// Gmail por proyecto contra un Google simulado (sin red): OAuth con estado firmado,
// borradores (nunca envíos), token cifrado que no sale del servidor y aislamiento.
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.ADMIN_PASSWORD = 'local-regression-password-123';
process.env.LC_ALLOW_MOCK = '1';
process.env.GOOGLE_CLIENT_ID = 'cid.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
const calls = []; let revoked = 0;
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    res.setHeader('content-type', 'application/json'); calls.push({ m: req.method, u: req.url, body });
    const send = (st, o) => { res.statusCode = st; res.end(JSON.stringify(o)); };
    if (req.url === '/token') {
      const p = new URLSearchParams(body);
      if (p.get('client_secret') !== 'gsecret') return send(401, { error: 'invalid_client' });
      if (p.get('grant_type') === 'authorization_code') return p.get('code') === 'buen-codigo' ? send(200, { access_token: 'at-1', refresh_token: 'rt-SECRETO-1', expires_in: 3600, scope: 'https://www.googleapis.com/auth/gmail.compose openid email' }) : send(400, { error: 'invalid_grant' });
      if (p.get('grant_type') === 'refresh_token') return send(200, { access_token: 'at-2', expires_in: 3600 });
    }
    if (req.url.startsWith('/revoke')) { revoked++; return send(200, {}); }
    if (!/^Bearer at-/.test(req.headers.authorization || '')) return send(401, {});
    if (req.url === '/gmail/v1/users/me/profile') return send(200, { emailAddress: 'dani@example.com', messagesTotal: 10 });
    if (req.url === '/gmail/v1/users/me/drafts' && req.method === 'POST') return send(200, { id: 'r-123', message: { id: 'm1' } });
    if (/messages\/send|drafts\/send/.test(req.url)) return send(500, { error: { message: 'NO DEBERÍA ENVIAR' } });
    send(404, {});
  });
}).listen(0);
await new Promise(r => srv.on('listening', r));
process.env.LC_GOOGLE_TEST_BASE = 'http://localhost:' + srv.address().port;
const { usePglite } = await import('../server/dev.js'); await usePglite();
const I = await import('../server/integrations.js');
const GG = await import('../server/google.js');
const { sessionCookie } = await import('../server/auth.js');
const oauth = (await import('../api/oauth.js')).default;
const { runOps } = await import('../server/docs.js');
const T = ops => runOps(ops, { allowLease: true });
await I.ensureSchema();
await T([{ op: 'write', c: 'projects', id: 'pr-m', ops: { set: { name: 'M' } } }, { op: 'write', c: 'projects', id: 'pr-otro', ops: { set: { name: 'Otro' } } }]);
let n = 0; const ok = m => { n++; console.log('✓', m); };
function call(url, cookie) {
  return new Promise(resolve => {
    const req = { method: 'GET', url, headers: { host: 'localhost:9', cookie: cookie || '' } };
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end() { resolve(this); }, get headersSent() { return false; } };
    oauth(req, res);
  });
}

// inicio: sin sesión no se puede; con sesión redirige a Google con solo el permiso de redactar
let r = await call('/api/oauth?start=1&project=pr-m');
assert.match(r.headers.location, /integ=gmail-error/);
const cookie = sessionCookie({ headers: { host: 'localhost:9' } }).split(';')[0];
r = await call('/api/oauth?start=1&project=pr-m', cookie);
const go = new URL(r.headers.location);
assert.equal(go.searchParams.get('scope'), GG.SCOPES.join(' '));
assert.ok(!/gmail\.send|gmail\.readonly|mail\.google\.com/.test(go.searchParams.get('scope')), 'no pide enviar ni leer');
assert.equal(go.searchParams.get('redirect_uri'), 'http://localhost:9/api/oauth');
const state = go.searchParams.get('state');
ok('inicio del OAuth: exige sesión y solo pide el permiso de redactar');

// vuelta: estado manipulado o código malo → error; correcto → guarda cifrado
r = await call('/api/oauth?code=buen-codigo&state=' + encodeURIComponent(state.slice(0, -2) + 'xx'));
assert.match(r.headers.location, /gmail-error/);
r = await call('/api/oauth?code=malo&state=' + encodeURIComponent(state));
assert.match(r.headers.location, /gmail-error/);
r = await call('/api/oauth?code=buen-codigo&state=' + encodeURIComponent(state));
assert.match(r.headers.location, /integ=gmail-ok/); assert.match(r.headers.location, /dani%40example\.com/);
const proj = (await T([{ op: 'get', c: 'projects', id: 'pr-m' }]))[0].data;
assert.equal(proj.integrations.gmail.email, 'dani@example.com');
assert.ok(!JSON.stringify(proj).includes('rt-SECRETO') && !JSON.stringify(await I.list('pr-m')).includes('rt-SECRETO'), 'el token no sale del servidor');
ok('vuelta del OAuth: firma comprobada, acceso guardado cifrado y solo metadatos visibles');

// borradores
const d = await I.read('pr-m', 'crear_borrador', { para: ['Genís <genis@example.com>'], asunto: 'Propuesta de colaboración · Ñandú', cuerpo: 'Hola,\nTe escribo…' }, 'gmail');
assert.equal(d.borrador, 'r-123'); assert.match(d.aviso, /no se ha enviado/i);
const post = calls.filter(c => c.u === '/gmail/v1/users/me/drafts').pop();
const raw = Buffer.from(JSON.parse(post.body).message.raw, 'base64url').toString('utf8');
assert.match(raw, /^To: =\?UTF-8\?B\?\S+ <genis@example\.com>$/m); assert.match(raw, /Subject: =\?UTF-8\?B\?/);
assert.ok(!calls.some(c => /send/.test(c.u)), 'nunca envía');
await assert.rejects(() => I.read('pr-m', 'crear_borrador', { para: ['no-es-un-correo'], asunto: 'x', cuerpo: 'y' }, 'gmail'), /no válida/);
await assert.rejects(() => I.read('pr-m', 'enviar', {}, 'gmail'), /no disponible/);
await assert.rejects(() => I.read('pr-otro', 'crear_borrador', { asunto: 'x', cuerpo: 'y' }, 'gmail'), /no tiene Gmail/);
ok('borradores con acentos y destinatarios; no existe acción de enviar; otro proyecto no puede usarlo');

await I.disconnect('pr-m', 'gmail');
assert.equal(revoked, 1);
await assert.rejects(() => I.read('pr-m', 'estado_gmail', {}, 'gmail'), /no tiene Gmail/);
ok('desconectar retira el acceso en Google y borra la credencial');
srv.close();
console.log('\n' + n + ' pruebas de Gmail superadas');
process.exit(0);
