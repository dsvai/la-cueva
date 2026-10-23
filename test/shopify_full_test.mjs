// Shopify con acceso completo contra una tienda simulada (sin red): consultas libres de lectura,
// mutaciones de la lista permitida solo tras aprobar, una vez, y nada que mueva dinero.
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.ADMIN_PASSWORD = 'local-regression-password-123';
process.env.LC_ALLOW_MOCK = '1';
const calls = [];
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (/access_token$/.test(req.url)) return res.end(JSON.stringify({ access_token: 'tok', scope: 'write_products', expires_in: 86399 }));
    const q = JSON.parse(body); calls.push(q);
    if (/shop \{/.test(q.query)) return res.end(JSON.stringify({ data: { shop: { name: 'Tienda', myshopifyDomain: 't.myshopify.com', primaryDomain: { url: 'https://t' }, currencyCode: 'EUR', plan: { displayName: 'Basic' } }, productsCount: { count: 3 } } }));
    if (/collections/.test(q.query)) return res.end(JSON.stringify({ data: { collections: { nodes: [{ id: 'gid://shopify/Collection/1', title: 'Gorras' }] } } }));
    if (/productVariantsBulkUpdate/.test(q.query)) {
      const bad = q.variables.variants.some(v => Number(v.price) < 0);
      return res.end(JSON.stringify({ data: { productVariantsBulkUpdate: { productVariants: bad ? [] : [{ id: 'v1', price: q.variables.variants[0].price }], userErrors: bad ? [{ field: ['variants', '0', 'price'], message: 'El precio no puede ser negativo' }] : [] } } }));
    }
    res.end(JSON.stringify({ errors: [{ message: 'no simulado' }] }));
  });
}).listen(0);
await new Promise(r => srv.on('listening', r));
process.env.LC_SHOPIFY_TEST_BASE = 'http://localhost:' + srv.address().port + '/s/{shop}';
const { usePglite } = await import('../server/dev.js'); await usePglite();
const I = await import('../server/integrations.js');
const SG = await import('../server/shopify_gql.js');
const { runOps } = await import('../server/docs.js');
const T = ops => runOps(ops, { allowLease: true });
await I.ensureSchema();
await T([{ op: 'write', c: 'projects', id: 'pr-a', ops: { set: { name: 'A' } } }]);
await I.connect('pr-a', 'shopify', { shop: 't', clientId: 'id', clientSecret: 'secret' });
let n = 0; const ok = m => { n++; console.log('✓', m); };

const r = await I.read('pr-a', 'consulta_graphql', { consulta: '{ collections(first: 5) { nodes { id title } } }' });
assert.equal(r.collections.nodes[0].title, 'Gorras');
await assert.rejects(() => I.read('pr-a', 'consulta_graphql', { consulta: 'mutation { productDelete(input:{id:"x"}) { deletedProductId } }' }), /solo se consulta/);
await assert.rejects(() => I.read('pr-a', 'consulta_graphql', { consulta: '{ a } { b }' }), /exactamente una|no válido/);
ok('consultas libres de lectura; las mutaciones no pasan por la vía de consulta');

assert.throws(() => SG.checkMutation('mutation { refundCreate(input:{orderId:"x"}) { refund { id } } }'), /no permitida/);
assert.throws(() => SG.checkMutation('mutation { appSubscriptionCreate(name:"x") { userErrors { message } } }'), /no permitida/);
assert.throws(() => SG.checkMutation('mutation { orderCancel(orderId:"x") { userErrors { message } } }'), /no permitida/);
const v = await I.read('pr-a', 'validar_mutacion', { mutacion: 'mutation($p:ID!){ productDelete(input:{id:$p}) { deletedProductId } tagsAdd(id:$p, tags:["x"]) { userErrors { message } } }' });
assert.deepEqual(v.operaciones.map(o => o.risk), ['borra', '']);
ok('lista permitida: lo que mueve dinero o toca la cuenta queda fuera; los borrados se marcan');

const M = 'mutation($pid:ID!,$variants:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$pid, variants:$variants){ productVariants { id price } userErrors { field message } } }';
await T([{ op: 'write', c: 'approvals', id: 'ap-s1', ops: { set: { kind: 'integracion', state: 'pendiente', projectId: 'pr-a', payload: { provider: 'shopify', action: 'ejecutar_mutacion', params: { mutacion: M, variables: { pid: 'gid://shopify/Product/1', variants: [{ id: 'v1', price: '39.90' }] } } } } } }]);
await assert.rejects(() => I.executeApproval('ap-s1'), /no está aprobada/);
await T([{ op: 'write', c: 'approvals', id: 'ap-s1', ops: { set: { state: 'aprobada' } } }]);
const before = calls.length;
const r1 = await I.executeApproval('ap-s1'); assert.equal(r1.state, 'hecha', r1.result); assert.match(r1.result, /Editar variantes/);
const after = calls.length; const r2 = await I.executeApproval('ap-s1'); assert.equal(r2.state, 'hecha'); assert.equal(calls.length, after, 'no se repite');
assert.equal(after - before, 1);
ok('cambio aprobado: se ejecuta una sola vez con los datos fijados');

await T([{ op: 'write', c: 'approvals', id: 'ap-s2', ops: { set: { kind: 'integracion', state: 'aprobada', projectId: 'pr-a', payload: { provider: 'shopify', action: 'ejecutar_mutacion', params: { mutacion: M, variables: { pid: 'gid://shopify/Product/1', variants: [{ id: 'v1', price: '-1' }] } } } } } }]);
const r3 = await I.executeApproval('ap-s2'); assert.equal(r3.state, 'fallida'); assert.match(r3.result, /negativo/);
await T([{ op: 'write', c: 'approvals', id: 'ap-s3', ops: { set: { kind: 'integracion', state: 'aprobada', projectId: 'pr-a', payload: { provider: 'shopify', action: 'ejecutar_mutacion', params: { mutacion: 'mutation { refundCreate(input:{orderId:"x"}) { refund { id } } }' } } } } }]);
const c0 = calls.length; const r4 = await I.executeApproval('ap-s3'); assert.equal(r4.state, 'fallida'); assert.equal(calls.length, c0, 'no llega a Shopify');
ok('errores de Shopify se muestran; una operación prohibida no se ejecuta aunque esté aprobada');
srv.close();
console.log('\n' + n + ' pruebas de Shopify completo superadas');
process.exit(0);
