/* un paso del modelo de IA, con la clave guardada en el servidor; respuesta en streaming NDJSON */
import { wrap, json, readJson } from '../server/http.js';
import { isAuthed, csrfOk } from '../server/auth.js';
import { step, validateRequest, LlmError } from '../server/llm.js';


export default wrap(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { code: 'method' });
  if (!isAuthed(req)) return json(res, 401, { code: 'session_expired' });
  if (!csrfOk(req)) return json(res, 403, { code: 'forbidden' });
  let body;
  try { body = validateRequest(await readJson(req)); } catch (e) { return json(res, 400, { code: e.code || 'invalid_request', message: e.message }); }
  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
  res.statusCode = 200;
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-accel-buffering', 'no');
  const send = o => { try { res.write(JSON.stringify(o) + '\n'); } catch (_) { /* cliente desconectado */ } };
  try {
    const r = await step(Object.assign({}, body, { signal: ctl.signal, onText: d => send({ t: 'text', d }) }));
    send({ t: 'done', r });
  } catch (e) {
    const code = e instanceof LlmError ? e.code : 'upstream_error';
    send({ t: 'error', code, message: e instanceof LlmError && code === 'invalid_request' ? e.message : undefined });
  }
  res.end();
});
