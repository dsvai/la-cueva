/* Servidor local de desarrollo: sirve public/ y las funciones de api/ como en Vercel.
   Sin DATABASE_URL usa PGlite (Postgres en memoria o en LC_PGLITE_DIR). Solo para pruebas. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setDb } from './db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = parseInt(process.env.PORT || '3210', 10);

export async function usePglite(dir) {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(dir || undefined);
  await pg.waitReady;
  setDb({
    query: (t, p) => pg.query(t, p || []),
    transaction: fn => pg.transaction(tx => fn((t, p) => tx.query(t, p || [])))
  });
  return pg;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json' };
const handlers = {};
async function handler(name) {
  if (!handlers[name]) handlers[name] = (await import(pathToFileURL(path.join(root, 'api', name + '.js')).href)).default;
  return handlers[name];
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const m = u.pathname.match(/^\/api\/([\w-]+)$/);
    if (m) {
      if (!fs.existsSync(path.join(root, 'api', m[1] + '.js'))) { res.statusCode = 404; return res.end(); }
      return (await handler(m[1]))(req, res);
    }
    const f = path.join(root, 'public', u.pathname === '/' ? 'index.html' : path.normalize(u.pathname).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(path.join(root, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('404'); }
    res.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) await usePglite(process.env.LC_PGLITE_DIR);
  createServer().listen(PORT, () => console.log('La Cueva en http://localhost:' + PORT));
}
