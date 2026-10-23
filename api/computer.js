/* ordenador en la nube de los agentes (Claude Managed Agents)
   POST { action: 'start' | 'wait' | 'status' | 'stop', … } · GET ?file=ID descarga un archivo de salida */
import { wrap, json, readJson } from '../server/http.js';
import { isAuthed, csrfOk } from '../server/auth.js';
import { ensureSchema } from '../server/db.js';
import * as PC from '../server/computer.js';

export default wrap(async (req, res) => {
  if (!isAuthed(req)) return json(res, 401, { code: 'not_granted' });
  if (req.method === 'GET') {
    const id = new URL(req.url, 'http://x').searchParams.get('file');
    try {
      const f = await PC.download(id);
      res.statusCode = 200;
      res.setHeader('content-type', f.type); res.setHeader('cache-control', 'private, no-store');
      res.setHeader('content-disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(f.name || 'archivo'));
      return res.end(f.body);
    } catch (e) { return json(res, 404, { code: 'not_found', message: e && e.expose ? e.message : 'No se pudo descargar el archivo.' }); }
  }
  if (req.method !== 'POST') return json(res, 405, { code: 'method' });
  if (!csrfOk(req)) return json(res, 403, { code: 'forbidden' });
  await ensureSchema();
  const b = await readJson(req, 6e6);
  try {
    let out;
    if (b.action === 'start') out = await PC.start(b);
    else if (b.action === 'wait') out = await PC.waitFor(b.sessionId, Math.min(Math.max(Number(b.maxMs) || 200000, 5000), 240000));
    else if (b.action === 'status') out = await PC.status(b.sessionId);
    else if (b.action === 'stop') out = await PC.stop(b.sessionId);
    else return json(res, 400, { code: 'invalid', message: 'Acción desconocida.' });
    return json(res, 200, { ok: true, result: out || {} });
  } catch (e) {
    if (!(e && e.expose)) console.error('[computer]', e && (e.status || ''), e && e.message);
    const msg = e && e.expose ? e.message : (e && e.status === 400 && /beta|not.*enabled|managed/i.test(String(e.message)) ? 'Tu cuenta de Anthropic API no tiene activado el ordenador en la nube (Managed Agents).' : 'No se pudo usar el ordenador en la nube' + (e && e.status ? ' (' + e.status + ')' : '') + '.');
    return json(res, 200, { ok: false, code: (e && e.code) || 'server_error', message: msg });
  }
});
