// Pruebas del backend sin red: PGlite + proveedor simulado.
// Ejecutar: node test/server_test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
process.env.ADMIN_PASSWORD = 'contraseña-de-prueba-123';
process.env.LC_ALLOW_MOCK = '1';
process.env.AI_PROVIDER = 'mock';
const require = createRequire(import.meta.url);
const { usePglite } = await import('../server/dev.js');
await usePglite();
const { runOps, applyOps } = await import('../server/docs.js');
const { runWorker, loadRuntime } = await import('../server/runtime.js');
const { step } = await import('../server/llm.js');
const { usageDay } = await import('../server/usage.js');
const R = require('../shared/remote.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const ok = (m) => { n++; console.log('✓', m); };

const T = ops => runOps(ops, { allowLease: true });

// --- diff / merge
{
  const d = R.diff('tasks', { a: 1, logs: [1, 2] }, { a: 2, logs: [1, 2, 3], b: 'x' });
  assert.deepEqual(d.set, { a: 2, b: 'x' }); assert.deepEqual(d.append, { logs: [3] });
  const u = R.diff('usage', { calls: 2, byAgent: { x: { calls: 1 } } }, { calls: 3, byAgent: { x: { calls: 2 }, y: { calls: 1 } } });
  assert.deepEqual(u.inc, { calls: 1, byAgent: { x: { calls: 1 }, y: { calls: 1 } } });
  const L = { state: 'en_curso', heartbeat: 5, title: 't' };
  R.merge3(L, { state: 'en_curso', heartbeat: 1, title: 't' }, { state: 'pausada', heartbeat: 1, title: 't' });
  assert.deepEqual(L, { state: 'pausada', heartbeat: 5, title: 't' });
  assert.deepEqual(applyOps('tasks', { logs: [1] }, { append: { logs: [2] }, unset: [] }).logs, [1, 2]);
  ok('diff, merge a tres bandas y parches');
}

// --- dos escritores concurrentes sobre el mismo documento de consumo y actividad
{
  const a = R.makeRemoteDb(T, {}), b = R.makeRemoteDb(T, {});
  await a.start(); await b.start();
  await a.collection('usage').doc('2026-10-18').set({ id: '2026-10-18', calls: 1, inTok: 10, outTok: 5, byAgent: { alex: { calls: 1, inTok: 10, outTok: 5 } }, byProject: {} });
  await b.collection('usage').doc('2026-10-18').set({ id: '2026-10-18', calls: 1, inTok: 7, outTok: 3, byAgent: { mia: { calls: 1, inTok: 7, outTok: 3 } }, byProject: {} });
  const g = (await T([{ op: 'get', c: 'usage', id: '2026-10-18' }]))[0];
  assert.equal(g.data.calls, 2); assert.equal(g.data.inTok, 17); assert.ok(g.data.byAgent.alex && g.data.byAgent.mia);
  await a.collection('activity').doc('d1').set({ id: 'd1', events: [{ t: 1 }] });
  await b.collection('activity').doc('d1').set({ id: 'd1', events: [{ t: 2 }] });
  const ga = (await T([{ op: 'get', c: 'activity', id: 'd1' }]))[0];
  assert.equal(ga.data.events.length, 2);
  a.stop(); b.stop();
  ok('consumo y actividad se suman entre escritores (sin pisarse)');
}

// --- contrato del orquestador
{
  const r1 = (await T([{ op: 'acquire', name: 'x', holder: 'h1', ttlMs: 10000 }]))[0];
  const r2 = (await T([{ op: 'acquire', name: 'x', holder: 'h2', ttlMs: 10000 }]))[0];
  assert.equal(r1.acquired, true); assert.equal(r2.acquired, false);
  await T([{ op: 'release', name: 'x', holder: 'h1' }]);
  assert.equal((await T([{ op: 'acquire', name: 'x', holder: 'h2', ttlMs: 10000 }]))[0].acquired, true);
  const browser = await runOps([{ op: 'acquire', name: 'y', holder: 'b', ttlMs: 10000 }], { allowLease: false });
  assert.equal(browser[0].acquired, false);
  const bad = await runOps([{ op: 'write', c: 'locks', id: 'x', ops: { set: { a: 1 } } }, { op: 'get', c: '../x', id: 'a' }]);
  assert.ok(bad[0].error && bad[1].error);
  ok('contratos exclusivos; el navegador no puede tomarlos; colecciones validadas');
}

// --- proveedor simulado + bucle de herramientas
{
  let executed = null;
  const sample = R.makeSample(step);
  const r = await sample([{ role: 'user', content: 'Eres Daniel, director' }, { role: 'user', content: 'REGLAPRUEBA' }], { tools: [{ name: 'proponer_regla_memoria', description: 'x', inputSchema: { type: 'object', properties: {} }, execute: async i => { executed = i; return 'registrada'; } }] });
  assert.equal(executed.alcance, 'agencia'); assert.match(r.text, /registrada/);
  ok('bucle de herramientas: el modelo pide una herramienta, se ejecuta y continúa');
}

// --- búsqueda web: turnos en pausa y bloques originales del proveedor se devuelven tal cual
{
  const seen = []; let n = 0;
  const stub = async req => { seen.push(JSON.parse(JSON.stringify(req.messages))); n++;
    if (n === 1) return { text: 'Buscando…', toolCalls: [], stop: 'pause', usage: { in: 1, out: 1, searches: 1 }, raw: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'x' } }] };
    if (n === 2) return { text: '', toolCalls: [{ id: 't1', name: 'ver', input: {} }], stop: 'tool_use', usage: { in: 1, out: 1 }, raw: [{ type: 'web_search_tool_result', tool_use_id: 's1', content: [] }, { type: 'tool_use', id: 't1', name: 'ver', input: {} }] };
    return { text: 'Listo con fuentes', toolCalls: [], stop: 'end', usage: { in: 1, out: 1 } }; };
  const sample = R.makeSample(stub);
  const r = await sample('busca algo', { web: true, tools: [{ name: 'ver', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ text: 'pags', images: [{ mediaType: 'image/jpeg', data: 'AAAA' }] }) }] });
  assert.match(r.text, /Listo con fuentes/); assert.equal(r.usage.searches, 1);
  const last = seen[2]; assert.equal(last[1].content[0].type, 'provider_raw'); assert.equal(last[2].content[0].type, 'provider_raw');
  assert.equal(last[3].content[0].images.length, 1);
  ok('búsqueda web: pausa, bloques del proveedor intactos y herramientas que devuelven imágenes');
}

