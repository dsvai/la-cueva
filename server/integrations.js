/* ============================================================
   LA CUEVA · integraciones externas (por proyecto)
   - Las credenciales se guardan cifradas (AES-256-GCM) en lc_secrets, una fila por
     proyecto y proveedor: nunca se mezclan cuentas de clientes distintos.
   - El navegador nunca recibe una credencial: solo metadatos (tienda, permisos, fecha).
   - Lecturas: las pueden pedir los agentes del proyecto.
   - Escrituras: solo se ejecutan desde una aprobación ya aprobada por el administrador,
     con los datos fijados cuando el agente la propuso, y una sola vez.
   Clave de cifrado: LC_SECRET_KEY si existe; si no, derivada de ADMIN_PASSWORD
   (en ese caso, cambiar la contraseña obliga a reconectar las integraciones).
   ============================================================ */
import crypto from 'node:crypto';
import { q, tx, ensureSchema } from './db.js';
import { getDoc, writeDoc, DocError } from './docs.js';

const SHOPIFY_API = process.env.SHOPIFY_API_VERSION || '2026-07';
const ID_RE = /^[\w.~:@+-]{1,160}$/;
/* solo en pruebas locales (LC_ALLOW_MOCK=1) se puede apuntar a un Shopify simulado */
const shopBase = shop => (process.env.LC_ALLOW_MOCK === '1' && process.env.LC_SHOPIFY_TEST_BASE) ? process.env.LC_SHOPIFY_TEST_BASE.replace('{shop}', shop) : 'https://' + shop + '.myshopify.com';

function key() {
  const base = process.env.LC_SECRET_KEY ? 'k:' + process.env.LC_SECRET_KEY : 'pw:' + (process.env.ADMIN_PASSWORD || '');
  return crypto.createHash('sha256').update('la-cueva/secrets/v1/' + base).digest();
}
export function encrypt(obj) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return 'v1.' + iv.toString('base64') + '.' + c.getAuthTag().toString('base64') + '.' + data.toString('base64');
}
export function decrypt(s) {
  const [v, iv, tag, data] = String(s).split('.');
  if (v !== 'v1') throw new Error('formato');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
}

class IntError extends Error { constructor(code, message) { super(message); this.code = code; } }

async function loadSecret(projectId, provider) {
  const r = await q('SELECT enc, meta FROM lc_secrets WHERE project_id = $1 AND provider = $2', [projectId, provider]);
  if (!r.rows[0]) return null;
  try { return { cred: decrypt(r.rows[0].enc), meta: r.rows[0].meta || {} }; }
  catch (e) { throw new IntError('reconnect', 'No se pueden descifrar las credenciales (¿cambió la contraseña del administrador?). Vuelve a conectar la integración.'); }
}
async function saveSecret(projectId, provider, cred, meta) {
  await q(`INSERT INTO lc_secrets (project_id, provider, enc, meta, updated_at) VALUES ($1, $2, $3, $4::jsonb, now())
           ON CONFLICT (project_id, provider) DO UPDATE SET enc = excluded.enc, meta = excluded.meta, updated_at = now()`, [projectId, provider, encrypt(cred), JSON.stringify(meta)]);
}

/* ---------------- Shopify ---------------- */
export function normalizeShop(input) {
  let s = String(input || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  s = s.replace(/\.myshopify\.com$/, '');
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(s)) throw new IntError('invalid', 'Escribe el dominio interno de la tienda, del tipo «mi-tienda.myshopify.com».');
  return s;
}
async function shopifyToken(projectId, cred) {
  if (cred.accessToken) return cred.accessToken;
  if (cred.token && cred.tokenExp > Date.now() + 120000) return cred.token;
  const res = await fetch(shopBase(cred.shop) + '/admin/oauth/access_token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cred.clientId, client_secret: cred.clientSecret }).toString()
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    const why = String(j.error || j.errors || res.status);
    if (/shop_not_permitted/.test(why)) throw new IntError('shopify_auth', 'Shopify no permite el acceso: la app y la tienda deben pertenecer a la misma organización del Dev Dashboard.');
    if (/invalid_client|401|400/.test(why)) throw new IntError('shopify_auth', 'Shopify ha rechazado el Client ID o el Client secret, o la app no está instalada en la tienda.');
    throw new IntError('shopify_auth', 'No se pudo obtener acceso a Shopify (' + why.slice(0, 80) + ').');
  }
  cred.token = j.access_token; cred.tokenExp = Date.now() + (Number(j.expires_in) || 86399) * 1000; cred.scope = j.scope || cred.scope;
  if (projectId) { const cur = await loadSecret(projectId, 'shopify'); await saveSecret(projectId, 'shopify', cred, Object.assign({}, cur ? cur.meta : {}, { scopes: cred.scope || '' })); }
  return cred.token;
}
async function gql(projectId, cred, query, variables) {
  const token = await shopifyToken(projectId, cred);
  const res = await fetch(shopBase(cred.shop) + '/admin/api/' + SHOPIFY_API + '/graphql.json', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': token }, body: JSON.stringify({ query, variables: variables || {} })
  });
  if (res.status === 401 || res.status === 403) { cred.token = null; throw new IntError('shopify_auth', 'Shopify ha rechazado el acceso (' + res.status + '). Revisa que la app siga instalada y tenga los permisos necesarios.'); }
  if (res.status === 429) throw new IntError('rate_limited', 'Shopify pide esperar un momento (límite de peticiones).');
  const j = await res.json().catch(() => ({}));
  if (j.errors && j.errors.length) {
    const msg = j.errors.map(e => e.message).join('; ');
    if (/access denied|access scope|not approved to access/i.test(msg)) throw new IntError('shopify_scope', 'La app de Shopify no tiene permiso para esto: ' + msg.slice(0, 200) + '. Añade el permiso en el Dev Dashboard (nueva versión) y apruébalo en la tienda.');
    throw new IntError('shopify_error', 'Shopify respondió con un error: ' + msg.slice(0, 300));
  }
  return j.data;
}
const money = m => m ? m.amount + ' ' + m.currencyCode : '—';
const SHOP_INFO = `{ shop { name email myshopifyDomain primaryDomain { url } currencyCode plan { displayName } } productsCount { count } }`;
const PRODUCT_FIELDS = `id title handle status vendor productType tags totalInventory onlineStoreUrl updatedAt priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }`;

