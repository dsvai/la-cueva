// Regression tests: isolated in-memory DB, no paid AI or external Shopify calls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
process.env.ADMIN_PASSWORD = 'local-regression-password-123';
process.env.LC_ALLOW_MOCK = '1';
process.env.AI_PROVIDER = 'mock';
const { usePglite } = await import('../server/dev.js');
const pg = await usePglite();
const { q, ensureSchema } = await import('../server/db.js');
const { writeDoc, getDoc } = await import('../server/docs.js');
const { encrypt, executeApproval } = await import('../server/integrations.js');
const require = createRequire(import.meta.url);
const R = require('../shared/remote.cjs');
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };
const originalFetch = globalThis.fetch;
try {
  await ensureSchema();
  await test('concurrent requests claim an approved Shopify action only once', async () => {
    await writeDoc('projects', 'regression-project', { set: { name: 'Local test' } });
    await q('INSERT INTO lc_secrets (project_id, provider, enc, meta) VALUES ($1,$2,$3,$4::jsonb)', ['regression-project', 'shopify', encrypt({ shop: 'local-regression', accessToken: 'fake-local-token' }), '{}']);
    await writeDoc('approvals', 'regression-approval', { set: { kind: 'integracion', projectId: 'regression-project', state: 'aprobada', execState: 'pendiente', payload: { provider: 'shopify', action: 'crear_producto_borrador', params: { titulo: 'Local test product' } } } });
    let writes = 0;
    globalThis.fetch = async () => {
      writes++;
      await new Promise(r => setTimeout(r, 30));
      return new Response(JSON.stringify({ data: { productCreate: { product: { id: 'gid://shopify/Product/1', title: 'Local test product', status: 'DRAFT' }, userErrors: [] } } }), { status: 200 });
    };
    const outcomes = await Promise.all([executeApproval('regression-approval'), executeApproval('regression-approval')]);
    assert.equal(writes, 1);
    assert.ok(outcomes.some(x => x.state === 'hecha'));
    assert.equal((await executeApproval('regression-approval')).state, 'hecha');
    assert.equal(writes, 1);
    assert.equal((await getDoc('approvals', 'regression-approval')).data.execState, 'hecha');
    globalThis.fetch = originalFetch;
  });
  console.log('\n' + passed + ' reliability regressions passed');
} finally {
  globalThis.fetch = originalFetch;
  await pg.close();
}
