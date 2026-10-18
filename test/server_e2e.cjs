// Prueba de extremo a extremo de la versión con backend: servidor local (PGlite + IA simulada) y Chromium.
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const path = require('path');
const PORT = 3217, URL = 'http://localhost:' + PORT;
const env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_PASSWORD: 'clave-local-de-prueba', LC_ALLOW_MOCK: '1', AI_PROVIDER: 'mock', CRON_SECRET: 'cron-local' });
delete env.DATABASE_URL; delete env.POSTGRES_URL;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', ['server/dev.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
  for (let i = 0; i < 50 && !/La Cueva en/.test(out); i++) await sleep(200);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const fails = []; let n = 0;
  const step = async (name, fn) => { try { await fn(); n++; console.log('OK', name); } catch (e) { fails.push(name); console.log('FAIL', name, e.message); } };
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => { errs.push(e.message); console.log('PAGEERR', e.message); });
  p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_TUNNEL|Failed to load resource: the server responded with a status of 401/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 200)); });
  await p.goto(URL);
  await step('pantalla de acceso', async () => { await p.waitForSelector('#lc-gate input[type=password]', { timeout: 8000 }); await p.screenshot({ path: path.join(__dirname, 's1_login.png') }); });
  await step('contraseña incorrecta', async () => { await p.fill('#lc-gate input', 'mala'); await p.click('#lc-gate button'); await p.waitForFunction(() => /incorrecta/.test(document.querySelector('.lg-err').textContent), null, { timeout: 5000 }); });
  await step('entrar', async () => { await p.fill('#lc-gate input', 'clave-local-de-prueba'); await p.click('#lc-gate button'); await p.waitForFunction(() => !document.querySelector('#lc-gate') && window.__lc, null, { timeout: 15000 }); });
  await step('API protegida sin sesión', async () => { const r = await (await b.newContext()).request.post(URL + '/api/db', { data: { ops: [{ op: 'query', c: 'tasks' }] }, headers: { 'x-lc': '1' } }); if (r.status() !== 401) throw new Error('estado ' + r.status()); });
  await step('CSRF: sin cabecera se rechaza', async () => { const r = await p.request.post(URL + '/api/db', { data: { ops: [] } }); if (r.status() !== 403) throw new Error('estado ' + r.status()); });
  await step('cron con secreto', async () => { const r = await (await b.newContext()).request.get(URL + '/api/worker?slot=3', { headers: { authorization: 'Bearer cron-local' } }); if (r.status() !== 200) throw new Error('estado ' + r.status()); });
  await step('cron sin secreto rechazado', async () => { const r = await (await b.newContext()).request.get(URL + '/api/worker'); if (r.status() !== 401) throw new Error('estado ' + r.status()); });
  await p.waitForTimeout(800);
  await step('modo servidor visible', async () => { const t = await p.textContent('#p-db span'); if (!/servidor/.test(t)) throw new Error(t); await p.screenshot({ path: path.join(__dirname, 's2_home.png') }); });
  await step('chat con Daniel', async () => { await p.click('#fab'); await p.waitForTimeout(300); await p.fill('#c-in', 'Hola Daniel'); await p.keyboard.press('Enter'); await p.waitForFunction(() => /simulada del servidor/.test(document.querySelector('.msgs').textContent), null, { timeout: 8000 }); });
  await step('plan', async () => { await p.fill('#c-in', 'PLANPRUEBA hazme una tienda'); await p.keyboard.press('Enter'); await p.waitForSelector('.plan footer .btn:has-text("Aprobar y ejecutar")', { timeout: 8000 }); });
  await step('aprobar y el servidor trabaja', async () => {
    await p.click('.plan footer .btn:has-text("Aprobar y ejecutar")');
    await p.waitForFunction(() => __lc.Store.all('plans').some(x => x.state === 'en_revision'), null, { timeout: 40000 });
    await p.waitForFunction(() => [...document.querySelectorAll('.msgs .msg')].some(m => /Hecho|simulada/.test(m.textContent)) && document.querySelectorAll('.msgs .msg').length >= 5, null, { timeout: 10000 });
    await p.screenshot({ path: path.join(__dirname, 's3_after.png') });
  });
  const st = await p.evaluate(() => ({ tasks: __lc.Store.all('tasks').map(t => t.agentId + ':' + t.state), plans: __lc.Store.all('plans').map(x => x.state), dl: __lc.Store.all('deliverables').length, running: __lc.Orch.running.size }));
  console.log(JSON.stringify(st));
  await step('el navegador no ejecutó tareas', async () => { if (st.running) throw new Error('running ' + st.running); });
  for (const pn of ['control', 'integrations', 'status']) await step('panel ' + pn, async () => { await p.evaluate(x => Panels.open(x), pn); await p.waitForTimeout(pn === 'status' ? 900 : 250); await p.screenshot({ path: path.join(__dirname, 's_p_' + pn + '.png') }); });
  await step('estado del servidor', async () => { const t = await p.textContent('#panel .pbody, .pbody'); if (!/Conectada/.test(t) || !/simulador/.test(t)) throw new Error(t.slice(0, 300)); });
  await step('panel settings', async () => { await p.evaluate(() => Panels.open('settings')); await p.waitForTimeout(250); await p.screenshot({ path: path.join(__dirname, 's_p_settings.png') }); });
  await step('persistencia tras recargar', async () => {
    await p.reload(); await p.waitForFunction(() => window.__lc && __lc.Store.all('plans').length >= 1, null, { timeout: 15000 });
    const k = await p.evaluate(() => __lc.Store.all('tasks').filter(t => t.state === 'completada').length); if (k !== 3) throw new Error('completadas ' + k);
  });
  await step('segundo dispositivo ve los mismos datos', async () => {
    const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p2 = await c2.newPage(); await p2.goto(URL); await p2.waitForSelector('#lc-gate input'); await p2.screenshot({ path: path.join(__dirname, 's4_login_mobile.png') });
    await p2.fill('#lc-gate input', 'clave-local-de-prueba'); await p2.click('#lc-gate button');
    await p2.waitForFunction(() => window.__lc && __lc.Store.all('deliverables').length >= 4, null, { timeout: 15000 });
    await p2.waitForTimeout(600); await p2.screenshot({ path: path.join(__dirname, 's5_mobile.png') });
    // cambio en el móvil → lo ve el escritorio
    await p2.evaluate(() => __lc.Store.put('projects', { id: 'pr-movil', name: 'Proyecto desde el móvil', status: 'activo', createdAt: Date.now() }));
    await p.waitForFunction(() => !!__lc.Store.get('projects', 'pr-movil'), null, { timeout: 12000 });
  });
  await step('cerrar sesión', async () => { await p.evaluate(() => window.LCServer.logout()); await p.waitForSelector('#lc-gate input', { timeout: 8000 }); });
  console.log('page errors:', errs.length, '·', n, 'OK ·', fails.length, 'FAIL');
  await b.close(); srv.kill();
  if (/Error/.test(out)) console.log('--- server log ---\n' + out.split('\n').filter(l => /rror/.test(l)).slice(0, 20).join('\n'));
  process.exit(fails.length || errs.length ? 1 : 0);
})();
