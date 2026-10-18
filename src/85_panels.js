/* ============================================================
   LA CUEVA · paneles: dirección, proyectos, aprobaciones, memoria,
   integraciones, estado, ajustes, ficha de empleado y visores
   ============================================================ */
const Panels = (() => {
  let current = null, tab = {}, refresh = null;
  const M = () => $('#modal');
  function shell(title, desc, tabs, narrow) {
    const m = M(); m.innerHTML = ''; $$('.nb[data-panel]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    const p = h('<section class="panel' + (narrow ? ' narrow' : '') + '"><div class="phead"><div style="flex:1;min-width:0"><h2></h2><p></p></div><button class="x" aria-label="Cerrar" style="position:static">×</button></div>' + (tabs ? '<div class="tabs" role="tablist"></div>' : '') + '<div class="pbody"></div></section>');
    p.querySelector('h2').textContent = title; p.querySelector('.phead p').textContent = desc || ''; if (!desc) p.querySelector('.phead p').remove();
    p.querySelector('.x').onclick = close;
    m.append(p); m.classList.add('open');
    m.onclick = e => { if (e.target === m) close(); };
    return p;
  }
  function tabsInto(p, list, key, draw) {
    const tl = p.querySelector('.tabs'), body = p.querySelector('.pbody');
    const sel = tab[key] && list.some(x => x[0] === tab[key]) ? tab[key] : list[0][0];
    tl.innerHTML = '';
    for (const [id, label] of list) { const b = h('<button class="tab" role="tab"></button>'); b.textContent = label; b.setAttribute('aria-selected', id === sel); b.onclick = () => { tab[key] = id; tabsInto(p, list, key, draw); }; tl.append(b); }
    body.innerHTML = ''; draw(sel, body);
    refresh = () => { const sc = body.scrollTop; body.innerHTML = ''; draw(tab[key] || sel, body); body.scrollTop = sc; };
  }
  function close() { M().classList.remove('open'); M().innerHTML = ''; current = null; refresh = null; $$('.nb[data-panel]').forEach(b => b.setAttribute('aria-pressed', 'false')); }
  function open(name, arg) {
    current = name;
    ({ control, projects, approvals, memory, integrations, status, settings })[name](arg);
    $$('.nb[data-panel]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.panel === name)));
  }
  let rt = 0;
  Bus.on('store:any', () => { if (!refresh || !current || ['agent', 'settings', 'projform'].includes(current)) return; clearTimeout(rt); rt = setTimeout(() => { if (refresh && !M().querySelector('textarea:focus,input:focus')) refresh(); }, 400); });
  Bus.on('live', () => { if (current === 'control') { clearTimeout(rt); rt = setTimeout(() => refresh && refresh(), 300); } });
  const empty = (t, s) => '<div class="empty"><b>' + esc(t) + '</b>' + esc(s || '') + '</div>';
  const kpi = (n, l, s) => '<div class="card kpi"><div class="l">' + esc(l) + '</div><div class="n">' + esc(String(n)) + '</div>' + (s ? '<div class="s">' + esc(s) + '</div>' : '') + '</div>';

  /* ================= DIRECCIÓN ================= */
  function control() {
    const p = shell('Panel de dirección', 'Todo lo que aparece aquí sale del registro real de La Cueva: tareas, entregables, aprobaciones y consumo.', true);
    tabsInto(p, [['res', 'Resumen'], ['plans', 'Planes y tareas'], ['collab', 'Colaboraciones'], ['dl', 'Entregables'], ['act', 'Actividad'], ['use', 'Consumo'], ['sched', 'Programadas']], 'control', (t, b) => {
      if (t === 'res') {
        const tasks = Store.all('tasks'), cfg = Config.get(), u = Activity.today();
        const working = new Set([...Activity.live.values()].map(l => l.agentId));
        const pend = tasks.filter(x => ['pendiente', 'en_cola', 'en_curso', 'esperando_colaboracion', 'esperando_aprobacion'].includes(x.state)).length;
        const blocks = tasks.filter(x => ['bloqueada', 'fallida', 'interrumpida'].includes(x.state) && !['cancelado', 'completado'].includes((Store.get('plans', x.planId) || {}).state)).length;
        b.innerHTML = '<div class="grid g4">' + kpi(Store.all('projects').filter(x => x.status === 'activo').length, 'Proyectos activos') + kpi(pend, 'Tareas abiertas') + kpi(working.size, 'Agentes trabajando ahora') + kpi(Store.all('approvals').filter(a => a.state === 'pendiente').length, 'Aprobaciones pendientes') + kpi(Store.all('deliverables').length, 'Entregables') + kpi(blocks, 'Bloqueos y fallos') + kpi(u.calls + ' / ' + cfg.dailyCalls, 'Llamadas de IA hoy', (LC_SERVER ? '' : '≈ ') + fmtNum(u.inTok + u.outTok) + ' tokens' + (LC_SERVER ? '' : ' (estimación)')) + kpi(Store.all('schedules').filter(s => s.enabled).length, 'Programadas activas') + '</div>';
        // requiere atención
        b.append(h('<div class="sec-h">Requiere tu atención</div>'));
        const L = h('<div class="card list"></div>'); let n = 0;
        for (const pl of Store.all('plans').filter(x => ['pendiente_aprobacion', 'requiere_atencion', 'en_revision'].includes(x.state)).sort((a, c) => c.createdAt - a.createdAt)) { n++; const li = h('<div class="li"><div class="grow"><b></b><small></small></div></div>'); li.querySelector('b').textContent = pl.title; li.querySelector('small').innerHTML = pChip(pl.state) + ' ' + esc(projName(pl.projectId)) + (pl.error ? ' · ' + esc(pl.error) : ''); const bt = h('<button class="btn sm sec">Abrir</button>'); bt.onclick = () => openPlan(pl.id); li.append(bt); L.append(li); }
        for (const t of Store.all('tasks').filter(x => x.state === 'interrumpida')) { n++; const li = h('<div class="li"><div class="grow"><b></b><small></small></div></div>'); li.querySelector('b').textContent = t.title; li.querySelector('small').innerHTML = tChip(t.state) + ' ' + esc(agentName(t.agentId)); const bt = h('<button class="btn sm">Reanudar</button>'); bt.onclick = () => Orch.retryTask(t.id); li.append(bt); L.append(li); }
        for (const a of Store.all('approvals').filter(x => x.state === 'pendiente')) { n++; const li = h('<div class="li"><div class="grow"><b></b><small></small></div></div>'); li.querySelector('b').textContent = a.title; li.querySelector('small').textContent = 'Solicitud de ' + agentName(a.agentId); const bt = h('<button class="btn sm sec">Revisar</button>'); bt.onclick = () => open('approvals'); li.append(bt); L.append(li); }
        const pr = Store.all('rules').filter(r => r.state === 'propuesta').length; if (pr) { n++; const li = h('<div class="li"><div class="grow"><b>' + pr + ' regla(s) de memoria propuestas</b><small>Ninguna se aplica hasta que la apruebes.</small></div></div>'); const bt = h('<button class="btn sm sec">Revisar</button>'); bt.onclick = () => open('memory'); li.append(bt); L.append(li); }
        b.append(n ? L : h(empty('Nada pendiente', 'Cuando un plan, una aprobación o una regla necesiten tu decisión, aparecerán aquí.')));
        b.append(h('<div class="sec-h">Ahora mismo</div>'));
        const live = [...Activity.live.values()];
        if (!live.length) b.append(h(empty('Nadie está ejecutando nada', 'Los agentes solo trabajan cuando les escribes o cuando un plan está en marcha.')));
        else { const LL = h('<div class="card list"></div>'); for (const l of live) { const a = Roster.get(l.agentId); const li = h('<div class="li"><div class="grow"><b></b><small></small></div></div>'); if (a) li.prepend(avatarEl(a, 30)); li.querySelector('b').textContent = agentName(l.agentId); li.querySelector('small').textContent = (l.label || (l.kind === 'chat' ? 'Respondiendo en el chat' : 'Trabajando')) + ' · desde ' + fmtTime(l.started); LL.append(li); } b.append(LL); }
      }
      if (t === 'plans') {
        const plans = Store.all('plans').sort((a, c) => c.createdAt - a.createdAt);
        if (!plans.length) { b.innerHTML = empty('Todavía no hay planes', 'Pide a Daniel un trabajo concreto («prepara…», «haz…») y creará un plan con tareas para el equipo.'); return; }
        for (const pl of plans) { const w = h('<div style="margin-bottom:12px"></div>'); w.append(ChatUI.planCard(pl.id)); const meta = h('<div class="hint" style="margin-top:4px"></div>'); meta.textContent = projName(pl.projectId) + ' · creado ' + fmtDT(pl.createdAt) + (pl.createdBy === 'programacion' ? ' · por programación' : ''); w.append(meta); b.append(w); }
      }
      if (t === 'collab') {
        const cs = Store.all('tasks').filter(x => x.parentId).sort((a, c) => c.createdAt - a.createdAt);
        if (!cs.length) { b.innerHTML = empty('Sin colaboraciones todavía', 'Cuando un especialista pida ayuda a otro durante una tarea, quedará registrado aquí.'); return; }
        const tb = h('<div class="tblw"><table class="tbl"><thead><tr><th>Pide</th><th>Ayuda</th><th>Petición</th><th>Estado</th><th>Fecha</th></tr></thead><tbody></tbody></table></div>');
        for (const c of cs) { const r = h('<tr><td></td><td></td><td></td><td></td><td></td></tr>'); const td = r.children; td[0].textContent = agentName(c.requestedBy) + ' (' + (DEPT_NAMES[(Roster.get(c.requestedBy) || {}).dept] || '') + ')'; td[1].textContent = agentName(c.agentId) + ' (' + (DEPT_NAMES[(Roster.get(c.agentId) || {}).dept] || '') + ')'; td[2].textContent = trunc(c.instructions, 140); td[3].innerHTML = tChip(c.state) + (c.kind === 'sub' ? ' <span class="chip plain">subtarea</span>' : ''); td[4].textContent = fmtDT(c.createdAt); tb.querySelector('tbody').append(r); }
        b.append(tb);
      }
      if (t === 'dl') deliverablesList(b, null);
      if (t === 'act') activityList(b, null);
      if (t === 'use') usage(b, null);
      if (t === 'sched') {
        b.append(h('<div class="note">' + (LC_SERVER ? 'Las tareas programadas las ejecuta el servidor aunque La Cueva esté cerrada. Se revisan una vez por hora (límite del plan Hobby de Vercel), así que pueden arrancar hasta una hora más tarde de lo indicado. Cada ejecución crea un plan que respeta tu visto bueno si lo tienes activado.' : 'Las tareas programadas se ejecutan solo mientras La Cueva está abierta en algún dispositivo. Si estaba cerrada a su hora, se ejecutan al abrirla y quedan marcadas «con retraso». Para ejecución real con la app cerrada hace falta el backend de la Fase 4.') + '</div>'));
        const ss = Store.all('schedules');
        if (!ss.length) { b.append(h(empty('Nada programado', 'Pide a Daniel algo recurrente, por ejemplo: «cada lunes a las 9, que Luna prepare las ideas de contenido de la semana».'))); return; }
        const L = h('<div class="card list" style="margin-top:12px"></div>');
        for (const s of ss) { const li = h('<div class="li"><div class="grow"><b></b><small></small></div></div>'); li.querySelector('b').textContent = s.title; li.querySelector('small').textContent = agentName(s.agentId) + ' · ' + ({ una_vez: 'Una vez', diaria: 'Cada día', semanal: 'Cada semana', mensual: 'Cada mes' })[s.freq] + ' a las ' + s.time + ' · ' + (s.enabled && s.nextRun ? 'próxima: ' + fmtDT(s.nextRun) : 'desactivada') + ' · ' + (s.runs || 0) + ' ejecuciones' + (s.error ? ' · error: ' + s.error : ''); const tg = h('<button class="btn sm sec"></button>'); tg.textContent = s.enabled ? 'Desactivar' : 'Activar'; tg.onclick = () => Store.patch('schedules', s.id, { enabled: !s.enabled, nextRun: !s.enabled ? Sched.next(s) : s.nextRun, error: null }); const del = h('<button class="btn sm ghost">Eliminar</button>'); del.onclick = () => confirmBox('¿Eliminar la programación «' + s.title + '»?', 'Las ejecuciones pasadas y sus entregables se conservan.', 'Eliminar programación', () => { Store.del('schedules', s.id); Activity.log('programacion', 'Eliminaste la programación «' + s.title + '»', {}); }); li.append(tg, del); L.append(li); }
        b.append(L);
      }
    });
  }
  function openPlan(pid) { const pl = Store.get('plans', pid); if (pl && pl.convId) { const cv = Store.get('convs', pl.convId); close(); if (cv) ChatUI.open(cv.agentId, { convId: cv.id }); } else { tab.control = 'plans'; open('control'); } }
  function deliverablesList(b, pid) {
    const ds = Store.all('deliverables').filter(d => pid === null || d.projectId === pid).sort((a, c) => c.ts - a.ts);
    if (!ds.length) { b.append(h(empty('Sin entregables todavía', 'Cada tarea completada genera un entregable que podrás abrir, copiar y descargar.'))); return; }
    const tb = h('<div class="tblw"><table class="tbl"><thead><tr><th>Entregable</th><th>Autor</th><th>Proyecto</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody></tbody></table></div>');
    for (const d of ds) { const r = h('<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>'); const td = r.children; td[0].textContent = d.title; td[1].textContent = agentName(d.agentId); td[2].textContent = projName(d.projectId); td[3].innerHTML = '<span class="chip ' + ({ borrador: 'plain', en_revision: 'info', aprobado: 'ok' })[d.status] + '">' + ({ borrador: 'Borrador', en_revision: 'En revisión', aprobado: 'Aprobado' })[d.status] + '</span>'; td[4].textContent = fmtDT(d.ts); const bt = h('<button class="btn sm sec">Abrir</button>'); bt.onclick = () => deliverable(d.id); td[5].append(bt); tb.querySelector('tbody').append(r); }
    b.append(tb);
  }
  const KIND = { plan: 'Plan', tarea: 'Tarea', entregable: 'Entregable', aprobacion: 'Aprobación', memoria: 'Memoria', colaboracion: 'Colaboración', bloqueo: 'Bloqueo', error: 'Error', chat: 'Chat', proyecto: 'Proyecto', programacion: 'Programación', equipo: 'Equipo', sistema: 'Sistema', escalado: 'Escalado', ajustes: 'Ajustes' };
  function activityList(b, pid) {
    const ev = Activity.recent(400).filter(e => pid === null || e.projectId === pid).slice(0, 250);
    if (!ev.length) { b.append(h(empty('Sin actividad registrada', 'Aquí aparecerá cada acción real: conversaciones, tareas, aprobaciones y cambios.'))); return; }
    const L = h('<div class="card list"></div>');
    for (const e of ev) { const li = h('<div class="li"><span class="chip plain" style="min-width:96px;justify-content:center"></span><div class="grow"><b style="font-weight:500"></b><small></small></div></div>'); li.querySelector('.chip').textContent = KIND[e.kind] || e.kind; li.querySelector('b').textContent = e.text; li.querySelector('small').textContent = fmtDT(e.ts) + (e.agentId ? ' · ' + agentName(e.agentId) : '') + (e.projectId ? ' · ' + projName(e.projectId) : ''); if (e.kind === 'error' || e.kind === 'bloqueo') li.querySelector('.chip').className = 'chip bad'; L.append(li); }
    b.append(L);
  }
  function usage(b, pid) {
    const days = Store.all('usage').sort((a, c) => a.id.localeCompare(c.id)).slice(-30); const cfg = Config.get();
    const tot = { calls: 0, tok: 0, inTok: 0, outTok: 0, searches: 0 }, byA = {}, byP = {};
    const add = (target, v) => { for (const key of ['calls', 'inTok', 'outTok', 'searches']) target[key] = (target[key] || 0) + (Number(v[key]) || 0); target.tok = target.inTok + target.outTok; };
    for (const d of days) {
      for (const [k, v] of Object.entries(d.byProject || {})) { if (pid !== null && k !== pid) continue; add(byP[k] ||= {}, v); }
      if (pid === null) { add(tot, d); for (const [k, v] of Object.entries(d.byAgent || {})) add(byA[k] ||= {}, v); }
    }
    if (pid !== null) Object.assign(tot, byP[pid] || {});
    const price = (parseFloat(cfg.priceIn) || 0) > 0 || (parseFloat(cfg.priceOut) || 0) > 0;
    b.append(h('<div class="note">' + (LC_SERVER ? 'Desde esta actualización, el servidor cuenta cada petición al proveedor (también dentro de un turno) y limita el presupuesto antes de enviarla. Guarda los tokens y búsquedas recibidos incluso si un paso posterior falla. Un error puede no devolver todos los tokens facturados; el historial anterior puede contener estimaciones. El coste usa las tarifas manuales de tokens de Ajustes; búsquedas y otros cargos quedan aparte.' : 'En el artefacto, los tokens son una estimación. Configura las tarifas en Ajustes para estimar su coste.') + '</div>'));
    const amount = (tot.inTok * (parseFloat(cfg.priceIn) || 0) + tot.outTok * (parseFloat(cfg.priceOut) || 0)) / 1e6;
    const g = h('<div class="grid g4" style="margin-top:12px"></div>');
    g.innerHTML = kpi(tot.calls, 'Peticiones de IA (30 días)') + kpi(fmtNum(tot.tok), LC_SERVER ? 'Tokens registrados' : 'Tokens estimados') + (price ? kpi('≈ ' + amount.toFixed(2) + ' €', 'Estimación con tarifas manuales', 'Solo tokens; búsquedas aparte.') : kpi('—', 'Coste', 'Sin precio configurado')) + kpi(tot.searches, 'Búsquedas registradas'); b.append(g);
    if (days.length) {
      b.append(h('<div class="sec-h">Llamadas por día</div>'));
      const max = Math.max(1, ...days.map(d => pid === null ? d.calls : ((d.byProject || {})[pid] || {}).calls || 0));
      const ch = h('<div class="card"><div style="display:flex;align-items:flex-end;gap:4px;height:120px"></div><div class="hint" style="display:flex;justify-content:space-between;margin-top:6px"><span></span><span></span></div></div>');
      for (const d of days) { const v = pid === null ? d.calls : ((d.byProject || {})[pid] || {}).calls || 0; const col = h('<div title="" style="flex:1;background:var(--forest);border-radius:3px 3px 0 0;min-height:2px"></div>'); col.style.height = Math.max(2, v / max * 110) + 'px'; col.title = d.id + ': ' + v + ' llamadas'; ch.firstElementChild.append(col); }
      ch.querySelectorAll('.hint span')[0].textContent = days[0].id; ch.querySelectorAll('.hint span')[1].textContent = days[days.length - 1].id + ' · máx. ' + max; b.append(ch);
    }
    const barList = (title, obj, nameFn) => { const ent = Object.entries(obj).sort((a, c) => c[1].calls - a[1].calls); if (!ent.length) return; b.append(h('<div class="sec-h">' + title + '</div>')); const c = h('<div class="card list"></div>'); const mx = Math.max(...ent.map(e => e[1].calls)); for (const [k, v] of ent) { const li = h('<div class="li"><div style="width:150px;flex-shrink:0"></div><div class="grow"><div class="bar"><i></i></div></div><div class="num" style="width:150px"></div></div>'); li.firstElementChild.textContent = nameFn(k); li.querySelector('i').style.width = (v.calls / mx * 100) + '%'; li.querySelector('.num').textContent = v.calls + ' llamadas · ≈' + fmtNum(v.tok) + ' tok'; c.append(li); } b.append(c); };
    if (pid === null) barList('Por agente', byA, agentName);
    barList('Por proyecto', byP, k => k === '_general' ? 'General (sin proyecto)' : projName(k));
  }

  /* ================= PROYECTOS ================= */
  function projects(pid) {
    if (pid && Store.get('projects', pid)) return projectDetail(pid);
    const p = shell('Proyectos', 'Cada negocio o cliente tiene su propia memoria, documentos, conversaciones y tareas. La información de un proyecto no aparece en otro.', false);
    const b = p.querySelector('.pbody');
    refresh = () => { b.innerHTML = ''; drawList(); };
    function drawList() {
      const tb = h('<div class="toolbar"><button class="btn"><svg><use href="#i-plus"/></svg>Nuevo proyecto</button></div>'); tb.firstElementChild.onclick = () => projectForm(null); b.append(tb);
      const ps = Store.all('projects').sort((a, c) => (a.status === 'archivado') - (c.status === 'archivado') || c.createdAt - a.createdAt);
      if (!ps.length) { b.append(h('<div style="margin-top:12px">' + empty('Aún no hay proyectos', 'Crea el primero (por ejemplo, uno de tus negocios) o pídeselo a Daniel en el chat. Empieza vacío: no se importa ni se inventa ningún dato.') + '</div>')); return; }
      const g = h('<div class="grid g2" style="margin-top:12px"></div>');
      for (const pr of ps) {
        const tasks = Store.all('tasks').filter(t => t.projectId === pr.id), dl = Store.all('deliverables').filter(d => d.projectId === pr.id).length;
        const c = h('<button class="card" style="text-align:left;cursor:pointer;border-left:5px solid"><div style="display:flex;gap:8px;align-items:center"><b style="font-family:var(--f-display);font-size:var(--t-l);flex:1"></b><span class="chip"></span></div><div class="hint" style="margin:4px 0 8px"></div><div class="hint"></div></button>');
        c.style.borderLeftColor = pr.color; c.querySelector('b').textContent = pr.name; const ch = c.querySelector('.chip'); ch.textContent = pr.status === 'activo' ? 'Activo' : pr.status === 'pausado' ? 'Pausado' : 'Archivado'; ch.className = 'chip ' + (pr.status === 'activo' ? 'ok' : 'plain');
        c.querySelectorAll('.hint')[0].textContent = (pr.client ? 'Cliente: ' + pr.client + ' · ' : 'Negocio propio · ') + trunc(pr.description || 'Sin descripción', 120);
        c.querySelectorAll('.hint')[1].textContent = tasks.filter(t => !TERMINAL.has(t.state)).length + ' tareas abiertas · ' + dl + ' entregables · ' + Chat.convsFor('daniel').concat(Store.all('convs')).filter((v, i, a) => a.indexOf(v) === i && v.projectId === pr.id).length + ' conversaciones';
        c.onclick = () => projectDetail(pr.id); g.append(c);
      }
      b.append(g);
    }
    drawList();
  }
  function projectForm(pid) {
    current = 'projform';
    const pr = pid ? Store.get('projects', pid) : null;
    const p = shell(pr ? 'Editar proyecto' : 'Nuevo proyecto', pr ? '' : 'Rellena lo que sepas; podrás completarlo después. Los agentes solo verán lo que pongas aquí y en los documentos del proyecto.', false, true);
    const f = h('<form class="form"><label class="f">Nombre<input name="name" required maxlength="80"></label><label class="f">Cliente (déjalo vacío si es un negocio propio)<input name="client" maxlength="80"></label><label class="f">Descripción<textarea name="description" placeholder="Qué es, a quién se dirige, en qué punto está"></textarea></label><label class="f">Objetivos<textarea name="objectives" placeholder="Qué quieres conseguir"></textarea></label><label class="f">Estado<select name="status"><option value="activo">Activo</option><option value="pausado">Pausado</option><option value="archivado">Archivado</option></select></label><div class="toolbar"><button class="btn" type="submit"></button><button class="btn sec" type="button">Cancelar</button></div></form>');
    f.querySelector('[type=submit]').textContent = pr ? 'Guardar cambios' : 'Crear proyecto';
    if (pr) { f.name.value = pr.name; f.client.value = pr.client || ''; f.description.value = pr.description || ''; f.objectives.value = pr.objectives || ''; f.status.value = pr.status; } else f.status.value = 'activo';
    f.onsubmit = e => { e.preventDefault(); const v = { name: f.name.value.trim(), client: f.client.value.trim(), description: f.description.value.trim(), objectives: f.objectives.value.trim(), status: f.status.value }; if (!v.name) return; if (pr) { Store.patch('projects', pr.id, Object.assign(v, { kind: v.client ? 'cliente' : 'negocio' })); Activity.log('proyecto', 'Editaste el proyecto ' + v.name, { projectId: pr.id }); projectDetail(pr.id); } else { const np = Projects.create(v); if (v.status !== 'activo') Store.patch('projects', np.id, { status: v.status }); projectDetail(np.id); } };
    f.querySelector('[type=button]').onclick = () => pr ? projectDetail(pr.id) : projects();
    p.querySelector('.pbody').append(f);
    setTimeout(() => f.name.focus(), 30);
  }
  function projectDetail(pid) {
    current = 'projects';
    const pr = Store.get('projects', pid);
    const p = shell(pr.name, (pr.client ? 'Cliente: ' + pr.client : 'Negocio propio') + ' · ' + (pr.status === 'activo' ? 'Activo' : pr.status === 'pausado' ? 'Pausado' : 'Archivado'), true);
    const back = h('<button class="btn sm ghost">← Todos los proyectos</button>'); back.onclick = () => projects(); p.querySelector('.phead').prepend(back);
    tabsInto(p, [['res', 'Resumen'], ['docs', 'Documentos'], ['conv', 'Conversaciones'], ['tasks', 'Tareas'], ['dl', 'Entregables'], ['mem', 'Memoria'], ['int', 'Integraciones'], ['cost', 'Costes'], ['act', 'Actividad']], 'proj', (t, b) => {
      const P = Store.get('projects', pid); if (!P) { b.innerHTML = empty('Proyecto no encontrado'); return; }
      if (t === 'res') {
        const c = h('<div class="grid g2"><div class="card doc"><div class="sec-h" style="margin-top:0">Descripción</div><div class="md d1"></div><div class="sec-h">Objetivos</div><div class="md d2"></div></div><div class="card"><div class="sec-h" style="margin-top:0">Acciones</div><div class="toolbar"></div><div class="sec-h">Equipo que ha participado</div><div class="team hint"></div></div></div>');
        c.querySelector('.d1').innerHTML = md(P.description || '_Sin descripción. Edítalo para que los agentes tengan contexto._'); c.querySelector('.d2').innerHTML = md(P.objectives || '_Sin objetivos definidos._');
        const tb = c.querySelector('.toolbar');
        const B = (txt, fn, cls) => { const x = h('<button class="btn sm ' + (cls || '') + '"></button>'); x.textContent = txt; x.onclick = fn; tb.append(x); };
        B('Hablar con Daniel sobre este proyecto', () => { const cv = Chat.ensureConv('daniel', pid); close(); ChatUI.open('daniel', { convId: cv.id }); });
        B('Editar', () => projectForm(pid), 'sec');
        const ids = [...new Set(Store.all('tasks').filter(x => x.projectId === pid).map(x => x.agentId).concat(Store.all('convs').filter(x => x.projectId === pid).map(x => x.agentId)))];
        const team = c.querySelector('.team'); team.textContent = ids.length ? ids.map(agentName).join(', ') : 'Nadie todavía. Cualquier agente puede trabajar en él.';
        b.append(c);
      }
      if (t === 'docs') {
        b.append(h('<div class="note">Los documentos del proyecto son la base de conocimiento que los agentes consultan con «Consultar documentos». Admite texto pegado, archivos de texto, PDF y Word (.docx). Los PDF que son sobre todo imágenes los lee la IA una vez (consume algunas llamadas). Los documentos que adjuntas en un chat de este proyecto también se guardan aquí.</div>'));
        const f = h('<form class="form card" style="margin-top:12px"><div class="f2"><label class="f">Nombre del documento<input name="n" required maxlength="80" placeholder="p. ej. Briefing de marca"></label><label class="f">O sube un archivo (texto, PDF o Word)<input name="file" type="file" accept=".txt,.md,.csv,.json,.html,.xml,.yml,.yaml,.pdf,.docx"></label></div><label class="f">Contenido<textarea name="t" placeholder="Pega aquí el texto"></textarea></label><div><button class="btn" type="submit">Añadir documento</button></div></form>');
        let pageBlobs = null;
        f.file.onchange = async () => {
          const fl = f.file.files[0]; if (!fl) return; pageBlobs = null;
          if (!f.n.value) f.n.value = fl.name.slice(0, 80);
          if (DocRead.can(fl)) {
            f.t.value = ''; f.t.placeholder = 'Leyendo ' + fl.name + '…'; const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
            try { const r = await DocRead.read(fl, m => { f.t.placeholder = m; }); f.t.value = String(r.text || '').slice(0, 200000); pageBlobs = r.pageBlobs || null; if (r.note) toast(r.note); if (!f.t.value.trim()) toast('El documento no contiene texto legible.', true); }
            catch (e) { toast('No se pudo leer el documento: ' + ((e && e.message) || 'error'), true); }
            finally { btn.disabled = false; f.t.placeholder = 'Pega aquí el texto'; }
          } else f.t.value = (await fl.text()).slice(0, 200000);
        };
        f.onsubmit = e => { e.preventDefault(); const text = f.t.value.trim(); if (!f.n.value.trim() || !text) { toast('Pon un nombre y el contenido del documento.', true); return; } const d = Store.put('pdocs', { id: uid('pd'), projectId: pid, name: trunc(f.n.value.trim(), 80), size: text.length, ts: Date.now() }); Store.put('ptext', { id: d.id, text: text.slice(0, 200000) }); if (pageBlobs && pageBlobs.length) Chat.savePages(d.id, pageBlobs); pageBlobs = null; Activity.log('proyecto', 'Documento añadido: ' + d.name, { projectId: pid }); toast('Documento añadido'); };
        b.append(f);
        const ds = Store.all('pdocs').filter(d => d.projectId === pid);
        b.append(h('<div class="sec-h">Documentos (' + ds.length + ')</div>'));
        if (!ds.length) b.append(h(empty('Sin documentos', 'Añade briefings, datos o textos de referencia.')));
        const L = h('<div class="card list"></div>');
        for (const d of ds) { const li = h('<div class="li"><div class="grow"><b></b><small></small></div></div>'); li.querySelector('b').textContent = d.name; li.querySelector('small').textContent = fmtNum(d.size) + ' caracteres' + (d.pages ? ' · ' + d.pages + ' páginas con imagen' : '') + (d.method === 'lectura con IA' ? ' · leído por la IA' : '') + ' · ' + fmtDT(d.ts); const v = h('<button class="btn sm sec">Ver</button>'); v.onclick = async () => { const t2 = await Store.load('ptext', d.id); preview({ kind: 'text', name: d.name, text: (t2 && t2.text) || '' }); }; const del = h('<button class="btn sm ghost">Eliminar</button>'); del.onclick = () => confirmBox('¿Eliminar «' + d.name + '»?', 'Los agentes dejarán de poder consultarlo. No se puede deshacer.', 'Eliminar documento', () => { Store.del('pdocs', d.id); Store.del('ptext', d.id); for (let n = 1; n <= (d.pages || 0); n++) Store.del('pimg', d.id + '-p' + n); Activity.log('proyecto', 'Documento eliminado: ' + d.name, { projectId: pid }); }); li.append(v, del); L.append(li); }
        if (ds.length) b.append(L);
      }
      if (t === 'conv') {
        const cs = Store.all('convs').filter(c => c.projectId === pid).sort((a, c) => c.updatedAt - a.updatedAt);
        if (!cs.length) { b.append(h(empty('Sin conversaciones en este proyecto', 'Abre un chat con cualquier agente y elige este proyecto en el selector superior.'))); return; }
        const L = h('<div class="card list"></div>');
        for (const c of cs) { const li = h('<div class="li"><div class="grow"><b></b><small></small></div></div>'); const a = Roster.get(c.agentId); if (a) li.prepend(avatarEl(a, 30)); li.querySelector('b').textContent = c.title; li.querySelector('small').textContent = agentName(c.agentId) + ' · ' + (c.count || 0) + ' mensajes · ' + ago(c.updatedAt); const o = h('<button class="btn sm sec">Continuar</button>'); o.onclick = () => { close(); ChatUI.open(c.agentId, { convId: c.id }); }; li.append(o); L.append(li); }
        b.append(L);
      }
      if (t === 'tasks') {
        const pls = Store.all('plans').filter(x => x.projectId === pid).sort((a, c) => c.createdAt - a.createdAt);
        if (!pls.length) { b.append(h(empty('Sin tareas', 'Pide a Daniel un trabajo dentro de este proyecto y repartirá las tareas.'))); return; }
        for (const pl of pls) { const w = h('<div style="margin-bottom:12px"></div>'); w.append(ChatUI.planCard(pl.id)); b.append(w); }
      }
      if (t === 'dl') deliverablesList(b, pid);
      if (t === 'mem') {
        const rs = Store.all('rules').filter(r => (r.scope === 'proyecto' && r.scopeId === pid) || (r.scope === 'cliente' && P.client && r.scopeId === P.client));
        b.append(h('<div class="sec-h" style="margin-top:0">Memoria normativa del proyecto' + (P.client ? ' y del cliente' : '') + '</div>'));
        if (!rs.length) b.append(h(empty('Sin reglas', 'Las reglas que propongan los agentes en este proyecto aparecerán aquí para que las apruebes.')));
        for (const r of rs) b.append(ruleCard(r));
        const ns = Memory.notesFor(pid, 50);
        b.append(h('<div class="sec-h">Memoria operativa (decisiones y notas)</div>'));
        if (!ns.length) b.append(h(empty('Sin notas', 'Los agentes registran aquí decisiones relevantes mientras trabajan.')));
        const L = h('<div class="card list"></div>'); for (const n of ns) { const li = h('<div class="li"><div class="grow"><b style="font-weight:500"></b><small></small></div></div>'); li.querySelector('b').textContent = n.text; li.querySelector('small').textContent = agentName(n.agentId) + ' · ' + fmtDT(n.ts); const del = h('<button class="btn sm ghost">Borrar</button>'); del.onclick = () => Store.del('notes', n.id); li.append(del); L.append(li); } if (ns.length) b.append(L);
        b.append(h('<div class="note" style="margin-top:12px">Además se guardan automáticamente las conversaciones, tareas, entregables y su historial de ejecución dentro del proyecto.</div>'));
      }
      if (t === 'int' && LC_SERVER) { projectIntegrations(b, Store.get('projects', pid) || pr); return; }
      if (t === 'int') { b.append(h('<div class="note">Ninguna integración externa está conectada todavía. Cuando exista el backend (Fase 4), cada conexión se asignará a un proyecto concreto con sus propias credenciales, sin mezclar cuentas de distintos clientes.</div>')); const g = h('<div class="grid g2" style="margin-top:12px"></div>'); for (const i of INTEGRATIONS.filter(x => x.id !== 'claude')) { const c = h('<div class="card"><b></b> <span class="chip plain">Pendiente de desarrollo</span><div class="hint"></div></div>'); c.querySelector('b').textContent = i.name; c.querySelector('.hint').textContent = i.need; g.append(c); } b.append(g); }
      if (t === 'cost') usage(b, pid);
      if (t === 'act') activityList(b, pid);
    });
  }

  /* ================= APROBACIONES ================= */
  /* integraciones del proyecto (versión con servidor): cada proyecto tiene sus propias credenciales */
  function projectIntegrations(b, pr) {
    const sh = pr.integrations && pr.integrations.shopify;
    const redraw = integ => { Store.patch('projects', pr.id, { integrations: integ }); b.innerHTML = ''; projectIntegrations(b, Store.get('projects', pr.id)); };
    b.append(h('<div class="note">Las credenciales se guardan cifradas en el servidor, solo para este proyecto: nunca llegan al navegador ni se comparten con otros proyectos. Los agentes pueden <b>consultar</b> la tienda; cualquier <b>cambio</b> (crear borradores, editar textos, publicar) les llega como propuesta a Aprobaciones y solo se ejecuta si lo apruebas.</div>'));
    const c = h('<div class="card" style="margin-top:12px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-family:var(--f-display);font-size:var(--t-l);flex:1">Shopify</b><span class="chip"></span></div><div class="body" style="margin-top:8px"></div></div>');
    const chip = c.querySelector('.chip'), body = c.querySelector('.body');
    if (sh) {
      chip.className = 'chip ok'; chip.textContent = 'Conectada';
      body.innerHTML = '<div><b></b></div><div class="hint"></div><div class="toolbar" style="margin-top:10px"><button class="btn sec t">Probar conexión</button><button class="btn ghost d">Desconectar</button></div>';
      body.querySelector('b').textContent = (sh.name || '') + ' · ' + sh.shop; body.querySelector('.hint').textContent = 'Conectada ' + fmtDT(sh.connectedAt) + (sh.currency ? ' · moneda ' + sh.currency : '');
      body.querySelector('.t').onclick = async () => { try { const r = await window.LCIntegrations.read(pr.id, 'estado_tienda', {}); toast('Conexión correcta: ' + r.tienda + ' · ' + (r.productos != null ? r.productos + ' productos' : '')); } catch (e) { toast(e.message || 'No se pudo conectar.', true); } };
      body.querySelector('.d').onclick = () => confirmBox('¿Desconectar Shopify de este proyecto?', 'Se borran las credenciales guardadas. La tienda no cambia. Podrás volver a conectarla cuando quieras.', 'Desconectar', async () => { try { await window.LCIntegrations.disconnect(pr.id, 'shopify'); const integ = Object.assign({}, pr.integrations); delete integ.shopify; redraw(integ); toast('Shopify desconectada'); } catch (e) { toast(e.message, true); } });
    } else {
      chip.className = 'chip warn'; chip.textContent = 'Sin conectar';
      body.innerHTML = '<details class="hint" style="margin-bottom:10px"><summary style="cursor:pointer;font-weight:600">Cómo conseguir los datos (5 minutos)</summary><ol style="margin:8px 0 0 18px;line-height:1.6"><li>Entra en dev.shopify.com con tu cuenta de Partner y abre <b>Apps → Create app</b> (créala «manualmente», sin plantilla).</li><li>En <b>Versions → New version</b>, en «Access scopes» marca lo que La Cueva puede hacer: <b>read_products</b> y <b>write_products</b> (y <b>read_orders</b> si quieres resúmenes de ventas). Como App URL vale https://shopify.dev/apps/default-app-home. Pulsa <b>Release</b>.</li><li>En <b>Home → Install app</b>, instálala en la tienda. La tienda tiene que estar en la misma organización que la app.</li><li>En <b>Settings</b> de la app copia el <b>Client ID</b> y el <b>Client secret</b> y pégalos aquí.</li></ol></details><form class="form"><label class="f">Dominio interno de la tienda<input name="shop" required placeholder="mi-tienda.myshopify.com" autocomplete="off"></label><div class="f2"><label class="f">Client ID<input name="cid" autocomplete="off"></label><label class="f">Client secret<input name="cs" type="password" autocomplete="new-password"></label></div><label class="f">O, si tienes una app antigua, su token de acceso (shpat_…)<input name="tok" type="password" autocomplete="new-password" placeholder="Opcional"></label><div><button class="btn" type="submit">Conectar y probar</button></div></form>';
      const f = body.querySelector('form');
      f.onsubmit = async e => {
        e.preventDefault(); const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Comprobando con Shopify…';
        try { const m = await window.LCIntegrations.connect(pr.id, 'shopify', { shop: f.shop.value, clientId: f.cid.value, clientSecret: f.cs.value, accessToken: f.tok.value }); f.reset(); redraw(Object.assign({}, pr.integrations, { shopify: { shop: m.shop, name: m.name, currency: m.currency, connectedAt: m.connectedAt } })); toast('Conectada: ' + m.name); }
        catch (er) { toast(er.message || 'No se pudo conectar.', true); }
        btn.disabled = false; btn.textContent = 'Conectar y probar';
      };
    }
    b.append(c);
    const g = h('<div class="grid g2" style="margin-top:12px"></div>');
    for (const i of INTEGRATIONS.filter(x => !['claude', 'shopify', 'web', 'openai'].includes(x.id))) { const k = h('<div class="card"><b></b> <span class="chip plain">Pendiente de desarrollo</span><div class="hint"></div></div>'); k.querySelector('b').textContent = i.name; k.querySelector('.hint').textContent = i.need; g.append(k); }
    b.append(g);
  }

  function approvals() {
    const p = shell('Aprobaciones', 'Los agentes trabajan con autonomía, pero estas acciones esperan tu decisión: ' + SENSITIVE.join(', ').toLowerCase() + '. También las nuevas contrataciones.', true);
    tabsInto(p, [['pend', 'Pendientes'], ['hist', 'Historial']], 'appr', (t, b) => {
      const all = Store.all('approvals').sort((a, c) => c.createdAt - a.createdAt);
      const list = all.filter(a => t === 'pend' ? a.state === 'pendiente' : a.state !== 'pendiente');
      if (!list.length) { b.innerHTML = t === 'pend' ? empty('No hay nada pendiente', 'Cuando un agente necesite tu permiso, aparecerá aquí y en el icono de la cabecera.') : empty('Sin historial', 'Aquí quedarán tus decisiones, con quién las pidió y cuándo.'); return; }
      for (const a of list) {
        const c = h('<div class="card" style="margin-bottom:10px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-family:var(--f-display);font-size:var(--t-l);flex:1"></b><span class="chip"></span></div><div class="hint m"></div><div class="md d" style="margin:8px 0"></div></div>');
        c.querySelector('b').textContent = a.title; const ch = c.querySelector('.chip'); ch.className = 'chip ' + (a.state === 'pendiente' ? 'wait' : a.state === 'aprobada' ? 'ok' : 'bad'); ch.textContent = a.state === 'pendiente' ? 'Pendiente' : a.state === 'aprobada' ? 'Aprobada' : 'Rechazada';
        c.querySelector('.m').textContent = 'Pedida por ' + agentName(a.agentId) + ' · ' + fmtDT(a.createdAt) + (a.projectId ? ' · ' + projName(a.projectId) : '') + ({ nuevo_agente: ' · Nueva contratación', permiso: ' · Ampliación de permiso', accion: ' · Acción sensible', integracion: ' · Cambio en una integración' })[a.kind] + (a.decidedAt ? ' · decidida ' + fmtDT(a.decidedAt) : '');
        let det = a.details || ''; if (a.kind === 'nuevo_agente' && a.payload) det += '\n\n**Propuesta:** ' + a.payload.name + ' — ' + a.payload.role + ' (' + (DEPT_NAMES[a.payload.dept] || a.payload.dept) + ')\n\n' + (a.payload.specialty || '') + (a.payload.instructions ? '\n\n_Instrucciones:_ ' + a.payload.instructions : '');
        if (a.kind === 'permiso' && a.payload) det += '\n\n**Permiso pedido:** ' + (PERMS[a.payload.permiso] || a.payload.permiso);
        c.querySelector('.d').innerHTML = md(det);
        if (a.kind === 'accion') c.append(h('<div class="note">Aprobar no ejecuta nada fuera de La Cueva. El agente dejará el trabajo listo y te dirá el paso exacto que debes dar tú.</div>'));
        if (a.kind === 'integracion' && a.state === 'pendiente') c.append(h('<div class="note"><b>Si apruebas, se ejecutará de verdad</b> en la tienda exactamente lo que ves arriba, una sola vez.</div>'));
        if (a.kind === 'integracion' && a.execState) { const n = h('<div class="note"></div>'); n.textContent = a.execState === 'hecha' ? 'Ejecutado: ' + a.execResult : a.execState === 'fallida' ? 'No se pudo ejecutar: ' + (a.execError || '') : 'Ejecutando en la tienda…'; c.append(n); }
        if (a.note) { const n = h('<div class="hint"></div>'); n.textContent = 'Tu nota: ' + a.note; c.append(n); }
        if (a.state === 'pendiente') {
          const f = h('<div class="toolbar" style="margin-top:8px"><input class="search" style="flex:1;min-width:200px" placeholder="Nota para el agente (opcional)" aria-label="Nota"><button class="btn">Aprobar</button><button class="btn sec">Rechazar</button></div>');
          f.children[1].onclick = () => Orch.decide(a.id, true, f.children[0].value.trim()); f.children[2].onclick = () => Orch.decide(a.id, false, f.children[0].value.trim());
          c.append(f);
        }
        b.append(c);
      }
    });
  }

  /* ================= MEMORIA ================= */
  const SCOPE = { agencia: 'Agencia', proyecto: 'Proyecto', cliente: 'Cliente', agente: 'Agente' };
  function ruleCard(r) {
    const c = h('<div class="card" style="margin-bottom:10px"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="chip info sc"></span><span class="chip st"></span><span class="hint o"></span></div><div class="t" style="margin:8px 0;font-size:var(--t-m)"></div></div>');
    c.querySelector('.sc').textContent = SCOPE[r.scope] + (r.scope === 'proyecto' ? ': ' + projName(r.scopeId) : r.scope === 'cliente' ? ': ' + r.scopeId : r.scope === 'agente' ? ': ' + agentName(r.scopeId) : '');
    const st = c.querySelector('.st'); st.textContent = ({ propuesta: 'Propuesta', aprobada: 'Aprobada', rechazada: 'Rechazada', revocada: 'Revocada' })[r.state]; st.className = 'chip ' + ({ propuesta: 'wait', aprobada: 'ok', rechazada: 'plain', revocada: 'plain' })[r.state];
    const o = r.origin || {}; c.querySelector('.o').textContent = 'Origen: ' + (o.agentId === 'admin' ? 'tú' : agentName(o.agentId)) + ' · ' + fmtDT(r.createdAt) + (o.projectId ? ' · ' + projName(o.projectId) : '');
    c.querySelector('.t').textContent = r.text;
    if (r.reason) { const rs = h('<div class="hint"></div>'); rs.textContent = 'Motivo: ' + r.reason; c.append(rs); }
    if (r.risky) c.append(h('<div class="note warn" style="margin-top:6px">Parece hablar de permisos o de saltarse controles. Las reglas nunca cambian permisos: eso solo se hace en la ficha de cada empleado.</div>'));
    const tb = h('<div class="toolbar" style="margin-top:8px"></div>');
    const B = (txt, fn, cls) => { const x = h('<button class="btn sm ' + (cls || '') + '"></button>'); x.textContent = txt; x.onclick = fn; tb.append(x); };
    if (r.state === 'propuesta') { B('Aprobar', () => Memory.decide(r.id, 'aprobar')); B('Rechazar', () => Memory.decide(r.id, 'rechazar'), 'sec'); }
    if (r.state === 'aprobada') B('Revocar', () => Memory.decide(r.id, 'revocar'), 'sec');
    if (r.state === 'rechazada' || r.state === 'revocada') B('Volver a proponer', () => Store.patch('rules', r.id, { state: 'propuesta' }), 'ghost');
    B('Editar', () => { const ta = h('<div class="form" style="margin-top:8px"><textarea class="search" rows="3"></textarea><div class="toolbar"><button class="btn sm">Guardar</button><button class="btn sm ghost">Cancelar</button></div></div>'); ta.querySelector('textarea').value = r.text; ta.querySelector('.btn').onclick = () => { const v = ta.querySelector('textarea').value.trim(); if (v) Memory.decide(r.id, 'editar', '', v); }; ta.querySelectorAll('.btn')[1].onclick = () => ta.remove(); c.append(ta); }, 'ghost');
    if (o.convId && Store.get('convs', o.convId)) B('Ver conversación de origen', () => { const cv = Store.get('convs', o.convId); close(); ChatUI.open(cv.agentId, { convId: cv.id }); }, 'ghost');
    c.append(tb);
    if (r.history && r.history.length > 1) { const d = h('<details class="hint" style="margin-top:6px"><summary>Historial</summary></details>'); for (const x of r.history) { const l = h('<div></div>'); l.textContent = fmtDT(x.ts) + ' · ' + x.action + ' · ' + (x.by === 'admin' ? 'tú' : agentName(x.by)) + (x.note ? ' · ' + x.note : ''); d.append(l); } c.append(d); }
    return c;
  }
  function memory() {
    const p = shell('Memoria', 'Memoria híbrida: la operativa se guarda sola dentro de cada proyecto; la normativa (reglas permanentes) solo entra en vigor cuando tú la apruebas.', true);
    tabsInto(p, [['prop', 'Propuestas'], ['ok', 'Aprobadas'], ['hist', 'Rechazadas y revocadas'], ['op', 'Operativa'], ['new', 'Nueva regla']], 'mem', (t, b) => {
      const rs = Store.all('rules').sort((a, c) => c.createdAt - a.createdAt);
      if (t === 'prop' || t === 'ok' || t === 'hist') {
        const list = rs.filter(r => t === 'prop' ? r.state === 'propuesta' : t === 'ok' ? r.state === 'aprobada' : ['rechazada', 'revocada'].includes(r.state));
        if (!list.length) { b.innerHTML = t === 'prop' ? empty('No hay propuestas', 'Cuando un agente detecte una preferencia o procedimiento duradero, te lo propondrá aquí.') : t === 'ok' ? empty('Ninguna regla aprobada', 'Las reglas aprobadas se aplican a los agentes según su ámbito: agencia, proyecto, cliente o agente.') : empty('Nada por aquí', ''); return; }
        for (const r of list) b.append(ruleCard(r));
      }
      if (t === 'op') {
        b.append(h('<div class="note">Por proyecto se guardan automáticamente: conversaciones, documentos, tareas, entregables, decisiones, historial de ejecución y resultados de herramientas. La recuperación de contexto funciona hoy por palabras clave; la búsqueda semántica necesita el backend.</div>'));
        const ps = [{ id: null, name: 'General (sin proyecto)' }].concat(Store.all('projects'));
        const tb = h('<div class="tblw" style="margin-top:12px"><table class="tbl"><thead><tr><th>Ámbito</th><th class="num">Conversaciones</th><th class="num">Documentos</th><th class="num">Tareas</th><th class="num">Entregables</th><th class="num">Decisiones</th><th class="num">Reglas</th></tr></thead><tbody></tbody></table></div>');
        for (const pr of ps) { const id = pr.id; const r = h('<tr><td></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td></tr>'); const td = r.children; td[0].textContent = pr.name; td[1].textContent = Store.all('convs').filter(c => (c.projectId || null) === id).length; td[2].textContent = Store.all('pdocs').filter(d => (d.projectId || null) === id).length; td[3].textContent = Store.all('tasks').filter(x => (x.projectId || null) === id).length; td[4].textContent = Store.all('deliverables').filter(x => (x.projectId || null) === id).length; td[5].textContent = Store.all('notes').filter(x => (x.projectId || null) === id).length; td[6].textContent = Store.all('rules').filter(x => x.state === 'aprobada' && (id ? (x.scope === 'proyecto' && x.scopeId === id) : x.scope === 'agencia')).length; tb.querySelector('tbody').append(r); }
        b.append(tb);
      }
      if (t === 'new') {
        const f = h('<form class="form card doc"><div class="hint">Las reglas que escribes tú quedan aprobadas al guardarlas. Úsalas para preferencias y procedimientos permanentes (tono, formatos, criterios). No sirven para dar permisos.</div><div class="f2"><label class="f">Ámbito<select name="s"><option value="agencia">Toda la agencia</option><option value="proyecto">Un proyecto</option><option value="cliente">Un cliente</option><option value="agente">Un agente</option></select></label><label class="f">¿Cuál?<select name="id"></select></label></div><label class="f">Regla<textarea name="t" required placeholder="p. ej. Escribe siempre en español de España y tutea al cliente."></textarea></label><div><button class="btn" type="submit">Guardar regla</button></div></form>');
        const fill = () => { const s = f.s.value, sel = f.id; sel.innerHTML = ''; sel.disabled = s === 'agencia'; const opts = s === 'proyecto' ? Store.all('projects').map(x => [x.id, x.name]) : s === 'cliente' ? [...new Set(Store.all('projects').map(x => x.client).filter(Boolean))].map(c => [c, c]) : s === 'agente' ? Roster.all().map(a => [a.id, a.name + ' · ' + a.role]) : [['', '—']]; for (const [v, l] of opts) { const o = h('<option></option>'); o.value = v; o.textContent = l; sel.append(o); } if (!opts.length) sel.append(h('<option value="">No hay ninguno todavía</option>')); };
        f.s.onchange = fill; fill();
        f.onsubmit = e => { e.preventDefault(); const s = f.s.value, text = f.t.value.trim(); if (!text || (s !== 'agencia' && !f.id.value)) { toast('Completa el ámbito y la regla.', true); return; } const r = Memory.propose({ scope: s, scopeId: s === 'agencia' ? null : f.id.value, text, reason: 'Escrita por el administrador', agentId: 'admin' }); if (r.rule && !r.dup) Memory.decide(r.rule.id, 'aprobar', 'Creada por el administrador'); toast(r.dup ? 'Ya existe una regla igual.' : 'Regla guardada y aprobada.'); tab.mem = 'ok'; refresh && refresh(); memory(); };
        b.append(f);
      }
    });
  }

  /* ================= INTEGRACIONES ================= */
  function integrations() {
    const p = shell('Integraciones', 'Estado real de cada conexión. Ninguna se marca como disponible si no existe un mecanismo que funcione hoy.', false);
    const b = p.querySelector('.pbody');
    b.append(h('<div class="note">' + (LC_SERVER ? 'El backend ya está activo: las claves viven solo en las variables de entorno de Vercel y nunca llegan al navegador. Las integraciones de terceros se irán conectando sobre él, asignadas a proyectos y agentes concretos y sin mezclar cuentas de clientes. Hasta que cada una tenga un mecanismo real, aparece como pendiente.' : 'Las credenciales de servicios externos deben guardarse en un servidor, nunca en el navegador. Por eso las integraciones de terceros llegan con el backend de la Fase 4 (GitHub + Vercel), asignadas a proyectos y agentes concretos, sin mezclar cuentas de clientes.') + '</div>'));
    const g = h('<div class="grid g2" style="margin-top:12px"></div>');
    for (const i of INTEGRATIONS) {
      if (LC_SERVER && i.id === 'claude') continue;
      const okNow = i.id === 'claude' ? AI.status === 'ok' : (LC_SERVER && i.id === 'openai' ? AI.provider === 'openai' : false);
      const c = h('<div class="card"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-family:var(--f-display);font-size:var(--t-m);flex:1"></b><span class="chip"></span></div><div class="hint" style="margin-top:6px"></div><div style="margin-top:6px;font-size:var(--t-s)"></div></div>');
      c.querySelector('b').textContent = i.name; const ch = c.querySelector('.chip');
      if (i.id === 'claude') { ch.className = 'chip ' + (okNow ? 'ok' : 'warn'); ch.textContent = okNow ? 'Configurada' : 'Pendiente de configuración'; }
      else if (LC_SERVER && i.id === 'openai') { ch.className = 'chip ' + (okNow ? 'ok' : 'warn'); ch.textContent = okNow ? 'Operativa' : 'Implementada, pendiente de configuración'; }
      else if (LC_SERVER && i.id === 'web') { const okW = AI.provider === 'anthropic'; ch.className = 'chip ' + (okW ? 'ok' : 'warn'); ch.textContent = okW ? 'Configurada' : 'Solo con Anthropic API'; }
      else if (LC_SERVER && i.id === 'shopify') { const n = Store.all('projects').filter(p => p.integrations && p.integrations.shopify).length; ch.className = 'chip ' + (n ? 'ok' : 'warn'); ch.textContent = n ? 'Conectada en ' + n + ' proyecto' + (n > 1 ? 's' : '') : 'Implementada, se conecta por proyecto'; }
      else { ch.className = 'chip plain'; ch.textContent = 'Pendiente de desarrollo'; }
      c.querySelector('.hint').textContent = LC_SERVER && i.id === 'openai' ? (okNow ? 'Los agentes usan OpenAI API desde el servidor con la clave guardada en Vercel.' : 'El servidor ya sabe usar OpenAI API: basta con crear la variable OPENAI_API_KEY en Vercel (y AI_PROVIDER=openai si también tienes clave de Anthropic).') : i.how;
      const need = LC_SERVER && i.id === 'openai' ? (okNow ? '' : 'Clave de OpenAI API con facturación en platform.openai.com. Una suscripción a ChatGPT no da acceso a la API.') : i.need; if (need) c.lastElementChild.innerHTML = '<b>Qué hace falta:</b> ' + esc(need); else c.lastElementChild.remove();
      g.append(c);
    }
    if (LC_SERVER) {
      const okA = AI.provider === 'anthropic';
      const c = h('<div class="card"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-family:var(--f-display);font-size:var(--t-m);flex:1">Anthropic API (Claude)</b><span class="chip"></span></div><div class="hint" style="margin-top:6px"></div></div>');
      const ch = c.querySelector('.chip'); ch.className = 'chip ' + (okA ? 'ok' : 'warn'); ch.textContent = okA ? 'Configurada' : 'Implementada, pendiente de configuración';
      c.querySelector('.hint').textContent = okA ? 'Los agentes usan Claude por API desde el servidor, con la clave guardada en Vercel. Se factura en console.anthropic.com, aparte de tu plan de Claude.' : 'Crea la variable ANTHROPIC_API_KEY en Vercel para usar Claude por API. Es una facturación aparte de tu suscripción a Claude.';
      g.prepend(c);
    }
    b.append(g);
  }

  /* ================= ESTADO DEL SISTEMA ================= */
  const CLS = { op: ['ok', 'Implementada y operativa'], ready: ['info', 'Configurada · sin prueba en esta comprobación'], cfg: ['warn', 'Implementada, pendiente de configuración'], proto: ['info', 'Prototipo'], dev: ['plain', 'Pendiente de desarrollo'], lim: ['warn', 'Operativa con limitación'] };
  function status() {
    const p = shell('Estado del sistema', 'Qué funciona de verdad, qué está limitado y qué falta, con la comprobación hecha en este momento.', true);
    tabsInto(p, [['feat', 'Funcionalidades'], ['arch', 'Arquitectura'], ['next', 'Siguiente fase']], 'status', (t, b) => {
      if (t === 'feat' && LC_SERVER) { serverStatus(b); return; }
      if (t === 'feat') {
        const ai = AI.status === 'ok', db = Store.mode === 'db';
        const rows = [
          ['Oficina isométrica, 12 espacios y 22 personajes únicos', 'op', 'Estudio 3D con materiales y luz suave, personajes editables y animados. WASD o flechas, ratón, zoom y directorio; modo 2D compatible si no hay WebGL.'],
          ['Estados visibles de cada agente', 'op', 'Disponible, trabajando, colaborando, esperando aprobación o detenido, según tareas y llamadas reales. Los descansos son ambientales y nunca simulan trabajo.'],
          ['Chat real con los 22 agentes', ai ? 'op' : 'cfg', ai ? 'Responden con Claude usando tu sesión. Markdown, código, adjuntos y herramientas.' : 'Abre La Cueva dentro de Claude con sesión iniciada y acepta el permiso para usar Claude.'],
          ['Historial persistente y proyectos', db ? 'op' : 'cfg', db ? 'Guardado en la base de datos de La Cueva.' : (Store.mode === 'local' ? 'Ahora mismo solo en este navegador.' : 'Sin almacenamiento en esta vista.')],
          ['Daniel: conversar, ejecutar y programar', ai ? 'op' : 'cfg', 'Decide el modo; solo crea planes cuando se lo pides.' + (ai && !AI.canTools ? ' Aviso: esta vista no admite herramientas, así que no podrá crear planes.' : '')],
          ['Orquestador: planes, tareas, dependencias y colaboración', ai ? 'lim' : 'cfg', 'Cola real con estados, reintentos, pausa, cancelación, límites y recuperación. Limitación: avanza solo con La Cueva abierta.'],
          ['Aprobaciones de acciones sensibles', 'op', 'Panel con historial auditable. Aprobar no ejecuta nada externo hasta que existan integraciones.'],
          ['Memoria normativa supervisada', 'op', 'Propuestas, aprobación, edición, origen y revocación por ámbitos. Las reglas no pueden tocar permisos.'],
          ['Memoria operativa por proyecto', 'op', 'Conversaciones, documentos, tareas, entregables y decisiones aislados por proyecto.'],
          ['Recuperación de contexto', 'lim', 'Por palabras clave. Búsqueda semántica: pendiente de backend.'],
          ['Fichas de empleado editables y nuevas contrataciones', 'op', 'Nombre, cargo, departamento, instrucciones, modelo, herramientas, permisos, límites, avatar y memoria.'],
          ['Modelo de IA configurable por agente', ai ? 'op' : 'cfg', 'Nivel rápido, equilibrado o de razonamiento avanzado, y nombre de modelo opcional. Daniel usa el de razonamiento avanzado.'],
          ['Tareas programadas', 'lim', 'Se ejecutan con La Cueva abierta; si estaba cerrada, al abrirla.'],
          ['Consumo y costes', 'lim', 'Llamadas exactas y tokens estimados. Coste en euros solo si configuras un precio (para una API de pago futura).'],
          ['Adjuntos', 'lim', 'Imágenes' + (AI.canImages ? ' (se envían a Claude)' : ' (esta vista no permite enviarlas)') + ', archivos de texto, PDF y Word. Los PDF de imágenes los transcribe la IA. En un chat de proyecto, los documentos se guardan en el proyecto.'],
          ['Trabajo en segundo plano con la app cerrada', 'dev', 'Requiere el backend con cola de trabajos y cron (Fase 4).'],
          ['Integraciones externas (Shopify, Meta, Google, GitHub, n8n…)', 'dev', 'Requieren servidor con credenciales seguras (Fase 4).'],
          ['OpenAI API', 'dev', 'Requiere servidor y clave propia con facturación aparte.'],
          ['Voz con Daniel y reuniones de voz', 'dev', 'La capa de IA está separada para añadir voz más adelante (Fase 5).'],
          ['Visualización de reuniones entre agentes', 'dev', 'La sala de reuniones existe; no se usa para simular reuniones (Fase 5).'],
          ['Varios usuarios y clientes', 'dev', 'Hoy es privada para ti. La base de datos ya separa datos por proyecto y admite reglas de acceso para ampliarla.']
        ];
        const tb = h('<div class="tblw"><table class="tbl"><thead><tr><th>Funcionalidad</th><th>Estado</th><th>Detalle</th></tr></thead><tbody></tbody></table></div>');
        for (const [n, c, d] of rows) { const r = h('<tr><td style="font-weight:600"></td><td></td><td></td></tr>'); r.children[0].textContent = n; r.children[1].innerHTML = '<span class="chip ' + CLS[c][0] + '">' + CLS[c][1] + '</span>'; r.children[2].textContent = d; tb.querySelector('tbody').append(r); }
        b.append(tb);
        b.append(h('<div class="sec-h">Comprobaciones de esta vista</div>'));
        const ck = h('<div class="card list"></div>');
        const L = (k, v, ok) => { const li = h('<div class="li"><div class="grow"><b></b></div><span class="chip"></span></div>'); li.querySelector('b').textContent = k; const c = li.querySelector('.chip'); c.textContent = v; c.className = 'chip ' + (ok ? 'ok' : 'warn'); ck.append(li); };
        L('IA (Claude)', ai ? 'Disponible' : 'No disponible', ai); L('Herramientas para agentes', AI.canTools ? 'Disponibles' : 'No disponibles', AI.canTools); L('Imágenes hacia la IA', AI.canImages ? 'Disponibles' : 'No disponibles', AI.canImages);
        L('Almacenamiento', db ? 'Base de datos de La Cueva' : Store.mode === 'local' ? 'Solo este navegador' : 'Solo memoria', db); L('Escrituras pendientes de guardar', String(Store.pending()), Store.pending() === 0);
        b.append(ck);
      }
      if (t === 'arch') {
        b.append(h('<div class="md doc">' + md(LC_SERVER ? ARCH_SERVER_MD : ARCH_MD) + '</div>'));
      }
      if (t === 'next') b.append(h('<div class="md doc">' + md(LC_SERVER ? NEXT_SERVER_MD : NEXT_MD) + '</div>'));
    });
  }

  /* estado real con backend: se consulta al servidor en el momento */
  async function serverStatus(b) {
    const ai = AI.status === 'ok', prov = ({ anthropic: 'Anthropic API', openai: 'OpenAI API', mock: 'simulador de pruebas' }[AI.provider] || 'la API configurada');
    b.append(h('<div class="hint">Comprobando el servidor…</div>'));
    let hs = null; try { hs = await window.LCServer.health(); } catch (e) { hs = null; }
    b.innerHTML = '';
    const w = hs && hs.worker;
    const rows = [
      ['Oficina isométrica, 12 espacios y 22 personajes únicos', 'op', 'Estudio 3D con materiales y luz suave, personajes editables y animados. WASD o flechas, ratón, zoom y directorio; modo 2D compatible si no hay WebGL.'],
      ['Estados visibles de cada agente', 'op', 'Según tareas reales del servidor y de tus chats. Los descansos son ambientales y nunca simulan trabajo.'],
      ['Acceso privado con contraseña', hs && hs.password ? 'op' : 'cfg', 'Sesión con cookie protegida; la contraseña vive solo en Vercel (ADMIN_PASSWORD).'],
      ['Base de datos en el servidor', hs && hs.db ? 'op' : 'cfg', hs && hs.db ? 'Postgres: proyectos, chats, tareas, memoria y entregables, compartidos entre tus dispositivos.' : ((hs && hs.dbError) || 'Falta conectar la base de datos.')],
      ['Chat real con los agentes', ai ? 'ready' : 'cfg', ai ? 'Proveedor configurado: ' + prov + '. Esta comprobación no envía una petición de pago ni valida la clave o el modelo. Los errores de una llamada aparecen en el chat y las tareas.' : 'Falta la clave de IA en Vercel (ANTHROPIC_API_KEY u OPENAI_API_KEY).'],
      ['Orquestador en segundo plano', ai && hs && hs.db ? 'op' : 'cfg', 'Lo ejecuta el servidor por tandas de hasta 5 minutos que se encadenan mientras queda trabajo: puedes cerrar La Cueva.' + (w ? ' Última tanda: ' + fmtDT(Date.parse(w.endedAt || w.startedAt)) + ' · ' + (w.reason || '') + '.' : ' Aún no ha trabajado ninguna tanda.')],
      ['Tareas programadas', hs && hs.cronSecret ? 'lim' : 'cfg', hs && hs.cronSecret ? 'Las ejecuta el servidor con La Cueva cerrada. Limitación del plan Hobby: se revisan una vez por hora (±1 h).' : 'Falta la variable CRON_SECRET en Vercel para que el cron horario pueda despertar al servidor.'],
      ['Aprobaciones de acciones sensibles', 'op', 'En Shopify, aprobar ejecuta el cambio mostrado en la tienda del proyecto. El servidor reserva la ejecución para impedir duplicados. Las aprobaciones sin integración solo registran tu decisión.'],
      ['Memoria normativa y operativa', 'op', 'Reglas supervisadas por ámbitos y memoria aislada por proyecto. Las reglas no pueden tocar permisos.'],
      ['Recuperación de contexto', 'lim', 'Por palabras clave. Búsqueda semántica: pendiente.'],
      ['Consumo y costes', 'op', 'El servidor limita y registra cada petición interna, sus tokens recibidos y las búsquedas. Un fallo puede no devolver todos los tokens facturados; el historial anterior conserva sus estimaciones. Tarifas de tokens manuales en Ajustes.'],
      ['Adjuntos', 'lim', 'Imágenes, texto, PDF y Word. Los PDF de imágenes los transcribe la IA una vez; el texto queda guardado (en un chat de proyecto, también en sus documentos). Las imágenes sueltas no se guardan en el servidor.'],
      ['Búsqueda y lectura web', AI.provider === 'anthropic' ? 'ready' : 'cfg', AI.provider === 'anthropic' ? 'Los agentes con permiso buscan en internet y leen páginas o PDF públicos, y citan las fuentes. 10 $ por cada 1.000 búsquedas, más tokens.' : 'Disponible solo con Anthropic API como proveedor.'],
      ['Shopify', Store.all('projects').some(p => p.integrations && p.integrations.shopify) ? 'op' : 'cfg', 'Se conecta por proyecto (Proyectos → Integraciones). Lectura de tienda, productos y pedidos; los cambios se ejecutan solo al aprobarlos.'],
      ['PDF: páginas como imágenes', 'op', 'Al adjuntar un PDF se guardan hasta 20 páginas como imagen; los agentes pueden verlas cuando el texto no basta.'],
      ['Otras integraciones (Gmail, Drive, Meta, Google Ads…)', 'dev', 'Se añadirán con el mismo modelo: credenciales cifradas por proyecto y aprobación para lo sensible.'],
      ['Voz y reuniones visibles entre agentes', 'dev', 'Fase 5.'],
      ['Varios usuarios', 'dev', 'Hoy hay un único administrador.']
    ];
    const tb = h('<div class="tblw"><table class="tbl"><thead><tr><th>Funcionalidad</th><th>Estado</th><th>Detalle</th></tr></thead><tbody></tbody></table></div>');
    for (const [n, c, d] of rows) { const r = h('<tr><td style="font-weight:600"></td><td></td><td></td></tr>'); r.children[0].textContent = n; r.children[1].innerHTML = '<span class="chip ' + CLS[c][0] + '">' + CLS[c][1] + '</span>'; r.children[2].textContent = d; tb.querySelector('tbody').append(r); }
    b.append(tb);
    b.append(h('<div class="sec-h">Comprobaciones del servidor</div>'));
    const ck = h('<div class="card list"></div>');
    const L = (k, v, ok) => { const li = h('<div class="li"><div class="grow"><b></b></div><span class="chip"></span></div>'); li.querySelector('b').textContent = k; const c = li.querySelector('.chip'); c.textContent = v; c.className = 'chip ' + (ok ? 'ok' : 'warn'); ck.append(li); };
    L('Servidor', hs ? 'Responde (' + (hs.env || '—') + (hs.region ? ', ' + hs.region : '') + ')' : 'Sin respuesta', !!hs);
    L('Base de datos', hs && hs.db ? 'Conectada' : 'No disponible', !!(hs && hs.db));
    L('Proveedor de IA', hs && hs.ai && hs.ai.provider ? prov : 'Sin configurar', !!(hs && hs.ai && hs.ai.provider));
    if (hs && hs.ai && hs.ai.models) L('Modelos por nivel', 'Rápido: ' + hs.ai.models.quick + ' · Equilibrado: ' + hs.ai.models.default + ' · Avanzado: ' + hs.ai.models.complex, true);
    L('Cron horario (CRON_SECRET)', hs && hs.cronSecret ? 'Configurado' : 'Falta', !!(hs && hs.cronSecret));
    L('Sincronización con el servidor', window.LCServer.syncError ? 'Con errores: ' + (window.LCServer.syncError.message || 'reintentando') : 'Al día', !window.LCServer.syncError);
    L('Escrituras pendientes de guardar', String(Store.pending()), Store.pending() === 0);
    b.append(ck);
  }

  /* ================= AJUSTES ================= */
  function settings() {
    current = 'settings';
    const p = shell('Ajustes', 'Configuración general de La Cueva. Los cambios se guardan al momento.', false, true);
    const b = p.querySelector('.pbody'); const c = Config.get();
    const f = h('<form class="form"></form>');
    f.innerHTML = '<div class="sec-h" style="margin-top:0">Ejecución y límites</div>' +
      '<label class="chk"><input type="checkbox" name="planApproval"> <span><b>Los planes de Daniel esperan mi visto bueno antes de empezar</b><br><span class="hint">Recomendado: cada tarea ' + (LC_SERVER ? 'se factura en tu cuenta del proveedor de IA' : 'consume tu uso de Claude') + '.</span></span></label>' +
      '<div class="f2"><label class="f">Tareas a la vez<select name="concurrency"><option>1</option><option>2</option><option>3</option></select></label><label class="f">Peticiones al proveedor por día (tope)<input name="dailyCalls" type="number" min="10" max="2000"></label><label class="f">Máximo de tareas por plan<input name="maxTasksPlan" type="number" min="1" max="12"></label><label class="f">Máximo de peticiones por plan<input name="maxCallsPlan" type="number" min="5" max="200"></label><label class="f">Profundidad de delegación<select name="maxDepth"><option value="1">1 · sin colaboraciones encadenadas</option><option value="2">2 · una colaboración por nivel</option></select></label></div>' +
      '<div class="sec-h">Oficina</div><label class="chk"><input type="checkbox" name="showNames"> Mostrar nombres sobre los personajes</label><label class="chk"><input type="checkbox" name="ambient"> Vida ambiental: los agentes disponibles hacen pausas para el café o el sofá (nunca simulan trabajar)</label>' +
      '<div class="sec-h">Costes (para una API de pago futura)</div><div class="f2"><label class="f">€ por millón de tokens de entrada<input name="priceIn" inputmode="decimal" placeholder="vacío = sin coste"></label><label class="f">€ por millón de tokens de salida<input name="priceOut" inputmode="decimal" placeholder="vacío = sin coste"></label></div>';
    f.planApproval.checked = c.planApproval; f.concurrency.value = String(c.concurrency); f.dailyCalls.value = c.dailyCalls; f.maxTasksPlan.value = c.maxTasksPlan; f.maxCallsPlan.value = c.maxCallsPlan; f.maxDepth.value = String(c.maxDepth); f.showNames.checked = c.showNames; f.ambient.checked = c.ambient; f.priceIn.value = c.priceIn; f.priceOut.value = c.priceOut;
    f.addEventListener('change', () => {
      const v = { planApproval: f.planApproval.checked, concurrency: +f.concurrency.value, dailyCalls: clamp(+f.dailyCalls.value || 150, 10, 2000), maxTasksPlan: clamp(+f.maxTasksPlan.value || 8, 1, 12), maxCallsPlan: clamp(+f.maxCallsPlan.value || 40, 5, 200), maxDepth: +f.maxDepth.value, showNames: f.showNames.checked, ambient: f.ambient.checked, priceIn: f.priceIn.value.trim(), priceOut: f.priceOut.value.trim() };
      Config.set(v); View.showNames = v.showNames; View.ambient = v.ambient; Orch.pump(); toast('Ajustes guardados');
    });
    f.onsubmit = e => e.preventDefault();
    b.append(f);
    b.append(h('<div class="sec-h">Identidad</div>'));
    b.append(h('<div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><img alt="Logotipo de La Cueva" style="height:44px"><span class="hint">Logotipo oficial de La Cueva by Daniel, integrado en la cabecera y en la recepción de la oficina.</span></div>'));
    b.lastElementChild.querySelector('img').src = LOGO_SRC;
    if (LC_SERVER) {
      b.append(h('<div class="sec-h">Sesión</div>'));
      const ss = h('<div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="hint" style="flex:1">Has entrado con la contraseña de administrador. Para cambiarla, edita ADMIN_PASSWORD en Vercel: se cerrarán todas las sesiones.</span><button class="btn sec">Cerrar sesión</button></div>');
      ss.querySelector('.btn').onclick = () => window.LCServer.logout();
      b.append(ss);
    }
    b.append(h('<div class="sec-h">Copia de seguridad</div>'));
    const bk = h('<div class="card"><div class="hint" style="margin-bottom:8px">' + (LC_SERVER ? 'Descarga todos tus datos en un archivo JSON. Para traer lo que tenías en la versión dentro de Claude: descarga allí la copia y restáurala aquí.' : 'Descarga todos tus datos (proyectos, conversaciones, tareas, entregables, memoria y plantilla) en un archivo JSON. También sirve para migrar al backend en la Fase 4.') + '</div><div class="toolbar"><button class="btn sec">Descargar copia</button><label class="btn ghost">Restaurar desde archivo<input type="file" accept=".json" hidden></label></div></div>');
    bk.querySelector('.btn').onclick = async () => { const data = await Store.exportAll(); Dl.save('la-cueva-copia-' + dayKey() + '.json', JSON.stringify(data, null, 2)); };
    bk.querySelector('input').onchange = async e => { const fl = e.target.files[0]; if (!fl) return; try { const j = JSON.parse(await fl.text()); confirmBox('¿Restaurar esta copia?', 'Se añadirán o sobrescribirán los elementos con el mismo identificador. No se borra nada que no esté en la copia.', 'Restaurar copia', async () => { const r = await Store.importAll(j); toast('Copia restaurada: ' + r.n + ' elementos' + (r.skipped ? ' (' + r.skipped + ' descartados por no ser válidos)' : '')); View.setAgents(Roster.enabled()); }); } catch (er) { toast('El archivo no es una copia válida de La Cueva.', true); } };
    b.append(bk);
  }

  /* ================= FICHA DE EMPLEADO ================= */
  function agent(id) {
    current = 'agent';
    const isNew = !id; const a = isNew ? null : Roster.get(id);
    const draft = isNew ? { name: '', role: '', dept: 'MKT', specialty: '', personality: '', instructions: '' } : JSON.parse(JSON.stringify(a));
    const p = shell(isNew ? 'Nuevo agente' : 'Ficha de ' + a.name, isNew ? 'Crea un nuevo especialista. Tendrá su avatar y un puesto libre en su departamento (o en la zona común si no hay sitio).' : a.role + ' · ' + (a.dept === 'DIR' ? 'Dirección' : DEPT_NAMES[a.dept]), !isNew);
    if (isNew) {
      const f = h('<form class="form"><div class="f2"><label class="f">Nombre<input name="name" required maxlength="40"></label><label class="f">Cargo<input name="role" required maxlength="60"></label><label class="f">Departamento<select name="dept"></select></label></div><label class="f">Especialidad<textarea name="specialty" required></textarea></label><label class="f">Personalidad<textarea name="personality"></textarea></label><label class="f">Instrucciones del puesto<textarea name="instructions"></textarea></label><div class="toolbar"><button class="btn" type="submit">Crear agente</button><button class="btn sec" type="button">Cancelar</button></div></form>');
      for (const d of DEPT_IDS) { const o = h('<option></option>'); o.value = d; o.textContent = DEPT_NAMES[d]; f.dept.append(o); }
      f.dept.value = 'MKT';
      f.onsubmit = e => { e.preventDefault(); const n = Roster.create({ name: f.name.value.trim(), role: f.role.value.trim(), dept: f.dept.value, specialty: f.specialty.value.trim(), personality: f.personality.value.trim(), instructions: f.instructions.value.trim() }); View.setAgents(Roster.enabled()); UI.renderDir(); Activity.log('equipo', 'Creaste el agente ' + n.name + ' (' + n.role + ')', { agentId: n.id }); toast(n.name + ' se ha incorporado al equipo'); agent(n.id); };
      f.querySelector('[type=button]').onclick = close;
      p.querySelector('.pbody').append(f); return;
    }
    const save = () => { Roster.save(draft); View.setAgents(Roster.enabled()); UI.renderDir(); Activity.log('equipo', 'Editaste la ficha de ' + draft.name, { agentId: draft.id }); toast('Ficha guardada'); };
    tabsInto(p, [['perfil', 'Perfil'], ['comp', 'Comportamiento'], ['modelo', 'Modelo de IA'], ['perm', 'Herramientas y permisos'], ['avatar', 'Avatar'], ['mem', 'Memoria'], ['act', 'Actividad']], 'agent', (t, b) => {
      const bar = h('<div class="toolbar" style="margin-top:16px"><button class="btn" type="button">Guardar cambios</button><button class="btn ghost" type="button">Hablar con ' + esc(draft.name) + '</button></div>');
      bar.children[0].onclick = save; bar.children[1].onclick = () => ChatUI.open(draft.id);
      if (t === 'perfil') {
        const f = h('<div class="form"><div class="f2"><label class="f">Nombre<input data-k="name" maxlength="40"></label><label class="f">Cargo<input data-k="role" maxlength="60"></label><label class="f">Departamento<select data-k="dept"></select></label></div><label class="f">Especialidad<textarea data-k="specialty"></textarea></label><label class="f">Descripción<textarea data-k="description"></textarea></label><label class="chk"><input type="checkbox" data-k="enabled"> Agente activo (si lo desactivas, no recibe tareas ni aparece en la oficina)</label></div>');
        for (const d of ['DIR'].concat(DEPT_IDS)) { const o = h('<option></option>'); o.value = d; o.textContent = d === 'DIR' ? 'Dirección' : DEPT_NAMES[d]; f.querySelector('[data-k=dept]').append(o); }
        if (draft.id === 'daniel') f.querySelector('[data-k=dept]').disabled = true; else f.querySelector('[data-k=dept] option[value=DIR]').disabled = true;
        bind(f, draft); b.append(f, bar);
      }
      if (t === 'comp') { const f = h('<div class="form"><label class="f">Personalidad<textarea data-k="personality"></textarea></label><label class="f">Instrucciones de comportamiento<textarea data-k="instructions" style="min-height:160px"></textarea></label><div class="note">Estas instrucciones se suman a las reglas de honestidad y seguridad de La Cueva, que no se pueden desactivar.</div></div>'); bind(f, draft); b.append(f, bar); }
      if (t === 'modelo') {
        const f = h('<div class="form"><label class="f">Nivel de modelo<select data-k="tier"><option value="quick">Rápido · respuestas breves y tareas sencillas</option><option value="default">Equilibrado · uso general</option><option value="complex">Razonamiento avanzado · estrategia y problemas difíciles</option></select></label><label class="f">Modelo concreto (opcional)<input data-k="model" placeholder="Vacío = el mejor disponible para el nivel elegido"></label><div class="note">' + (LC_SERVER ? 'En el servidor, cada nivel usa el modelo configurado en Vercel para el proveedor activo (puedes cambiarlo con las variables ANTHROPIC_MODEL_QUICK/DEFAULT/COMPLEX u OPENAI_MODEL_*). Si escribes un identificador concreto y no existe, se usa el del nivel.' : 'La Cueva no fija nombres de modelos: el nivel elige automáticamente el modelo vigente de Claude disponible en tu cuenta. Si escribes un identificador concreto y no está disponible, se usa el nivel elegido. Cuando exista el backend, aquí podrás elegir también otro proveedor.') + '</div><div class="f2"><label class="f">Duración máxima por respuesta (segundos)<input type="number" min="60" max="900" data-lk="maxDurSeg"></label><label class="f">Mensajes de historial que recuerda<input type="number" min="4" max="60" data-lk="historial"></label></div></div>');
        bind(f, draft); b.append(f, bar);
      }
      if (t === 'perm') {
        const w = h('<div class="grid g2"><div class="card"><div class="sec-h" style="margin-top:0">Herramientas</div><div class="tl"></div></div><div class="card"><div class="sec-h" style="margin-top:0">Permisos</div><div class="pl"></div><div class="sec-h">Límites de autonomía</div><div class="f2"><label class="f">Colaboraciones por tarea<input type="number" min="0" max="5" data-lk="maxColab"></label><label class="f">Subtareas por tarea<input type="number" min="0" max="5" data-lk="maxSubtareas"></label></div></div></div>');
        const isDir = draft.dept === 'DIR';
        for (const [k, tl] of Object.entries(TOOLS)) { if (tl.who === 'director' && !isDir) continue; if (tl.who === 'specialist' && isDir) continue; const l = h('<label class="chk"><input type="checkbox"> <span></span></label>'); l.querySelector('span').textContent = tl.label + (draft.perms[tl.perm] ? '' : ' (requiere permiso: ' + PERMS[tl.perm] + ')'); const cb = l.querySelector('input'); cb.checked = tl.always ? !(draft.toolsOff || []).includes(k) : (draft.tools || []).includes(k); cb.onchange = () => { if (tl.always) { draft.toolsOff = (draft.toolsOff || []).filter(x => x !== k); if (!cb.checked) draft.toolsOff.push(k); return; } draft.tools = (draft.tools || []).filter(x => x !== k); if (cb.checked) draft.tools.push(k); }; w.querySelector('.tl').append(l); }
        for (const [k, lbl] of Object.entries(PERMS)) { if (['planificar', 'programar', 'contratar', 'supervisar'].includes(k) && !isDir) continue; if (k === 'delegar' && isDir) continue; const l = h('<label class="chk"><input type="checkbox"> <span></span></label>'); l.querySelector('span').textContent = lbl; const cb = l.querySelector('input'); cb.checked = !!draft.perms[k]; cb.onchange = () => { draft.perms[k] = cb.checked; }; w.querySelector('.pl').append(l); }
        w.querySelector('.pl').append(h('<div class="note">Las acciones sensibles (' + SENSITIVE.slice(0, 4).join(', ').toLowerCase() + '…) siempre requieren tu aprobación, tenga los permisos que tenga.</div>'));
        bind(w, draft); b.append(w, bar);
      }
      if (t === 'avatar') {
        const w = h('<div class="grid g2"><div class="card" style="display:flex;align-items:center;justify-content:center;background:var(--paper-2)"><canvas width="192" height="192" style="width:192px;height:192px"></canvas></div><div class="form"></div></div>');
        const cv = w.querySelector('canvas'), x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
        let frame = 0; const draw = () => {
          const rendered = window.LC_STUDIO && window.LC_STUDIO.portrait(draft.avatar, 192, true, frame * .16);
          x.clearRect(0, 0, 192, 192);
          if (rendered) { x.imageSmoothingEnabled = true; x.drawImage(rendered, 0, 0, 192, 192); return; }
          const sh = buildSheet(draft.avatar), keys = ['stand-S', 'walk-S', 'walk-E', 'stand-N'], k = keys[Math.floor(frame / 8) % 4];
          x.imageSmoothingEnabled = false; x.drawImage(sh.canvas, (frame % 4) * FR * (k.startsWith('walk') ? 1 : 0), sh.row(k) * FR, FR, FR, 0, 0, 192, 192);
        };
        const iv = setInterval(() => { if (!document.body.contains(cv)) { clearInterval(iv); return; } frame++; draw(); }, 160); draw();
        const form = w.querySelector('.form');
        const sel = (label, key, opts) => { const l = h('<label class="f"><span></span><select></select></label>'); l.querySelector('span').textContent = label; const s = l.querySelector('select'); for (const [v, t2] of opts) { const o = h('<option></option>'); o.value = v; o.textContent = t2; s.append(o); } s.value = draft.avatar[key] || ''; s.onchange = () => { draft.avatar[key] = s.value || undefined; draw(); }; form.append(l); };
        const color = (label, key) => { const l = h('<label class="f"><span></span><input type="color"></label>'); l.querySelector('span').textContent = label; const i = l.querySelector('input'); i.value = draft.avatar[key] || '#888888'; i.oninput = () => { draft.avatar[key] = i.value; draw(); }; form.append(l); };
        sel('Peinado', 'hs', [['short', 'Corto'], ['buzz', 'Rapado'], ['long', 'Largo'], ['bun', 'Moño'], ['ponytail', 'Coleta'], ['curly', 'Rizado'], ['bald', 'Sin pelo']]);
        sel('Tono de piel', 'skin', SKINS.map((s2, i) => [s2, 'Tono ' + (i + 1)]));
        color('Color de pelo', 'hair');
        sel('Prenda', 'ts', [['tee', 'Camiseta'], ['hoodie', 'Sudadera'], ['shirt', 'Camisa'], ['blazer', 'Americana'], ['sweater', 'Jersey'], ['turtle', 'Cuello alto'], ['vest', 'Chaleco']]);
        color('Color de la prenda', 'top'); color('Pantalón', 'pants'); color('Calzado', 'shoes');
        sel('Complemento', 'acc', [['', 'Ninguno'], ['glasses', 'Gafas'], ['shades', 'Gafas de sol'], ['phones', 'Auriculares']]);
        sel('Vello facial', 'face', [['', 'Ninguno'], ['beard', 'Barba'], ['stache', 'Bigote'], ['stubble', 'Barba de días']]);
        sel('Gorro', 'hat', [['', 'Ninguno'], ['cap', 'Gorra'], ['beanie', 'Gorro de lana']]);
        color('Color del gorro', 'hatC');
        b.append(w, bar);
      }
      if (t === 'mem') {
        const f = h('<div class="card"><div class="sec-h" style="margin-top:0">Memoria autorizada</div><div class="hint" style="margin-bottom:6px">Qué reglas aprobadas recibe este agente. La memoria operativa siempre es la del proyecto en el que trabaja.</div></div>');
        for (const [k, lbl] of [['agencia', 'Reglas de toda la agencia'], ['proyecto', 'Reglas del proyecto en el que trabaja'], ['cliente', 'Reglas del cliente de ese proyecto'], ['agente', 'Reglas propias de este agente']]) { const l = h('<label class="chk"><input type="checkbox"> <span></span></label>'); l.querySelector('span').textContent = lbl; const cb = l.querySelector('input'); cb.checked = (draft.memoryScopes || []).includes(k); cb.onchange = () => { draft.memoryScopes = (draft.memoryScopes || []).filter(x => x !== k); if (cb.checked) draft.memoryScopes.push(k); }; f.append(l); }
        b.append(f);
        const rs = Store.all('rules').filter(r => r.scope === 'agente' && r.scopeId === draft.id);
        b.append(h('<div class="sec-h">Reglas propias</div>')); if (!rs.length) b.append(h(empty('Sin reglas propias', 'Puedes crearlas en Memoria → Nueva regla.'))); for (const r of rs) b.append(ruleCard(r));
        b.append(bar);
      }
      if (t === 'act') {
        const tasks = Store.all('tasks').filter(x => x.agentId === draft.id), convs = Store.all('convs').filter(c => c.agentId === draft.id);
        let calls = 0, tok = 0; for (const d of Store.all('usage')) { const v = (d.byAgent || {})[draft.id]; if (v) { calls += v.calls; tok += v.inTok + v.outTok; } }
        b.innerHTML = '<div class="grid g4">' + kpi(convs.length, 'Conversaciones') + kpi(tasks.length, 'Tareas') + kpi(tasks.filter(x => x.state === 'completada').length, 'Completadas') + kpi(calls, 'Llamadas de IA', '≈ ' + fmtNum(tok) + ' tokens') + '</div>';
        b.append(h('<div class="sec-h">Tareas</div>'));
        if (!tasks.length) b.append(h(empty('Sin tareas todavía', '')));
        const L = h('<div class="card list"></div>'); for (const tk of tasks.sort((x, y) => y.createdAt - x.createdAt).slice(0, 30)) { const li = h('<div class="li"><div class="grow"><b></b><small></small></div></div>'); li.querySelector('b').textContent = tk.title; li.querySelector('small').innerHTML = tChip(tk.state) + ' ' + esc(projName(tk.projectId)) + ' · ' + esc(fmtDT(tk.createdAt)); if (tk.resultId) { const v = h('<button class="btn sm sec">Ver</button>'); v.onclick = () => deliverable(tk.resultId); li.append(v); } L.append(li); } if (tasks.length) b.append(L);
        b.append(h('<div class="sec-h">Conversaciones</div>')); const L2 = h('<div class="card list"></div>'); for (const c of convs) { const li = h('<div class="li"><div class="grow"><b></b><small></small></div></div>'); li.querySelector('b').textContent = c.title; li.querySelector('small').textContent = projName(c.projectId) + ' · ' + ago(c.updatedAt); const o = h('<button class="btn sm sec">Abrir</button>'); o.onclick = () => { close(); ChatUI.open(c.agentId, { convId: c.id }); }; li.append(o); L2.append(li); } if (convs.length) b.append(L2); else b.append(h(empty('Sin conversaciones', '')));
      }
    });
  }
  function bind(root, obj) {
    $$('[data-k]', root).forEach(el => { const k = el.dataset.k; if (el.type === 'checkbox') { el.checked = obj[k] !== false; el.onchange = () => obj[k] = el.checked; } else { el.value = obj[k] == null ? '' : obj[k]; el.oninput = el.onchange = () => obj[k] = el.value; } });
    $$('[data-lk]', root).forEach(el => { const k = el.dataset.lk; el.value = obj.limits[k]; el.oninput = () => obj.limits[k] = +el.value; });
  }

  /* ================= VISORES ================= */
  async function deliverable(id) {
    const d = Store.get('deliverables', id); if (!d) return;
    current = 'viewer';
    const p = shell(d.title, agentName(d.agentId) + ' · ' + projName(d.projectId) + ' · ' + fmtDT(d.ts), false);
    const b = p.querySelector('.pbody');
    const t = await Store.load('dtext', id); const text = (t && t.text) || '';
    const tb = h('<div class="toolbar" style="margin-bottom:12px"><span class="chip"></span><button class="btn sm sec">Copiar</button><button class="btn sm sec"><svg><use href="#i-dl"/></svg>Descargar .md</button></div>');
    const ch = tb.querySelector('.chip'); ch.textContent = ({ borrador: 'Borrador', en_revision: 'En revisión', aprobado: 'Aprobado' })[d.status]; ch.className = 'chip ' + ({ borrador: 'plain', en_revision: 'info', aprobado: 'ok' })[d.status];
    tb.children[1].onclick = () => copyText(text); tb.children[2].onclick = () => Dl.save(slug(d.title) + '.md', text);
    const htmlBlock = (text.match(/```html\n([\s\S]*?)```/i) || [])[1];
    if (htmlBlock) { const x = h('<button class="btn sm sec"><svg><use href="#i-dl"/></svg>Descargar .html</button>'); x.onclick = () => Dl.save(slug(d.title) + '.html', htmlBlock); tb.append(x); }
    if (d.status !== 'aprobado') { const x = h('<button class="btn sm">Marcar como aprobado</button>'); x.onclick = () => { Store.patch('deliverables', id, { status: 'aprobado' }); Activity.log('entregable', 'Aprobaste el entregable «' + d.title + '»', { deliverableId: id, projectId: d.projectId }); deliverable(id); }; tb.append(x); }
    if (d.truncated) b.append(h('<div class="note warn" style="margin-bottom:10px">La respuesta llegó cortada por longitud. Puedes pedir al agente que continúe.</div>'));
    b.append(tb); const c = h('<div class="md doc"></div>'); c.innerHTML = md(text); b.append(c);
  }
  function preview(att) {
    current = 'viewer';
    const p = shell(att.name, att.kind === 'image' ? 'Imagen adjunta' : att.kind === 'text' ? 'Documento de texto' : 'Archivo adjunto', false);
    const b = p.querySelector('.pbody');
    if (att.kind === 'image') { const im = h('<img alt="" style="max-width:100%;border-radius:8px">'); im.src = att.local || att.url; b.append(im); }
    else if (att.kind === 'text') { const pre = h('<pre style="white-space:pre-wrap;font-family:var(--f-mono);font-size:13px;background:#fffaf2;border:1px solid var(--line);border-radius:8px;padding:12px;max-height:60vh;overflow:auto"></pre>'); pre.textContent = (att.text || '').slice(0, 40000); b.append(pre); }
    else { const n = h('<div class="note"></div>'); n.textContent = att.note || 'Vista previa no disponible para este tipo de archivo.'; b.append(n); if (att.url && /^(https:\/\/|\/_blob\/)/.test(att.url)) { const a = h('<a target="_blank" rel="noopener">Abrir el archivo</a>'); a.href = att.url; b.append(a); } }
  }
  function retry(taskId) {
    const t = Store.get('tasks', taskId); if (!t) return;
    current = 'viewer';
    const p = shell('Reintentar tarea', t.title, false, true);
    const f = h('<form class="form"><div class="hint"></div><label class="f">Indicaciones para el agente (opcional)<textarea name="n" placeholder="Por ejemplo: el presupuesto mensual es de 800 €; prioriza Instagram."></textarea></label><label class="f">Responsable<select name="a"></select></label><div class="toolbar"><button class="btn" type="submit">Reintentar</button><button class="btn sec" type="button">Cancelar tarea</button></div></form>');
    f.querySelector('.hint').textContent = 'Estado: ' + TS[t.state] + (t.error ? ' — ' + t.error : '');
    for (const a of Roster.enabled().filter(x => x.dept !== 'DIR')) { const o = h('<option></option>'); o.value = a.id; o.textContent = a.name + ' · ' + a.role; f.a.append(o); }
    f.a.value = t.agentId;
    f.onsubmit = e => { e.preventDefault(); if (f.a.value !== t.agentId) Orch.reassign(taskId, f.a.value); else Orch.retryTask(taskId, f.n.value.trim()); close(); toast('Tarea en cola'); };
    f.querySelector('[type=button]').onclick = () => { Orch.cancelTask(taskId); close(); };
    p.querySelector('.pbody').append(f);
  }
  function confirmBox(title, text, okLabel, fn) {
    const box = h('<div style="position:fixed;inset:0;z-index:95;background:rgba(15,10,6,.5);display:flex;align-items:center;justify-content:center;padding:16px"><div class="panel narrow" style="max-width:440px;padding:20px"><h3></h3><p class="hint" style="margin:8px 0 16px"></p><div class="toolbar"><button class="btn danger"></button><button class="btn sec">Cancelar</button></div></div></div>');
    box.querySelector('h3').textContent = title; box.querySelector('p').textContent = text; box.querySelector('.danger').textContent = okLabel;
    box.querySelector('.danger').onclick = () => { box.remove(); fn(); }; box.querySelector('.sec').onclick = () => box.remove();
    document.body.append(box); box.querySelector('.sec').focus();
  }
  return { open, close, agent, deliverable, preview, retry, confirm: confirmBox, get current() { return current; } };
})();