// --- flujo completo: navegador (observador) crea un plan con Daniel; el worker lo ejecuta en segundo plano
{
  const bdb = R.makeRemoteDb(T, { observer: true, pollMs: 300, full: ['config', 'agents', 'projects', 'convs', 'plans', 'tasks', 'approvals', 'rules', 'notes', 'deliverables', 'schedules', 'pdocs', 'usage', 'activity'] });
  await bdb.start();
  const sample = R.makeSample(step); sample.provider = 'mock';
  const B = loadRuntime(bdb, sample, 'browser');
  let kicks = 0; B.Bus.on('orch:kick', () => kicks++);
  await B.Store.init(); await B.AI.init(); await B.Leader.start();
  assert.equal(B.Leader.is(), false, 'el navegador no ejecuta la cola');
  assert.equal(B.AI.provider, 'mock');
  const cv = B.Chat.ensureConv('daniel', null);
  await B.Chat.send(cv.id, 'PLANPRUEBA crea la tienda', []);
  const plan = B.Store.all('plans')[0];
  assert.ok(plan, 'plan creado'); assert.equal(plan.state, 'pendiente_aprobacion');
  B.Orch.approvePlan(plan.id);
  assert.ok(kicks > 0, 'el navegador avisa al worker');
  await B.Store.flush();
  const tasksQueued = B.Store.all('tasks').filter(t => t.state === 'en_cola').length;
  assert.equal(tasksQueued, 1);

  // el worker hace todo el trabajo con el navegador abierto solo como observador
  const r = await runWorker({ softMs: 25000, hardMs: 30000 });
  assert.equal(r.ran, true, r.reason);
  const all = (await T([{ op: 'query', c: 'tasks', where: [] }]))[0].docs.map(d => d.data);
  const states = all.map(t => t.agentId + ':' + t.state).sort();
  if (states[0] !== 'alex:completada') console.log(JSON.stringify(all.map(t => [t.agentId, t.state, t.error, t.logs]), null, 1));
  assert.deepEqual(states, ['alex:completada', 'clara:completada', 'mia:completada'], states.join(','));
  const pl = (await T([{ op: 'get', c: 'plans', id: plan.id }]))[0].data;
  assert.equal(pl.state, 'en_revision', 'Daniel consolidó');
  const dl = (await T([{ op: 'query', c: 'deliverables', where: [] }]))[0].docs;
  assert.equal(dl.length, 4);
  ok('el worker ejecuta el plan, la colaboración y la consolidación sin el navegador');

  // el navegador recibe los cambios por sincronización, incluido el informe en el chat
  await sleep(900);
  assert.equal(B.Store.get('plans', plan.id).state, 'en_revision');
  assert.equal(B.Store.all('tasks').filter(t => t.state === 'completada').length, 3);
  const msgs = await B.Chat.messages(cv.id);
  assert.ok(msgs.some(m => m.meta && m.meta.kind === 'consolidacion'), 'informe de Daniel en la conversación');
  assert.ok(msgs.filter(m => m.role === 'user').length === 1, 'el historial del chat se conserva');
  // La primera fila puede ser la de otro día, creada por la prueba de concurrencia.
  const u = (await T([{ op: 'get', c: 'usage', id: usageDay('Europe/Madrid') }]))[0].data;
  assert.ok(u.calls >= 6, 'consumo sumado de navegador y worker: ' + u.calls);
  ok('el navegador ve el resultado sincronizado y el consumo cuadra (' + u.calls + ' llamadas)');

  // pausa desde el navegador mientras el worker trabaja
  await B.Chat.send(cv.id, 'PLANPRUEBA otra vez LENTO', []);
  const p2 = B.Store.all('plans').find(p => p.id !== plan.id);
  B.Orch.approvePlan(p2.id); await B.Store.flush();
  const wp = runWorker({ softMs: 20000, hardMs: 25000 });
  await sleep(1500);
  B.Orch.pausePlan(p2.id); await B.Store.flush();
  const r2 = await wp;
  assert.equal(r2.ran, true);
  const t2 = (await T([{ op: 'query', c: 'tasks', where: [['planId', '==', p2.id]] }]))[0].docs.map(d => d.data);
  assert.ok(t2.every(t => t.state !== 'en_curso' && t.state !== 'completada' || t.agentId === 'mia'), t2.map(t => t.agentId + ':' + t.state).join(','));
  assert.ok(t2.some(t => t.state === 'pausada'), 'tarea pausada: ' + t2.map(t => t.state).join(','));
  ok('pausar desde el navegador detiene el trabajo en el servidor');

  // traspaso: si una tanda se queda sin tiempo, la tarea vuelve a la cola y la siguiente tanda la termina
  B.Orch.resumePlan(p2.id); await B.Store.flush();
  const r3 = await runWorker({ softMs: 300, hardMs: 600 });
  assert.equal(r3.more, true, 'queda trabajo: ' + r3.reason);
  const r4 = await runWorker({ softMs: 30000, hardMs: 40000 });
  assert.equal(r4.ran, true);
  const p2b = (await T([{ op: 'get', c: 'plans', id: p2.id }]))[0].data;
  assert.equal(p2b.state, 'en_revision', 'segundo plan terminado tras el traspaso: ' + p2b.state);
  ok('traspaso entre tandas del worker sin perder trabajo');
  bdb.stop();
}
console.log('\n' + n + ' pruebas del backend superadas');
process.exit(0);
