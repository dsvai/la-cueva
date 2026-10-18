/* ============================================================
   LA CUEVA · tiempo de ejecución remoto compartido (navegador y worker)
   - makeRemoteDb: misma interfaz que la base de datos del artefacto
     (collection/doc/get/set/delete/where/limit/acquire) sobre el backend.
     Escribe parches (solo lo que cambia) y sincroniza los cambios de otros
     escritores con una fusión a tres bandas.
   - makeSample: misma interfaz que la capacidad «sample» de Claude, con el
     bucle de herramientas; cada paso del modelo lo hace el servidor.
   ============================================================ */
(function (root) {
  'use strict';
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function deq(a, b) {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return a === b || (a == null && b == null);
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!deq(a[i], b[i])) return false; return true; }
    const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!deq(a[k], b[k])) return false;
    return true;
  }
  function numDelta(base, next) {
    // diferencia numérica recursiva (para contadores de consumo); null si no es numérico
    if (typeof next === 'number') return typeof base === 'number' || base == null ? next - (base || 0) : null;
    if (next && typeof next === 'object' && !Array.isArray(next) && (base == null || (typeof base === 'object' && !Array.isArray(base)))) {
      const out = {};
      for (const k of Object.keys(next)) { const d = numDelta(base ? base[k] : undefined, next[k]); if (d === null) return null; if (d !== 0 && !(typeof d === 'object' && !Object.keys(d).length)) out[k] = d; }
      return out;
    }
    return null;
  }
  /* parche entre lo último conocido (base) y lo nuevo */
  function diff(c, base, next) {
    const ops = { set: {}, unset: [], append: {}, inc: {} }; let n = 0;
    base = base || {};
    for (const k of Object.keys(next)) {
      const a = base[k], b = next[k];
      if (b === undefined || deq(a, b)) continue;
      if (c === 'usage') { const d = numDelta(a, b); if (d !== null) { if (typeof d === 'number' ? d !== 0 : (Object.keys(d).length || a === undefined)) { ops.inc[k] = d; n++; } continue; } }
      if (Array.isArray(b) && (a === undefined || (Array.isArray(a) && a.length < b.length && deq(a, b.slice(0, a.length))))) { ops.append[k] = a === undefined ? b : b.slice(a.length); n++; continue; }
      ops.set[k] = b; n++;
    }
    for (const k of Object.keys(base)) if (next[k] === undefined && base[k] !== undefined) { ops.unset.push(k); n++; }
    return n ? ops : null;
  }
  /* fusión a tres bandas en el sitio: lo que no cambió en local adopta lo remoto */
  function merge3(local, base, remote) {
    base = base || {};
    const keys = new Set(Object.keys(local).concat(Object.keys(remote), Object.keys(base)));
    for (const k of keys) {
      if (deq(local[k], base[k])) { if (remote[k] === undefined) delete local[k]; else local[k] = clone(remote[k]); }
    }
    return local;
  }

  function makeRemoteDb(transport, opts) {
    opts = opts || {};
    const bases = new Map();           // 'c/id' -> { v, data }
    let onRemote = null, wants = null, cursor = null, timer = null, stopped = false, syncing = false;
    const lastError = { v: null };
    async function one(op) { const [r] = await transport([op]); if (r && r.error) throw r.error; return r; }
    function remember(c, id, v, data) { const k = c + '/' + id; const b = bases.get(k); if (!b || v >= b.v) bases.set(k, { v, data: clone(data) }); }
    function doc(c, id) {
      return {
        id, path: c + '/' + id,
        async get() { const r = await one({ op: 'get', c, id }); if (r.exists) remember(c, id, r.v, r.data); return { id, exists: !!r.exists, data: () => clone(r.data), metadata: {} }; },
        async set(obj) {
          const k = c + '/' + id, b = bases.get(k);
          const ops = diff(c, b ? b.data : null, obj); if (!ops) return;
          const r = await one({ op: 'write', c, id, ops });
          bases.set(k, { v: r.v, data: clone(r.data) });
          if (onRemote && !deq(r.data, obj)) onRemote(c, id, clone(r.data), clone(obj));
        },
        async update(p) { const b = bases.get(c + '/' + id); return this.set(Object.assign(clone(b ? b.data : {}) || {}, p)); },
        async delete() { await one({ op: 'delete', c, id }); bases.delete(c + '/' + id); },
        async acquire(o) { return one({ op: 'acquire', name: c + '-' + id, holder: o.holder, ttlMs: o.ttlMs }); },
        async release(o) { return one({ op: 'release', name: c + '-' + id, holder: o.holder }); },
        collection() { throw new Error('Subcolecciones no disponibles'); }
      };
    }
    function collection(c, where, lim) {
      where = where || [];
      return {
        path: c, doc: id => doc(c, id || ('d' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8))),
        where: (f, op, v) => collection(c, where.concat([[f, op, v]]), lim),
        orderBy() { return this; }, limit: n => collection(c, where, n),
        async get() {
          const r = await one({ op: 'query', c, where, limit: lim });
          const docs = r.docs.map(d => { remember(c, d.id, d.v, d.data); return { id: d.id, exists: true, data: () => clone(d.data) }; });
          return { docs, size: docs.length, empty: !docs.length };
        }
      };
    }
    async function syncOnce() {
      if (syncing || stopped) return; syncing = true;
      try {
        const r = await one({ op: 'changes', since: cursor, full: opts.full || [] });
        cursor = r.now;
        for (const d of r.docs) {
          const k = d.c + '/' + d.id, b = bases.get(k);
          if (b && b.v >= d.v) continue;
          if (d.deleted) { bases.delete(k); if (onRemote) onRemote(d.c, d.id, null, b ? b.data : null); continue; }
          if (d.partial) {
            if (!wants || !wants(d.c, d.id)) continue;      // documento largo que nadie tiene abierto
            const g = await one({ op: 'get', c: d.c, id: d.id }); if (!g.exists) continue;
            const prev = bases.get(k); if (prev && prev.v >= g.v) continue;
            bases.set(k, { v: g.v, data: clone(g.data) }); if (onRemote) onRemote(d.c, d.id, clone(g.data), prev ? prev.data : null);
            continue;
          }
          bases.set(k, { v: d.v, data: clone(d.data) });
          if (onRemote) onRemote(d.c, d.id, clone(d.data), b ? b.data : null);
        }
        lastError.v = null;
      } catch (e) { lastError.v = e; if (opts.onSyncError) opts.onSyncError(e); }
      finally { syncing = false; }
    }
    function loop() {
      if (stopped) return;
      const ms = typeof opts.pollMs === 'function' ? opts.pollMs() : (opts.pollMs || 4000);
      timer = setTimeout(async () => { await syncOnce(); loop(); }, ms);
    }
    const db = {
      collection: c => collection(c), doc: p => { const [c, id] = String(p).split('/'); return doc(c, id); },
      observer: !!opts.observer, strictLease: !!opts.strictLease, remote: true,
      onRemote(fn, wantsFn) { onRemote = fn; wants = wantsFn || null; },
      async start() { await syncOnce(); loop(); },
      stop() { stopped = true; clearTimeout(timer); },
      syncNow: syncOnce,
      get lastSyncError() { return lastError.v; }
    };
    return db;
  }

  /* ---------- bucle de muestreo con herramientas ---------- */
  async function blobToBlock(b) {
    if (b && b.type === 'image' && b.data) return b;
    const buf = typeof b.arrayBuffer === 'function' ? await b.arrayBuffer() : b;
    let b64;
    if (typeof Buffer !== 'undefined') b64 = Buffer.from(buf).toString('base64');
    else { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); b64 = btoa(s); }
    return { type: 'image', mediaType: /^image\/(png|jpeg|gif|webp)$/.test(b.type) ? b.type : 'image/jpeg', data: b64 };
  }
  function makeSample(step, cfg) {
    cfg = cfg || {};
    const maxSteps = cfg.maxSteps || 10;
    async function sample(input, o) {
      o = o || {};
      const turns = typeof input === 'string' ? [{ role: 'user', content: input }] : input.map(t => ({ role: t.role, content: t.content }));
      if (o.images && o.images.length) {
        let li = turns.length - 1; while (li >= 0 && turns[li].role !== 'user') li--;
        if (li >= 0) { const imgs = await Promise.all(o.images.slice(0, 4).map(blobToBlock)); turns[li] = { role: 'user', content: [{ type: 'text', text: String(turns[li].content || '') }].concat(imgs) }; }
      }
      const tools = (o.tools || []).filter(Boolean);
      const schemas = tools.map(t => ({ name: t.name, description: t.description || '', inputSchema: t.inputSchema || { type: 'object', properties: {} } }));
      const texts = []; const usage = { in: 0, out: 0 }; let model = '', stop = 'end';
      for (let i = 0; i < maxSteps; i++) {
        if (o.signal && o.signal.aborted) throw { code: 'cancelled', text: texts.join('\n\n') };
        const prefix = texts.length ? texts.join('\n\n') + '\n\n' : '';
        let r;
        try {
          r = await step({ messages: turns, tools: schemas, tier: o.modelTier || 'default', model: o.model || '', signal: o.signal, onText: o.onText ? (d, cum) => o.onText({ text: prefix + cum, delta: d }) : null });
        } catch (e) { throw { code: (e && e.code) || 'upstream_error', message: e && e.message, text: texts.join('\n\n') }; }
        usage.in += (r.usage && r.usage.in) || 0; usage.out += (r.usage && r.usage.out) || 0; model = r.model || model;
        if (r.text) texts.push(r.text);
        if (r.stop !== 'tool_use' || !r.toolCalls || !r.toolCalls.length) { stop = r.stop; break; }
        if (!schemas.length) { stop = r.stop; break; }
        turns.push({ role: 'assistant', content: (r.text ? [{ type: 'text', text: r.text }] : []).concat(r.toolCalls.map(tc => ({ type: 'tool_call', id: tc.id, name: tc.name, input: tc.input || {} }))) });
        const results = [];
        for (const tc of r.toolCalls) {
          const t = tools.find(x => x.name === tc.name);
          let content, isError = false;
          if (!t) { content = 'Esa herramienta no está disponible para ti.'; isError = true; }
          else { try { const out = await t.execute(tc.input || {}, { signal: o.signal }); content = typeof out === 'string' ? out : JSON.stringify(out); } catch (e) { content = 'Error: ' + ((e && e.message) || e); isError = true; } }
          results.push({ type: 'tool_result', id: tc.id, content: String(content == null ? '' : content).slice(0, 20000), isError });
        }
        turns.push({ role: 'user', content: results });
        if (i === maxSteps - 1) stop = 'max_steps';
      }
      const text = texts.join('\n\n');
      if (!text.trim()) throw { code: stop === 'refusal' ? 'refused' : 'empty_completion', text: '' };
      return { text, truncated: stop === 'max_tokens' || stop === 'max_steps', modelTierApplied: o.modelTier || 'default', modelApplied: model, usage };
    }
    sample.limits = async () => cfg.limits || { maxPromptBytes: 900000, tools: { maxCount: 20 }, images: { maxCount: 4, maxInputBytes: 3e6, mediaTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] } };
    return sample;
  }

  /* paso del modelo desde el navegador: /api/llm con respuesta en streaming (NDJSON) */
  function httpStep(base) {
    return async function (req) {
      let res;
      try {
        res = await fetch((base || '') + '/api/llm', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-lc': '1' }, body: JSON.stringify({ messages: req.messages, tools: req.tools, tier: req.tier, model: req.model }), signal: req.signal });
      } catch (e) { throw { code: req.signal && req.signal.aborted ? 'cancelled' : 'upstream_error' }; }
      if (res.status === 401) throw { code: 'session_expired' };
      if (!res.ok || !res.body) { let j = {}; try { j = await res.json(); } catch (_) { } throw { code: j.code || 'upstream_error', message: j.message }; }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '', cum = '', done = null;
      try {
        for (;;) {
          const { value, done: end } = await reader.read(); if (end) break;
          buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
            let ev; try { ev = JSON.parse(line); } catch (_) { continue; }
            if (ev.t === 'text') { cum += ev.d; if (req.onText) req.onText(ev.d, cum); }
            else if (ev.t === 'done') done = ev.r;
            else if (ev.t === 'error') throw { code: ev.code || 'upstream_error', message: ev.message };
          }
        }
      } catch (e) { if (req.signal && req.signal.aborted) throw { code: 'cancelled' }; throw e && e.code ? e : { code: 'upstream_error' }; }
      if (!done) throw { code: req.signal && req.signal.aborted ? 'cancelled' : 'upstream_error' };
      return done;
    };
  }

  /* transporte HTTP de la base de datos */
  function httpTransport(base, onAuthLost) {
    return async function (ops) {
      let res;
      for (let attempt = 0; ; attempt++) {
        try { res = await fetch((base || '') + '/api/db', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-lc': '1' }, body: JSON.stringify({ ops }) }); break; }
        catch (e) { if (attempt >= 2) throw { code: 'unavailable', message: 'Sin conexión con el servidor de La Cueva.' }; await new Promise(r => setTimeout(r, 800 * (attempt + 1))); }
      }
      if (res.status === 401) { if (onAuthLost) onAuthLost(); throw { code: 'not_granted', message: 'La sesión ha caducado. Vuelve a entrar.' }; }
      if (!res.ok) { let j = {}; try { j = await res.json(); } catch (_) { } throw { code: j.code || 'unavailable', message: j.message || 'El servidor no respondió correctamente.' }; }
      const j = await res.json(); return j.results;
    };
  }

  const api = { clone, deq, diff, merge3, makeRemoteDb, makeSample, httpStep, httpTransport };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LCRemote = api;
})(typeof window !== 'undefined' ? window : globalThis);