const READ = {
  async estado_tienda(pid, cred) {
    const d = await gql(pid, cred, SHOP_INFO);
    return { tienda: d.shop.name, dominio: d.shop.primaryDomain && d.shop.primaryDomain.url, dominio_interno: d.shop.myshopifyDomain, moneda: d.shop.currencyCode, plan: d.shop.plan && d.shop.plan.displayName, productos: d.productsCount && d.productsCount.count };
  },
  async buscar_productos(pid, cred, p) {
    const first = Math.min(Math.max(parseInt(p.limite, 10) || 10, 1), 25);
    const d = await gql(pid, cred, `query($first:Int!,$q:String){ products(first:$first, query:$q, sortKey:UPDATED_AT, reverse:true){ nodes { ${PRODUCT_FIELDS} } } }`, { first, q: p.consulta ? String(p.consulta).slice(0, 200) : null });
    return d.products.nodes.map(x => ({ id: x.id, titulo: x.title, estado: x.status, precio: money(x.priceRangeV2.minVariantPrice) + (x.priceRangeV2.maxVariantPrice.amount !== x.priceRangeV2.minVariantPrice.amount ? ' – ' + money(x.priceRangeV2.maxVariantPrice) : ''), inventario: x.totalInventory, tipo: x.productType, proveedor: x.vendor, etiquetas: x.tags, url: x.onlineStoreUrl, actualizado: x.updatedAt }));
  },
  async ver_producto(pid, cred, p) {
    if (!/^gid:\/\/shopify\/Product\/\d+$/.test(String(p.id || ''))) throw new IntError('invalid', 'Necesito el id del producto (gid://shopify/Product/…); búscalo antes con buscar_productos.');
    const d = await gql(pid, cred, `query($id:ID!){ product(id:$id){ ${PRODUCT_FIELDS} descriptionHtml seo { title description } options { name values } variants(first:30){ nodes { id title sku price compareAtPrice inventoryQuantity } } media(first:10){ nodes { alt mediaContentType preview { image { url } } } } } }`, { id: p.id });
    if (!d.product) throw new IntError('not_found', 'Ese producto no existe en la tienda.');
    const x = d.product;
    return { id: x.id, titulo: x.title, estado: x.status, descripcion_html: String(x.descriptionHtml || '').slice(0, 6000), seo: x.seo, opciones: x.options, variantes: x.variants.nodes, imagenes: x.media.nodes.map(m => ({ alt: m.alt, url: m.preview && m.preview.image && m.preview.image.url })), etiquetas: x.tags, url: x.onlineStoreUrl };
  },
  async resumen_pedidos(pid, cred, p) {
    const dias = Math.min(Math.max(parseInt(p.dias, 10) || 30, 1), 90);
    const since = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    const d = await gql(pid, cred, `query($q:String){ orders(first:100, query:$q, sortKey:CREATED_AT, reverse:true){ nodes { name createdAt displayFinancialStatus displayFulfillmentStatus totalPriceSet { shopMoney { amount currencyCode } } lineItems(first:5){ nodes { title quantity } } } } }`, { q: 'created_at:>=' + since });
    const os = d.orders.nodes; const total = os.reduce((n, o) => n + Number(o.totalPriceSet.shopMoney.amount || 0), 0);
    const cur = os[0] ? os[0].totalPriceSet.shopMoney.currencyCode : '';
    const top = {}; for (const o of os) for (const li of o.lineItems.nodes) top[li.title] = (top[li.title] || 0) + li.quantity;
    return { periodo_dias: dias, pedidos: os.length, ventas: total.toFixed(2) + ' ' + cur, ticket_medio: os.length ? (total / os.length).toFixed(2) + ' ' + cur : '—', mas_vendidos: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, n]) => t + ' (' + n + ')'), aviso: os.length >= 100 ? 'Se han contado solo los 100 pedidos más recientes del periodo.' : undefined };
  }
};

