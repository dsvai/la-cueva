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
  function create(f) {
    const id = (f.name || 'agente').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 5);
    const look = f.avatar || { skin: SKINS[Math.floor(Math.random() * SKINS.length)], hair: HAIRS[Math.floor(Math.random() * HAIRS.length)], hs: ['short', 'long', 'bun', 'curly', 'buzz', 'ponytail'][Math.floor(Math.random() * 6)], top: ROOMS[f.dept] ? ROOMS[f.dept].wall : BR.forest, ts: 'shirt', pants: BR.brown, shoes: '#2a2018', badge: ROOMS[f.dept] ? ROOMS[f.dept].accent : BR.sand };
    const a = Object.assign(base({ id, name: f.name, role: f.role, dept: f.dept, specialty: f.specialty || '', personality: f.personality || '', instructions: f.instructions || '', avatar: look, tier: 'default', model: '', enabled: true, custom: true }), { createdAt: Date.now() });
    return save(a);
  }
  return { all, get, enabled, save, create };
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
  function words(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9ñ]+/).filter(w => w.length > 3); }
  async function search(projectId, query, n) {
    const q = new Set(words(query)); const out = [];
    for (const d of Store.all('pdocs').filter(x => x.projectId === projectId)) {
      const t = await Store.load('ptext', d.id); const text = (t && t.text) || '';
      const parts = text.split(/\n{2,}/);
      parts.forEach((p, i) => { let s = 0; for (const w of words(p)) if (q.has(w)) s++; if (s) out.push({ s, src: d.name, text: p.slice(0, 900) }); });
    }
    for (const d of Store.all('deliverables').filter(x => x.projectId === projectId)) { let s = 0; for (const w of words(d.title + ' ' + (d.summary || ''))) if (q.has(w)) s += 2; if (s) out.push({ s, src: 'Entregable: ' + d.title, text: d.summary || '' }); }
    return out.sort((a, b) => b.s - a.s).slice(0, n || 5);
  }
  return { rulesFor, propose, decide, note, notesFor, search, RISKY };
})();
