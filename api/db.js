/* operaciones de documentos para el navegador del administrador */
import { wrap, json, readJson } from '../server/http.js';
import { isAuthed, csrfOk } from '../server/auth.js';
import { runOps } from '../server/docs.js';

export default wrap(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { code: 'method' });
  if (!isAuthed(req)) return json(res, 401, { code: 'not_granted', message: 'Sesión no válida.' });
  if (!csrfOk(req)) return json(res, 403, { code: 'forbidden' });
  const body = await readJson(req);
  // el navegador nunca toma el contrato del orquestador: eso lo hace el worker
  const results = await runOps(body && body.ops, { allowLease: false });
  return json(res, 200, { results });
});
