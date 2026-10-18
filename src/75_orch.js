/* ============================================================
   LA CUEVA · orquestador real
   Planes y tareas persistentes con estados, cola, dependencias, colaboración
   entre agentes, aprobaciones, límites, reintentos, pausa, cancelación y
   recuperación tras una interrupción. En el artefacto avanza con La Cueva abierta;
   con backend lo ejecuta el worker del servidor (también con la app cerrada).
   ============================================================ */
const TS = {   // estados de tarea y su texto visible
  pendiente: 'Pendiente', en_cola: 'En cola', en_curso: 'Trabajando', esperando_colaboracion: 'Esperando colaboración',
  esperando_aprobacion: 'Esperando tu aprobación', bloqueada: 'Bloqueada', completada: 'Completada', fallida: 'Fallida',
  cancelada: 'Cancelada', pausada: 'Pausada', interrumpida: 'Interrumpida'
};
const PS = { pendiente_aprobacion: 'Pendiente de tu visto bueno', en_curso: 'En curso', pausado: 'Pausado', requiere_atencion: 'Requiere atención', consolidando: 'Daniel está consolidando', en_revision: 'Listo para revisar', completado: 'Completado', cancelado: 'Cancelado' };
const TERMINAL = new Set(['completada', 'fallida', 'cancelada']);
const ACTIVE = new Set(['en_cola', 'en_curso', 'esperando_colaboracion', 'esperando_aprobacion']);

