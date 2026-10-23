// Integración con GitHub contra un GitHub simulado (sin red): conexión, lectura, aislamiento y escrituras solo aprobadas.
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.ADMIN_PASSWORD = 'local-regression-password-123';
process.env.LC_ALLOW_MOCK = '1';
const calls = []; const files = { 'README.md': 'Hola', 'src/app.js': 'console.log(1)' }; const refs = { main: 'sha-main' };
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    const j = body ? JSON.parse(body) : null; calls.push({ m: req.method, u: req.url, j });
    res.setHeader('content-type', 'application/json');
    const send = (st, o) => { res.statusCode = st; res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer github_pat_' + 'A'.repeat(30)) return send(401, { message: 'Bad credentials' });
    const u = new URL(req.url, 'http://x'); const p = u.pathname;
    if (p === '/repos/dani/why-hats-web') return send(200, { full_name: 'dani/why-hats-web', private: true, default_branch: 'main', permissions: { push: true }, html_url: 'https://github.com/dani/why-hats-web', open_issues_count: 2, description: 'Web', language: 'JavaScript', pushed_at: '2026-10-20' });
    if (p.endsWith('/commits')) return send(200, [{ sha: 'abcdef123', commit: { message: 'Inicio', author: { name: 'Dani', date: '2026-10-01' } } }]);
    if (p.endsWith('/contents/') || p.endsWith('/contents')) return send(200, Object.keys(files).map(f => ({ name: f, path: f, type: 'file', size: files[f].length })));
    const mc = p.match(/\/contents\/(.+)$/);
    if (mc && req.method === 'GET') { const f = decodeURIComponent(mc[1]); if (!(f in files)) return send(404, { message: 'Not Found' }); return send(200, { type: 'file', path: f, size: files[f].length, sha: 'sha-' + f, content: Buffer.from(files[f]).toString('base64') }); }
    if (mc && req.method === 'PUT') { if (j.branch === 'main') return send(422, { message: 'no permitido en main en esta prueba' }); files[decodeURIComponent(mc[1]) + '@' + j.branch] = Buffer.from(j.content, 'base64').toString(); return send(201, { content: {} }); }
    if (p.endsWith('/git/ref/heads/main')) return send(200, { object: { sha: refs.main } });
    if (p.endsWith('/git/refs') && req.method === 'POST') { const n = j.ref.replace('refs/heads/', ''); if (refs[n]) return send(422, { message: 'Reference already exists' }); refs[n] = j.sha; return send(201, {}); }
    if (p.endsWith('/pulls') && req.method === 'POST') return send(201, { number: 7, html_url: 'https://github.com/dani/why-hats-web/pull/7', draft: j.draft, head: j.head, base: j.base });
    if (p.endsWith('/issues') && req.method === 'POST') return send(201, { number: 12, title: j.title, html_url: 'https://github.com/dani/why-hats-web/issues/12' });
    if (p.endsWith('/issues')) return send(200, [{ number: 1, title: 'Bug', state: 'open', labels: [], user: { login: 'dani' }, created_at: '2026-10-01', body: 'x' }]);
    send(404, { message: 'Not Found' });
  });
}).listen(0);
await new Promise(r => srv.on('listening', r));
process.env.LC_GITHUB_TEST_BASE = 'http://localhost:' + srv.address().port;
const { usePglite } = await import('../server/dev.js'); await usePglite();
const I = await import('../server/integrations.js');
const { runOps } = await import('../server/docs.js');
const T = ops => runOps(ops, { allowLease: true });
await I.ensureSchema();
await T([{ op: 'write', c: 'projects', id: 'pr-wh', ops: { set: { name: 'Why Hats' } } }, { op: 'write', c: 'projects', id: 'pr-otro', ops: { set: { name: 'Otro' } } }]);
const TOKEN = 'github_pat_' + 'A'.repeat(30);
let n = 0; const ok = m => { n++; console.log('✓', m); };

