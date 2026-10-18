/* ============================================================
   LA CUEVA · interfaz: utilidades, directorio, selección, chat
   ============================================================ */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function toast(msg, bad) { const t = h('<div class="toast' + (bad ? ' bad' : '') + '"></div>'); t.textContent = msg; $('#toasts').append(t); setTimeout(() => t.remove(), bad ? 6500 : 3800); }
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast('Copiado al portapapeles'); return true; } catch (e) { toast('No se pudo copiar automáticamente. Selecciona el texto y cópialo.', true); return false; } }
const Dl = (() => {
  let api = null, tried = false;
  async function save(filename, data) {
    if (!tried) { tried = true; try { if (window.claude && window.claude.use) api = await window.claude.use('downloads'); } catch (e) { api = null; } }
    if (!api) { await copyText(typeof data === 'string' ? data : ''); toast('Las descargas no están disponibles en esta vista; he copiado el contenido.'); return; }
    try { await api.save({ filename, data }); toast('Archivo guardado: ' + filename); }
    catch (e) { if (e && e.code === 'declined') return; toast('No se pudo guardar el archivo (' + ((e && e.code) || 'error') + ').', true); }
  }
  return { save };
})();
function slug(s) { return String(s || 'documento').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'documento'; }

/* ---------- Markdown seguro (escapa primero, luego formatea) ---------- */
function md(src) {
  src = String(src || '').replace(/\u0000/g, '').replace(/([^\n])```/g, '$1\n```');
  const codes = [];
  src = src.replace(/```([\w+-]*)\n?([\s\S]*?)(```|$)/g, (m, lang, code) => { codes.push({ lang, code }); return '\u0000C' + (codes.length - 1) + '\u0000'; });
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const lines = src.split('\n'); const out = []; let i = 0;
  while (i < lines.length) {
    let l = lines[i];
    const cm = l.match(/^\u0000C(\d+)\u0000$/);
    if (cm && codes[+cm[1]]) { const c = codes[+cm[1]]; out.push('<pre data-lang="' + esc(c.lang) + '"><button class="cp" type="button">Copiar</button><code>' + esc(c.code.replace(/\n$/, '')) + '</code></pre>'); i++; continue; }
    if (/^\s*$/.test(l)) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>'); i++; continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(l)) { const b = []; while (i < lines.length && /^\s*>/.test(lines[i])) b.push(lines[i++].replace(/^\s*>\s?/, '')); out.push('<blockquote>' + b.map(inline).join('<br>') + '</blockquote>'); continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const row = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = row(l); i += 2; const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
      out.push('<table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' + body.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d+[.)]/.test(l); const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) { let it = lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ''); while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) it += ' ' + lines[i++].trim(); items.push(it.replace(/^\[( |x)\]\s*/i, (m0, x) => x.trim() ? '☑ ' : '☐ ')); }
      out.push((ordered ? '<ol>' : '<ul>') + items.map(x => '<li>' + inline(x) + '</li>').join('') + (ordered ? '</ol>' : '</ul>')); continue;
    }
    const p = []; while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4})\s/.test(lines[i]) && !/^\u0000C/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && !/^\s*>/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) p.push(lines[i++]);
    if (!p.length) { out.push('<p>' + inline(lines[i++]) + '</p>'); continue; }
    out.push('<p>' + p.map(inline).join('<br>') + '</p>');
  }
  return out.join('');
}
document.addEventListener('click', e => { const b = e.target.closest('pre .cp'); if (b) { copyText(b.parentElement.querySelector('code').textContent); } });

/* ---------- avatares y estados ---------- */
function avatarEl(agent, px) { const c = avatarCanvas(Object.assign({ bg: shade((ROOMS[agent.dept] || ROOMS.MEET).wall, -.15) }, agent.avatar), 40); c.className = 'av'; c.style.width = c.style.height = (px || 36) + 'px'; c.setAttribute('aria-hidden', 'true'); return c; }
const ST_TXT = { idle: 'Disponible', working: 'Trabajando', collab: 'Colaborando', waiting: 'Esperando aprobación', stopped: 'Detenido' };
const ST_CHIP = { idle: 'ok', working: 'warn', collab: 'info', waiting: 'wait', stopped: 'bad' };
function stChip(st) { return '<span class="chip ' + ST_CHIP[st.state] + '">' + ST_TXT[st.state] + '</span>'; }
const T_CHIP = { pendiente: 'plain', en_cola: 'info', en_curso: 'warn', esperando_colaboracion: 'info', esperando_aprobacion: 'wait', bloqueada: 'bad', completada: 'ok', fallida: 'bad', cancelada: 'plain', pausada: 'plain', interrumpida: 'bad' };
const P_CHIP = { pendiente_aprobacion: 'wait', en_curso: 'warn', pausado: 'plain', requiere_atencion: 'bad', consolidando: 'warn', en_revision: 'info', completado: 'ok', cancelado: 'plain' };
function tChip(s) { return '<span class="chip ' + (T_CHIP[s] || 'plain') + '">' + esc(TS[s] || s) + '</span>'; }
function pChip(s) { return '<span class="chip ' + (P_CHIP[s] || 'plain') + '">' + esc(PS[s] || s) + '</span>'; }
function agentName(id) { const a = Roster.get(id); return a ? a.name : (id === 'programacion' ? 'Programación' : id || '—'); }
function projName(id) { const p = id && Store.get('projects', id); return p ? p.name : 'General'; }

