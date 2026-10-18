/* estado del servidor (detalles solo con sesión; nunca devuelve valores de claves) */
import { wrap, json } from '../server/http.js';
import { isAuthed, passwordConfigured } from '../server/auth.js';
import { dbConfigured, ensureSchema, getMeta } from '../server/db.js';
import { info } from '../server/llm.js';

export default wrap(async (req, res) => {
  if (!isAuthed(req)) return json(res, 200, { ok: true });
  let db = false, dbError = null, worker = null;
  if (dbConfigured()) {
    try { await ensureSchema(); worker = await getMeta('worker_last'); db = true; } catch (e) { dbError = 'No se pudo conectar con la base de datos.'; }
  }
  json(res, 200, {
    ok: true, db, dbError, password: passwordConfigured(), ai: info(),
    cronSecret: !!process.env.CRON_SECRET, worker,
    env: process.env.VERCEL_ENV || 'local', region: process.env.VERCEL_REGION || null,
    tz: process.env.LC_TIMEZONE || 'Europe/Madrid'
  });
});
