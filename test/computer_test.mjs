// Ordenador en la nube contra un Managed Agents simulado (sin red): sesión por encargo,
// entorno y agente reutilizados, límite diario, y una tarea que espera al ordenador
// en el worker y continúa sola con el resultado y los archivos.
import assert from 'node:assert/strict';
process.env.ADMIN_PASSWORD = 'local-regression-password-123';
process.env.LC_ALLOW_MOCK = '1';
process.env.AI_PROVIDER = 'mock';
process.env.LC_COMPUTER_DAILY = '3';
const { usePglite } = await import('../server/dev.js'); await usePglite();
const PC = await import('../server/computer.js');
await (await import('../server/db.js')).ensureSchema();
const made = { env: 0, agent: 0, sessions: [], uploads: [] }; let polls = 0;
const fake = {
  beta: {
    environments: { create: async p => { made.env++; assert.equal(p.config.networking.type, 'unrestricted'); return { id: 'env_1' }; } },
    agents: { create: async p => { made.agent++; assert.equal(p.tools[0].default_config.permission_policy.type, 'always_allow'); assert.match(p.system, /mnt\/session\/outputs/); return { id: 'agent_1' }; } },
    sessions: {
      create: async p => { const id = 'sesn_' + (made.sessions.length + 1); made.sessions.push({ id, p }); return { id }; },
      retrieve: async id => ({ id, status: ++polls >= 2 ? 'idle' : 'running', stats: { active_seconds: 90 } }),
      events: {
        list: async function* () { yield { type: 'agent.message', content: [{ type: 'text', text: 'He creado ventas.xlsx con 3 hojas y fórmulas.' }] }; yield { type: 'span.model_request_end', model_usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }; yield { type: 'session.status_idle', stop_reason: { type: 'end_turn' } }; },
        send: async () => ({})
      }
    },
    files: {
      upload: async p => { made.uploads.push(p); return { id: 'file_in' + made.uploads.length }; },
      list: async function* () { yield { id: 'file_out00001', filename: 'ventas.xlsx', size_bytes: 20480, mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }; },
      retrieveMetadata: async () => ({ filename: 'ventas.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      download: async () => new Response(Buffer.from('PK-fake-xlsx'))
    }
  }
};
const factory = () => fake; factory._mock = true; PC._setClientFactory(factory);
let n = 0; const ok = m => { n++; console.log('✓', m); };

const s1 = await PC.start({ projectId: 'pr-1', agentName: 'Alex', encargo: 'Analiza las ventas y crea un Excel', documentos: [{ nombre: 'ventas.csv', texto: 'mes,ventas\nene,10' }] });
const s2 = await PC.start({ projectId: 'pr-1', agentName: 'Mia', encargo: 'Otro encargo de prueba largo' });
assert.equal(made.env, 1); assert.equal(made.agent, 1, 'entorno y agente se crean una vez');
assert.equal(made.sessions[0].p.resources[0].mount_path, '/ventas.csv.txt');
assert.equal(made.sessions[0].p.budget.max_list_cost.amount, '2.00');
assert.match(made.sessions[0].p.initial_events[0].content[0].text, /Alex/);
await PC.start({ projectId: 'pr-1', encargo: 'Tercer encargo de prueba' });
await assert.rejects(() => PC.start({ projectId: 'pr-1', encargo: 'Cuarto encargo de prueba' }), /límite diario/);
await assert.rejects(() => PC.status('../../etc'), /no válida/);
ok('sesión por encargo con documentos y tope de coste; entorno y agente reutilizados; límite diario');

polls = 1;
const st = await PC.status(s1.sessionId);
assert.equal(st.done, true); assert.match(st.summary, /ventas\.xlsx/); assert.equal(st.files[0].id, 'file_out00001');
assert.ok(PC.estimateUsd(st) > 0);
const dl = await PC.download('file_out00001'); assert.equal(dl.name, 'ventas.xlsx'); assert.equal(dl.body.toString(), 'PK-fake-xlsx');
await assert.rejects(() => PC.download('../x'), /no válido/);
ok('resultado: resumen, archivos de salida, coste aproximado y descarga a través del servidor');

// tarea completa en el worker: lanza el encargo, espera sin gastar llamadas de IA y continúa sola
process.env.LC_COMPUTER_DAILY = '10';
await (await import('../server/db.js')).setMeta('computer_usage', { day: 'x', n: 0 });
const { runOps } = await import('../server/docs.js');
const { runWorker } = await import('../server/runtime.js');
const T = ops => runOps(ops, { allowLease: true });
polls = -1;
await T([{ op: 'write', c: 'tasks', id: 't-pc', ops: { set: { id: 't-pc', title: 'Informe de ventas en Excel', instructions: 'ORDENADORPRUEBA prepara el Excel', agentId: 'alex', state: 'en_cola', createdAt: Date.now(), logs: [] } } }]);
const r = await runWorker({ softMs: 25000, hardMs: 30000 });
assert.equal(r.ran, true, r.reason);
const task = (await T([{ op: 'get', c: 'tasks', id: 't-pc' }]))[0].data;
assert.equal(task.state, 'completada', JSON.stringify(task.logs && task.logs.slice(-6)));
assert.ok(task.logs.some(l => /ordenador en la nube/i.test(JSON.stringify(l))), 'pasó por el ordenador');
const dlv = (await T([{ op: 'get', c: 'deliverables', id: task.resultId }]))[0].data;
assert.equal(dlv.files[0].name, 'ventas.xlsx');
assert.ok(task.computerUsd > 0);
ok('tarea: espera a su ordenador en el worker, continúa con el resultado y el entregable incluye los archivos');
console.log('\n' + n + ' pruebas del ordenador en la nube superadas');
process.exit(0);