/* ---------- interfaz principal ---------- */
const UI = (() => {
  let openDrawer = null;

  function header() {
    $('#logo').src = LOGO_SRC;
    $$('.nb').forEach(b => { const label = b.querySelector('.lb'); if (label) { b.setAttribute('aria-label', label.textContent); b.title = label.textContent; } });
    $$('.nb[data-panel], .pill[data-panel]').forEach(b => b.addEventListener('click', () => Panels.open(b.dataset.panel)));
    $('.nb[data-open=dir]').addEventListener('click', () => toggle('dir'));
    $$('[data-close]').forEach(b => b.addEventListener('click', () => close(b.dataset.close)));
    $('#z-in').onclick = () => View.zoomBy(1); $('#z-out').onclick = () => View.zoomBy(-1); $('#z-all').onclick = () => View.overview(); $('#z-me').onclick = () => View.centerMe();
    $('#fab').onclick = () => ChatUI.open('daniel');
    const fav = $('#fab-av'), d = Roster.get('daniel'); fav.getContext('2d').drawImage(avatarCanvas(Object.assign({ bg: '#4f3b2d' }, d.avatar), 36), 0, 0);
    $('#new-agent').onclick = () => Panels.agent(null);
    $('#dir-q').addEventListener('input', renderDir);
    TouchControls.bind($('#joystick'), $('#joystick-knob'), View.setPad);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#modal').classList.contains('open')) Panels.close(); else if ($('#sel').hidden === false) View.select(null); else if (openDrawer) close(openDrawer); } });
  }
  function toggle(id) { if (openDrawer === id) close(id); else open(id); }
  function open(id) {
    Bus.emit('ui:overlay');
    if (openDrawer && openDrawer !== id && window.innerWidth < 900) close(openDrawer);
    $('#' + id).classList.add('open'); if (id === 'dir') { $('.nb[data-open=dir]').setAttribute('aria-pressed', 'true'); renderDir(); }
    openDrawer = id; layoutFab();
  }
  function close(id) { $('#' + id).classList.remove('open'); if (id === 'dir') $('.nb[data-open=dir]').setAttribute('aria-pressed', 'false'); if (openDrawer === id) openDrawer = null; layoutFab(); }
  function layoutFab() { $('#fab').style.display = $('#chat').classList.contains('open') ? 'none' : ''; }

  /* ---------- directorio ---------- */
  function renderDir() {
    const q = ($('#dir-q').value || '').toLowerCase().trim();
    const list = $('#dir-list'); list.innerHTML = '';
    const groups = ['DIR'].concat(DEPT_IDS);
    for (const g of groups) {
      const ags = Roster.all().filter(a => a.dept === g && (!q || (a.name + ' ' + a.role + ' ' + a.specialty).toLowerCase().includes(q)));
      if (!ags.length) continue;
      const R = ROOMS[g];
      const sec = h('<div class="dept"><h4><i style="background:' + R.wall + '"></i>' + esc(g === 'DIR' ? 'Dirección' : DEPT_NAMES[g]) + '<button class="btn sm ghost" title="Ir a la sala">Ir a la sala</button></h4></div>');
      sec.querySelector('button').onclick = () => { View.focusRoom(g); if (window.innerWidth < 900) close('dir'); };
      for (const a of ags) {
        const st = Orch.agentStatus(a.id);
        const row = h('<button class="agent-row"><span class="mid"><span class="nm"></span><span class="rl"></span></span><span class="dot st-' + st.state + '" title="' + esc(ST_TXT[st.state]) + '"></span></button>');
        row.prepend(avatarEl(a, 34)); row.querySelector('.nm').textContent = a.name + (a.enabled === false ? ' (desactivado)' : ''); row.querySelector('.rl').textContent = a.role + ' · ' + (st.label || '');
        row.onclick = () => { View.focusAgent(a.id); if (window.innerWidth < 900) close('dir'); };
        row.ondblclick = () => ChatUI.open(a.id);
        sec.append(row);
      }
      list.append(sec);
    }
    if (!list.children.length) list.append(h('<div class="empty"><b>Sin resultados</b>Prueba con otro nombre o cargo.</div>'));
  }

  /* ---------- selección y tooltip ---------- */
  let selId = null;
  function onSelect(id) {
    selId = id; const box = $('#sel');
    if (!id) { box.hidden = true; return; }
    const a = Roster.get(id); if (!a) { box.hidden = true; return; }
    const st = Orch.agentStatus(id);
    box.innerHTML = '';
    box.append(h('<button class="x" aria-label="Cerrar">×</button>'));
    const row = h('<div class="row"><div><h3></h3><div class="role"></div></div></div>'); row.prepend(avatarEl(a, 52));
    row.querySelector('h3').textContent = a.name; row.querySelector('.role').textContent = a.role + ' · ' + (a.dept === 'DIR' ? 'Dirección' : DEPT_NAMES[a.dept]);
    box.append(row);
    box.append(h('<div class="now">' + stChip(st) + ' <span></span></div>')); box.querySelector('.now span').textContent = st.label === ST_TXT[st.state] ? '' : st.label;
    const acts = h('<div class="acts"><button class="btn">Hablar</button><button class="btn sec">Ficha</button></div>');
    acts.children[0].onclick = () => ChatUI.open(id); acts.children[1].onclick = () => Panels.agent(id);
    box.append(acts);
    box.querySelector('.x').onclick = () => View.select(null);
    box.hidden = false; placeSel();
  }
  function placeSel() {
    const box = $('#sel'); if (box.hidden || !selId) return;
    const p = View.screenPosOf(selId), st = $('#stage').getBoundingClientRect();
    if (!p) return;
    const w = box.offsetWidth, hh = box.offsetHeight;
    let x = p.x - w / 2, y = p.y - hh - 12;
    if (y < 8) y = p.y + 70;
    x = clamp(x, 8, st.width - w - 8); y = clamp(y, 8, st.height - hh - 8);
    box.style.left = x + 'px'; box.style.top = y + 'px';
  }
  function onHover(info) {
    const tip = $('#tip'); if (!info) { tip.hidden = true; return; }
    const a = Roster.get(info.id); if (!a) { tip.hidden = true; return; }
    const st = Orch.agentStatus(info.id);
    tip.innerHTML = '<b></b><br><span class="r"></span><br><span class="s"></span>';
    tip.querySelector('b').textContent = a.name; tip.querySelector('.r').textContent = a.role; tip.querySelector('.s').textContent = (ST_TXT[st.state]) + (st.label && st.label !== ST_TXT[st.state] ? ' · ' + st.label : '');
    tip.style.left = Math.min(info.x + 14, window.innerWidth - 250) + 'px'; tip.style.top = (info.y + 14) + 'px'; tip.hidden = false;
  }
  function badges() {
    const ap = Store.all('approvals').filter(a => a.state === 'pendiente').length;
    const pr = Store.all('rules').filter(r => r.state === 'propuesta').length;
    const attn = Store.all('plans').filter(p => ['pendiente_aprobacion', 'requiere_atencion', 'en_revision'].includes(p.state)).length + Store.all('tasks').filter(t => t.state === 'interrumpida').length;
    $('#b-appr').textContent = ap || ''; $('#b-mem').textContent = pr || ''; $('#b-attn').textContent = attn || '';
  }
  function sysPills() {
    const ai = $('#p-ai'), dbp = $('#p-db');
    ai.className = 'pill' + (AI.status === 'ok' ? '' : ' bad'); ai.querySelector('span').textContent = AI.status === 'ok' ? (LC_SERVER ? 'IA configurada' : 'IA activa') : AI.status === 'checking' ? 'IA…' : 'IA no disponible';
    const m = Store.mode; dbp.className = 'pill' + (m === 'db' ? '' : m === 'local' ? ' warn' : ' bad'); dbp.querySelector('span').textContent = m === 'db' ? 'Datos guardados' : m === 'local' ? 'Solo este navegador' : 'Sin guardar';
    ai.title = AI.status === 'ok' ? (LC_SERVER ? 'Proveedor de IA configurado: ' + ({ anthropic: 'Anthropic API', openai: 'OpenAI API', mock: 'simulador de pruebas' }[AI.provider] || 'la API configurada') + '. La clave y el modelo no se prueban al abrir esta vista.' : 'Los agentes responden con Claude usando tu sesión') : (LC_SERVER ? 'Falta la clave de IA en Vercel' : 'Abre La Cueva dentro de Claude con tu sesión iniciada');
    dbp.title = m === 'db' ? (LC_SERVER ? 'Proyectos, chats y tareas se guardan en la base de datos del servidor (Postgres)' : 'Proyectos, chats y tareas se guardan en la base de datos de La Cueva') : m === 'local' ? 'Sin base de datos: los datos solo se guardan en este navegador' : 'Sin almacenamiento: los datos se pierden al cerrar';
    if (LC_SERVER && m === 'db') dbp.querySelector('span').textContent = 'Datos en el servidor';
  }
  return { header, open, close, toggle, renderDir, onSelect, placeSel, onHover, badges, sysPills, get selId() { return selId; } };
})();

