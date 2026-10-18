/* ============================================================
   LA CUEVA · acceso de un único administrador
   La contraseña vive solo en la variable de entorno ADMIN_PASSWORD de Vercel.
   La sesión es una cookie HttpOnly firmada con una clave derivada de ella
   (cambiar la contraseña cierra todas las sesiones).
   ============================================================ */
import crypto from 'node:crypto';
import { getMeta, setMeta } from './db.js';

const COOKIE = 'lc_session';
const DAYS = 30;

export function passwordConfigured() { return (process.env.ADMIN_PASSWORD || '').length >= 10; }

function key(purpose) {
  return crypto.createHmac('sha256', 'la-cueva/' + purpose + '/v1').update(process.env.ADMIN_PASSWORD || '').digest();
}
function sign(payload) { return crypto.createHmac('sha256', key('session')).update(payload).digest('base64url'); }
function safeEq(a, b) {
  const A = crypto.createHash('sha256').update(String(a)).digest(), B = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(A, B);
}

export function parseCookies(req) {
  const out = {}; const h = req.headers.cookie || '';
  for (const part of h.split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}

export function isAuthed(req) {
  if (!passwordConfigured()) return false;
  const v = parseCookies(req)[COOKIE]; if (!v) return false;
  const [ver, exp, sig] = v.split('.');
  if (ver !== 'v1' || !exp || !sig) return false;
  if (!(Number(exp) > Date.now())) return false;
  return safeEq(sign(ver + '.' + exp), sig);
}

function secureFlag(req) {
  const host = String(req.headers.host || '');
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) && !req.headers['x-forwarded-proto'] ? '' : '; Secure';
}
export function sessionCookie(req) {
  const exp = Date.now() + DAYS * 86400000;
  const payload = 'v1.' + exp;
  return COOKIE + '=' + payload + '.' + sign(payload) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + DAYS * 86400 + secureFlag(req);
}
export function clearCookie(req) { return COOKIE + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + secureFlag(req); }

/* intento de acceso con bloqueo tras 10 fallos (15 minutos) */
export async function tryLogin(password) {
  const st = (await getMeta('auth_failures')) || { n: 0, until: 0 };
  if (st.until > Date.now()) return { ok: false, locked: true, retryAt: st.until };
  const ok = passwordConfigured() && typeof password === 'string' && password.length <= 500 && safeEq(password, process.env.ADMIN_PASSWORD);
  if (ok) { if (st.n) await setMeta('auth_failures', { n: 0, until: 0 }); return { ok: true }; }
  const n = st.n + 1;
  await setMeta('auth_failures', { n: n >= 10 ? 0 : n, until: n >= 10 ? Date.now() + 15 * 60000 : 0 });
  await new Promise(r => setTimeout(r, 700));
  return { ok: false, locked: n >= 10 };
}

/* el navegador debe mandar esta cabecera en peticiones que cambian datos (defensa CSRF) */
export function csrfOk(req) { return req.method === 'GET' || req.headers['x-lc'] === '1'; }

/* llamadas internas: cron de Vercel (CRON_SECRET) y el worker que se relanza a sí mismo */
export function workerToken() { return crypto.createHmac('sha256', key('worker')).update('worker').digest('base64url'); }
export function isInternal(req) {
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer ')) return false;
  const t = h.slice(7);
  if (process.env.CRON_SECRET && safeEq(t, process.env.CRON_SECRET)) return 'cron';
  if (passwordConfigured() && safeEq(t, workerToken())) return 'self';
  return false;
}
