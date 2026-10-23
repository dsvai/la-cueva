/* ============================================================
   LA CUEVA · Gmail (borradores) por proyecto
   - Se conecta con OAuth de Google: Daniel inicia sesión en Google y concede solo
     el permiso de redactar (gmail.compose). La app de Google la crea él en su
     Google Cloud (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel).
   - Los agentes solo crean BORRADORES: nada se envía. Daniel los revisa y los envía
     él desde Gmail. Por eso crear un borrador no necesita aprobación.
   - El token de actualización se guarda cifrado por proyecto (lc_secrets) y nunca
     llega al navegador.
   ============================================================ */
import crypto from 'node:crypto';

export const SCOPES = ['https://www.googleapis.com/auth/gmail.compose', 'openid', 'email'];
const test = () => process.env.LC_ALLOW_MOCK === '1' && process.env.LC_GOOGLE_TEST_BASE;
const AUTH = () => test() ? test() + '/o/oauth2/v2/auth' : 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = () => test() ? test() + '/token' : 'https://oauth2.googleapis.com/token';
const GMAIL = () => test() ? test() + '/gmail/v1/users/me' : 'https://gmail.googleapis.com/gmail/v1/users/me';
const REVOKE = () => test() ? test() + '/revoke' : 'https://oauth2.googleapis.com/revoke';

export class GoogleError extends Error { constructor(code, message) { super(message); this.code = code; this.expose = true; } }
export function configured() { return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }

/* estado firmado del flujo OAuth: proyecto + caducidad (10 min). La cookie de sesión
   es SameSite=Strict y no viaja en la vuelta desde Google, así que la vuelta se valida
   con esta firma, que solo puede emitir quien tiene sesión de administrador. */
