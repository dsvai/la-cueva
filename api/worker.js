/* ============================================================
   Worker en segundo plano
   - GET  desde el cron de Vercel (Authorization: Bearer CRON_SECRET), una vez por hora
   - POST desde el navegador (sesión) cuando hay trabajo nuevo, o desde sí mismo
     para encadenar la siguiente tanda mientras quede trabajo.
   Responde enseguida y trabaja con waitUntil hasta el límite de la función.
   ============================================================ */
import { waitUntil } from '@vercel/functions';
import { wrap, json, baseUrl } from '../server/http.js';
import { isAuthed, isInternal, csrfOk, workerToken } from '../server/auth.js';
import { dbConfigured, ensureSchema } from '../server/db.js';
import { hasBackgroundWork } from '../server/docs.js';
import { runWorker } from '../server/runtime.js';


function selfUrl(req) {
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) return 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return baseUrl(req);
}

async function job(req, depth) {
  const r = await runWorker({ log: e => console.error('[worker]', e && e.message) });
  console.log('[worker]', JSON.stringify(r));
  if (r.more && depth < 20) {
    const url = selfUrl(req) + '/api/worker?depth=' + (depth + 1);
    try { await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + workerToken(), 'x-lc': '1' } }); }
    catch (e) { console.error('[worker] no se pudo encadenar la siguiente tanda', e && e.message); }
  }
}

export default wrap(async (req, res) => {
  const internal = isInternal(req);
  const authed = internal || (isAuthed(req) && csrfOk(req) && req.method === 'POST');
  if (!authed) return json(res, 401, { code: 'not_granted' });
  if (!dbConfigured()) return json(res, 503, { code: 'setup', message: 'Falta la base de datos.' });
  await ensureSchema();
  if (!(await hasBackgroundWork())) return json(res, 200, { started: false, reason: 'Sin trabajo pendiente' });
  const depth = Math.max(0, parseInt(new URL(req.url, 'http://x').searchParams.get('depth') || '0', 10) || 0);
  waitUntil(job(req, depth));
  return json(res, 202, { started: true });
});
