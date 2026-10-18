// Páginas de PDF como imágenes + Shopify (con una tienda simulada) en la versión con backend.
const { spawn } = require('child_process');
const http = require('http');
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
const PORT = 3221, SHOP_PORT = 3222, URL = 'http://localhost:' + PORT;
const DOCS = process.argv[2];
const NM = path.join(__dirname, '..', 'node_modules');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// --- Shopify simulado ---
const created = [];
const shop = http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (/\/admin\/oauth\/access_token$/.test(req.url)) { const p = new URLSearchParams(body); if (p.get('client_secret') !== 'secreto-ok') { res.statusCode = 400; return res.end(JSON.stringify({ error: 'invalid_client' })); } return res.end(JSON.stringify({ access_token: 'tok-1', scope: 'read_products,write_products', expires_in: 86399 })); }
    if (req.headers['x-shopify-access-token'] !== 'tok-1') { res.statusCode = 401; return res.end('{}'); }
    const q = JSON.parse(body);
    if (/productCreate/.test(q.query)) { created.push(q.variables.product); return res.end(JSON.stringify({ data: { productCreate: { product: { id: 'gid://shopify/Product/99', title: q.variables.product.title, status: 'DRAFT', handle: 'x' }, userErrors: [] } } })); }
    if (/shop \{/.test(q.query)) return res.end(JSON.stringify({ data: { shop: { name: 'Why Hats Test', email: 'x@y.z', myshopifyDomain: 'whyhats-test.myshopify.com', primaryDomain: { url: 'https://whyhats.test' }, currencyCode: 'EUR', plan: { displayName: 'Basic' } }, productsCount: { count: 12 } } }));
    if (/products\(/.test(q.query)) return res.end(JSON.stringify({ data: { products: { nodes: [{ id: 'gid://shopify/Product/1', title: 'Gorra Negra', handle: 'gorra', status: 'ACTIVE', vendor: 'Why Hats', productType: 'Gorra', tags: [], totalInventory: 5, onlineStoreUrl: null, updatedAt: '2026-10-01', priceRangeV2: { minVariantPrice: { amount: '35.0', currencyCode: 'EUR' }, maxVariantPrice: { amount: '35.0', currencyCode: 'EUR' } } }] } } }));
    res.end(JSON.stringify({ errors: [{ message: 'no simulado' }] }));
  });
}).listen(SHOP_PORT);
const env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_PASSWORD: 'clave-local-de-prueba', LC_ALLOW_MOCK: '1', AI_PROVIDER: 'mock', LC_SHOPIFY_TEST_BASE: 'http://localhost:' + SHOP_PORT + '/s/{shop}' });
delete env.DATABASE_URL; delete env.POSTGRES_URL;
(async () => {
  const srv = spawn('node', ['server/dev.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
  for (let i = 0; i < 50 && !/La Cueva en/.test(out); i++) await sleep(200);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/(pdf\.js|mammoth)\//, r => { const u = r.request().url(); const f = /pdf\.worker\.min\.js$/.test(u) ? 'pdfjs-dist/build/pdf.worker.min.js' : /pdf\.min\.js$/.test(u) ? 'pdfjs-dist/build/pdf.min.js' : 'mammoth/mammoth.browser.min.js'; r.fulfill({ body: fs.readFileSync(path.join(NM, f)), contentType: 'text/javascript' }); });
  const errs = []; p.on('pageerror', e => { errs.push(e.message); console.log('PAGEERR', e.message); });
  const fails = []; const step = async (n, fn) => { try { await fn(); console.log('OK', n); } catch (e) { fails.push(n); console.log('FAIL', n, e.message); } };
  await p.goto(URL); await p.waitForSelector('#lc-gate input');
  await p.fill('#lc-gate input', 'clave-local-de-prueba'); await p.click('#lc-gate button');
  await p.waitForFunction(() => !document.querySelector('#lc-gate') && window.__lc, null, { timeout: 15000 });
  const pid = await p.evaluate(() => Projects.create({ name: 'Why Hats' }).id);
  await p.evaluate(id => { const cv = __lc.Chat.ensureConv('daniel', id); ChatUI.open('daniel', { convId: cv.id }); }, pid);
  await p.waitForTimeout(400);
  await step('PDF: páginas guardadas como imagen', async () => {
    await p.setInputFiles('#c-file', [path.join(DOCS, 'plan_texto.pdf')]);
    await p.waitForFunction(() => document.querySelectorAll('#c-atts .att').length === 1, null, { timeout: 30000 });
    await p.fill('#c-in', 'Aquí va el plan'); await p.keyboard.press('Enter');
    await p.waitForFunction(id => __lc.Store.all('pdocs').some(d => d.projectId === id && d.pages === 2), pid, { timeout: 15000 });
  });
  await step('el agente ve las páginas con ver_paginas_documento', async () => {
    await p.waitForFunction(() => !__lc.Chat.isStreaming(ChatUI.convId), null, { timeout: 10000 });
    await p.fill('#c-in', 'PAGINASPRUEBA enséñame las páginas'); await p.keyboard.press('Enter');
    await p.waitForFunction(() => /he visto 2 imágenes/.test(document.querySelector('.msgs').textContent), null, { timeout: 15000 });
  });
  await step('Shopify: credenciales incorrectas se rechazan', async () => {
    await p.evaluate(id => Panels.open('projects', id), pid); await p.click('.tab:has-text("Integraciones")'); await p.waitForTimeout(300);
    await p.fill('input[name=shop]', 'whyhats-test.myshopify.com'); await p.fill('input[name=cid]', 'cid'); await p.fill('input[name=cs]', 'malo');
    await p.click('button:has-text("Conectar y probar")');
    await p.waitForFunction(() => /rechazado/.test(document.querySelector('#toasts').textContent), null, { timeout: 10000 });
  });
  await step('Shopify: conectar', async () => {
    await p.fill('input[name=cs]', 'secreto-ok'); await p.click('button:has-text("Conectar y probar")');
    await p.waitForFunction(() => /Why Hats Test/.test(document.querySelector('.pbody').textContent), null, { timeout: 10000 });
    await p.screenshot({ path: path.join(__dirname, 'i1_shopify.png') });
  });
  await step('el navegador nunca recibe la credencial', async () => {
    const leaked = await p.evaluate(() => JSON.stringify(__lc.Store.all('projects')).includes('secreto-ok') || JSON.stringify(window.__mockStore || {}).includes('secreto-ok'));
    const list = await p.evaluate(id => window.LCIntegrations.list(id), pid);
    if (leaked || JSON.stringify(list).includes('secreto-ok') || JSON.stringify(list).includes('tok-1')) throw new Error('fuga');
  });
  await step('consulta de lectura', async () => { const r = await p.evaluate(id => window.LCIntegrations.read(id, 'buscar_productos', { consulta: 'gorra' }), pid); if (r[0].titulo !== 'Gorra Negra') throw new Error(JSON.stringify(r)); });
  await step('otro proyecto no puede usar esa tienda', async () => { const ok = await p.evaluate(async () => { const o = Projects.create({ name: 'Otro cliente' }); try { await window.LCIntegrations.read(o.id, 'estado_tienda', {}); return false; } catch (e) { return /no tiene Shopify/.test(e.message); } }); if (!ok) throw new Error('aislamiento'); });
  await step('propuesta de cambio no toca la tienda hasta aprobar', async () => {
    await p.evaluate(() => Panels.close());
    await p.evaluate(id => { const cv = __lc.Chat.ensureConv('daniel', id); ChatUI.open('daniel', { convId: cv.id }); }, pid); await p.waitForTimeout(300);
    await p.fill('#c-in', 'SHOPIFYPRUEBA crea la gorra'); await p.keyboard.press('Enter');
    await p.waitForFunction(() => __lc.Store.all('approvals').some(a => a.kind === 'integracion' && a.state === 'pendiente'), null, { timeout: 15000 });
    if (created.length) throw new Error('se ejecutó sin aprobar');
  });
  await step('ejecutar sin aprobar es imposible', async () => { const id = await p.evaluate(() => __lc.Store.all('approvals').find(a => a.kind === 'integracion').id); const r = await p.evaluate(async x => { await __lc.Store.flush(); try { await window.LCIntegrations.execute(x); return 'ejecutado'; } catch (e) { return e.message; } }, id); if (!/no está aprobada/.test(r) || created.length) throw new Error(r); });
  await step('aprobar ejecuta una vez en Shopify', async () => {
    await p.evaluate(() => Panels.open('approvals')); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(__dirname, 'i2_approval.png') });
    await p.click('.card .btn:has-text("Aprobar")');
    await p.waitForFunction(() => __lc.Store.all('approvals').some(a => a.execState === 'hecha'), null, { timeout: 15000 });
    const id = await p.evaluate(() => __lc.Store.all('approvals').find(a => a.kind === 'integracion').id);
    await p.evaluate(x => window.LCIntegrations.execute(x), id);  // segundo intento: no repite
    if (created.length !== 1 || created[0].status !== 'DRAFT' || created[0].title !== 'Gorra de prueba') throw new Error(JSON.stringify(created));
  });
  console.log('page errors:', errs.length, '· fails:', fails.length);
  await b.close(); srv.kill(); shop.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