function key() { return crypto.createHmac('sha256', 'la-cueva/oauth-state/v1').update(process.env.ADMIN_PASSWORD || '').digest(); }
export function makeState(projectId) {
  const body = Buffer.from(JSON.stringify({ p: projectId, e: Date.now() + 600000, n: crypto.randomBytes(9).toString('base64url') })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', key()).update(body).digest('base64url');
}
export function readState(state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) throw new GoogleError('invalid', 'Enlace de conexión no válido.');
  const want = crypto.createHmac('sha256', key()).update(body).digest('base64url');
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) throw new GoogleError('invalid', 'Enlace de conexión no válido.');
  const o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!(o.e > Date.now())) throw new GoogleError('invalid', 'El enlace de conexión ha caducado; vuelve a pulsar «Conectar Gmail».');
  return o.p;
}
export function authUrl(redirectUri, projectId) {
  const q = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state: makeState(projectId) });
  return AUTH() + '?' + q.toString();
}
async function tokenCall(params) {
  const res = await fetch(TOKEN(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(Object.assign({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET }, params)).toString() });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (j.error === 'invalid_grant') throw new GoogleError('reconnect', 'Google ha retirado el acceso (caducado o revocado). Vuelve a conectar Gmail en Proyectos → Integraciones.');
    throw new GoogleError('google_auth', 'Google rechazó la conexión (' + String(j.error_description || j.error || res.status).slice(0, 120) + ').');
  }
  return j;
}
export async function exchange(code, redirectUri) {
  const j = await tokenCall({ code: String(code || ''), grant_type: 'authorization_code', redirect_uri: redirectUri });
  if (!j.refresh_token) throw new GoogleError('google_auth', 'Google no devolvió acceso permanente. Quita La Cueva de los accesos de tu cuenta de Google y vuelve a conectar.');
  if (!String(j.scope || '').includes('gmail.compose')) throw new GoogleError('google_scope', 'No se concedió el permiso de redactar en Gmail. Vuelve a conectar y marca la casilla de Gmail.');
  const cred = { refresh: j.refresh_token, access: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  const prof = await gmail(cred, 'GET', '/profile');
  cred.email = prof.emailAddress;
  return cred;
}
async function access(cred) {
  if (cred.access && cred.exp > Date.now() + 60000) return cred.access;
  const j = await tokenCall({ refresh_token: cred.refresh, grant_type: 'refresh_token' });
  cred.access = j.access_token; cred.exp = Date.now() + (Number(j.expires_in) || 3600) * 1000;
  return cred.access;
}
async function gmail(cred, method, path, body) {
  const res = await fetch(GMAIL() + path, { method, headers: { authorization: 'Bearer ' + await access(cred), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (res.ok) return j;
  if (res.status === 401) throw new GoogleError('reconnect', 'Gmail ha rechazado el acceso. Vuelve a conectar Gmail en Proyectos → Integraciones.');
  if (res.status === 403) throw new GoogleError('google_scope', 'Gmail no permite esta acción con los permisos concedidos.');
  if (res.status === 429) throw new GoogleError('rate_limited', 'Gmail pide esperar un momento.');
  throw new GoogleError('google_error', 'Error de Gmail (' + res.status + '): ' + String((j.error && j.error.message) || '').slice(0, 160));
}
export async function revoke(cred) { try { await fetch(REVOKE() + '?token=' + encodeURIComponent(cred.refresh), { method: 'POST' }); } catch (_) { /* sin red: se borra igualmente */ } }

/* ---------- borradores ---------- */
const EMAIL = /^[^\s<>@,;"]+@[^\s<>@,;"]+\.[^\s<>@,;"]+$/;
function addrList(v, field) {
  const arr = (Array.isArray(v) ? v : String(v || '').split(/[,;]/)).map(s => String(s).trim()).filter(Boolean);
  for (const a of arr) { const m = a.match(/<([^>]+)>$/); if (!EMAIL.test(m ? m[1] : a)) throw new GoogleError('invalid', 'Dirección de correo no válida en «' + field + '»: ' + a.slice(0, 80)); }
  if (arr.length > 50) throw new GoogleError('invalid', 'Demasiados destinatarios.');
  return arr;
}
const enc = s => /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
const encAddr = a => { const m = a.match(/^(.*?)\s*<([^>]+)>$/); return m && m[1] ? enc(m[1].replace(/^"|"$/g, '')) + ' <' + m[2] + '>' : a; };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function buildMime({ para, cc, cco, asunto, cuerpo, html }) {
  const to = addrList(para, 'para'), c = addrList(cc, 'cc'), b = addrList(cco, 'cco');
  const subject = String(asunto || '').replace(/[\r\n]+/g, ' ').slice(0, 300);
  if (!subject) throw new GoogleError('invalid', 'Falta el asunto.');
  const text = String(cuerpo || '').slice(0, 100000);
  const htmlBody = html ? String(html).slice(0, 200000) : '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' + esc(text).replace(/\n/g, '<br>') + '</div>';
  const boundary = 'lc_' + crypto.randomBytes(8).toString('hex');
  const head = [to.length && 'To: ' + to.map(encAddr).join(', '), c.length && 'Cc: ' + c.map(encAddr).join(', '), b.length && 'Bcc: ' + b.map(encAddr).join(', '), 'Subject: ' + enc(subject), 'MIME-Version: 1.0', 'Content-Type: multipart/alternative; boundary="' + boundary + '"'].filter(Boolean);
  const part = (type, s) => '--' + boundary + '\r\nContent-Type: ' + type + '; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from(s, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n') + '\r\n';
  const raw = head.join('\r\n') + '\r\n\r\n' + part('text/plain', text || htmlBody.replace(/<[^>]+>/g, ' ')) + part('text/html', htmlBody) + '--' + boundary + '--';
  return { raw: Buffer.from(raw, 'utf8').toString('base64url'), to, subject };
}
export async function createDraft(cred, p) {
  const m = buildMime(p);
  const d = await gmail(cred, 'POST', '/drafts', { message: { raw: m.raw } });
  return { borrador: d.id, para: m.to.join(', ') || '(sin destinatario)', asunto: m.subject, cuenta: cred.email, enlace: 'https://mail.google.com/mail/u/' + encodeURIComponent(cred.email || '0') + '/#drafts', aviso: 'Es un BORRADOR: no se ha enviado nada. Revísalo y envíalo desde Gmail.' };
}
export async function profile(cred) { const p = await gmail(cred, 'GET', '/profile'); return { cuenta: p.emailAddress, mensajes: p.messagesTotal }; }
