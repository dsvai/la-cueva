/* integraciones por proyecto: conectar, desconectar, consultar y ejecutar acciones aprobadas */
import { wrap, json, readJson } from '../server/http.js';
import { isAuthed, csrfOk } from '../server/auth.js';
import { ensureSchema, connect, disconnect, list, read, executeApproval, errorBody } from '../server/integrations.js';

export default wrap(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { code: 'method' });
  if (!isAuthed(req)) return json(res, 401, { code: 'not_granted' });
  if (!csrfOk(req)) return json(res, 403, { code: 'forbidden' });
  await ensureSchema();
  const b = await readJson(req, 200000);
  try {
    let out;
    if (b.action === 'list') out = await list(b.projectId);
    else if (b.action === 'connect') out = await connect(b.projectId, b.provider, b);
    else if (b.action === 'disconnect') out = await disconnect(b.projectId, b.provider);
    else if (b.action === 'read') out = await read(b.projectId, b.op, b.params);
    else if (b.action === 'execute') out = await executeApproval(b.approvalId);
    else return json(res, 400, { code: 'invalid', message: 'Acción desconocida.' });
    return json(res, 200, { ok: true, result: out });
  } catch (e) {
    return json(res, 200, Object.assign({ ok: false }, errorBody(e)));
  }
});
