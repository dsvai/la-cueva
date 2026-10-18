/* ============================================================
   LA CUEVA · almacenamiento persistente
   Base de datos del artefacto (db) si está disponible; si no, este
   navegador (localStorage) o solo memoria. Todo pasa por aquí.
   ============================================================ */
const Store = (() => {
  // colecciones cargadas al arrancar; las pesadas (textos) se cargan bajo demanda
  const EAGER = ['config', 'agents', 'projects', 'convs', 'plans', 'tasks', 'approvals', 'rules', 'notes', 'deliverables', 'schedules', 'pdocs'];
  const DAILY = ['activity', 'usage'];   // un documento por día: se cargan los últimos 30
  const failed = new Set(); let truncatedCols = [];
  const LAZY = ['chunks', 'dtext', 'tthread', 'ptext'];
  const mem = {}; for (const c of EAGER.concat(LAZY, DAILY)) mem[c] = new Map();
  let db = null, mode = 'memory', lastError = null;
  const queue = new Map(); let pumping = false;

  function useLocal() {
    try { const k = '__lc_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
  }
  async function init() {
    try {
      if (window.claude && typeof window.claude.use === 'function') db = await Promise.race([window.claude.use('db'), sleep(10000).then(() => null)]);
    } catch (e) { db = null; }
    if (db) {
      mode = 'db';
      const days = []; for (let i = 0; i < 30; i++) days.push(dayKey(Date.now() - i * 86400000));
      for (const c of EAGER.concat(DAILY)) {
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try {
            if (DAILY.includes(c)) { const snap = await db.collection(c).where('id', 'in', days).limit(30).get(); for (const d of snap.docs) if (d.exists) mem[c].set(d.id, Object.assign({}, d.data())); }
            else { const snap = await db.collection(c).limit(1000).get(); for (const d of snap.docs) if (d.exists) mem[c].set(d.id, Object.assign({}, d.data())); if (snap.docs.length >= 1000) truncatedCols.push(c); }
            ok = true;
          } catch (e) {
            lastError = e; console.warn('carga', c, e);
            if (e && (e.code === 'not_granted' || e.code === 'revoked')) { db = null; mode = useLocal() ? 'local' : 'memory'; break; }
            await sleep(600);
          }
        }
        if (!db) break;
        if (!ok) failed.add(c);   // no se escribe en una colección que no se pudo leer, para no sobrescribirla
      }
    } else if (useLocal()) mode = 'local';
    if (mode === 'local') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); if (!k || !k.startsWith('lc:')) continue;
        const [, c, id] = k.split(':'); if (!mem[c] || LAZY.includes(c)) continue;
        if (DAILY.includes(c) && Date.now() - Date.parse(id) > 31 * 86400000) continue;
        try { mem[c].set(id, JSON.parse(localStorage.getItem(k))); } catch (e) { }
      }
    }
    if (failed.size) setTimeout(() => Bus.emit('store:error', { message: 'No se pudieron cargar ' + [...failed].join(', ') + '. Esos datos no se guardarán hasta recargar La Cueva.' }), 1500);
    if (truncatedCols.length) setTimeout(() => Bus.emit('store:error', { message: 'Hay más de 1.000 elementos en ' + truncatedCols.join(', ') + '; solo se muestran los primeros. Haz una copia de seguridad y archiva lo terminado.' }), 1800);
    Bus.emit('store:ready', mode);
    return mode;
  }
  function all(c) { return [...mem[c].values()]; }
  function get(c, id) { return mem[c].get(id) || null; }
  function emit(c) { Bus.emit('store:' + c); Bus.emit('store:any', c); }
  /* escribe el documento entero (en memoria al instante, persistencia en cola) */
  function put(c, obj) {
    if (!obj.id) obj.id = uid(c.slice(0, 2));
    mem[c].set(obj.id, obj);
    enqueue(c, obj.id, obj); emit(c);
    return obj;
  }
  function patch(c, id, p) { const o = mem[c].get(id); if (!o) return null; Object.assign(o, p); enqueue(c, id, o); emit(c); return o; }
  function del(c, id) { mem[c].delete(id); enqueue(c, id, null); emit(c); }
  const MAXB = 240000;
  function bytes(o) { try { return new Blob([JSON.stringify(o)]).size; } catch (e) { return JSON.stringify(o).length * 3; } }
  /* recorta documentos que superarían el límite de 256 KiB de la base de datos */
  function fit(c, o) {
    if (!o || bytes(o) <= MAXB) return o;
    o = JSON.parse(JSON.stringify(o));
    if (c === 'chunks') { for (const m of o.msgs) for (const a of (m.att || [])) if (a.text) { a.text = a.text.slice(0, 8000); a.cut = true; } while (bytes(o) > MAXB && o.msgs.length) { const m = o.msgs.find(x => (x.text || '').length > 20000); if (!m) break; m.text = m.text.slice(0, Math.floor(m.text.length / 2)) + '\n\n[Recortado al guardar: superaba el tamaño máximo]'; } }
    else if (c === 'dtext' || c === 'ptext') { while (bytes(o) > MAXB) o.text = o.text.slice(0, Math.floor(o.text.length * 0.85)); o.text += '\n\n[Recortado al guardar: superaba el tamaño máximo de un documento]'; o.cut = true; }
    else if (c === 'activity') { while (bytes(o) > 180000 && o.events.length > 50) o.events = o.events.slice(Math.ceil(o.events.length * 0.1)); }
    else if (c === 'tthread') { while (bytes(o) > MAXB && o.turns.length > 2) o.turns.splice(1, 1); }
    return o;
  }
  function enqueue(c, id, obj) {
    if (failed.has(c)) return;
    queue.set(c + '/' + id, { c, id, obj: obj ? fit(c, JSON.parse(JSON.stringify(obj))) : null, tries: 0 });
    if (!pumping) pump();
  }
  async function pump() {
    pumping = true;
    await sleep(250);
    while (queue.size) {
      const [k, job] = queue.entries().next().value; queue.delete(k);
      try { await writeOne(job); }
      catch (e) {
        lastError = e; console.warn('guardar', job.c, e);
        const permanent = e && (e.code === 'invalid_argument' || e.code === 'quota_exceeded' || e.code === 'revoked' || e.code === 'not_granted');
        if (!permanent && job.tries < 3) { job.tries++; await sleep(600 * Math.pow(2, job.tries) + Math.random() * 400); const k2 = job.c + '/' + job.id; if (!queue.has(k2)) queue.set(k2, job); }
        else Bus.emit('store:error', e);
      }
    }
    pumping = false;
  }
  async function writeOne({ c, id, obj }) {
    if (mode === 'db') { const ref = db.collection(c).doc(id); if (obj) await ref.set(obj); else await ref.delete(); }
    else if (mode === 'local') { const k = 'lc:' + c + ':' + id; try { if (obj) localStorage.setItem(k, JSON.stringify(obj)); else localStorage.removeItem(k); } catch (e) { throw { code: 'quota_exceeded', message: 'El almacenamiento de este navegador está lleno.' }; } }
  }
  /* documentos perezosos (textos largos) */
  async function load(c, id) {
    if (mem[c].has(id)) return mem[c].get(id);
    let v = null;
    try {
      if (mode === 'db') { const s = await db.collection(c).doc(id).get(); if (s.exists) v = Object.assign({}, s.data()); }
      else if (mode === 'local') { const raw = localStorage.getItem('lc:' + c + ':' + id); if (raw) v = JSON.parse(raw); }
    } catch (e) { lastError = e; }
    if (v) mem[c].set(id, v);
    return v;
  }
  async function loadWhere(c, field, value) {
    const out = [];
    try {
      if (mode === 'db') { const s = await db.collection(c).where(field, '==', value).limit(500).get(); for (const d of s.docs) { const v = Object.assign({}, d.data()); mem[c].set(d.id, v); out.push(v); } return out; }
      if (mode === 'local') { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('lc:' + c + ':')) { try { const v = JSON.parse(localStorage.getItem(k)); if (v && v[field] === value) { mem[c].set(v.id, v); out.push(v); } } catch (e) { } } } return out; }
    } catch (e) { lastError = e; }
    return all(c).filter(v => v[field] === value);
  }
  function pending() { return queue.size + (pumping ? 1 : 0); }
  /* copia de seguridad completa (incluye textos ya cargados) */
  async function exportAll() {
    const out = { app: 'La Cueva', version: 1, exportedAt: new Date().toISOString(), data: {} };
    for (const d of all('deliverables')) await load('dtext', d.id);
    for (const cv of all('convs')) for (let n = 0; n < (cv.chunks || 1); n++) await load('chunks', cv.id + '-' + n);
    for (const p of all('pdocs')) await load('ptext', p.id);
    for (const c of EAGER.concat(LAZY, DAILY)) out.data[c] = all(c);
    return out;
  }
  async function importAll(json) {
    if (!json || json.app !== 'La Cueva' || !json.data) throw new Error('El archivo no es una copia de La Cueva.');
    let n = 0, skipped = 0;
    for (const c of Object.keys(json.data)) {
      if (!mem[c] || !Array.isArray(json.data[c])) continue;
      for (const o of json.data[c]) {
        if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !/^[\w.~:@+-]{1,120}$/.test(o.id)) { skipped++; continue; }
        if (c === 'agents' && (typeof o.name !== 'string' || typeof o.perms !== 'object')) { skipped++; continue; }
        put(c, o); n++;
      }
    }
    return { n, skipped };
  }
  window.addEventListener('beforeunload', e => { if (queue.size || pumping) { e.preventDefault(); e.returnValue = ''; } });
  return { init, all, get, put, patch, del, load, loadWhere, pending, exportAll, importAll, get mode() { return mode; }, get lastError() { return lastError; }, get db() { return db; } };
})();