await assert.rejects(() => I.connect('pr-wh', 'github', { repo: 'dani/why-hats-web', token: 'abc' }), /github_pat_/);
await assert.rejects(() => I.connect('pr-wh', 'github', { repo: 'dani/why-hats-web', token: 'github_pat_' + 'B'.repeat(30) }), /rechazado el token/);
const meta = await I.connect('pr-wh', 'github', { repo: 'https://github.com/dani/why-hats-web.git', token: TOKEN });
assert.equal(meta.repo, 'dani/why-hats-web'); assert.equal(meta.defaultBranch, 'main'); assert.equal(meta.canWrite, true);
const proj = (await T([{ op: 'get', c: 'projects', id: 'pr-wh' }]))[0].data;
assert.equal(proj.integrations.github.repo, 'dani/why-hats-web');
assert.ok(!JSON.stringify(proj).includes(TOKEN) && !JSON.stringify(await I.list('pr-wh')).includes(TOKEN), 'el token no sale del servidor');
ok('conexión: valida el token, comprueba el repositorio y nunca expone el token');

const st = await I.read('pr-wh', 'estado_repo', {}, 'github'); assert.equal(st.rama_principal, 'main');
const ls = await I.read('pr-wh', 'listar_archivos', {}, 'github'); assert.ok(ls.some(f => f.ruta === 'README.md'));
const rd = await I.read('pr-wh', 'leer_archivo', { ruta: 'src/app.js' }, 'github'); assert.equal(rd.contenido, 'console.log(1)');
await assert.rejects(() => I.read('pr-wh', 'leer_archivo', { ruta: '../secreto' }, 'github'), /no válida/);
await assert.rejects(() => I.read('pr-otro', 'estado_repo', {}, 'github'), /no tiene GitHub/);
ok('lectura de estado, archivos y contenido; rutas peligrosas rechazadas; otro proyecto no puede usarlo');

// propuesta de código: sin aprobar no se ejecuta; aprobada se ejecuta una vez, en rama nueva y con PR en borrador
const ap = { id: 'ap-gh1', kind: 'integracion', state: 'pendiente', projectId: 'pr-wh', payload: { provider: 'github', action: 'proponer_cambios_codigo', params: { rama: 'main', titulo_pr: 'Mejora README', descripcion_pr: 'Texto', archivos: [{ ruta: 'README.md', contenido: 'Hola mundo' }] } } };
await T([{ op: 'write', c: 'approvals', id: ap.id, ops: { set: ap } }]);
await assert.rejects(() => I.executeApproval('ap-gh1'), /no está aprobada/);
await T([{ op: 'write', c: 'approvals', id: ap.id, ops: { set: { state: 'aprobada' } } }]);
const r1 = await I.executeApproval('ap-gh1');
assert.equal(r1.state, 'hecha', r1.result); assert.match(r1.result, /borrador #7/);
const pr = calls.find(c => c.u.endsWith('/pulls') && c.m === 'POST'); assert.equal(pr.j.draft, true); assert.equal(pr.j.base, 'main'); assert.notEqual(pr.j.head, 'main');
assert.ok(!calls.some(c => c.m === 'PUT' && c.j.branch === 'main'), 'nunca escribe en la rama principal');
const before = calls.length; const r2 = await I.executeApproval('ap-gh1'); assert.equal(r2.state, 'hecha'); assert.equal(calls.length, before, 'no repite la ejecución');
ok('cambios de código: solo tras aprobar, una vez, en rama nueva y con pull request en borrador');

await T([{ op: 'write', c: 'approvals', id: 'ap-gh2', ops: { set: { kind: 'integracion', state: 'aprobada', projectId: 'pr-wh', payload: { provider: 'github', action: 'crear_issue', params: { titulo: 'Revisar velocidad', cuerpo: 'Detalle' } } } } }]);
const r3 = await I.executeApproval('ap-gh2'); assert.match(r3.result, /Issue creado: #12/);
await T([{ op: 'write', c: 'approvals', id: 'ap-gh3', ops: { set: { kind: 'integracion', state: 'aprobada', projectId: 'pr-wh', payload: { provider: 'github', action: 'proponer_cambios_codigo', params: { archivos: [{ ruta: '../../etc/x', contenido: 'x' }] } } } } }]);
const r4 = await I.executeApproval('ap-gh3'); assert.equal(r4.state, 'fallida');
ok('issues aprobados se crean; propuestas con rutas peligrosas fallan sin tocar el repositorio');

await I.disconnect('pr-wh', 'github');
await assert.rejects(() => I.read('pr-wh', 'estado_repo', {}, 'github'), /no tiene GitHub/);
ok('desconectar borra el acceso');
srv.close();
console.log('\n' + n + ' pruebas de GitHub superadas');
process.exit(0);
