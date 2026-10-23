/* OAuth de Google para conectar Gmail a un proyecto.
   GET ?start=1&project=ID → (con sesión de administrador) redirige a Google.
   GET ?code=…&state=…      → vuelta desde Google: guarda el acceso cifrado y vuelve a La Cueva. */
import { wrap, baseUrl } from '../server/http.js';
import { isAuthed } from '../server/auth.js';
import { ensureSchema } from '../server/db.js';
import * as GG from '../server/google.js';
import { saveGmail } from '../server/integrations.js';

function back(res, base, params) {
  res.statusCode = 302; res.setHeader('cache-control', 'no-store');
  res.setHeader('location', base + '/?' + new URLSearchParams(params).toString()); res.end();
}
export default wrap(async (req, res) => {
  const base = baseUrl(req), u = new URL(req.url, base || 'http://x'), redirect = base + '/api/oauth';
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
  if (!GG.configured()) return back(res, base, { integ: 'gmail-error', msg: 'Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel.' });
  if (u.searchParams.get('start')) {
    if (!isAuthed(req)) return back(res, base, { integ: 'gmail-error', msg: 'Entra en La Cueva antes de conectar Gmail.' });
    const pid = String(u.searchParams.get('project') || '');
    if (!/^[\w.~:@+-]{1,160}$/.test(pid)) return back(res, base, { integ: 'gmail-error', msg: 'Proyecto no válido.' });
    res.statusCode = 302; res.setHeader('cache-control', 'no-store'); res.setHeader('location', GG.authUrl(redirect, pid)); return res.end();
  }
  let pid = '';
  try {
    if (u.searchParams.get('error')) throw new GG.GoogleError('cancelled', u.searchParams.get('error') === 'access_denied' ? 'Has cancelado la conexión con Google.' : 'Google no completó la conexión.');
    pid = GG.readState(u.searchParams.get('state'));
    await ensureSchema();
    const cred = await GG.exchange(u.searchParams.get('code'), redirect);
    const meta = await saveGmail(pid, cred);
    return back(res, base, { integ: 'gmail-ok', project: pid, email: meta.email || '' });
  } catch (e) {
    return back(res, base, { integ: 'gmail-error', project: pid, msg: e && e.expose ? e.message : 'No se pudo conectar Gmail.' });
  }
});
