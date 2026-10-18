/* ============================================================
   LA CUEVA · documentos (misma forma que la base de datos del artefacto)
   Cada escritura es un parche (set / unset / append / inc) que se aplica
   dentro de una transacción con bloqueo por documento, así dos escritores
   (tu navegador y el worker) no se pisan los cambios.
   ============================================================ */
import { q, tx, ensureSchema } from './db.js';

export const COLLECTIONS = new Set(['config', 'agents', 'projects', 'convs', 'plans', 'tasks', 'approvals', 'rules', 'notes', 'deliverables', 'schedules', 'pdocs', 'chunks', 'dtext', 'tthread', 'ptext', 'activity', 'usage', 'pimg', 'locks']);
const ID_RE = /^[\w.~:@+-]{1,160}$/;
const FIELD_RE = /^[A-Za-z_][\w]{0,60}$/;
const MAX_DOC_BYTES = 1024 * 1024;
/* topes de listas que crecen por adición desde varios escritores */
const CAPS = { activity: { events: 3000 }, tasks: { logs: 40, toolEvents: 30 } };

export class DocError extends Error { constructor(code, message) { super(message); this.code = code; } }

function checkColId(c, id) {
  if (!COLLECTIONS.has(c) || c === 'locks') throw new DocError('invalid_argument', 'Colección no permitida: ' + c);
  if (id !== undefined && (typeof id !== 'string' || !ID_RE.test(id))) throw new DocError('invalid_argument', 'Identificador no válido');
}

function addDeep(cur, delta) {
  if (typeof delta === 'number') return (typeof cur === 'number' ? cur : 0) + delta;
  if (delta && typeof delta === 'object') {
    const out = cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : {};
    for (const [k, v] of Object.entries(delta)) out[k] = addDeep(out[k], v);
    return out;
  }
  return cur;
}

export function applyOps(c, cur, ops) {
  const d = cur && typeof cur === 'object' ? JSON.parse(JSON.stringify(cur)) : {};
  ops = ops || {};
  for (const [k, v] of Object.entries(ops.set || {})) d[k] = v;
  for (const k of ops.unset || []) delete d[k];
  for (const [k, arr] of Object.entries(ops.append || {})) if (Array.isArray(arr)) d[k] = (Array.isArray(d[k]) ? d[k] : []).concat(arr);
  for (const [k, delta] of Object.entries(ops.inc || {})) d[k] = addDeep(d[k], delta);
  const caps = CAPS[c];
  if (caps) for (const [k, n] of Object.entries(caps)) if (Array.isArray(d[k]) && d[k].length > n) d[k] = d[k].slice(-n);
  return d;
}

export async function getDoc(c, id) {
  checkColId(c, id);
  const r = await q('SELECT data, v FROM lc_docs WHERE collection = $1 AND id = $2 AND NOT deleted', [c, id]);
  return r.rows[0] ? { exists: true, id, data: r.rows[0].data, v: r.rows[0].v } : { exists: false, id, data: null, v: 0 };
}

export async function query(c, where, limit) {
  checkColId(c);
  const cond = ['collection = $1', 'NOT deleted'], params = [c];
  for (const w of (Array.isArray(where) ? where : [])) {
    const [f, op, v] = w;
    if (typeof f !== 'string' || !FIELD_RE.test(f)) throw new DocError('invalid_argument', 'Campo no válido');
    if (op === '==') {
      if (f === 'id') { params.push(String(v)); cond.push('id = $' + params.length); }
      else { params.push(JSON.stringify(v)); cond.push("data -> '" + f + "' = $" + params.length + '::jsonb'); }
    } else if (op === 'in') {
      if (!Array.isArray(v) || v.length > 100) throw new DocError('invalid_argument', 'Filtro «in» no válido');
      if (f === 'id') { params.push(v.map(String)); cond.push('id = ANY($' + params.length + '::text[])'); }
      else { params.push(JSON.stringify(v)); cond.push("data -> '" + f + "' IN (SELECT jsonb_array_elements($" + params.length + '::jsonb))'); }
    } else throw new DocError('invalid_argument', 'Operador no admitido: ' + op);
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 1000, 1), 2000);
  const r = await q('SELECT id, data, v FROM lc_docs WHERE ' + cond.join(' AND ') + ' ORDER BY id LIMIT ' + lim, params);
  return r.rows.map(x => ({ id: x.id, data: x.data, v: x.v }));
}

export async function writeDoc(c, id, ops, options) {
  checkColId(c, id);
  return tx(async run => {
    await run('SELECT pg_advisory_xact_lock(hashtext($1))', [c + '/' + id]);
    const r = await run('SELECT data, deleted FROM lc_docs WHERE collection = $1 AND id = $2', [c, id]);
    const cur = r.rows[0] && !r.rows[0].deleted ? r.rows[0].data : null;
    if (options && options.external && c === 'approvals') {
      ops = JSON.parse(JSON.stringify(ops || {}));
      const owned = ['execState', 'execStartedAt', 'execAt', 'execResult', 'execError'];
      if (cur && cur.state !== 'pendiente') owned.push('state', 'kind', 'payload', 'projectId');
      for (const field of owned) {
        for (const kind of ['set', 'inc', 'append']) if (ops[kind]) delete ops[kind][field];
        if (ops.unset) ops.unset = ops.unset.filter(k => k !== field);
      }
    }
    const next = applyOps(c, cur, ops);
    next.id = id;
    const json = JSON.stringify(next);
    if (Buffer.byteLength(json) > MAX_DOC_BYTES) throw new DocError('invalid_argument', 'El documento supera el tamaño máximo (1 MB).');
    const w = await run(
      `INSERT INTO lc_docs (collection, id, data, deleted, v, seq, updated_at) VALUES ($1, $2, $3::jsonb, false, 1, nextval('lc_seq'), clock_timestamp())
       ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, deleted = false, v = lc_docs.v + 1, seq = nextval('lc_seq'), updated_at = clock_timestamp()
       RETURNING v`, [c, id, json]);
    return { v: w.rows[0].v, data: next };
  });
}