const WRITE = {
  async crear_producto_borrador(pid, cred, p) {
    const input = { title: String(p.titulo || '').slice(0, 255), descriptionHtml: String(p.descripcion_html || ''), vendor: p.proveedor ? String(p.proveedor) : undefined, productType: p.tipo ? String(p.tipo) : undefined, tags: Array.isArray(p.etiquetas) ? p.etiquetas.map(String).slice(0, 50) : undefined, status: 'DRAFT' };
    if (p.seo_titulo || p.seo_descripcion) input.seo = { title: p.seo_titulo || undefined, description: p.seo_descripcion || undefined };
    if (!input.title) throw new IntError('invalid', 'Falta el título del producto.');
    const d = await gql(pid, cred, `mutation($product:ProductCreateInput!){ productCreate(product:$product){ product { id title status handle } userErrors { field message } } }`, { product: input });
    const r = d.productCreate; if (r.userErrors && r.userErrors.length) throw new IntError('shopify_error', r.userErrors.map(e => e.message).join('; '));
    return 'Producto creado como BORRADOR (no visible en la tienda): «' + r.product.title + '» · ' + r.product.id;
  },
  async actualizar_producto(pid, cred, p) {
    if (!/^gid:\/\/shopify\/Product\/\d+$/.test(String(p.producto_id || ''))) throw new IntError('invalid', 'Falta el id del producto.');
    const input = { id: p.producto_id };
    if (p.titulo) input.title = String(p.titulo).slice(0, 255);
    if (p.descripcion_html) input.descriptionHtml = String(p.descripcion_html);
    if (Array.isArray(p.etiquetas)) input.tags = p.etiquetas.map(String).slice(0, 50);
    if (p.tipo) input.productType = String(p.tipo);
    if (p.seo_titulo || p.seo_descripcion) input.seo = { title: p.seo_titulo || undefined, description: p.seo_descripcion || undefined };
    if (Object.keys(input).length < 2) throw new IntError('invalid', 'No hay ningún cambio que aplicar.');
    const d = await gql(pid, cred, `mutation($product:ProductUpdateInput!){ productUpdate(product:$product){ product { id title status } userErrors { field message } } }`, { product: input });
    const r = d.productUpdate; if (r.userErrors && r.userErrors.length) throw new IntError('shopify_error', r.userErrors.map(e => e.message).join('; '));
    return 'Producto actualizado: «' + r.product.title + '» (' + r.product.status + ')';
  },
  async cambiar_estado_producto(pid, cred, p) {
    const st = String(p.estado || '').toUpperCase();
    if (!['ACTIVE', 'DRAFT', 'ARCHIVED'].includes(st)) throw new IntError('invalid', 'Estado no válido (ACTIVE, DRAFT o ARCHIVED).');
    const d = await gql(pid, cred, `mutation($product:ProductUpdateInput!){ productUpdate(product:$product){ product { id title status } userErrors { field message } } }`, { product: { id: p.producto_id, status: st } });
    const r = d.productUpdate; if (r.userErrors && r.userErrors.length) throw new IntError('shopify_error', r.userErrors.map(e => e.message).join('; '));
    return 'Estado cambiado: «' + r.product.title + '» ahora está ' + ({ ACTIVE: 'ACTIVO (publicado en los canales configurados)', DRAFT: 'en BORRADOR', ARCHIVED: 'ARCHIVADO' })[r.product.status];
  }
};
export const SHOPIFY_WRITES = Object.keys(WRITE);
export const SHOPIFY_READS = Object.keys(READ);

/* ---------------- API común ---------------- */
function checkPid(pid) { if (typeof pid !== 'string' || !ID_RE.test(pid)) throw new IntError('invalid', 'Proyecto no válido.'); }

async function setProjectMeta(projectId, provider, meta) {
  const p = await getDoc('projects', projectId);
  if (!p.exists) return;
  const integ = Object.assign({}, p.data.integrations || {});
  if (meta) integ[provider] = meta; else delete integ[provider];
  await writeDoc('projects', projectId, { set: { integrations: integ } });
}

