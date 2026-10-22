/* ============================================================
   LA CUEVA · plantilla editable, configuración y memoria
   ============================================================ */
const Config = (() => {
  const DEF = { planApproval: true, concurrency: 2, dailyCalls: 150, maxTasksPlan: 8, maxCallsPlan: 40, maxDepth: 2, showNames: true, ambient: true, priceIn: '', priceOut: '', logoUrl: '', logoAssetId: '' };
  function get() { return Object.assign({}, DEF, Store.get('config', 'main') || {}); }
  function set(p) { const c = Object.assign(get(), p, { id: 'main' }); Store.put('config', c); return c; }
  return { get, set, DEF };
})();

const Roster = (() => {
  function base(a) {
    const isDir = a.dept === 'DIR';
    return Object.assign({
      description: a.specialty, perms: defaultPerms(isDir), limits: defaultLimits(isDir),
      tools: Object.keys(TOOLS).filter(t => TOOLS[t].who === 'all' || TOOLS[t].who === (isDir ? 'director' : 'specialist')),
      memoryScopes: ['agencia', 'proyecto', 'cliente', 'agente'], avatar: a.avatar
    }, JSON.parse(JSON.stringify(a)));
  }
  function all() {
    const out = [], seen = new Set();
    // los permisos nuevos que no existían cuando se guardó la ficha toman su valor por defecto
    const merge = (b, o) => Object.assign(b, o, { perms: Object.assign({}, b.perms, o.perms || {}), limits: Object.assign({}, b.limits, o.limits || {}) });
    for (const d of DEFAULT_AGENTS) { const o = Store.get('agents', d.id); out.push(o ? merge(base(d), o) : base(d)); seen.add(d.id); }
    for (const o of Store.all('agents')) if (!seen.has(o.id)) out.push(merge(base(o), o));
    return out;
  }
  function get(id) { return all().find(a => a.id === id) || null; }
  function enabled() { return all().filter(a => a.enabled !== false); }
  function save(a) { a.updatedAt = Date.now(); Store.put('agents', JSON.parse(JSON.stringify(a))); Bus.emit('roster'); return a; }
  function setEnabled(id, active) {
    if (!get(id)) throw new Error('Ese agente no existe.');
    const change = { enabled: !!active, updatedAt: Date.now() };
    // Default profiles need only an override; retain saved instructions and avatars.
    if (Store.get('agents', id)) Store.patch('agents', id, change);
    else Store.put('agents', Object.assign({ id }, change));
    Bus.emit('roster');
    return get(id);
  }
  function create(f) {
    const id = (f.name || 'agente').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 5);
    const look = f.avatar || { skin: SKINS[Math.floor(Math.random() * SKINS.length)], hair: HAIRS[Math.floor(Math.random() * HAIRS.length)], hs: ['short', 'long', 'bun', 'curly', 'buzz', 'ponytail'][Math.floor(Math.random() * 6)], top: ROOMS[f.dept] ? ROOMS[f.dept].wall : BR.forest, ts: 'shirt', pants: BR.brown, shoes: '#2a2018', badge: ROOMS[f.dept] ? ROOMS[f.dept].accent : BR.sand };
    const a = Object.assign(base({ id, name: f.name, role: f.role, dept: f.dept, specialty: f.specialty || '', personality: f.personality || '', instructions: f.instructions || '', avatar: look, tier: 'default', model: '', enabled: true, custom: true }), { createdAt: Date.now() });
    return save(a);
  }
  return { all, get, enabled, save, setEnabled, create };
})();

