/* utilidades HTTP comunes a las funciones de /api */
export async function readJson(req, maxBytes) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const limit = maxBytes || 4.4e6;
  const chunks = []; let n = 0;
  for await (const ch of req) { n += ch.length; if (n > limit) throw Object.assign(new Error('too_large'), { status: 413 }); chunks.push(ch); }
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

export function json(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(headers || {})) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function wrap(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      console.error('[api]', req.url, e && e.message);
      if (!res.headersSent) json(res, e && e.status === 413 ? 413 : 500, { code: e && e.status === 413 ? 'too_large' : 'server_error', message: e && e.status === 413 ? 'La petición es demasiado grande.' : 'Error interno del servidor.' });
      else try { res.end(); } catch (_) { /* ya cerrada */ }
    }
  };
}

export function baseUrl(req) {
  const host = req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host);
  if (host) return ((req.headers['x-forwarded-proto'] || (/^localhost|^127\./.test(host) ? 'http' : 'https')) + '://' + host).replace(/,.*$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return '';
}