export async function connect(projectId, provider, body) {
  checkPid(projectId);
  if (provider !== 'shopify') throw new IntError('invalid', 'Integración no disponible todavía.');
  const p = await getDoc('projects', projectId); if (!p.exists) throw new IntError('invalid', 'El proyecto no existe.');
  const shop = normalizeShop(body.shop);
  const cred = { shop };
  if (body.accessToken) { if (!/^shpat_[\w-]{10,}$/.test(String(body.accessToken).trim())) throw new IntError('invalid', 'El token de acceso de Shopify empieza por «shpat_».'); cred.accessToken = String(body.accessToken).trim(); }
  else {
    if (!body.clientId || !body.clientSecret) throw new IntError('invalid', 'Faltan el Client ID y el Client secret de la app.');
    cred.clientId = String(body.clientId).trim().slice(0, 200); cred.clientSecret = String(body.clientSecret).trim().slice(0, 300);
  }
  const info = await READ.estado_tienda(null, cred);        // prueba real antes de guardar
  const meta = { shop: shop + '.myshopify.com', name: info.tienda, currency: info.moneda, scopes: cred.scope || '', method: cred.accessToken ? 'token' : 'app', connectedAt: Date.now() };
  await saveSecret(projectId, 'shopify', cred, meta);
  await setProjectMeta(projectId, 'shopify', { shop: meta.shop, name: meta.name, currency: meta.currency, connectedAt: meta.connectedAt });
  return meta;
}
export async function disconnect(projectId, provider) {
  checkPid(projectId);
  await q('DELETE FROM lc_secrets WHERE project_id = $1 AND provider = $2', [projectId, provider]);
  await setProjectMeta(projectId, provider, null);
  return { ok: true };
}
export async function list(projectId) {
  checkPid(projectId);
  const r = await q('SELECT provider, meta, updated_at FROM lc_secrets WHERE project_id = $1', [projectId]);
  return r.rows.map(x => ({ provider: x.provider, meta: x.meta, updatedAt: x.updated_at }));
}
export async function read(projectId, op, params) {
  checkPid(projectId);
  if (!READ[op]) throw new IntError('invalid', 'Consulta no disponible: ' + op);
  const s = await loadSecret(projectId, 'shopify');
  if (!s) throw new IntError('not_connected', 'Este proyecto no tiene Shopify conectado.');
  return READ[op](projectId, s.cred, params || {});
}

/* ejecuta una escritura aprobada (una sola vez) */
export async function executeApproval(approvalId) {
  if (typeof approvalId !== 'string' || !ID_RE.test(approvalId)) throw new IntError('invalid', 'Aprobación no válida.');
  // reserva atómica: solo una ejecución por aprobación
  const claim = await tx(async run => {
    await run('SELECT pg_advisory_xact_lock(hashtext($1))', ['approvals/' + approvalId]);
    const r = await run("SELECT data FROM lc_docs WHERE collection = 'approvals' AND id = $1 AND NOT deleted", [approvalId]);
    const a = r.rows[0] && r.rows[0].data;
    if (!a) return { error: 'La aprobación no existe.' };
    if (a.kind !== 'integracion' || !a.payload) return { error: 'Esta aprobación no corresponde a una integración.' };
    if (a.state !== 'aprobada') return { error: 'La acción no está aprobada.' };
    if (a.execState && a.execState !== 'pendiente') return { already: a };
    return { a };
  });
  if (claim.error) throw new IntError('invalid', claim.error);
  if (claim.already) return { state: claim.already.execState, result: claim.already.execResult || claim.already.execError };
  const a = claim.a;
  await writeDoc('approvals', approvalId, { set: { execState: 'ejecutando', execStartedAt: Date.now() } });
  try {
    const { provider, action, params } = a.payload;
    if (provider !== 'shopify' || !WRITE[action]) throw new IntError('invalid', 'Acción no disponible.');
    const s = await loadSecret(a.projectId, 'shopify');
    if (!s) throw new IntError('not_connected', 'El proyecto ya no tiene Shopify conectado.');
    const result = await WRITE[action](a.projectId, s.cred, params || {});
    await writeDoc('approvals', approvalId, { set: { execState: 'hecha', execResult: result, execAt: Date.now() } });
    return { state: 'hecha', result };
  } catch (e) {
    const msg = e instanceof IntError ? e.message : 'Error inesperado al ejecutar la acción.';
    if (!(e instanceof IntError)) console.error('[integrations]', e && e.message);
    await writeDoc('approvals', approvalId, { set: { execState: 'fallida', execError: msg, execAt: Date.now() } });
    return { state: 'fallida', result: msg };
  }
}

export function errorBody(e) {
  if (e instanceof IntError || e instanceof DocError) return { code: e.code, message: e.message };
  console.error('[integrations]', e && e.message);
  return { code: 'server_error', message: 'Error de conexión con la integración.' };
}
export { ensureSchema, IntError };
