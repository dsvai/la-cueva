// Lectura de PDF (texto e imagen) y Word en la versión con backend, y guardado en documentos del proyecto.
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
const PORT = 3219, URL = 'http://localhost:' + PORT;
const DOCS = process.argv[2];
const NM = path.join(__dirname, '..', 'node_modules');
const env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_PASSWORD: 'clave-local-de-prueba', LC_ALLOW_MOCK: '1', AI_PROVIDER: 'mock' });
delete env.DATABASE_URL; delete env.POSTGRES_URL;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', ['server/dev.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
  for (let i = 0; i < 50 && !/La Cueva en/.test(out); i++) await sleep(200);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/(pdf\.js|mammoth)\//, r => {
    const u = r.request().url();
    const f = /pdf\.worker\.min\.js$/.test(u) ? 'pdfjs-dist/build/pdf.worker.min.js' : /pdf\.min\.js$/.test(u) ? 'pdfjs-dist/build/pdf.min.js' : 'mammoth/mammoth.browser.min.js';
    r.fulfill({ body: fs.readFileSync(path.join(NM, f)), contentType: 'text/javascript' });
  });
  const errs = []; p.on('pageerror', e => { errs.push(e.message); console.log('PAGEERR', e.message); });
  const fails = []; const step = async (n, fn) => { try { await fn(); console.log('OK', n); } catch (e) { fails.push(n); console.log('FAIL', n, e.message); } };
  await p.goto(URL); await p.waitForSelector('#lc-gate input');
  await p.fill('#lc-gate input', 'clave-local-de-prueba'); await p.click('#lc-gate button');
  await p.waitForFunction(() => !document.querySelector('#lc-gate') && window.__lc, null, { timeout: 15000 });
  const pid = await p.evaluate(() => Projects.create({ name: 'Gira de prueba' }).id);
  await p.evaluate(id => { const cv = __lc.Chat.ensureConv('daniel', id); ChatUI.open('daniel', { convId: cv.id }); }, pid);
  await p.waitForTimeout(400);
  await step('adjuntar PDF de texto, PDF de imagen y Word', async () => {
    await p.setInputFiles('#c-file', [path.join(DOCS, 'plan_texto.pdf'), path.join(DOCS, 'mediakit_imagen.pdf'), path.join(DOCS, 'briefing.docx')]);
    await p.waitForFunction(() => document.querySelectorAll('#c-atts .att').length === 3, null, { timeout: 30000 });
  });
  await step('enviar', async () => { await p.fill('#c-in', 'Te paso los documentos'); await p.keyboard.press('Enter'); await p.waitForTimeout(2500); });
  const r = await p.evaluate(async id => {
    const docs = __lc.Store.all('pdocs').filter(d => d.projectId === id);
    const texts = {}; for (const d of docs) texts[d.name] = ((await __lc.Store.load('ptext', d.id)) || {}).text || '';
    const cv = __lc.Chat.convsFor('daniel', id)[0]; const msgs = await __lc.Chat.messages(cv.id);
    const u = msgs.find(m => m.role === 'user');
    return { docs: docs.map(d => [d.name, d.method, d.size]), texts, att: u.att.map(a => [a.name, a.kind, a.method, (a.text || '').length, !!a.savedDoc]) };
  }, pid);
  console.log(JSON.stringify(r.docs), JSON.stringify(r.att));
  await step('PDF de texto leído con pdf.js', async () => { if (!/San Diego/.test(r.texts['plan_texto.pdf'] || '') || !/Página 2/.test(r.texts['plan_texto.pdf'])) throw new Error((r.texts['plan_texto.pdf'] || '').slice(0, 120)); });
  await step('PDF de imágenes transcrito por la IA', async () => { const d = r.docs.find(x => x[0] === 'mediakit_imagen.pdf'); if (!d || d[1] !== 'lectura con IA' || !(r.texts['mediakit_imagen.pdf'] || '').length) throw new Error(JSON.stringify(d)); });
  await step('Word leído con mammoth', async () => { if (!/3\.000 entradas/.test(r.texts['briefing.docx'] || '')) throw new Error(r.texts['briefing.docx']); });
  await step('los tres quedan en documentos del proyecto', async () => { if (r.docs.length !== 3 || !r.att.every(a => a[1] === 'text' && a[4])) throw new Error('docs ' + r.docs.length); });
  await step('documentos visibles en el panel del proyecto', async () => { await p.evaluate(id => Panels.open('projects', id), pid); await p.click('.tab:has-text("Documentos")'); await p.waitForTimeout(300); const t = await p.textContent('.pbody'); if (!/briefing\.docx/.test(t)) throw new Error('no aparece'); await p.screenshot({ path: path.join(__dirname, 'd1_docs.png') }); });
  console.log('page errors:', errs.length, '· fails:', fails.length);
  await b.close(); srv.kill();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