/* borrado lógico: deja una marca para que los demás escritores se enteren */
export async function deleteDoc(c, id) {
  checkColId(c, id);
  const r = await q(`UPDATE lc_docs SET data = NULL, deleted = true, v = v + 1, seq = nextval('lc_seq'), updated_at = clock_timestamp() WHERE collection = $1 AND id = $2 RETURNING v`, [c, id]);
  return { v: r.rows[0] ? r.rows[0].v : 0 };
}

/* cambios desde un instante (con solape de 15 s para no perder transacciones lentas) */
export async function changes(since, full) {
  const now = (await q('SELECT clock_timestamp() AS now')).rows[0].now;
  if (!since) return { now: new Date(now).toISOString(), docs: [] };
  const fullSet = new Set(Array.isArray(full) ? full : []);
  const r = await q(`SELECT collection, id, v, deleted, CASE WHEN collection = ANY($2::text[]) THEN data ELSE NULL END AS data
                     FROM lc_docs WHERE updated_at > ($1::timestamptz - interval '15 seconds') ORDER BY updated_at LIMIT 800`, [since, [...fullSet]]);
  return { now: new Date(now).toISOString(), docs: r.rows.map(x => ({ c: x.collection, id: x.id, v: x.v, deleted: x.deleted, data: x.data, partial: !x.deleted && !fullSet.has(x.collection) })) };
}

/* contrato temporal: solo un ejecutor del orquestador a la vez */
export async function acquire(name, holder, ttlMs) {
  if (!ID_RE.test(String(name)) || !ID_RE.test(String(holder))) throw new DocError('invalid_argument', 'Contrato no válido');
  const ttl = Math.min(Math.max(parseInt(ttlMs, 10) || 45000, 5000), 600000);
  const r = await q(`INSERT INTO lc_leases (name, holder, expires_at) VALUES ($1, $2, clock_timestamp() + ($3 || ' milliseconds')::interval)
                     ON CONFLICT (name) DO UPDATE SET holder = excluded.holder, expires_at = excluded.expires_at
                     WHERE lc_leases.expires_at < clock_timestamp() OR lc_leases.holder = excluded.holder
                     RETURNING holder`, [name, holder, String(ttl)]);
  if (r.rows[0]) return { acquired: true, holder };
  const cur = await q('SELECT holder FROM lc_leases WHERE name = $1', [name]);
  return { acquired: false, holder: cur.rows[0] ? cur.rows[0].holder : null };
}
export async function release(name, holder) {
  await q('DELETE FROM lc_leases WHERE name = $1 AND holder = $2', [name, holder]);
  return { released: true };
}

/* ¿hay algo que hacer en segundo plano? (consulta barata antes de arrancar el worker) */
export async function hasBackgroundWork() {
  const soon = Date.now() + 5 * 60000;
  const r = await q(`SELECT 1 FROM lc_docs WHERE NOT deleted AND (
      (collection = 'tasks' AND data ->> 'state' IN ('en_cola', 'en_curso'))
   OR (collection = 'plans' AND data ->> 'state' IN ('en_curso', 'consolidando'))
   OR (collection = 'schedules' AND (data ->> 'enabled') = 'true' AND jsonb_typeof(data -> 'nextRun') = 'number' AND (data ->> 'nextRun')::double precision <= $1)
  ) LIMIT 1`, [soon]);
  return r.rows.length > 0;
}

/* lote de operaciones desde el cliente o el worker */
export async function runOps(ops, opts) {
  await ensureSchema();
  const allowLease = !!(opts && opts.allowLease);
  const out = [];
  for (const o of (Array.isArray(ops) ? ops.slice(0, 50) : [])) {
    try {
      if (o.op === 'get') out.push(await getDoc(o.c, o.id));
      else if (o.op === 'query') out.push({ docs: await query(o.c, o.where, o.limit) });
      else if (o.op === 'write') out.push(await writeDoc(o.c, o.id, o.ops, { external: true }));
      else if (o.op === 'delete') out.push(await deleteDoc(o.c, o.id));
      else if (o.op === 'changes') out.push(await changes(o.since, o.full));
      else if (o.op === 'acquire') out.push(allowLease ? await acquire(o.name, o.holder, o.ttlMs) : { acquired: false, holder: null });
      else if (o.op === 'release') out.push(allowLease ? await release(o.name, o.holder) : { released: false });
      else out.push({ error: { code: 'invalid_argument', message: 'Operación desconocida' } });
    } catch (e) {
      out.push({ error: { code: e.code && typeof e.code === 'string' && !/^\d/.test(e.code) ? e.code : 'upstream_error', message: e instanceof DocError ? e.message : 'Error de base de datos' } });
      if (!(e instanceof DocError)) console.error('[docs]', o.op, o.c, e.message);
    }
  }
  return out;
}