const Orch = (() => {
  const running = new Map();   // taskId -> {ctl, why}
  const consolidating = new Set();
  let pumpTimer = null, hold = false;

  const T = id => Store.get('tasks', id);
  const P = id => Store.get('plans', id);
  function tlog(task, msg, level) { task.logs = (task.logs || []).concat([{ ts: Date.now(), msg, level: level || 'info' }]).slice(-40); }
  function setTask(task, p, msg) { Object.assign(task, p); if (msg) tlog(task, msg); Store.put('tasks', task); }
  function planTasks(pid) { return Store.all('tasks').filter(t => t.planId === pid); }
  function project(id) { return id ? Store.get('projects', id) : null; }

  /* ---------- crear planes ---------- */
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(); }
  function createPlan(inp, meta) {
    const cfg = Config.get();
    const tasks = Array.isArray(inp.tareas) ? inp.tareas : [];
    if (!tasks.length) throw new Error('El plan no tiene tareas.');
    if (tasks.length > cfg.maxTasksPlan) throw new Error('El plan supera el máximo de ' + cfg.maxTasksPlan + ' tareas. Divídelo o agrupa tareas.');
    const keys = new Set(), seen = new Set();
    for (const t of tasks) {
      const a = Roster.get(String(t.responsable || '').toLowerCase().trim());
      if (!a || a.enabled === false) throw new Error('Responsable desconocido o desactivado: ' + t.responsable + '. Usa uno de los id del equipo.');
      if (a.dept === 'DIR') throw new Error('Daniel consolida al final; asigna las tareas a especialistas.');
      const k = String(t.clave || t.titulo); if (keys.has(k)) throw new Error('Clave de tarea repetida: ' + k); keys.add(k);
      const sig = a.id + '|' + norm(t.titulo); if (seen.has(sig)) throw new Error('Tarea duplicada para ' + a.name + ': ' + t.titulo); seen.add(sig);
    }
    for (const t of tasks) for (const d of (t.depende_de || [])) if (!keys.has(String(d))) throw new Error('Dependencia inexistente: ' + d);
    // ciclos
    const depMap = Object.fromEntries(tasks.map(t => [String(t.clave || t.titulo), (t.depende_de || []).map(String)]));
    const visiting = new Set(), done = new Set();
    const dfs = k => { if (done.has(k)) return; if (visiting.has(k)) throw new Error('Las dependencias forman un ciclo.'); visiting.add(k); for (const d of depMap[k]) dfs(d); visiting.delete(k); done.add(k); };
    Object.keys(depMap).forEach(dfs);
    // una conversación de proyecto nunca crea planes en otro proyecto; desde una general, el resultado va a una conversación de ese proyecto
    const pid = meta.projectId ? meta.projectId : ((inp.proyecto_id && project(inp.proyecto_id)) ? inp.proyecto_id : null);
    if (pid && pid !== (meta.projectId || null) && meta.convId) meta.convId = Chat.ensureConv('daniel', pid).id;
    const autoRun = meta.autoApprove || !cfg.planApproval;
    const plan = Store.put('plans', { id: uid('pl'), title: trunc(inp.titulo || 'Plan', 120), goal: trunc(inp.objetivo || '', 1200), projectId: pid, convId: meta.convId || null, createdBy: meta.createdBy || 'daniel', state: autoRun ? 'en_curso' : 'pendiente_aprobacion', taskIds: [], createdAt: Date.now(), calls: 0, maxCalls: cfg.maxCallsPlan, scheduleId: meta.scheduleId || null });
    const idByKey = {};
    for (const t of tasks) idByKey[String(t.clave || t.titulo)] = uid('tk');
    for (const t of tasks) {
      const k = String(t.clave || t.titulo);
      const deps = (t.depende_de || []).map(d => idByKey[String(d)]);
      Store.put('tasks', { id: idByKey[k], planId: plan.id, parentId: null, depth: 0, kind: 'task', projectId: pid, agentId: String(t.responsable).toLowerCase().trim(), requestedBy: 'daniel', title: trunc(t.titulo, 140), instructions: trunc(t.instrucciones || t.titulo, 4000), deliverable: trunc(t.entregable || '', 400), deps, state: 'pendiente', attempt: 0, createdAt: Date.now(), logs: [{ ts: Date.now(), msg: 'Creada por Daniel en el plan «' + plan.title + '»' }] });
      plan.taskIds.push(idByKey[k]);
    }
    Store.put('plans', plan);
    Activity.log('plan', 'Daniel creó el plan «' + plan.title + '» con ' + tasks.length + ' tareas', { agentId: 'daniel', projectId: pid, planId: plan.id });
    if (autoRun) startPlan(plan.id);
    return plan;
  }
  function startPlan(pid) {
    const plan = P(pid); if (!plan) return;
    plan.state = 'en_curso'; Store.put('plans', plan);
    for (const t of planTasks(pid)) if (t.state === 'pendiente' && depsDone(t)) setTask(t, { state: 'en_cola' }, 'En cola');
    schedulePump();
  }
  function approvePlan(pid) { Activity.log('aprobacion', 'Aprobaste el plan «' + (P(pid) || {}).title + '»', { planId: pid }); startPlan(pid); }
  function depsDone(t) { return (t.deps || []).every(d => { const x = T(d); return x && x.state === 'completada'; }); }

  /* ---------- bomba de la cola ---------- */
  function schedulePump() { clearTimeout(pumpTimer); pumpTimer = setTimeout(pump, 60); if (!Leader.is()) Bus.emit('orch:kick'); }
  function pump() {
    if (!Leader.is() || hold) return;
    const cfg = Config.get();
    const queued = Store.all('tasks').filter(t => t.state === 'en_cola' && (!t.planId || (P(t.planId) && P(t.planId).state === 'en_curso'))).sort((a, b) => a.createdAt - b.createdAt);
    for (const t of queued) {
      if (running.size >= cfg.concurrency) break;
      if (running.has(t.id)) continue;
      // un agente no lleva dos tareas a la vez
      if ([...running.keys()].some(id => { const r = T(id); return r && r.agentId === t.agentId; })) continue;
      runTask(t.id);
    }
  }

  /* ---------- ejecución de una tarea ---------- */
  function taskPrompt(task) {
    const plan = P(task.planId), parts = [];
    parts.push('## TAREA ASIGNADA' + (task.kind === 'collab' ? ' (petición de colaboración de ' + ((Roster.get(task.requestedBy) || {}).name || task.requestedBy) + ')' : ''));
    if (plan) parts.push('Plan: ' + plan.title + (plan.goal ? '\nObjetivo del plan: ' + plan.goal : ''));
    parts.push('Tu tarea: ' + task.title + '\nInstrucciones: ' + task.instructions + (task.deliverable ? '\nEntregable esperado: ' + task.deliverable : ''));
    const deps = (task.deps || []).map(T).filter(Boolean);
    return { parts, deps };
  }
  async function buildFirstTurn(task) {
    const { parts, deps } = taskPrompt(task);
    for (const d of deps) {
      const txt = d.resultId ? ((await Store.load('dtext', d.resultId)) || {}).text || '' : (d.summary || '');
      parts.push('### Resultado previo: ' + d.title + ' (por ' + ((Roster.get(d.agentId) || {}).name || d.agentId) + ')\n' + trunc(txt, 7000));
    }
    const ag = Roster.get(task.agentId);
    parts.push('## CÓMO TRABAJAR\n- Entrega el resultado final completo en tu respuesta, en Markdown (o código completo si se pide). No narres tus pasos.\n- ' +
      (ag.perms.delegar && task.depth < Config.get().maxDepth ? 'Si necesitas a otro especialista usa pedir_colaboracion (máximo ' + ag.limits.maxColab + '); recibirás su respuesta y luego entregarás el resultado final.\n- ' : '') +
      'Si falta información imprescindible, usa reportar_bloqueo y explica qué necesitas.\n- Si el trabajo implica una acción sensible (publicar, lanzar campañas, gastar, enviar comunicaciones externas, borrar, cambiar configuraciones críticas), prepárala y usa solicitar_aprobacion.\n- No inventes datos reales; marca los supuestos.');
    return parts.join('\n\n');
  }
  async function runTask(id) {
    const task = T(id); if (!task || running.has(id)) return;
    const agent = Roster.get(task.agentId);
    const plan = P(task.planId);
    if (!agent || agent.enabled === false) { setTask(task, { state: 'bloqueada', error: 'El agente no existe o está desactivado.' }, 'Bloqueada: agente desactivado'); afterChange(task); return; }
    if (plan && plan.calls >= plan.maxCalls) { setTask(task, { state: 'pausada', error: 'Se alcanzó el límite de llamadas del plan (' + plan.maxCalls + ').' }, 'Pausada por límite de llamadas del plan'); plan.state = 'pausado'; Store.put('plans', plan); return; }
    const ctl = new AbortController(); running.set(id, { ctl, why: null });
    setTask(task, { state: 'en_curso', startedAt: task.startedAt || Date.now(), heartbeat: Date.now(), error: null }, task.resume ? 'Reanudada (' + task.resume + ')' : 'Empieza a trabajar');
    Activity.log('tarea', agent.name + ' empezó «' + task.title + '»', { agentId: agent.id, taskId: id, projectId: task.projectId });
    const hb = setInterval(() => { const t = T(id); if (t && t.state === 'en_curso') { t.heartbeat = Date.now(); Store.put('tasks', t); } }, 20000);
    const timer = setTimeout(() => { const r = running.get(id); if (r) { r.why = 'timeout'; r.ctl.abort(); } }, (agent.limits.maxDurSeg || 360) * 1000);
    try {
      const th0 = await Store.load('tthread', id); const th = th0 ? JSON.parse(JSON.stringify(th0)) : { id, turns: [] };
      if (!th.turns.length) th.turns.push({ role: 'user', content: await buildFirstTurn(task) });
      else if (task.resume && !th.sample) th.turns.push({ role: 'user', content: await continuation(task) });
      th.turns = compactTurns(th.turns);
      const ctx = { mode: 'task', agent, task, project: project(task.projectId), signals: th.signals || { collab: [], sub: [], approval: null, block: null }, events: [] };
      const input = [{ role: 'user', content: Prompt.preamble(agent, { project: ctx.project }) }].concat(th.turns);
      if (plan) { plan.calls++; Store.put('plans', plan); }
      const res = await AI.call({ agent, input, tools: Tools.build(agent, ctx), signal: ctl.signal, projectId: task.projectId, planId: task.planId, kind: 'task', label: task.title, taskId: id,
        resumeState: th.sample, onCheckpoint: async state => {
          th.sample = state; th.signals = JSON.parse(JSON.stringify(ctx.signals)); Store.put('tthread', th);
          if (!(await Store.flush(10000))) throw { code: 'checkpoint_failed', message: 'No se pudo guardar el avance. Reanuda cuando vuelva la conexión.' };
        } });
      const fresh = T(id); if (!fresh || fresh.state !== 'en_curso') return;   // pausada o cancelada mientras tanto
      fresh.toolEvents = (fresh.toolEvents || []).concat(ctx.events).slice(-30);
      fresh.resume = null; fresh.resumeNote = null;
      const sg = ctx.signals;
      if (!res.truncated || sg.block || sg.approval || sg.collab.length) {
        th.sample = null; th.signals = null;
        th.turns.push({ role: 'assistant', content: res.text || '(Herramientas ejecutadas; decisión pendiente.)' });
        Store.put('tthread', th);
      }
      const dropKids = why => { for (const c of sg.collab) { const x = T(c); if (x && !TERMINAL.has(x.state)) { const r = running.get(c); if (r) { r.why = 'cancel'; r.ctl.abort(); } else setTask(x, { state: 'cancelada' }, 'Cancelada: ' + why); } } };
      if (sg.block) { dropKids('la tarea que la pidió quedó bloqueada'); setTask(fresh, { state: 'bloqueada', error: sg.block }, 'Bloqueo: ' + sg.block); escalate(fresh, 'Bloqueo en «' + fresh.title + '»: ' + sg.block); }
      else if (sg.approval) {
        dropKids('la tarea que la pidió espera una aprobación');
        const ap = Store.get('approvals', sg.approval);
        if (ap && ap.state !== 'pendiente') setTask(fresh, { state: 'en_cola', resume: 'approval', resumeNote: approvalNote(ap), approvalId: sg.approval, draft: trunc(res.text, 600) }, 'Aprobación ya decidida');
        else setTask(fresh, { state: 'esperando_aprobacion', approvalId: sg.approval, draft: trunc(res.text, 600) }, 'Espera tu aprobación');
      }
      else if (sg.collab.length) {
        setTask(fresh, { state: 'esperando_colaboracion', waitingOn: sg.collab, draft: trunc(res.text, 600) }, 'Espera a ' + sg.collab.map(c => (Roster.get(T(c).agentId) || {}).name).join(', '));
        if (sg.collab.every(c => { const x = T(c); return x && TERMINAL.has(x.state); })) setTask(fresh, { state: 'en_cola', resume: 'collab' }, 'Colaboraciones recibidas');
      }
      else if (res.truncated) {
        const count = (fresh.continuations || 0) + 1;
        const automatic = count <= 2;
        setTask(fresh, { state: automatic ? 'en_cola' : 'pausada', resume: 'continuation', continuations: count,
          error: automatic ? null : 'La entrega sigue incompleta. Avance guardado; reanuda para continuar.' },
          automatic ? 'Continúa desde el avance guardado (' + res.stop + ')' : 'Pausada con avance guardado; no es una entrega completa');
      } else complete(fresh, res);
    } catch (e) {
      const t = T(id); if (!t) return;
      const why = running.get(id) && running.get(id).why;
      if (why === 'pause') setTask(t, { state: 'pausada' }, 'Pausada por ti');
      else if (why === 'handoff') setTask(t, { state: 'en_cola', resume: t.resume || null }, 'Continuará en el siguiente turno del servidor');
      else if (why === 'cancel') setTask(t, { state: 'cancelada' }, 'Cancelada por ti');
      else if (why === 'timeout') setTask(t, { state: 'fallida', error: AI.copy('timeout') }, 'Fallida por tiempo');
      else if (e.code === 'rate_limited' || e.code === 'daily_limit') setTask(t, { state: 'pausada', error: e.message }, 'Pausada: ' + e.message);
      else if (e.code === 'upstream_error' && (t.attempt || 0) < 1) setTask(t, { state: 'en_cola', attempt: (t.attempt || 0) + 1, resume: t.resume || null }, 'Reintento automático tras un fallo temporal');
      else setTask(t, { state: 'fallida', error: e.message || String(e) }, 'Fallida: ' + (e.message || e));
      if (t.state === 'fallida') Activity.log('error', (agent.name) + ' no pudo completar «' + t.title + '»: ' + t.error, { agentId: agent.id, taskId: id, projectId: t.projectId });
    } finally {
      clearInterval(hb); clearTimeout(timer); running.delete(id);
      const t = T(id); if (t) afterChange(t);
      schedulePump();
    }
  }
  function compactTurns(turns) {
    // conserva el encargo inicial y las últimas vueltas si crece demasiado
    let total = turns.reduce((n, t) => n + t.content.length, 0);
    while (total > 120000 && turns.length > 3) { const r = turns.splice(1, 1)[0]; total -= r.content.length; }
    return turns;
  }
  async function continuation(task) {
    if (task.resume === 'collab') {
      const out = ['Ya tienes las respuestas de colaboración que pediste:'];
      for (const cid of (task.waitingOn || [])) { const c = T(cid); if (!c) continue; const txt = c.resultId ? ((await Store.load('dtext', c.resultId)) || {}).text : c.error; out.push('### ' + ((Roster.get(c.agentId) || {}).name || c.agentId) + ' — ' + TS[c.state] + '\n' + trunc(txt || '', 6000)); }
      out.push('Intégralas y entrega ahora el resultado FINAL completo de tu tarea.');
      return out.join('\n\n');
    }
    if (task.resume === 'approval') return task.resumeNote || 'Decisión del administrador recibida. Entrega ahora el resultado final.';
    if (task.resume === 'info' || task.resume === 'retry') return (task.resumeNote ? 'Indicaciones del administrador: ' + task.resumeNote + '\n\n' : '') + 'Continúa y entrega el resultado final completo.';
    return 'Continúa y entrega el resultado final completo.';
  }
  function kindOf(text) { return /```html/i.test(text) ? 'html' : /```(js|javascript|python|py|liquid|json|ts|css|sh|bash)/i.test(text) ? 'code' : 'doc'; }
  function complete(task, res) {
    if (res.truncated) throw new Error('No se puede completar una tarea con una respuesta incompleta.');
    const d = Store.put('deliverables', { id: uid('dl'), projectId: task.projectId, planId: task.planId, taskId: task.id, agentId: task.agentId, title: task.title, kind: kindOf(res.text), summary: trunc(res.text.replace(/[#*`>|]/g, '').replace(/\s+/g, ' '), 280), ts: Date.now(), status: 'borrador', truncated: !!res.truncated, chars: res.text.length });
    Store.put('dtext', { id: d.id, text: res.text });
    setTask(task, { state: 'completada', endedAt: Date.now(), resultId: d.id, summary: d.summary }, 'Completada' + (res.truncated ? ' (respuesta cortada por longitud)' : ''));
    Activity.log('entregable', ((Roster.get(task.agentId) || {}).name) + ' entregó «' + task.title + '»', { agentId: task.agentId, taskId: task.id, projectId: task.projectId, deliverableId: d.id });
  }
  function escalate(task, text) {
    const plan = P(task.planId);
    const conv = plan && plan.convId ? Store.get('convs', plan.convId) : Chat.ensureConv('daniel', task.projectId);
    Chat.post(conv.id, { role: 'system', from: task.agentId, text: '**Escalado a Daniel** · ' + ((Roster.get(task.agentId) || {}).name || task.agentId) + ': ' + text + '\n\nPuedes responder en el panel de tareas (Reintentar con indicaciones) o pedir a Daniel que lo replantee.', meta: { taskId: task.id } });
    Activity.log('bloqueo', text, { agentId: task.agentId, taskId: task.id, projectId: task.projectId });
  }
  /* tras cada cambio: desbloquear dependientes, padres en espera y cierre del plan */
  function afterChange(task) {
    if (task.state === 'completada' || TERMINAL.has(task.state)) {
      // padres que esperaban esta colaboración
      for (const p of Store.all('tasks').filter(x => x.state === 'esperando_colaboracion' && (x.waitingOn || []).includes(task.id))) {
        if (p.waitingOn.every(c => { const x = T(c); return x && TERMINAL.has(x.state); })) setTask(p, { state: 'en_cola', resume: 'collab' }, 'Colaboraciones recibidas');
      }
      // dependientes
      if (task.planId) for (const t of planTasks(task.planId)) if ((t.state === 'pendiente' || (t.state === 'bloqueada' && t.error === 'Depende de una tarea que no se completó.')) && (t.deps || []).includes(task.id)) {
        if (depsDone(t)) setTask(t, { state: 'en_cola', error: null }, 'Dependencias completadas');
        else if (t.deps.some(d => { const x = T(d); return x && (x.state === 'fallida' || x.state === 'cancelada'); })) setTask(t, { state: 'bloqueada', error: 'Depende de una tarea que no se completó.' }, 'Bloqueada por dependencia');
      }
    }
    if (task.planId) checkPlan(task.planId);
    Bus.emit('orch');
  }
  function checkPlan(pid) {
    const plan = P(pid); if (!plan || !['en_curso', 'requiere_atencion'].includes(plan.state)) return;
    const ts = planTasks(pid);
    const STOP = new Set(['bloqueada', 'fallida', 'pausada', 'interrumpida', 'cancelada']);
    const live = t => {
      if (t.state === 'esperando_colaboracion') { const kids = (t.waitingOn || []).map(T).filter(Boolean); return kids.some(k => live(k) || k.state === 'completada') || !kids.length || !kids.every(k => STOP.has(k.state)); }
      return ACTIVE.has(t.state) || (t.state === 'pendiente' && depsDone(t));
    };
    if (ts.some(live)) return;
    if (ts.some(t => t.state === 'bloqueada' || t.state === 'fallida' || t.state === 'pausada' || t.state === 'interrumpida' || t.state === 'esperando_colaboracion')) { if (plan.state !== 'requiere_atencion') { plan.state = 'requiere_atencion'; Store.put('plans', plan); Activity.log('plan', 'El plan «' + plan.title + '» requiere tu atención', { planId: pid, projectId: plan.projectId }); } return; }
    if (ts.every(t => t.state === 'completada' || t.state === 'cancelada')) { if (Leader.is()) consolidate(pid); else Bus.emit('orch:kick'); }
  }
  /* Daniel consolida y presenta el resultado */
  async function consolidate(pid, force) {
    const plan = P(pid); if (!plan || plan.state === 'consolidando' || consolidating.has(pid)) return;
    plan.state = 'consolidando'; Store.put('plans', plan); Bus.emit('orch'); consolidating.add(pid);
    const daniel = Roster.get('daniel');
    const parts = ['Eres el director. El equipo ha terminado el plan «' + plan.title + '». Objetivo: ' + (plan.goal || '—') + '.', 'Resultados de cada tarea:'];
    for (const t of planTasks(pid).filter(x => x.depth === 0 || x.kind === 'sub')) {
      const txt = t.resultId ? ((await Store.load('dtext', t.resultId)) || {}).text : '';
      parts.push('### [' + (t.resultId || '-') + '] ' + t.title + ' — ' + ((Roster.get(t.agentId) || {}).name) + ' — ' + TS[t.state] + '\n' + trunc(txt || t.error || '', 5000));
    }
    parts.push('Escribe para el administrador un informe de entrega en Markdown: qué se ha hecho y por quién (cita los entregables por título), decisiones tomadas, riesgos o huecos detectados, qué debe revisar o aprobar él y próximos pasos. Sé directo y concreto. No inventes resultados que no estén arriba.');
    const live = Activity.start({ agentId: 'daniel', kind: 'task', label: 'Consolidando «' + plan.title + '»' });
    try {
      const input = [{ role: 'user', content: Prompt.preamble(daniel, { project: project(plan.projectId) }) }, { role: 'user', content: parts.join('\n\n') }];
      plan.calls++;
      const threadId = pid + '-summary';
      const previous = await Store.load('tthread', threadId);
      const res = await AI.call({ agent: daniel, input, projectId: plan.projectId, planId: pid, kind: 'task', label: 'Consolidación',
        resumeState: previous && previous.sample, onCheckpoint: async sample => {
          Store.put('tthread', { id: threadId, turns: [], sample });
          if (!(await Store.flush(10000))) throw { code: 'checkpoint_failed' };
        } });
      if (res.truncated) throw { code: 'incomplete_completion', message: 'El informe está incompleto. Avance guardado; reanuda el plan para continuarlo.' };
      Store.put('tthread', { id: threadId, turns: [], sample: null });
      if ((P(pid) || {}).state !== 'consolidando') return;   // cancelado mientras consolidaba
      const d = Store.put('deliverables', { id: uid('dl'), projectId: plan.projectId, planId: pid, taskId: null, agentId: 'daniel', title: 'Informe de entrega · ' + plan.title, kind: 'informe', summary: trunc(res.text.replace(/[#*`>|]/g, '').replace(/\s+/g, ' '), 280), ts: Date.now(), status: 'en_revision', chars: res.text.length });
      Store.put('dtext', { id: d.id, text: res.text });
      Object.assign(plan, { state: 'en_revision', consolidatedId: d.id, endedAt: Date.now() }); Store.put('plans', plan);
      if (plan.convId) Chat.post(plan.convId, { role: 'assistant', agentId: 'daniel', text: res.text, meta: { planId: pid, deliverableId: d.id, kind: 'consolidacion' } });
      Activity.log('plan', 'Daniel consolidó el plan «' + plan.title + '» y lo dejó listo para tu revisión', { agentId: 'daniel', planId: pid, projectId: plan.projectId, deliverableId: d.id });
    } catch (e) {
      plan.state = 'requiere_atencion'; plan.error = e.message; Store.put('plans', plan);
      Activity.log('error', 'No se pudo consolidar «' + plan.title + '»: ' + e.message, { planId: pid });
    } finally { consolidating.delete(pid); Activity.end(live); Bus.emit('orch'); }
  }

  /* ---------- acciones del administrador ---------- */
  function pausePlan(pid) { const plan = P(pid); if (!plan) return; plan.state = 'pausado'; Store.put('plans', plan); for (const t of planTasks(pid)) { const r = running.get(t.id); if (r) { r.why = 'pause'; r.ctl.abort(); } else if (t.state === 'en_cola') setTask(t, { state: 'pausada' }, 'Pausada por ti'); } Activity.log('plan', 'Pausaste el plan «' + plan.title + '»', { planId: pid }); Bus.emit('orch'); }
  function resumePlan(pid) { const plan = P(pid); if (!plan || ['cancelado', 'completado'].includes(plan.state)) return; if (plan.calls >= plan.maxCalls) plan.maxCalls = plan.calls + Config.get().maxCallsPlan; plan.state = 'en_curso'; plan.error = null; Store.put('plans', plan); for (const t of planTasks(pid)) if (['pausada', 'interrumpida'].includes(t.state)) setTask(t, { state: 'en_cola', resume: t.resume || (Store.get('tthread', t.id) ? 'retry' : null) }, 'Reanudada'); for (const t of planTasks(pid)) if (t.state === 'pendiente' && depsDone(t)) setTask(t, { state: 'en_cola' }); Activity.log('plan', 'Reanudaste el plan «' + plan.title + '»', { planId: pid }); schedulePump(); checkPlan(pid); Bus.emit('orch'); }
  function cancelPlan(pid) { const plan = P(pid); if (!plan) return; for (const t of planTasks(pid)) { const r = running.get(t.id); if (r) { r.why = 'cancel'; r.ctl.abort(); } else if (!TERMINAL.has(t.state)) setTask(t, { state: 'cancelada' }, 'Cancelada por ti'); } plan.state = 'cancelado'; Store.put('plans', plan); Activity.log('plan', 'Cancelaste el plan «' + plan.title + '»', { planId: pid }); Bus.emit('orch'); }
  function finishReview(pid, ok) { const plan = P(pid); if (!plan) return; plan.state = ok ? 'completado' : 'en_revision'; Store.put('plans', plan); if (ok && plan.consolidatedId) Store.patch('deliverables', plan.consolidatedId, { status: 'aprobado' }); Activity.log('plan', (ok ? 'Aprobaste la entrega de «' : 'Pediste cambios en «') + plan.title + '»', { planId: pid }); Bus.emit('orch'); }
  function retryTask(id, note) {
    const t = T(id); if (!t || running.has(id)) return;
    const pl0 = P(t.planId); if (pl0 && ['cancelado', 'completado'].includes(pl0.state)) { toast('Ese plan está ' + PS[pl0.state].toLowerCase() + '; pide a Daniel un plan nuevo.', true); return; }
    if (pl0 && pl0.calls >= pl0.maxCalls) pl0.maxCalls = pl0.calls + Config.get().maxCallsPlan;
    const hasThread = !!Store.get('tthread', id);
    setTask(t, { state: 'en_cola', attempt: 0, error: null, resume: hasThread ? (note ? 'info' : 'retry') : null, resumeNote: note || null }, 'Reintento pedido por ti' + (note ? ': ' + trunc(note, 80) : ''));
    const plan = P(t.planId); if (plan && plan.state !== 'en_curso') { plan.state = 'en_curso'; Store.put('plans', plan); }
    for (const x of planTasks(t.planId)) if (x.state === 'bloqueada' && (x.deps || []).includes(id)) setTask(x, { state: 'pendiente', error: null });
    schedulePump(); Bus.emit('orch');
  }
  function reassign(id, agentId) { const t = T(id); if (!t || running.has(id)) return; const plan = P(t.planId); if (plan && ['cancelado', 'completado'].includes(plan.state)) return; Store.del('tthread', id); setTask(t, { agentId, state: 'en_cola', resume: null, attempt: 0, error: null }, 'Reasignada a ' + ((Roster.get(agentId) || {}).name || agentId)); if (plan && plan.state !== 'en_curso') { plan.state = 'en_curso'; Store.put('plans', plan); } for (const x of planTasks(t.planId)) if (x.state === 'bloqueada' && (x.deps || []).includes(id)) setTask(x, { state: 'pendiente', error: null }); schedulePump(); Bus.emit('orch'); }
  function cancelTask(id) { const t = T(id); if (!t) return; const r = running.get(id); if (r) { r.why = 'cancel'; r.ctl.abort(); } else { setTask(t, { state: 'cancelada' }, 'Cancelada por ti'); afterChange(t); } }

  function approvalNote(a) {
    const ok = a.state === 'aprobada', note = a.note;
    if (a.kind === 'integracion') return ok
      ? (a.execState === 'hecha' ? 'El administrador APROBÓ «' + a.title + '» y el cambio YA SE HA EJECUTADO en la tienda. Resultado: ' + (a.execResult || '') + '. ' + (note ? 'Nota: ' + note + '. ' : '') + 'Entrega el resultado final.' : 'El administrador APROBÓ «' + a.title + '», pero al ejecutarlo falló: ' + (a.execError || 'error desconocido') + '. ' + (note ? 'Nota: ' + note + '. ' : '') + 'Explica el problema y entrega el resultado final sin reintentarlo.')
      : 'El administrador RECHAZA «' + a.title + '». ' + (note ? 'Motivo: ' + note + '. ' : '') + 'No lo propongas de nuevo; ajusta el trabajo y entrega el resultado final.';
    return ok ? 'El administrador APRUEBA la acción «' + a.title + '». ' + (note ? 'Nota: ' + note + '. ' : '') + 'Recuerda que no puedes ejecutarla fuera de La Cueva: deja el entregable listo y explica el paso exacto que él debe dar. Entrega el resultado final.'
      : 'El administrador RECHAZA la acción «' + a.title + '». ' + (note ? 'Motivo: ' + note + '. ' : '') + 'No la plantees de nuevo; ajusta el trabajo y entrega el resultado final.';
  }
  /* ---------- aprobaciones ---------- */
  function requestApproval(o) {
    const a = Store.put('approvals', Object.assign({ id: uid('ap'), state: 'pendiente', createdAt: Date.now() }, o));
    Activity.log('aprobacion', ((Roster.get(o.agentId) || {}).name || o.agentId) + ' solicita aprobación: ' + o.title, { agentId: o.agentId, taskId: o.taskId, projectId: o.projectId });
    Bus.emit('approvals'); return a;
  }
  function decide(id, ok, note) {
    const a = Store.get('approvals', id); if (!a || a.state !== 'pendiente') return;
    Store.patch('approvals', id, { state: ok ? 'aprobada' : 'rechazada', decidedAt: Date.now(), note: note || '' });
    Activity.log('aprobacion', (ok ? 'Aprobaste' : 'Rechazaste') + ': ' + a.title, { agentId: a.agentId, taskId: a.taskId, projectId: a.projectId });
    if (a.kind === 'nuevo_agente' && ok) { const ag = Roster.create(a.payload); View.setAgents(Roster.enabled()); Activity.log('equipo', 'Nueva contratación habilitada: ' + ag.name + ' (' + ag.role + ')', { agentId: ag.id }); }
    if (a.kind === 'permiso' && ok && a.payload && Object.hasOwn(PERMS, a.payload.permiso)) { const ag = Roster.get(a.agentId); if (ag) { ag.perms[a.payload.permiso] = true; Roster.save(ag); } }
    const resume = () => {
      const ap = Store.get('approvals', id);
      if (a.taskId) { const t = T(a.taskId); if (t && t.state === 'esperando_aprobacion') { setTask(t, { state: 'en_cola', resume: 'approval', resumeNote: approvalNote(ap) }, ok ? 'Aprobación concedida' : 'Aprobación rechazada'); schedulePump(); } }
      if (a.convId && !a.taskId) Chat.post(a.convId, { role: 'system', text: (ok ? 'Has **aprobado**' : 'Has **rechazado**') + ': ' + a.title + (note ? ' — ' + note : '') + (ap && ap.kind === 'integracion' && ok ? (ap.execState === 'hecha' ? '\n\n**Ejecutado:** ' + ap.execResult : '\n\n**No se pudo ejecutar:** ' + (ap.execError || 'error desconocido')) : '') });
      Bus.emit('approvals'); Bus.emit('orch');
    };
    // integraciones: al aprobar, el servidor ejecuta exactamente lo propuesto (una sola vez) y luego sigue la tarea
    if (a.kind === 'integracion' && ok && window.LCIntegrations) {
      Store.patch('approvals', id, { execState: 'pendiente' });
      (async () => {
        await Store.flush();
        let r; try { r = await window.LCIntegrations.execute(id); } catch (e) { r = { state: 'fallida', result: (e && e.message) || 'error' }; }
        Store.patch('approvals', id, r.state === 'hecha' ? { execState: 'hecha', execResult: r.result, execAt: Date.now() } : { execState: 'fallida', execError: r.result, execAt: Date.now() });
        Activity.log('integracion', (r.state === 'hecha' ? 'Ejecutado en Shopify: ' : 'Falló en Shopify: ') + trunc(String(r.result || ''), 120), { projectId: a.projectId, agentId: a.agentId });
        toast(r.state === 'hecha' ? 'Hecho en Shopify: ' + trunc(String(r.result || ''), 90) : 'No se pudo ejecutar en Shopify: ' + trunc(String(r.result || ''), 90), r.state !== 'hecha');
        resume();
      })();
      return;
    }
    if (a.kind === 'integracion' && ok) Store.patch('approvals', id, { execState: 'fallida', execError: 'Las integraciones solo funcionan en la versión con servidor.' });
    resume();
  }

  /* ---------- recuperación al abrir ---------- */
  function recover() {
    if (!Leader.is()) return 0;
    let n = 0; const worker = LC_RUNTIME === 'worker';
    for (const t of Store.all('tasks')) if (t.state === 'en_curso' && !running.has(t.id) && Date.now() - (t.heartbeat || 0) > 60000) {
      // en el servidor, una tarea cortada (p. ej. por el límite de tiempo de la función) vuelve a la cola hasta 2 veces
      if (worker && (t.recoveries || 0) < 2) setTask(t, { state: 'en_cola', recoveries: (t.recoveries || 0) + 1, resume: Store.get('tthread', t.id) ? 'retry' : (t.resume || null) }, 'Retomada por el servidor tras una interrupción');
      else { setTask(t, { state: 'interrumpida' }, worker ? 'Interrumpida varias veces en el servidor' : 'Interrumpida: La Cueva se cerró mientras trabajaba'); n++; }
    }
    for (const t of Store.all('tasks')) if (t.state === 'esperando_colaboracion' && (t.waitingOn || []).every(c => { const x = T(c); return x && TERMINAL.has(x.state); })) setTask(t, { state: 'en_cola', resume: 'collab' }, 'Colaboraciones recibidas');
    for (const p of Store.all('plans')) if (p.state === 'consolidando' && !consolidating.has(p.id)) {
      if (worker) { p.state = 'en_curso'; Store.put('plans', p); }
      else { p.state = 'requiere_atencion'; p.error = 'La consolidación se interrumpió.'; Store.put('plans', p); }
    }
    if (n) Activity.log('sistema', n + ' tarea(s) quedaron interrumpidas' + (worker ? ' en el servidor' : ' al cerrar La Cueva') + '. Puedes reanudarlas.', {});
    for (const p of Store.all('plans')) if (p.state === 'en_curso') checkPlan(p.id);
    schedulePump();
    return n;
  }
  /* cambios hechos desde otro sitio (p. ej. pausar o cancelar desde el navegador mientras el servidor trabaja) */
  function reconcile() {
    for (const [id, r] of running) {
      const t = T(id), plan = t && P(t.planId);
      if (!t || t.state === 'cancelada' || (plan && plan.state === 'cancelado')) { if (!r.why) { r.why = 'cancel'; r.ctl.abort(); } }
      else if (t.state === 'pausada' || (plan && plan.state === 'pausado')) { if (!r.why) { r.why = 'pause'; r.ctl.abort(); } }
    }
  }
  function drain(why) { for (const r of running.values()) if (!r.why) { r.why = why || 'handoff'; r.ctl.abort(); } }
  function setHold(v) { hold = !!v; }
  function hasQueued() { return Store.all('tasks').some(t => t.state === 'en_cola' && (!t.planId || (P(t.planId) && P(t.planId).state === 'en_curso'))); }
  /* estado visible de cada agente según el trabajo real */
  const stCache = new Map(); let stAt = 0;
  Bus.on('store:tasks', () => stCache.clear()); Bus.on('store:plans', () => stCache.clear()); Bus.on('live', () => stCache.clear());
  function agentStatus(id) {
    const now = performance.now(); if (now - stAt > 1000) { stCache.clear(); stAt = now; }
    if (stCache.has(id)) return stCache.get(id);
    const v = agentStatus0(id); stCache.set(id, v); return v;
  }
  function agentStatus0(id) {
    for (const l of Activity.live.values()) if (l.agentId === id) return { state: 'working', label: l.label || (l.kind === 'chat' ? 'Respondiendo en el chat' : 'Trabajando') };
    const ts = Store.all('tasks').filter(t => t.agentId === id);
    const run = ts.find(t => t.state === 'en_curso'); if (run) return { state: 'working', label: run.title };
    const w = ts.find(t => t.state === 'esperando_aprobacion'); if (w) return { state: 'waiting', label: 'Espera tu aprobación: ' + w.title };
    const c = ts.find(t => t.state === 'esperando_colaboracion'); if (c) { const other = T((c.waitingOn || [])[0]); return { state: 'collab', label: 'Colaborando en ' + c.title, with: other && other.agentId, visitor: true }; }
    const helping = Store.all('tasks').find(t => t.state === 'esperando_colaboracion' && (t.waitingOn || []).some(x => { const y = T(x); return y && y.agentId === id && !TERMINAL.has(y.state); }));
    if (helping) return { state: 'collab', label: 'Ayudando a ' + ((Roster.get(helping.agentId) || {}).name || ''), with: helping.agentId };
    const b = ts.find(t => ['bloqueada', 'fallida', 'pausada', 'interrumpida'].includes(t.state) && t.planId && P(t.planId) && !['cancelado', 'completado'].includes(P(t.planId).state));
    if (b) return { state: 'stopped', label: TS[b.state] + ': ' + b.title };
    const q = ts.find(t => t.state === 'en_cola'); if (q) return { state: 'idle', label: 'Tarea en cola: ' + q.title, queued: true };
    return { state: 'idle', label: 'Disponible' };
  }
  return { createPlan, approvePlan, startPlan, pausePlan, resumePlan, cancelPlan, finishReview, retryTask, reassign, cancelTask, requestApproval, decide, recover, agentStatus, consolidate, pump: schedulePump, running, planTasks, checkPlan, reconcile, drain, setHold, hasQueued, get consolidating() { return consolidating; } };
})();

/* ============================================================
   Herramientas que los agentes pueden usar (ejecutadas aquí, en La Cueva)
   ============================================================ */
const Tools = (() => {
  const S = (props, req) => ({ type: 'object', properties: props, required: req || [] });
  const str = d => ({ type: 'string', description: d });
  function allowed(agent, name) { const t = TOOLS[name]; return t && agent.perms.herramientas && (t.always ? !(agent.toolsOff || []).includes(name) : (agent.tools || []).includes(name)) && agent.perms[t.perm]; }
  function ev(ctx, name, input, result) { ctx.events.push({ name, label: TOOLS[name] ? TOOLS[name].label : name, input: trunc(JSON.stringify(input), 300), result: trunc(typeof result === 'string' ? result : JSON.stringify(result), 400), ts: Date.now() }); Bus.emit('tool:event', { ctx, name }); }
  function wrap(ctx, name, fn) { return async (input) => { try { const r = await fn(input || {}); ev(ctx, name, input, r); return r; } catch (e) { ev(ctx, name, input, 'Error: ' + (e.message || e)); throw e; } }; }
  function build(agent, ctx) {
    const list = [], add = (name, description, schema, fn) => { if (allowed(agent, name)) list.push({ name, description, inputSchema: schema, execute: wrap(ctx, name, fn) }); };
    const pid = ctx.project ? ctx.project.id : null;
    add('consultar_documentos', 'Busca en los documentos y entregables del proyecto actual por palabras clave y devuelve fragmentos relevantes. Solo funciona dentro de un proyecto.', S({ consulta: str('Palabras clave') }, ['consulta']), async i => {
      if (!pid) return 'No hay proyecto en esta conversación, así que no hay documentos que consultar.';
      const r = await Memory.search(pid, String(i.consulta || ''), 5); return r.length ? r.map(x => '[' + x.src + ']\n' + x.text).join('\n\n') : 'Sin resultados para esa consulta.';
    });
    add('registrar_decision', 'Guarda una decisión o dato relevante en la memoria operativa del proyecto actual para que el equipo la recuerde.', S({ texto: str('Decisión o dato, en una o dos frases') }, ['texto']), async i => { Memory.note(pid, String(i.texto), agent.id, ctx.task && ctx.task.id); return 'Guardado en la memoria del proyecto.'; });
    add('proponer_regla_memoria', 'Propone una regla, preferencia o procedimiento PERMANENTE. No se aplica hasta que el administrador la apruebe. Úsala solo si el administrador expresa algo duradero.', S({ alcance: { type: 'string', enum: ['agencia', 'proyecto', 'cliente', 'agente'] }, texto: str('La regla, redactada de forma clara'), motivo: str('Por qué la propones') }, ['alcance', 'texto']), async i => {
      const sc = String(i.alcance); const p = ctx.project;
      if ((sc === 'proyecto' || sc === 'cliente') && !p) return 'Esa regla necesita un proyecto; en esta conversación no hay ninguno.';
      if (sc === 'cliente' && !p.client) return 'Este proyecto no tiene cliente asignado.';
      const r = Memory.propose({ scope: sc, scopeId: sc === 'proyecto' ? p.id : sc === 'cliente' ? p.client : sc === 'agente' ? agent.id : null, text: String(i.texto || ''), reason: String(i.motivo || ''), agentId: agent.id, convId: ctx.convId, taskId: ctx.task && ctx.task.id, projectId: pid });
      return r.dup ? 'Ya existe una regla igual (estado: ' + r.rule.state + ').' : 'Propuesta registrada. Queda pendiente de la aprobación del administrador.';
    });
    add('solicitar_aprobacion', 'Pide al administrador que apruebe una acción sensible (publicar, lanzar campañas, gastar, enviar comunicaciones externas, comprar, borrar, cambiar configuración crítica o ampliar permisos). La tarea queda en espera hasta su decisión.', S({ accion: str('Acción concreta que pides aprobar'), detalle: str('Qué, dónde, coste o alcance, y riesgos'), permiso: str('Solo si pides ampliar un permiso: su clave') }, ['accion', 'detalle']), async i => {
      if (ctx.signals && ctx.signals.approval) return 'Ya hay una aprobación pendiente en esta tarea.';
      const perm = i.permiso && Object.hasOwn(PERMS, String(i.permiso)) ? String(i.permiso) : null;
      const a = Orch.requestApproval({ kind: perm ? 'permiso' : 'accion', agentId: agent.id, taskId: ctx.task ? ctx.task.id : null, convId: ctx.task ? null : ctx.convId, projectId: pid, title: trunc(String(i.accion), 160), details: trunc(String(i.detalle || ''), 2000), payload: perm ? { permiso: perm } : null });
      if (ctx.signals) ctx.signals.approval = a.id;
      return 'Solicitud enviada (' + a.id + '). ' + (ctx.task ? 'Termina tu respuesta con el trabajo preparado; continuarás cuando el administrador decida.' : 'El administrador la verá en Aprobaciones.');
    });
    // páginas de un PDF del proyecto como imágenes (la IA las ve, no solo el texto)
    if (pid && Store.all('pdocs').some(d => d.projectId === pid && d.pages)) add('ver_paginas_documento', 'Muestra como imágenes páginas de un PDF del proyecto (fotos, diseño, gráficos, logotipos). Úsala cuando el texto no basta. Máximo 4 páginas por llamada.', S({ documento: str('Nombre del documento'), paginas: str('Páginas, p. ej. «1-4» o «2,5»') }, ['documento']), async i => {
      const name = String(i.documento || '').toLowerCase().trim();
      const docs = Store.all('pdocs').filter(d => d.projectId === pid && d.pages);
      const d = docs.find(x => x.name.toLowerCase() === name || x.id === i.documento) || docs.find(x => x.name.toLowerCase().includes(name));
      if (!d) return 'No hay ningún PDF con páginas guardadas con ese nombre. Disponibles: ' + docs.map(x => x.name).join(', ');
      const want = []; for (const part of String(i.paginas || '1-4').split(',')) { const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/); if (m) { const a = +m[1], b = +(m[2] || m[1]); for (let n = a; n <= b && want.length < 4; n++) if (n >= 1 && n <= d.pages) want.push(n); } }
      if (!want.length) return 'Páginas no válidas: el documento tiene ' + d.pages + ' páginas guardadas.';
      const images = [];
      for (const n of want) { const pg = await Store.load('pimg', d.id + '-p' + n); if (pg && pg.data) images.push({ mediaType: pg.mediaType || 'image/jpeg', data: pg.data }); }
      if (!images.length) return 'No se pudieron cargar las imágenes de esas páginas.';
      return { text: 'Páginas ' + want.join(', ') + ' de «' + d.name + '» (' + d.pages + ' en total):', images };
    });
    // Shopify del proyecto: lectura directa; escritura solo con aprobación
    const shop = LC_SERVER && ctx.project && ctx.project.integrations && ctx.project.integrations.shopify && window.LCIntegrations;
    if (shop) {
      add('shopify_consultar', 'Consulta la tienda Shopify conectada a este proyecto (solo lectura). Operaciones: estado_tienda, buscar_productos (consulta, limite), ver_producto (id), resumen_pedidos (dias).', S({ operacion: { type: 'string', enum: ['estado_tienda', 'buscar_productos', 'ver_producto', 'resumen_pedidos'] }, consulta: str('Texto a buscar (buscar_productos)'), id: str('gid://shopify/Product/… (ver_producto)'), limite: { type: 'integer' }, dias: { type: 'integer' } }, ['operacion']), async i => {
        const r = await window.LCIntegrations.read(pid, String(i.operacion), { consulta: i.consulta, id: i.id, limite: i.limite, dias: i.dias });
        return trunc(JSON.stringify(r), 12000);
      });
      add('shopify_proponer_cambio', 'Propone un cambio en la tienda Shopify del proyecto. NO se ejecuta hasta que el administrador lo aprueba; entonces se aplica exactamente lo propuesto. Acciones: crear_producto_borrador (titulo, descripcion_html, tipo, proveedor, etiquetas, seo_*), actualizar_producto (producto_id + campos a cambiar), cambiar_estado_producto (producto_id, estado ACTIVE/DRAFT/ARCHIVED; ACTIVE publica).', S({ accion: { type: 'string', enum: ['crear_producto_borrador', 'actualizar_producto', 'cambiar_estado_producto'] }, producto_id: str('gid://shopify/Product/… (para actualizar o cambiar estado)'), titulo: str('Título'), descripcion_html: str('Descripción en HTML'), tipo: str('Tipo de producto'), proveedor: str('Proveedor o marca'), etiquetas: { type: 'array', items: { type: 'string' } }, seo_titulo: str('Título SEO'), seo_descripcion: str('Meta descripción'), estado: { type: 'string', enum: ['ACTIVE', 'DRAFT', 'ARCHIVED'] }, motivo: str('Por qué propones el cambio') }, ['accion', 'motivo']), async i => {
        if (ctx.signals && ctx.signals.approval) return 'Ya hay una aprobación pendiente en esta tarea.';
        const params = {}; for (const k of ['producto_id', 'titulo', 'descripcion_html', 'tipo', 'proveedor', 'etiquetas', 'seo_titulo', 'seo_descripcion', 'estado']) if (i[k] != null && i[k] !== '') params[k] = k === 'descripcion_html' ? trunc(String(i[k]), 20000) : i[k];
        const label = { crear_producto_borrador: 'Crear producto en borrador', actualizar_producto: 'Actualizar producto', cambiar_estado_producto: 'Cambiar estado de producto' }[i.accion] || i.accion;
        const det = '**Tienda:** ' + ctx.project.integrations.shopify.shop + '\n\n**Motivo:** ' + trunc(String(i.motivo || ''), 600) + '\n\n**Cambio exacto que se aplicará:**\n' + Object.entries(params).map(([k, v]) => '- ' + k + ': ' + trunc(Array.isArray(v) ? v.join(', ') : String(v).replace(/<[^>]+>/g, ' '), 400)).join('\n') + (i.accion === 'cambiar_estado_producto' && String(i.estado) === 'ACTIVE' ? '\n\n**Atención:** esto PUBLICA el producto en la tienda.' : '');
        const a = Orch.requestApproval({ kind: 'integracion', agentId: agent.id, taskId: ctx.task ? ctx.task.id : null, convId: ctx.task ? null : ctx.convId, projectId: pid, title: 'Shopify · ' + label + (params.titulo ? ': ' + trunc(String(params.titulo), 80) : ''), details: det, payload: { provider: 'shopify', action: String(i.accion), params } });
        if (ctx.signals) ctx.signals.approval = a.id;
        return 'Propuesta enviada a Aprobaciones (' + a.id + '). No se ha cambiado nada en la tienda todavía.' + (ctx.task ? ' Termina tu respuesta; continuarás cuando el administrador decida.' : '');
      });
    }
    if (ctx.mode === 'task') {
      add('pedir_colaboracion', 'Pide a otro especialista una parte concreta del trabajo. Recibirás su respuesta y después entregarás tu resultado final. Usa los id del equipo.', S({ agente: str('id del especialista'), peticion: str('Qué necesitas exactamente y para qué') }, ['agente', 'peticion']), async i => collab(agent, ctx, String(i.agente || '').toLowerCase().trim(), String(i.peticion || ''), true));
      add('crear_subtarea', 'Crea una subtarea independiente para otro especialista dentro del mismo plan, sin esperar su resultado (Daniel la tendrá en cuenta al consolidar).', S({ agente: str('id del especialista'), titulo: str('Título corto'), instrucciones: str('Instrucciones claras') }, ['agente', 'titulo', 'instrucciones']), async i => collab(agent, ctx, String(i.agente || '').toLowerCase().trim(), String(i.instrucciones || ''), false, String(i.titulo || '')));
      add('reportar_bloqueo', 'Informa de que no puedes continuar sin una información o decisión. La tarea queda bloqueada y se escala a Daniel y al administrador.', S({ motivo: str('Qué te bloquea'), que_necesitas: str('Qué necesitas para seguir') }, ['motivo']), async i => { ctx.signals.block = trunc(String(i.motivo) + (i.que_necesitas ? ' — Necesita: ' + i.que_necesitas : ''), 600); return 'Bloqueo registrado. Termina tu respuesta explicando qué falta.'; });
    } else if (agent.dept !== 'DIR') {
      add('escalar_a_daniel', 'Envía un asunto a Daniel (director) cuando algo excede tu función o necesita coordinar a varios especialistas.', S({ asunto: str('Asunto'), detalle: str('Contexto y lo que propones') }, ['asunto']), async i => { const c = Chat.ensureConv('daniel', pid); Chat.post(c.id, { role: 'system', from: agent.id, text: '**Escalado por ' + agent.name + '** · ' + String(i.asunto) + (i.detalle ? '\n\n' + String(i.detalle) : '') }); Activity.log('escalado', agent.name + ' escaló a Daniel: ' + trunc(String(i.asunto), 80), { agentId: agent.id, projectId: pid }); return 'Escalado a Daniel. Lo verá en su conversación.'; });
    }
    if (agent.dept === 'DIR' && ctx.mode !== 'task') {
      add('crear_plan', 'EJECUTAR: crea un plan con tareas asignadas a especialistas y lo pone en marcha (o lo deja pendiente del visto bueno del administrador según su configuración). Úsala solo cuando el administrador pide claramente que se haga un trabajo.', S({
        titulo: str('Título del plan'), objetivo: str('Resultado que se busca'), proyecto_id: str('id del proyecto, si aplica'),
        tareas: { type: 'array', description: 'Tareas (máximo ' + Config.get().maxTasksPlan + ')', items: S({ clave: str('Identificador corto único, p. ej. t1'), titulo: str('Título corto'), instrucciones: str('Instrucciones completas para el especialista'), responsable: str('id del especialista'), depende_de: { type: 'array', items: { type: 'string' }, description: 'Claves de tareas previas cuyo resultado necesita' }, entregable: str('Qué debe entregar') }, ['clave', 'titulo', 'instrucciones', 'responsable']) }
      }, ['titulo', 'tareas']), async i => {
        const plan = Orch.createPlan(i, { convId: ctx.convId, projectId: pid, createdBy: 'daniel' });
        ctx.planId = plan.id;
        return 'Plan creado (' + plan.id + ') con ' + plan.taskIds.length + ' tareas. Estado: ' + PS[plan.state] + '.' + (plan.state === 'pendiente_aprobacion' ? ' El administrador debe darle el visto bueno en la tarjeta del plan.' : ' Ya está en marcha.');
      });
      add('programar_tarea', 'PROGRAMAR: crea una tarea recurrente o futura para un especialista. Solo si el administrador lo pide. ' + (LC_SERVER ? 'La ejecuta el servidor aunque La Cueva esté cerrada (revisión cada hora).' : 'Se ejecuta mientras La Cueva esté abierta.'), S({ titulo: str('Título'), instrucciones: str('Qué debe hacer cada vez'), responsable: str('id del especialista'), frecuencia: { type: 'string', enum: ['una_vez', 'diaria', 'semanal', 'mensual'] }, hora: str('HH:MM'), dia_semana: { type: 'integer', description: '1=lunes … 7=domingo (semanal)' }, dia_mes: { type: 'integer', description: '1-28 (mensual)' }, fecha: str('AAAA-MM-DD (una vez)'), proyecto_id: str('id del proyecto, si aplica') }, ['titulo', 'instrucciones', 'responsable', 'frecuencia']), async i => {
        const s = Sched.create(i, pid); return 'Programación creada: «' + s.title + '». Próxima ejecución: ' + (s.nextRun ? fmtDT(s.nextRun) : '—') + (LC_SERVER ? '. La ejecutará el servidor (se revisa cada hora, así que puede variar hasta una hora).' : '. Importante: solo se ejecuta con La Cueva abierta.');
      });
      add('proponer_contratacion', 'Propone contratar un nuevo agente digital. El administrador debe aprobarlo para crearlo y habilitarlo.', S({ nombre: str('Nombre'), cargo: str('Cargo'), departamento: { type: 'string', enum: DEPT_IDS }, especialidad: str('Especialidad'), personalidad: str('Personalidad'), instrucciones: str('Instrucciones del puesto'), motivo: str('Por qué hace falta') }, ['nombre', 'cargo', 'departamento', 'motivo']), async i => {
        const a = Orch.requestApproval({ kind: 'nuevo_agente', agentId: 'daniel', convId: ctx.convId, projectId: pid, title: 'Contratar a ' + i.nombre + ' (' + i.cargo + ')', details: String(i.motivo || ''), payload: { name: String(i.nombre), role: String(i.cargo), dept: DEPT_IDS.includes(i.departamento) ? i.departamento : 'MKT', specialty: String(i.especialidad || ''), personality: String(i.personalidad || ''), instructions: String(i.instrucciones || '') } });
        return 'Propuesta de contratación enviada a Aprobaciones (' + a.id + ').';
      });
      add('consultar_estado', 'Devuelve el estado actual de la agencia: proyectos, planes, tareas por estado, aprobaciones pendientes y qué hace cada agente. Solo metadatos, sin contenidos de proyectos.', S({}), async () => {
        const tasks = Store.all('tasks'), by = {}; for (const t of tasks) by[t.state] = (by[t.state] || 0) + 1;
        return JSON.stringify({ proyectos: Store.all('projects').map(p => ({ id: p.id, nombre: p.name, estado: p.status })), planes: Store.all('plans').slice(-10).map(p => ({ id: p.id, titulo: p.title, estado: PS[p.state] })), tareas_por_estado: by, aprobaciones_pendientes: Store.all('approvals').filter(a => a.state === 'pendiente').length, reglas_propuestas: Store.all('rules').filter(r => r.state === 'propuesta').length, agentes_ocupados: Roster.enabled().map(a => ({ id: a.id, estado: Orch.agentStatus(a.id).label })).filter(x => x.estado !== 'Disponible') });
      });
      add('crear_proyecto', 'Crea un proyecto nuevo (negocio o cliente) cuando el administrador lo pida.', S({ nombre: str('Nombre'), descripcion: str('Descripción'), objetivos: str('Objetivos'), cliente: str('Nombre del cliente, si es un cliente externo') }, ['nombre']), async i => { const p = Projects.create({ name: String(i.nombre), description: String(i.descripcion || ''), objectives: String(i.objetivos || ''), client: String(i.cliente || '') }); return 'Proyecto creado: ' + p.name + ' (' + p.id + ').'; });
      add('leer_entregable', 'Lee el contenido de un entregable por su id para revisarlo. Solo entregables del proyecto actual (o generales si no hay proyecto).', S({ id: str('id del entregable') }, ['id']), async i => { const d = Store.get('deliverables', String(i.id)); if (!d) return 'No existe ese entregable.'; if ((d.projectId || null) !== (pid || null) && !agent.perms.otros_proyectos) return 'Ese entregable pertenece a otro proyecto; ábrelo dentro de su proyecto.'; const t = await Store.load('dtext', d.id); return trunc((t && t.text) || '', 12000); });
    }
    return list;
  }
  function collab(agent, ctx, targetId, request, wait, title) {
    const cfg = Config.get(), task = ctx.task, target = Roster.get(targetId);
    if (!target || target.enabled === false || target.dept === 'DIR') return 'Ese especialista no existe o no está disponible. Usa un id del equipo.';
    if (target.id === agent.id) return 'No puedes pedirte colaboración a ti mismo.';
    if (task.depth + 1 > cfg.maxDepth) return 'Límite de delegación alcanzado: resuelve esta parte tú o reporta un bloqueo.';
    // evita cadenas circulares (A → B → A)
    let p = task, chain = new Set([task.agentId]); while (p && p.parentId) { p = Store.get('tasks', p.parentId); if (p) chain.add(p.agentId); }
    if (chain.has(target.id)) return 'Esa persona ya participa en esta cadena de colaboración; no se permite delegar en círculo.';
    const mine = Store.all('tasks').filter(t => t.parentId === task.id);
    const lim = wait ? agent.limits.maxColab : agent.limits.maxSubtareas;
    if (mine.filter(t => (t.kind === 'collab') === wait).length >= lim) return 'Has alcanzado tu límite de ' + lim + (wait ? ' colaboraciones' : ' subtareas') + ' en esta tarea.';
    if (mine.some(t => t.agentId === target.id && norm2(t.instructions) === norm2(request))) return 'Ya pediste eso mismo a ' + target.name + '.';
    const plan = Store.get('plans', task.planId); if (plan && plan.calls + 2 > plan.maxCalls) return 'El plan está cerca de su límite de llamadas; no se pueden abrir más colaboraciones.';
    const t = Store.put('tasks', { id: uid('tk'), planId: task.planId, parentId: task.id, depth: task.depth + 1, kind: wait ? 'collab' : 'sub', projectId: task.projectId, agentId: target.id, requestedBy: agent.id, title: trunc(title || ('Colaboración para ' + agent.name + ': ' + request), 140), instructions: trunc(request, 3000), deps: [], state: 'en_cola', attempt: 0, createdAt: Date.now(), logs: [{ ts: Date.now(), msg: 'Pedida por ' + agent.name }] });
    if (plan) { plan.taskIds.push(t.id); Store.put('plans', plan); }
    Activity.log('colaboracion', agent.name + ' pidió ' + (wait ? 'colaboración' : 'una subtarea') + ' a ' + target.name + ': ' + trunc(request, 80), { agentId: agent.id, taskId: t.id, projectId: task.projectId });
    if (wait) ctx.signals.collab.push(t.id); else ctx.signals.sub.push(t.id);
    Orch.pump();
    return wait ? 'Petición enviada a ' + target.name + ' (' + t.id + '). Termina ahora tu respuesta con lo que ya tengas; recibirás su resultado para completar la tarea.' : 'Subtarea creada para ' + target.name + ' (' + t.id + ').';
  }
  function norm2(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  return { build };
})();

/* ============================================================
   Proyectos y programación
   ============================================================ */
const Projects = (() => {
  const COLORS = [BR.forest, '#7a5236', '#3c7571', '#76596c', '#a8873a', '#5f7487', '#ad6c62', '#73843f'];
  function create(f) {
    const n = Store.all('projects').length;
    const p = Store.put('projects', { id: uid('pr'), name: trunc(f.name || 'Proyecto', 80), description: f.description || '', objectives: f.objectives || '', client: (f.client || '').trim(), kind: f.client ? 'cliente' : 'negocio', color: f.color || COLORS[n % COLORS.length], agents: f.agents || [], status: 'activo', createdAt: Date.now() });
    Activity.log('proyecto', 'Proyecto creado: ' + p.name, { projectId: p.id });
    return p;
  }
  return { create };
})();

const Sched = (() => {
  function valid(s) { return ['una_vez', 'diaria', 'semanal', 'mensual'].includes(s.freq) && /^\d{2}:\d{2}$/.test(s.time || '') && Number.isInteger(s.dow) && s.dow >= 1 && s.dow <= 7 && Number.isInteger(s.dom) && s.dom >= 1 && s.dom <= 28 && (s.freq !== 'una_vez' || !s.date || /^\d{4}-\d{2}-\d{2}$/.test(s.date)); }
  function next(s, from) {
    if (!valid(s)) return null;
    const now = new Date(from || Date.now()); const [hh, mm] = String(s.time || '09:00').split(':').map(Number);
    const d = new Date(now); d.setHours(hh || 9, mm || 0, 0, 0);
    if (s.freq === 'una_vez') { if (s.date) { const [y, m, dd] = s.date.split('-').map(Number); const x = new Date(y, m - 1, dd, hh || 9, mm || 0); return x.getTime() > now.getTime() - 60000 ? x.getTime() : null; } return d.getTime() > now.getTime() ? d.getTime() : d.getTime() + 86400000; }
    if (s.freq === 'diaria') { if (d <= now) d.setDate(d.getDate() + 1); return d.getTime(); }
    if (s.freq === 'semanal') { const want = s.dow % 7; for (let i = 0; i < 9 && (d.getDay() !== want || d <= now); i++) d.setDate(d.getDate() + 1); return d > now ? d.getTime() : null; }
    if (s.freq === 'mensual') { d.setDate(s.dom); if (d <= now) d.setMonth(d.getMonth() + 1); return d > now ? d.getTime() : null; }
    return null;
  }
  function create(i, pid) {
    const a = Roster.get(String(i.responsable || '').toLowerCase()); if (!a) throw new Error('Responsable desconocido: ' + i.responsable);
    if (Store.all('schedules').filter(x => x.enabled).length >= 10) throw new Error('Ya hay 10 programaciones activas; desactiva alguna antes de crear otra.');
    const s = { id: uid('sc'), title: trunc(String(i.titulo), 120), instructions: trunc(String(i.instrucciones), 3000), agentId: a.id, projectId: pid || ((i.proyecto_id && Store.get('projects', i.proyecto_id)) ? i.proyecto_id : null), freq: String(i.frecuencia), time: String(i.hora || '09:00'), dow: i.dia_semana == null ? 1 : Number(i.dia_semana), dom: i.dia_mes == null ? 1 : Number(i.dia_mes), date: String(i.fecha || ''), enabled: true, createdAt: Date.now(), runs: 0 };
    if (!valid(s)) throw new Error('Programación no válida: revisa frecuencia (una_vez, diaria, semanal, mensual), hora HH:MM, día de la semana 1-7 y día del mes 1-28.');
    s.nextRun = next(s); Store.put('schedules', s);
    Activity.log('programacion', 'Programada «' + s.title + '» para ' + a.name, { agentId: a.id, projectId: s.projectId });
    return s;
  }
  function tick() {
    if (!Leader.is()) return;
    const now = Date.now();
    for (const s of Store.all('schedules')) {
      if (!s.enabled || !s.nextRun || s.nextRun > now) continue;
      if (!valid(s)) { Store.patch('schedules', s.id, { enabled: false, error: 'Datos de programación no válidos' }); continue; }
      if (s.lastRun && now - s.lastRun < 60000) continue;
      const late = now - s.nextRun > 10 * 60000;
      try {
        Orch.createPlan({ titulo: 'Programada: ' + s.title, objetivo: s.instructions, proyecto_id: s.projectId, tareas: [{ clave: 't1', titulo: s.title, instrucciones: s.instructions, responsable: s.agentId }] }, { projectId: s.projectId, createdBy: 'programacion', autoApprove: false, scheduleId: s.id, convId: Chat.ensureConv('daniel', s.projectId).id });
        Store.patch('schedules', s.id, { lastRun: now, runs: (s.runs || 0) + 1, nextRun: s.freq === 'una_vez' ? null : next(s, now), enabled: s.freq !== 'una_vez', lastLate: late });
        Activity.log('programacion', 'Ejecutada «' + s.title + '»' + (late ? (LC_SERVER ? ' (con retraso respecto a su hora)' : ' (con retraso: La Cueva estaba cerrada a su hora)') : ''), { agentId: s.agentId });
      } catch (e) { Store.patch('schedules', s.id, { error: e.message, enabled: false }); }
    }
  }
  return { create, tick, next };
})();