/* ---------- registro de actividad real y consumo ---------- */
const Activity = (() => {
  const live = new Map();     // llamadas de IA en curso: id -> {agentId, kind, label, taskId, started}
  function log(kind, text, ref) {
    const k = dayKey(); const doc = Store.get('activity', k) || { id: k, events: [] };
    doc.events.push(Object.assign({ ts: Date.now(), kind, text }, ref || {}));
    if (doc.events.length > 3000) doc.events = doc.events.slice(-3000);
    Store.put('activity', doc);
  }
  function recent(n) { const out = []; const days = Store.all('activity').sort((a, b) => b.id.localeCompare(a.id)); for (const d of days) { for (let i = d.events.length - 1; i >= 0; i--) { out.push(d.events[i]); if (out.length >= n) return out; } } return out; }
  function usage(agentId, projectId, inTok, outTok) {
    const k = dayKey(); const u = Store.get('usage', k) || { id: k, calls: 0, inTok: 0, outTok: 0, byAgent: {}, byProject: {} };
    u.calls++; u.inTok += inTok; u.outTok += outTok;
    const a = u.byAgent[agentId] || (u.byAgent[agentId] = { calls: 0, inTok: 0, outTok: 0 }); a.calls++; a.inTok += inTok; a.outTok += outTok;
    const pk = projectId || '_general'; const p = u.byProject[pk] || (u.byProject[pk] = { calls: 0, inTok: 0, outTok: 0 }); p.calls++; p.inTok += inTok; p.outTok += outTok;
    Store.put('usage', u);
  }
  function today() { return Store.get('usage', dayKey()) || { calls: 0, inTok: 0, outTok: 0, byAgent: {}, byProject: {} }; }
  function start(info) { const id = uid('live'); live.set(id, Object.assign({ started: Date.now() }, info)); Bus.emit('live'); return id; }
  function end(id) { live.delete(id); Bus.emit('live'); }
  return { log, recent, usage, today, start, end, live };
})();

/* ---------- una sola pestaña o dispositivo ejecuta la cola (contrato temporal en la base de datos) ---------- */
const Leader = (() => {
  const me = uid('tab'); let lead = true, ref = null, timer = null;
  async function beat() {
    const db = Store.db; if (!db) { lead = true; return; }
    try { ref = ref || db.collection('locks').doc('orquestador'); const r = await ref.acquire({ holder: me, ttlMs: 45000 }); const was = lead; lead = !!r.acquired; if (lead && !was) { Bus.emit('leader', true); Orch.recover(); Orch.pump(); } if (!lead && was) Bus.emit('leader', false); }
    catch (e) { lead = true; }
  }
  function start() { beat(); clearInterval(timer); timer = setInterval(beat, 20000); }
  return { start, is: () => lead, get id() { return me; } };
})();
