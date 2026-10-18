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
    const { runOps } = await import('../server/docs.js');
    await runOps([{ op: 'write', c: 'approvals', id: 'regression-approval', ops: { set: { execState: 'pendiente', state: 'pendiente', payload: {} } } }]);
    assert.equal((await executeApproval('regression-approval')).state, 'hecha');
    assert.equal(writes, 1, 'a stale browser cannot reset an executed approval');
    globalThis.fetch = originalFetch;
  });
  await test('tool-only steps retain their checkpoint and resume without replay', async () => {
    let steps = 0, tools = 0, saved;
    const sample = R.makeSample(async () => {
      steps++;
      return steps <= 2 ? { text: '', stop: 'tool_use', toolCalls: [{ id: 'call-' + steps, name: 'observe', input: {} }], usage: { in: 100, out: 10 } } : { text: 'Entrega completa', stop: 'end', usage: { in: 50, out: 20 } };
    }, { maxSteps: 2 });
    const options = { tools: [{ name: 'observe', execute: async () => { tools++; return 'ok'; } }], onCheckpoint: async x => { saved = x; } };
    const first = await sample('Local test', options);
    assert.equal(first.stop, 'max_steps'); assert.equal(first.truncated, true);
    assert.equal(first.usage.in, 200); assert.equal(first.usage.calls, 2);
    assert.equal(saved.turns.at(-1).content[0].type, 'tool_result');
    const second = await sample('ignored', { ...options, resumeState: first.continuation });
    assert.equal(second.truncated, false); assert.equal(second.text, 'Entrega completa');
    assert.equal(tools, 2); assert.equal(steps, 3);
  });
  await test('a failed provider step preserves earlier usage and tool history', async () => {
    let steps = 0;
    const sample = R.makeSample(async () => {
      if (++steps === 2) throw { code: 'rate_limited' };
      return { text: '', stop: 'tool_use', toolCalls: [{ id: 'call', name: 'observe', input: {} }], usage: { in: 100, out: 20, searches: 1 } };
    });
    await assert.rejects(sample('test', { tools: [{ name: 'observe', execute: async () => 'done' }] }), e => {
      assert.equal(e.code, 'rate_limited'); assert.equal(e.usage.in, 100);
      assert.equal(e.usage.searches, 1); assert.equal(e.continuation.turns.at(-1).content[0].type, 'tool_result'); return true;
    });
  });
  await test('incomplete tasks persist progress without completing or starting dependants', async () => {
    const { loadRuntime } = await import('../server/runtime.js');
    const { runOps } = await import('../server/docs.js');
    const db = R.makeRemoteDb(ops => runOps(ops, { allowLease: true }), { strictLease: true });
    await db.start();
    let finish = false;
    const sample = R.makeSample(async () => finish
      ? { text: 'Entrega completa', stop: 'end', usage: { in: 5, out: 5 } }
      : { text: 'Avance parcial', stop: 'max_tokens', usage: { in: 5, out: 5 } });
    sample.provider = 'mock';
    const rt = loadRuntime(db, sample, 'worker');
    const until = async predicate => { const end = Date.now() + 10000; while (!predicate() && Date.now() < end) await new Promise(r => setTimeout(r, 50)); assert.ok(predicate(), 'runtime condition timed out'); };
    try {
      await rt.Store.init(); await rt.AI.init(); await rt.Leader.start();
      const plan = rt.Orch.createPlan({ titulo: 'Continuation test', tareas: [
        { clave: 'first', titulo: 'First task', responsable: 'alex' },
        { clave: 'next', titulo: 'Dependent task', responsable: 'clara', depende_de: ['first'] }
      ] }, { autoApprove: true });
      const [first, next] = plan.taskIds;
      await until(() => rt.Store.get('tasks', first).state === 'pausada');
      assert.equal(rt.Store.get('tasks', next).state, 'pendiente');
      assert.equal(rt.Store.all('deliverables').length, 0);
      assert.ok((await getDoc('tthread', first)).data.sample.turns.some(t => t.content === 'Avance parcial'));
      finish = true;
      // A dependent blocked by a previous failure must also recover when the prerequisite succeeds.
      rt.Store.patch('tasks', next, { state: 'bloqueada', error: 'Depende de una tarea que no se completó.' });
      rt.Orch.resumePlan(plan.id);
      await until(() => rt.Store.get('plans', plan.id).state === 'en_revision');
      assert.equal(rt.Store.get('tasks', first).state, 'completada');
      assert.equal(rt.Store.get('tasks', next).state, 'completada');
    } finally { rt.Orch.setHold(true); rt.Orch.drain('pause'); await rt.Store.flush(); await rt.Leader.stop(); db.stop(); }
  });
  await test('server atomically admits only one concurrent request at the daily limit', async () => {
    const { step } = await import('../server/llm.js');
    const { usageDay } = await import('../server/usage.js');
    const day = usageDay('Europe/Madrid');
    const before = (await getDoc('usage', day)).data || { calls: 0 };
    await writeDoc('config', 'main', { set: { dailyCalls: before.calls + 1 } });
    const req = { messages: [{ role: 'user', content: 'Local mock only' }], context: { agentId: 'alex', projectId: 'regression-project' } };
    const results = await Promise.allSettled([step(req), step(req)]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(results.find(x => x.status === 'rejected').reason.code, 'daily_limit');
    const after = (await getDoc('usage', day)).data;
    assert.equal(after.calls, before.calls + 1); assert.ok(after.outTok > 0);
    assert.ok(after.byModel['mock:mock']);
    await writeDoc('usage', day, { set: { calls: 0 } });
    await assert.rejects(step(req), e => e.code === 'daily_limit');
    await writeDoc('usage', day, { set: { calls: after.calls } });
    await writeDoc('config', 'main', { set: { dailyCalls: 150 } });
  });
  await test('server enforces a plan budget before every internal provider step', async () => {
    const { step } = await import('../server/llm.js');
    await writeDoc('plans', 'budget-plan', { set: { calls: 0, maxCalls: 1, projectId: 'regression-project' } });
    const req = { messages: [{ role: 'user', content: 'Local mock only' }], context: { agentId: 'alex', projectId: 'regression-project', planId: 'budget-plan' } };
    await step(req);
    await assert.rejects(step(req), e => e.code === 'plan_limit');
    assert.equal((await getDoc('plans', 'budget-plan')).data.calls, 1);
  });
  console.log('\n' + passed + ' reliability regressions passed');
  process.exitCode = 0;
} finally {
  globalThis.fetch = originalFetch;
  await pg.close();
}
