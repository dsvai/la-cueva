/* GET: estado de la sesión y de la configuración · POST: entrar · DELETE: salir */
import { wrap, json, readJson } from '../server/http.js';
import { isAuthed, passwordConfigured, tryLogin, sessionCookie, clearCookie, csrfOk } from '../server/auth.js';
import { dbConfigured, ensureSchema } from '../server/db.js';
import { provider } from '../server/llm.js';
import { configured as googleConfigured } from '../server/google.js';

export default wrap(async (req, res) => {
  const setup = { db: dbConfigured(), password: passwordConfigured(), ai: !!provider(), google: googleConfigured() };
  if (req.method === 'GET') { const authed = isAuthed(req); if (authed) setup.aiProvider = provider(); return json(res, 200, { authenticated: authed, setup }); }
  if (!csrfOk(req)) return json(res, 403, { code: 'forbidden', message: 'Petición no permitida.' });
  if (req.method === 'DELETE') return json(res, 200, { ok: true }, { 'set-cookie': clearCookie(req) });
  if (req.method !== 'POST') return json(res, 405, { code: 'method' });
  if (!setup.password || !setup.db) return json(res, 503, { code: 'setup', message: 'Falta configuración en el servidor.', setup });
  await ensureSchema();
  const body = await readJson(req, 10000);
  const r = await tryLogin(body && body.password);
  if (!r.ok) return json(res, r.locked ? 429 : 401, { code: r.locked ? 'locked' : 'bad_password', message: r.locked ? 'Demasiados intentos. Espera 15 minutos.' : 'Contraseña incorrecta.' });
  return json(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req) });
});