/* ============================================================
   Chat: panel rápido y espacio de trabajo completo
   ============================================================ */
const ChatUI = (() => {
  let agentId = null, convId = null, atts = [], wide = false;
  const root = () => $('#chat');
  const SUG = {
    daniel: ['¿Qué puede hacer cada departamento por mí?', 'Crea un proyecto nuevo para uno de mis negocios', 'Prepara y ejecuta un plan para lanzar una tienda Shopify'],
    DEV: ['¿Qué necesitas de mí para empezar?', 'Revisa la estructura de una tienda Shopify para convertir más', 'Hazme una landing en un solo archivo HTML'],
    DIS: ['Propón tres líneas visuales para una marca', '¿Qué necesitas para diseñar las creatividades?', 'Haz un brief creativo para una campaña'],
    PAID: ['¿Cómo repartirías 1.500 € al mes entre canales?', 'Estructura una campaña de captación', '¿Qué datos necesitas para analizar mis campañas?'],
    CONT: ['Escribe tres titulares para una landing', 'Haz un calendario de contenido de 2 semanas', 'Define el tono de voz de una marca'],
    MKT: ['Haz un diagnóstico de marketing de mi negocio', '¿Qué priorizarías este trimestre?', 'Prepara un plan SEO local'],
    AUTO: ['¿Qué automatizarías primero en una pyme?', 'Diseña un flujo en n8n para captar leads', '¿Cómo funciona la memoria de La Cueva?'],
    VENT: ['Define mi cliente ideal B2B', 'Escribe una secuencia de seguimiento comercial', 'Prepara una propuesta comercial'],
    ATC: ['Crea respuestas modelo para clientes', 'Organiza un procedimiento operativo', 'Haz una checklist semanal de operaciones']
  };
  function shell() {
    const a = Roster.get(agentId), st = Orch.agentStatus(agentId);
    const r = root(); r.innerHTML = ''; r.classList.toggle('wide', wide);
    const head = h('<div class="dhead"><div style="flex:1;min-width:0"><h2></h2><div class="hint"></div></div><button class="btn sm ghost" id="c-new" title="Nueva conversación"><svg><use href="#i-plus"/></svg><span>Nueva</span></button><button class="btn sm ghost" id="c-wide" title="' + (wide ? 'Reducir' : 'Ampliar a espacio de trabajo') + '"><svg><use href="#i-exp"/></svg></button><button class="x" aria-label="Cerrar chat" style="position:static">×</button></div>');
    head.prepend(avatarEl(a, 40)); head.querySelector('h2').textContent = a.name; head.querySelector('.hint').innerHTML = esc(a.role) + ' · ' + stChip(st);
    head.querySelector('.x').onclick = () => UI.close('chat');
    head.querySelector('#c-new').onclick = () => { const c = Chat.newConv(agentId, currentProject()); convId = c.id; render(); };
    head.querySelector('#c-wide').onclick = () => { wide = !wide; render(); };
    r.append(head);
    const wrap = h('<div class="chat-wrap"><div class="convs"></div><div class="chat-main"><div class="chat-bar"></div><div class="msgs" aria-live="polite"></div><div class="composer"></div></div><div class="side"></div></div>');
    r.append(wrap);
  }
  function currentProject() { const c = convId && Store.get('convs', convId); return c ? c.projectId : null; }
  function bar() {
    const b = $('.chat-bar', root()); b.innerHTML = '';
    const convs = Chat.convsFor(agentId);
    const sc = h('<select aria-label="Conversación"></select>');
    for (const c of convs) { const o = h('<option></option>'); o.value = c.id; o.textContent = trunc(c.title, 40) + ' · ' + projName(c.projectId); if (c.id === convId) o.selected = true; sc.append(o); }
    sc.onchange = () => { convId = sc.value; render(); };
    const sp = h('<select aria-label="Proyecto de esta conversación"><option value="">Sin proyecto (general)</option></select>');
    for (const p of Store.all('projects').filter(p => p.status !== 'archivado')) { const o = h('<option></option>'); o.value = p.id; o.textContent = 'Proyecto: ' + p.name; sp.append(o); }
    sp.value = currentProject() || '';
    sp.onchange = async () => {
      const cv = Store.get('convs', convId);
      if (cv && cv.count) { const nc = Chat.newConv(agentId, sp.value || null); convId = nc.id; toast('Nueva conversación en ' + projName(sp.value) + ': los proyectos no comparten memoria.'); }
      else if (cv) { cv.projectId = sp.value || null; Store.put('convs', cv); }
      render();
    };
    b.append(sc, sp);
    if (agentId === 'daniel') b.append(h('<span class="hint" title="Daniel decide según lo que le pidas">Conversa · Ejecuta planes · Programa</span>'));
  }
  function sideList() {
    const s = $('.convs', root()); s.innerHTML = '<h4>Conversaciones con ' + esc(Roster.get(agentId).name) + '</h4>';
    const convs = Chat.convsFor(agentId); const byP = {};
    for (const c of convs) (byP[c.projectId || ''] = byP[c.projectId || ''] || []).push(c);
    for (const pid of Object.keys(byP)) {
      s.append(h('<h4>' + esc(pid ? projName(pid) : 'General') + '</h4>'));
      for (const c of byP[pid]) { const b = h('<button class="conv-item"><span></span><small></small></button>'); b.querySelector('span').textContent = c.title; b.querySelector('small').textContent = (c.last || 'Sin mensajes') + ' · ' + ago(c.updatedAt); if (c.id === convId) b.setAttribute('aria-current', 'true'); b.onclick = () => { convId = c.id; render(); }; s.append(b); }
    }
    const other = h('<h4>Otros agentes</h4>'); s.append(other);
    for (const a of Roster.enabled().filter(x => x.id !== agentId).slice(0, 30)) { const b = h('<button class="conv-item"><span></span></button>'); b.querySelector('span').textContent = a.name + ' · ' + a.role; b.onclick = () => open(a.id); s.append(b); }
  }
  function sideCtx() {
    const s = $('.side', root()); s.innerHTML = '';
    const pid = currentProject(), p = pid && Store.get('projects', pid);
    s.append(h('<div class="sec-h" style="margin-top:0">Contexto</div>'));
    const c = h('<div class="card"><b></b><div class="hint"></div></div>'); c.querySelector('b').textContent = p ? p.name : 'Sin proyecto'; c.querySelector('.hint').textContent = p ? trunc(p.description || 'Sin descripción', 160) : 'En las conversaciones generales el agente no ve datos de ningún proyecto.';
    s.append(c);
    const tasks = Store.all('tasks').filter(t => t.agentId === agentId || (agentId === 'daniel' && t.depth === 0)).filter(t => !pid || t.projectId === pid).sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
    s.append(h('<div class="sec-h">Tareas</div>'));
    if (!tasks.length) s.append(h('<div class="hint">Sin tareas por ahora.</div>'));
    for (const t of tasks) { const li = h('<div class="li"><div class="grow"><b></b><small></small></div></div>'); li.querySelector('b').textContent = t.title; li.querySelector('small').innerHTML = tChip(t.state) + ' ' + esc(agentName(t.agentId)); s.append(li); }
    const dl = Store.all('deliverables').filter(d => (agentId === 'daniel' || d.agentId === agentId) && (!pid || d.projectId === pid)).sort((a, b) => b.ts - a.ts).slice(0, 8);
    s.append(h('<div class="sec-h">Entregables</div>'));
    if (!dl.length) s.append(h('<div class="hint">Todavía no hay entregables.</div>'));
    for (const d of dl) { const b = h('<button class="conv-item"><span></span><small></small></button>'); b.querySelector('span').textContent = d.title; b.querySelector('small').textContent = agentName(d.agentId) + ' · ' + fmtDT(d.ts); b.onclick = () => Panels.deliverable(d.id); s.append(b); }
  }
  async function msgs() {
    const box = $('.msgs', root()); if (!box) return;
    const list = await Chat.messages(convId);
    box.innerHTML = '';
    const a = Roster.get(agentId);
    if (!list.length) {
      const e = h('<div class="empty"><b></b><span></span></div>'); e.querySelector('b').textContent = 'Habla con ' + a.name;
      e.querySelector('span').textContent = agentId === 'daniel' ? 'Pregúntale, pídele una estrategia o encárgale un trabajo: él decide si conversar, crear un plan para el equipo o programarlo.' : a.specialty;
      box.append(e);
    }
    for (const m of list) box.append(msgEl(m));
    const live = Chat.isStreaming(convId);
    box.scrollTop = box.scrollHeight;
    composerState(live);
  }
  function msgEl(m) {
    const el = h('<div class="msg ' + (['user', 'assistant', 'system'].includes(m.role) ? m.role : 'system') + '"><div class="bub md"></div><div class="meta"></div></div>'); el.dataset.id = m.id;
    fillMsg(el, m); return el;
  }
  function fillMsg(el, m) {
    if (m.status === 'streaming' && !Chat.isStreaming(convId)) m = Object.assign({}, m, { status: 'stopped', error: m.error || 'La respuesta se interrumpió (La Cueva se cerró o recargó).' });
    const bub = el.querySelector('.bub');
    if (m.status === 'streaming' && !m.text) bub.innerHTML = '<span class="typing"><i></i><i></i><i></i> ' + esc(agentName(m.agentId)) + ' está pensando…</span>';
    else bub.innerHTML = m.role === 'user' ? esc(m.text || '').replace(/\n/g, '<br>') : md(m.text);
    $$('.tools,.atts,.plan,.err,.plan-link', el).forEach(x => x.remove());
    if (m.att && m.att.length) { const at = h('<div class="atts"></div>'); for (const x of m.att) { const c = h('<button class="att" type="button"></button>'); if (x.kind === 'image' && (x.local || x.url)) c.append(h('<img alt="">')), c.querySelector('img').src = x.local || x.url; c.append(h('<span></span>')); c.querySelector('span').textContent = x.name + (x.unsaved ? ' (no guardado)' : ''); c.onclick = () => Panels.preview(x); at.append(c); } el.insertBefore(at, el.querySelector('.meta')); }
    if (m.tools && m.tools.length) {
      const t = h('<details class="tools"><summary></summary></details>'); t.querySelector('summary').textContent = 'Herramientas usadas (' + m.tools.length + ')';
      for (const e of m.tools) { const ti = h('<div class="ti"><b></b><br><code></code><br><code></code></div>'); ti.querySelector('b').textContent = e.label; const cs = ti.querySelectorAll('code'); cs[0].textContent = '→ ' + e.input; cs[1].textContent = '← ' + e.result; t.append(ti); }
      el.insertBefore(t, el.querySelector('.meta'));
    }
    if (m.meta && m.meta.kind === 'consolidacion' && m.meta.deliverableId) { const vb = h('<div class="toolbar plan-link"><button class="btn sm sec" type="button">Abrir el informe como entregable</button></div>'); vb.firstElementChild.onclick = () => Panels.deliverable(m.meta.deliverableId); el.insertBefore(vb, el.querySelector('.meta')); }
    else if (m.meta && m.meta.planId) el.insertBefore(planCard(m.meta.planId), el.querySelector('.meta'));
    if (m.status === 'error' || m.status === 'stopped') { const er = h('<div class="note warn err"></div>'); er.textContent = m.error || 'No se completó la respuesta.'; el.insertBefore(er, el.querySelector('.meta')); }
    const meta = el.querySelector('.meta');
    meta.textContent = (m.role === 'assistant' ? agentName(m.agentId) + ' · ' : m.role === 'system' ? (m.from ? 'Mensaje de ' + agentName(m.from) + ' · ' : 'Aviso de La Cueva · ') : '') + fmtTime(m.ts) + (m.status === 'truncated' ? ' · respuesta cortada por longitud' : '');
    if (m.role === 'assistant' && m.text && m.status !== 'streaming') { const cp = h('<button class="btn sm ghost" type="button">Copiar</button>'); cp.onclick = () => copyText(m.text); meta.append(cp); }
  }
  /* tarjeta viva de un plan */
  function planCard(pid) {
    const plan = Store.get('plans', pid); const el = h('<div class="plan"></div>'); el.dataset.plan = pid;
    if (!plan) { el.innerHTML = '<header><b>Plan no encontrado</b></header>'; return el; }
    const tasks = Orch.planTasks(pid).sort((a, b) => a.createdAt - b.createdAt);
    const top = tasks.filter(t => !t.parentId);
    el.innerHTML = '<header><b></b>' + pChip(plan.state) + '<span class="hint">' + tasks.filter(t => t.state === 'completada').length + '/' + tasks.length + ' tareas · ' + Number(plan.calls) + '/' + Number(plan.maxCalls) + ' llamadas · ' + esc(projName(plan.projectId)) + '</span></header>';
    el.querySelector('header b').textContent = plan.title;
    const addRow = (t, child) => {
      const r = h('<div class="tk' + (child ? ' child' : '') + '"><div class="t"><span></span><small></small></div></div>');
      const a = Roster.get(t.agentId); if (a) r.prepend(avatarEl(a, 26));
      r.querySelector('span').textContent = t.title; r.querySelector('small').innerHTML = esc(agentName(t.agentId)) + (t.kind === 'collab' ? ' · colaboración pedida por ' + esc(agentName(t.requestedBy)) : '') + (t.error ? ' · ' + esc(trunc(t.error, 90)) : '');
      r.insertAdjacentHTML('beforeend', tChip(t.state));
      if (t.resultId) { const b = h('<button class="btn sm sec">Ver</button>'); b.onclick = () => Panels.deliverable(t.resultId); r.append(b); }
      if (['fallida', 'bloqueada', 'pausada', 'interrumpida'].includes(t.state) && !['cancelado', 'completado'].includes(plan.state)) { const b = h('<button class="btn sm sec">Reintentar</button>'); b.onclick = () => Panels.retry(t.id); r.append(b); }
      el.append(r);
      for (const c of tasks.filter(x => x.parentId === t.id)) addRow(c, true);
    };
    for (const t of top) addRow(t, false);
    const f = h('<footer></footer>');
    const B = (txt, fn, cls) => { const b = h('<button class="btn sm ' + (cls || '') + '"></button>'); b.textContent = txt; b.onclick = fn; f.append(b); };
    if (plan.state === 'pendiente_aprobacion') { B('Aprobar y ejecutar', () => Orch.approvePlan(pid)); B('Descartar', () => Orch.cancelPlan(pid), 'sec'); f.append(h('<span class="hint">Cada tarea ' + (LC_SERVER ? 'se factura en tu cuenta del proveedor de IA' : 'consume tu uso de Claude') + ' (' + tasks.length + ' tareas, hasta ' + plan.maxCalls + ' llamadas).</span>')); }
    if (plan.state === 'en_curso') { B('Pausar', () => Orch.pausePlan(pid), 'sec'); B('Cancelar', () => Orch.cancelPlan(pid), 'ghost'); f.append(h('<span class="hint">' + (LC_SERVER ? 'Lo ejecuta el servidor: puedes cerrar La Cueva.' : 'Avanza mientras La Cueva esté abierta.') + '</span>')); }
    if (plan.state === 'pausado' || plan.state === 'requiere_atencion') { B('Reanudar', () => Orch.resumePlan(pid)); if (tasks.some(t => t.state === 'completada')) B('Consolidar con lo hecho', () => Orch.consolidate(pid), 'sec'); B('Cancelar', () => Orch.cancelPlan(pid), 'ghost'); }
    if (plan.state === 'en_revision') { if (plan.consolidatedId) B('Ver informe', () => Panels.deliverable(plan.consolidatedId), 'sec'); B('Aprobar entrega', () => Orch.finishReview(pid, true)); f.append(h('<span class="hint">¿Cambios? Díselos a Daniel aquí mismo.</span>')); }
    if (plan.state === 'completado' && plan.consolidatedId) B('Ver informe', () => Panels.deliverable(plan.consolidatedId), 'sec');
    if (f.children.length) el.append(f);
    return el;
  }
  function refreshPlans() { $$('.plan[data-plan]', root()).forEach(p => p.replaceWith(planCard(p.dataset.plan))); }
  function composer() {
    const c = $('.composer', root()); c.innerHTML = '';
    const a = Roster.get(agentId);
    const sug = SUG[agentId] || SUG[a.dept] || [];
    const cv = Store.get('convs', convId);
    if (sug.length && (!cv || !cv.count)) { const s = h('<div class="sugg"></div>'); for (const t of sug) { const b = h('<button type="button"></button>'); b.textContent = t; b.onclick = () => { $('textarea', c).value = t; $('textarea', c).focus(); }; s.append(b); } c.append(s); }
    const prev = h('<div class="atts" id="c-atts"></div>'); c.append(prev); renderAtts();
    const row = h('<div class="row"><button class="btn sec" id="c-att" title="Adjuntar imágenes o documentos" aria-label="Adjuntar"><svg><use href="#i-clip"/></svg></button><textarea id="c-in" rows="1" placeholder="Escribe a ' + esc(a.name) + '…" aria-label="Mensaje"></textarea><button class="btn" id="c-send" aria-label="Enviar"><svg><use href="#i-send"/></svg></button></div>');
    const file = h('<input type="file" id="c-file" multiple hidden accept="image/*,.txt,.md,.csv,.json,.html,.css,.js,.py,.liquid,.xml,.yml,.yaml,.pdf,.doc,.docx">');
    c.append(row, file);
    c.append(h('<div class="hint">Intro para enviar · Mayús+Intro para salto de línea' + (AI.status !== 'ok' ? ' · <b>IA no disponible en esta vista</b>' : '') + '</div>'));
    const ta = $('#c-in', c);
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(200, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    ta.addEventListener('paste', async e => { const fs = [...(e.clipboardData && e.clipboardData.files || [])]; if (fs.length) { e.preventDefault(); await addFiles(fs); } });
    $('#c-att', c).onclick = () => file.click();
    file.onchange = async () => { await addFiles([...file.files]); file.value = ''; };
    $('#c-send', c).onclick = () => Chat.isStreaming(convId) ? Chat.stop(convId) : send();
    c.addEventListener('dragover', e => e.preventDefault());
    c.addEventListener('drop', async e => { e.preventDefault(); await addFiles([...(e.dataTransfer.files || [])]); });
  }
  async function addFiles(fs) { if (!fs.length) return; toast('Preparando ' + fs.length + ' adjunto(s)…'); const prepared = await Files.prepare(fs.slice(0, 6)); atts.push(...prepared); renderAtts(); }
  function renderAtts() {
    const p = $('#c-atts', root()); if (!p) return; p.innerHTML = '';
    atts.forEach((x, i) => { const c = h('<span class="att"></span>'); if (x.kind === 'image') { c.append(h('<img alt="">')); c.querySelector('img').src = x.local; } c.append(h('<span></span>')); c.querySelector('span').textContent = x.name; const rm = h('<button class="btn sm ghost" aria-label="Quitar adjunto">×</button>'); rm.onclick = () => { atts.splice(i, 1); renderAtts(); }; c.append(rm); p.append(c); });
  }
  function composerState(live) { const b = $('#c-send', root()); if (!b) return; b.innerHTML = live ? '<svg><use href="#i-stop"/></svg>' : '<svg><use href="#i-send"/></svg>'; b.setAttribute('aria-label', live ? 'Detener' : 'Enviar'); b.classList.toggle('danger', live); }
  async function send() {
    const ta = $('#c-in', root()); const text = ta.value.trim();
    if (!text && !atts.length) return;
    if (AI.status !== 'ok') { toast(AI.copy('no_ai'), true); return; }
    const files = atts; atts = []; ta.value = ''; ta.style.height = 'auto'; renderAtts();
    const p = Chat.send(convId, text, files);
    composerState(true);
    await p;
    composerState(false);
  }
  function render() {
    if (!agentId) return;
    if (!convId || !Store.get('convs', convId) || Store.get('convs', convId).agentId !== agentId) convId = Chat.ensureConv(agentId, null).id;
    shell(); bar(); composer(); msgs(); if (wide) { sideList(); sideCtx(); }
  }
  function open(id, opts) {
    if ($('#modal').classList.contains('open')) Panels.close();
    agentId = id; convId = (opts && opts.convId) || (Chat.convsFor(id)[0] || {}).id || null; atts = [];
    render(); UI.open('chat');
    setTimeout(() => { const t = $('#c-in', root()); if (t && window.innerWidth > 760) t.focus(); }, 60);
  }
  // actualizaciones en vivo
  let streamT = 0;
  Bus.on('chat:stream', ({ convId: cid, msg }) => {
    if (cid !== convId) return; const now = performance.now(); if (now - streamT < 90 && msg.text) return; streamT = now;
    const el = $$('.msg', root()).find(x => x.dataset.id === msg.id); if (el) { fillMsg(el, msg); const box = $('.msgs', root()); if (box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight; }
  });
  Bus.on('chat:msg', ({ convId: cid, msg }) => {
    if (cid !== convId || !root().classList.contains('open')) return;
    const box = $('.msgs', root()); if (!box) return;
    const ex = $$('.msg', root()).find(x => x.dataset.id === msg.id);
    if (ex) fillMsg(ex, msg); else { const e = box.querySelector('.empty'); if (e) e.remove(); box.append(msgEl(msg)); }
    box.scrollTop = box.scrollHeight; composerState(Chat.isStreaming(convId));
    const s = $('.sugg', root()); if (s && msg.role === 'user') s.remove();
    if (msg.role === 'user') { const cv = Store.get('convs', convId); if (cv && cv.count <= 2) setTimeout(bar, 50); }
  });
  // mensajes que llegan desde el servidor (p. ej. el informe de Daniel) con el chat abierto
  let rr = 0;
  Bus.on('store:remote', ({ c, id }) => {
    if (!convId || !root().classList.contains('open') || Chat.isStreaming(convId)) return;
    if ((c === 'chunks' && id.startsWith(convId + '-')) || (c === 'convs' && id === convId)) { clearTimeout(rr); rr = setTimeout(msgs, 200); }
  });
  let rp = 0; const plansLater = () => { clearTimeout(rp); rp = setTimeout(() => { if (root().classList.contains('open')) { refreshPlans(); if (wide) sideCtx(); } }, 150); };
  Bus.on('store:tasks', plansLater); Bus.on('store:plans', plansLater);
  return { open, render, planCard, get agentId() { return agentId; }, get convId() { return convId; } };
})();