/* ---------- memoria: normativa (reglas aprobadas) y operativa (proyecto) ---------- */
const Memory = (() => {
  const RISKY = /(permis|autoriz|ignora|salt(a|ar)te|sin aprobaci|puedes enviar|puedes publicar|puedes gastar|acceso total|eres administrador|contraseña|clave api|api key)/i;
  function rulesFor(agent, project) {
    const rs = Store.all('rules').filter(r => r.state === 'aprobada');
    const sc = agent.memoryScopes || [];
    return rs.filter(r =>
      (r.scope === 'agencia' && sc.includes('agencia')) ||
      (r.scope === 'proyecto' && project && r.scopeId === project.id && sc.includes('proyecto')) ||
      (r.scope === 'cliente' && project && project.client && r.scopeId === project.client && sc.includes('cliente')) ||
      (r.scope === 'agente' && r.scopeId === agent.id && sc.includes('agente')));
  }
  function propose({ scope, scopeId, text, reason, agentId, convId, taskId, projectId }) {
    const dup = Store.all('rules').find(r => r.state !== 'rechazada' && r.text.trim().toLowerCase() === text.trim().toLowerCase());
    if (dup) return { dup: true, rule: dup };
    const r = Store.put('rules', { scope, scopeId: scopeId || null, text: text.trim(), reason: reason || '', state: 'propuesta', risky: RISKY.test(text), origin: { agentId, convId: convId || null, taskId: taskId || null, projectId: projectId || null, ts: Date.now() }, history: [{ ts: Date.now(), action: 'propuesta', by: agentId }], createdAt: Date.now() });
    Activity.log('memoria', 'Nueva regla propuesta: «' + trunc(text, 80) + '»', { agentId, projectId });
    return { rule: r };
  }
  function decide(id, action, note, newText) {
    const r = Store.get('rules', id); if (!r) return;
    const state = { aprobar: 'aprobada', rechazar: 'rechazada', revocar: 'revocada', editar: r.state }[action];
    const h = (r.history || []).concat([{ ts: Date.now(), action, by: 'admin', note: note || '' }]);
    Store.patch('rules', id, Object.assign({ state, history: h }, newText ? { text: newText, risky: RISKY.test(newText) } : {}));
    Activity.log('memoria', 'Regla ' + (state || action) + ': «' + trunc(newText || r.text, 70) + '»', { agentId: r.origin && r.origin.agentId });
  }
  function note(projectId, text, agentId, taskId, kind) {
    return Store.put('notes', { projectId: projectId || null, text: trunc(text, 1200), agentId, taskId: taskId || null, kind: kind || 'decision', ts: Date.now() });
  }
  function notesFor(projectId, n) { return Store.all('notes').filter(x => (x.projectId || null) === (projectId || null)).sort((a, b) => b.ts - a.ts).slice(0, n || 12); }
  /* recuperación por palabras clave (sin embeddings: pendiente de backend) */
  const STOP = new Set('los las con del que una por para como sus mas pero este esta son the and for with from that this los les des par sur une est'.split(' '));
  function words(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9ñ]+/).filter(w => w.length > 2 && !STOP.has(w)); }
  /* trocea un documento en fragmentos de ~1.200 caracteres. En tablas (hojas de cálculo convertidas a texto)
     cada fragmento lleva la fila de cabecera, para que una fila suelta siga teniendo sentido */
  const PART = 12000;
  function chunks(text) {
    const lines = String(text || '').split('\n');
    const nonEmpty = lines.filter(l => l.trim());
    const SEP = /\t|\s\|\s|;.*;|,.*,.*,/;
    const tabular = nonEmpty.length > 20 && nonEmpty.filter(l => SEP.test(l)).length > nonEmpty.length * 0.5;
    const header = tabular ? (nonEmpty.find(l => SEP.test(l)) || '').slice(0, 400) : '';
    const out = []; let cur = [], len = 0, start = 0, pos = 0;
    const flush = () => { const body = cur.join('\n').trim(); if (body) out.push({ text: (header && start > 0 ? header + '\n' : '') + body, at: start }); cur = []; len = 0; };
    for (const l0 of lines) {
      const l = l0.length > 1200 ? l0.slice(0, 1200) : l0, blank = !l.trim();
      if (cur.length && ((blank && !tabular && len > 400) || len + l.length > 1200)) flush();
      if (!cur.length && blank) { pos += l0.length + 1; continue; }
      if (!cur.length) start = pos;
      cur.push(l); len += l.length + 1; pos += l0.length + 1;
    }
    flush();
    return out;
  }
  function score(qs, qPhrase, text, docName) {
    const ws = words(text); if (!ws.length) return 0;
    const seen = new Set(); let hits = 0;
    for (const w of ws) if (qs.has(w)) { hits++; seen.add(w); }
    if (!seen.size) return 0;
    let s = seen.size * 3 + Math.min(hits, 12) * 0.5;
    if (qPhrase && text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(qPhrase)) s += 6;
    for (const w of words(docName)) if (qs.has(w)) s += 1;
    return s;
  }
  async function search(projectId, query, n) {
    const qs = new Set(words(query)); if (!qs.size) return [];
    const qPhrase = String(query || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const out = [];
    for (const d of Store.all('pdocs').filter(x => x.projectId === projectId)) {
      const t = await Store.load('ptext', d.id); const text = (t && t.text) || '';
      const parts = Math.max(1, Math.ceil(text.length / PART));
      for (const c of chunks(text)) { const s = score(qs, qPhrase.length > 5 ? qPhrase : '', c.text, d.name); if (s) out.push({ s, src: d.name + ' · parte ' + (Math.floor(c.at / PART) + 1) + ' de ' + parts, text: c.text }); }
    }
    for (const d of Store.all('deliverables').filter(x => x.projectId === projectId)) { const s = score(qs, '', d.title + ' ' + (d.summary || ''), ''); if (s) out.push({ s: s + 1, src: 'Entregable: ' + d.title + ' [' + d.id + ']', text: d.summary || '' }); }
    // como mucho 3 fragmentos del mismo documento, para no tapar a los demás
    const per = {}, res = [];
    for (const r of out.sort((a, b) => b.s - a.s)) { const k = r.src.split(' · parte')[0]; if ((per[k] = (per[k] || 0) + 1) > 3) continue; res.push(r); if (res.length >= (n || 6)) break; }
    return res;
  }
  /* lectura por partes de un documento del proyecto (para revisarlo entero sin saturar el contexto) */
  async function readPart(projectId, name, part) {
    const docs = Store.all('pdocs').filter(x => x.projectId === projectId);
    const key = String(name || '').toLowerCase().trim();
    const d = docs.find(x => x.id === name || x.name.toLowerCase() === key) || docs.find(x => key && x.name.toLowerCase().includes(key));
    if (!d) return { error: 'No hay ningún documento con ese nombre. Disponibles: ' + docs.map(x => x.name).join(' · ') };
    const t = await Store.load('ptext', d.id); const text = (t && t.text) || '';
    const parts = Math.max(1, Math.ceil(text.length / PART));
    const k = Math.min(Math.max(parseInt(part, 10) || 1, 1), parts);
    let a = (k - 1) * PART, b = Math.min(text.length, k * PART);
    if (k > 1) { const nl = text.lastIndexOf('\n', a); if (nl > a - 400) a = nl + 1; }
    if (b < text.length) { const nl = text.lastIndexOf('\n', b); if (nl > b - 400) b = nl; }
    return { name: d.name, part: k, parts, text: text.slice(a, b) };
  }
  function partsOf(d) { return Math.max(1, Math.ceil((d.size || 0) / PART)); }
  return { rulesFor, propose, decide, note, notesFor, search, readPart, partsOf, chunks, RISKY };
})();
