/* ============================================================
   LA CUEVA · conexión a Postgres
   Producción: Postgres (Neon u otro) mediante DATABASE_URL / POSTGRES_URL.
   Pruebas locales: un adaptador inyectado con setDb() (PGlite).
   El esquema solo se crea si no existe: nunca borra ni altera datos.
   ============================================================ */
import pg from 'pg';

let custom = null;
let pool = null;
let schemaReady = null;

export function setDb(adapter) { custom = adapter; schemaReady = null; }

export function dbUrl() { return process.env.DATABASE_URL || process.env.POSTGRES_URL || ''; }
export function dbConfigured() { return !!(custom || dbUrl()); }

function getPool() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: dbUrl(), max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000 });
    pool.on('error', e => console.error('[db] pool', e.message));
  }
  return pool;
}

/* consulta suelta */
export async function q(text, params) {
  if (custom) return custom.query(text, params);
  return getPool().query(text, params);
}

/* transacción: fn recibe una función de consulta ligada a la misma conexión */
export async function tx(fn) {
  if (custom) return custom.transaction(fn);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn((t, p) => client.query(t, p));
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw e;
  } finally { client.release(); }
}

const SCHEMA = [
  `CREATE SEQUENCE IF NOT EXISTS lc_seq`,
  `CREATE TABLE IF NOT EXISTS lc_docs (
     collection text NOT NULL,
     id text NOT NULL,
     data jsonb,
     deleted boolean NOT NULL DEFAULT false,
     v integer NOT NULL DEFAULT 1,
     seq bigint NOT NULL DEFAULT nextval('lc_seq'),
     updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
     PRIMARY KEY (collection, id)
   )`,
  `CREATE INDEX IF NOT EXISTS lc_docs_updated ON lc_docs (updated_at)`,
  `CREATE TABLE IF NOT EXISTS lc_leases (
     name text PRIMARY KEY,
     holder text NOT NULL,
     expires_at timestamptz NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS lc_secrets (
     project_id text NOT NULL,
     provider text NOT NULL,
     enc text NOT NULL,
     meta jsonb,
     updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (project_id, provider)
   )`,
  `CREATE TABLE IF NOT EXISTS lc_meta (
     k text PRIMARY KEY,
     v jsonb,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`
];

/* idempotente y no destructivo */
export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => { for (const s of SCHEMA) await q(s); })().catch(e => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

export async function getMeta(k) {
  const r = await q('SELECT v FROM lc_meta WHERE k = $1', [k]);
  return r.rows[0] ? r.rows[0].v : null;
}
export async function setMeta(k, v) {
  await q('INSERT INTO lc_meta (k, v, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = now()', [k, JSON.stringify(v)]);
}
