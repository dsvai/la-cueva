/* ============================================================
   LA CUEVA · arranque con backend (solo en la versión desplegada en Vercel)
   1. Comprueba la configuración del servidor y la sesión.
   2. Pide la contraseña si hace falta (la sesión es una cookie HttpOnly).
   3. Monta window.claude con la base de datos y la IA del servidor y carga la app.
   ============================================================ */
(function () {
  'use strict';
  window.LC_SERVER = true; window.LC_RUNTIME = 'browser';
  const EAGER = ['config', 'agents', 'projects', 'convs', 'plans', 'tasks', 'approvals', 'rules', 'notes', 'deliverables', 'schedules', 'pdocs', 'usage', 'activity'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let gate = null;
  function card(inner) {
    if (!gate) { gate = document.createElement('div'); gate.id = 'lc-gate'; document.body.append(gate); }
    gate.innerHTML = '<div class="lg-card"><img class="lg-logo" src="/logo.png" alt="La Cueva by Daniel">' + inner + '</div>';
    return gate.querySelector('.lg-card');
  }
  function closeGate() { if (gate) { gate.remove(); gate = null; } }
  async function getSession() {
    const r = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  function showError(msg) {
    const c = card('<h1>No se puede abrir La Cueva</h1><p>' + esc(msg) + '</p><button class="lg-btn" type="button">Reintentar</button>');
    c.querySelector('button').onclick = () => location.reload();
  }
  function showSetup(s) {
    const row = (ok, t, d) => '<li class="' + (ok ? 'ok' : 'no') + '"><b>' + (ok ? '✓ ' : '• ') + esc(t) + '</b><span>' + esc(d) + '</span></li>';
    card('<h1>Configuración pendiente</h1><p>El servidor de La Cueva está desplegado, pero le faltan estos ajustes en Vercel (Project → Settings → Environment Variables / Storage):</p><ul class="lg-list">' +
      row(s.db, 'Base de datos', s.db ? 'Conectada.' : 'Añade Neon Postgres desde la pestaña Storage del proyecto (crea DATABASE_URL).') +
      row(s.password, 'Contraseña de acceso', s.password ? 'Configurada.' : 'Crea la variable ADMIN_PASSWORD con al menos 10 caracteres.') +
      row(s.ai, 'IA de los agentes', s.ai ? 'Configurada.' : 'Crea ANTHROPIC_API_KEY u OPENAI_API_KEY (opcional para entrar, necesaria para que respondan).') +
      '</ul><p class="lg-hint">Después de añadir variables, vuelve a desplegar el proyecto (Deployments → Redeploy) y recarga esta página.</p><button class="lg-btn" type="button">Comprobar de nuevo</button>');
    gate.querySelector('button').onclick = () => location.reload();
  }
  function showLogin(note) {
    return new Promise(resolve => {
      const c = card('<h1>Entrar en La Cueva</h1>' + (note ? '<p>' + esc(note) + '</p>' : '') + '<form class="lg-form"><label>Contraseña<input type="password" name="pw" autocomplete="current-password" required></label><div class="lg-err" role="alert"></div><button class="lg-btn" type="submit">Entrar</button></form>');
      const f = c.querySelector('form'), err = c.querySelector('.lg-err'), inp = f.querySelector('input');
      setTimeout(() => inp.focus(), 50);
      f.onsubmit = async e => {
        e.preventDefault(); err.textContent = ''; const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Comprobando…';
        try {
          const r = await fetch('/api/session', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-lc': '1' }, body: JSON.stringify({ password: inp.value }) });
          const j = await r.json().catch(() => ({}));
          if (r.ok) { inp.value = ''; resolve(); return; }
          err.textContent = j.message || 'No se pudo entrar.';
        } catch (_) { err.textContent = 'Sin conexión con el servidor.'; }
        b.disabled = false; b.textContent = 'Entrar';
      };
    });
  }
  let lost = false;
  function sessionLost() {
    if (lost) return; lost = true;
    showLogin('Tu sesión ha caducado. Vuelve a entrar; los cambios sin guardar se reintentarán.').then(() => location.reload());
  }
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename || 'la-cueva.txt';
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      return { status: 'saved' };
    }
  };
  let kickT = 0, kickBusy = false;
  function kick() {
    clearTimeout(kickT);
    kickT = setTimeout(async () => {
      if (kickBusy) return; kickBusy = true;
      try { await fetch('/api/worker', { method: 'POST', credentials: 'same-origin', headers: { 'x-lc': '1' } }); } catch (_) { }
      kickBusy = false;
    }, 1200);
  }
  async function integ(body) {
    let r; try { r = await fetch('/api/integrations', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-lc': '1' }, body: JSON.stringify(body) }); }
    catch (_) { throw new Error('Sin conexión con el servidor.'); }
    if (r.status === 401) { sessionLost(); throw new Error('La sesión ha caducado.'); }
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.message || 'No se pudo completar la operación.');
    return j.result;
  }
  window.LCIntegrations = {
    read: (projectId, op, params, provider) => integ({ action: 'read', projectId, op, params, provider: provider || 'shopify' }),
    connect: (projectId, provider, data) => integ(Object.assign({}, data, { action: 'connect', projectId, provider })),
    disconnect: (projectId, provider) => integ({ action: 'disconnect', projectId, provider }),
    list: projectId => integ({ action: 'list', projectId }),
    execute: approvalId => integ({ action: 'execute', approvalId })
  };
  window.LCServer = {
    kick,
    async logout() { try { await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin', headers: { 'x-lc': '1' } }); } catch (_) { } location.reload(); },
    async health() { const r = await fetch('/api/health', { credentials: 'same-origin', cache: 'no-store' }); return r.json(); },
    syncError: null
  };
  function start(s) {
    const R = window.LCRemote;
    const db = R.makeRemoteDb(R.httpTransport('', sessionLost), { observer: true, full: EAGER, pollMs: () => (document.hidden ? 20000 : 4000), onSyncError: e => { window.LCServer.syncError = e; } });
    const dbReady = db.start().then(() => db, () => db);
    let sample = null;
    if (s.setup.ai) { sample = R.makeSample(R.httpStep('')); sample.provider = s.setup.aiProvider || ''; }
    window.claude = { use: async n => (n === 'db' ? dbReady : n === 'sample' ? sample : n === 'downloads' ? downloads : null) };
    const sc = document.createElement('script'); sc.src = '/app.js?v=' + encodeURIComponent(window.LC_BUILD || '');
    sc.onload = () => {
      closeGate();
      try { Bus.on('orch:kick', kick); } catch (_) { }   // eslint-disable-line no-undef
      kick();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) db.syncNow(); });
    };
    sc.onerror = () => showError('No se pudo cargar la aplicación.');
    document.body.append(sc);
  }
  (async () => {
    let s;
    try { s = await getSession(); } catch (_) { showError('No hay conexión con el servidor de La Cueva.'); return; }
    if (!s.setup.db || !s.setup.password) { showSetup(s.setup); return; }
    if (!s.authenticated) { await showLogin(); try { s = await getSession(); } catch (_) { showError('No hay conexión con el servidor.'); return; } }
    card('<h1>Abriendo La Cueva…</h1><p>Cargando proyectos, conversaciones y tareas.</p>');
    start(s);
  })();
})();
