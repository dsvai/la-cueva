// Real roster, prompts, tools and floor plan; isolated memory and fake model only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { character, disposeCharacter } from '../src/studio/characters.js';

let lastCall, modelCalls = 0;
const sample = async (input, opts) => { modelCalls++; lastCall = { input, opts }; return { text: 'Local test', usage: { in: 1, out: 1 } }; };
sample.provider = 'anthropic';
sample.limits = async () => ({ tools: { maxCount: 20 } });
const sprite = () => ({ ax: 0, ay: 0, screens: [] });
const context = vm.createContext({
  console, setTimeout, clearTimeout, setInterval, clearInterval, performance, Blob, AbortController, URL, Intl,
  LC_SERVER: true, LC_RUNTIME: 'worker', toast() {}, View: { setAgents() {} },
  Props: new Proxy({}, { get: (_, name) => name === 'chair'
    ? () => ({ seat: sprite(), back: sprite(), tall: sprite() }) : sprite }),
  claude: { use: async name => name === 'sample' ? sample : null }
});
context.window = context;
const files = ['10_core.js', '11_chars.js', '20_data.js', '30_world.js', '60_store.js', '65_agents.js', '70_ai.js', '72_chat.js', '75_orch.js'];
const rt = vm.runInContext(files.map(f => fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8')).join('\n') +
  '\n;({ Roster, Store, Prompt, Tools, AI, Chat, Orch, World, DEFAULT_AGENTS, TILE });', context);
const { Roster, Store, Prompt, Tools, AI, Chat, Orch, World } = rt;
await Store.init(); await AI.init();
try {
  // Existing installations have saved overrides, not a fresh seed of the roster.
  Store.put('agents', { id: 'daniel', name: 'Daniel personalizado', instructions: 'Instrucciones propias', enabled: true });
  const custom = Roster.create({ name: 'Asistente propio', role: 'Compras', dept: 'VENT' });
  const manager = Roster.get('marco');
  assert.ok(Roster.enabled().some(a => a.id === manager.id));
  assert.equal(Roster.all().filter(a => a.id === 'marco').length, 1);
  assert.equal(Roster.get('daniel').instructions, 'Instrucciones propias');
  assert.ok(Roster.get(custom.id));
  assert.ok(Prompt.preamble(Roster.get('daniel')).includes('marco: Marco — ' + manager.role));
  assert.ok(Prompt.team('daniel').includes('proveedores, festivales, desfiles de moda y eventos'));
  const edited = Roster.get('marco'); edited.name = 'Mi mánager'; edited.instructions = 'Especialización personalizada';
  Roster.save(edited);
  assert.equal(Roster.get('marco').instructions, 'Especialización personalizada');
  edited.enabled = false; Roster.save(edited);
  assert.ok(!Roster.enabled().some(a => a.id === 'marco'));
  assert.ok(!Prompt.team('daniel').includes('marco:'));
  Store.del('agents', 'marco');
  console.log('✓ manager joins saved teams, is available to Daniel and retains editable overrides');

  const project = Store.put('projects', { id: 'manager-project', name: 'Marca de prueba', objectives: 'Colaboraciones en moda' });
  const other = Store.put('projects', { id: 'other-project', name: 'Otro proyecto' });
  for (const [id, p, text] of [['current-doc', project, 'Festival objetivo: dossier privado del proyecto actual'], ['other-doc', other, 'Festival confidencial de otro proyecto']]) {
    Store.put('pdocs', { id, projectId: p.id, name: id });
    Store.put('ptext', { id, text });
  }
  const ctx = { agent: manager, project, mode: 'chat', events: [], signals: {} };
  const tools = Tools.build(manager, ctx), names = tools.map(t => t.name);
  for (const name of ['consultar_documentos', 'registrar_decision', 'solicitar_aprobacion', 'escalar_a_daniel']) assert.ok(names.includes(name));
  for (const name of ['crear_plan', 'programar_tarea', 'proponer_contratacion', 'crear_proyecto']) assert.ok(!names.includes(name));
  assert.equal(manager.perms.otros_proyectos, false);
  const docs = await tools.find(t => t.name === 'consultar_documentos').execute({ consulta: 'festival' });
  assert.ok(docs.includes('dossier privado')); assert.ok(!docs.includes('confidencial'));
  await tools.find(t => t.name === 'registrar_decision').execute({ texto: 'Candidatura por verificar' });
  assert.equal(Store.all('notes').at(-1).projectId, project.id);
  const prompt = Prompt.preamble(manager, { project });
  assert.ok(prompt.includes('Marca de prueba')); assert.ok(!prompt.includes('Otro proyecto'));
  assert.ok(prompt.includes('web_search'));
  await AI.call({ agent: manager, input: prompt, tools, projectId: project.id });
  assert.equal(lastCall.opts.web, true); assert.equal(lastCall.opts.context.agentId, 'marco');
  assert.equal(lastCall.opts.context.projectId, project.id);
  const restricted = Roster.get('marco'); restricted.perms.internet = false;
  await AI.call({ agent: restricted, input: 'Local test' });
  assert.ok(!lastCall.opts.web);
  assert.ok(!Prompt.preamble(restricted, { project }).includes('web_search'));
  console.log('✓ research respects internet permission, specialist tools and project isolation');

  // Daniel can assign him work without inventing a new custom agent.
  const plan = Orch.createPlan({ titulo: 'Preparar alianzas', tareas: [
    { clave: 'opportunities', titulo: 'Priorizar oportunidades', responsable: 'marco' }
  ] }, { projectId: project.id });
  assert.equal(Store.get('tasks', plan.taskIds[0]).agentId, 'marco');
  assert.equal(Store.get('tasks', plan.taskIds[0]).projectId, project.id);
  const station = World.stations.marco;
  assert.equal(station.room, 'VENT');
  const occupied = Object.values(World.stations).map(s => s.seat.x + ':' + s.seat.y);
  assert.equal(new Set(occupied).size, occupied.length, 'every default character has a separate seat');
  const start = World.nearestFree(Math.floor(World.spawn.x / rt.TILE), Math.floor(World.spawn.y / rt.TILE));
  const path = World.findPath(start.x, start.y, station.stand.tx, station.stand.ty);
  assert.ok(path && path.length, 'the manager desk is reachable from reception');
  assert.ok(path.every(p => World.walk(p.x, p.y)));
  assert.equal(World.assignSpare(custom.id, 'VENT').room, 'VENT', 'a spare remains for custom agents');
  const avatar = character(manager.avatar);
  assert.ok(avatar.root.children.length); disposeCharacter(avatar);
  console.log('✓ delegated tasks, distinct 3D character and reachable sales workstation');

  const essential = ['daniel', 'marco', 'alex', 'mia', 'kai'];
  for (const a of Roster.all()) Roster.setEnabled(a.id, essential.includes(a.id));
  assert.deepEqual(Array.from(Roster.enabled(), a => a.id).sort(), essential.slice().sort());
  assert.equal(Store.get('agents', 'leo').avatar, undefined, 'toggling a default must not freeze its profile or avatar');
  assert.equal(Roster.get('daniel').instructions, 'Instrucciones propias');
  assert.ok(!Prompt.team('daniel').includes('leo:'));
  assert.throws(() => Orch.createPlan({ titulo: 'Inactive assignee', tareas: [{ titulo: 'Test', responsable: 'leo' }] }), /desactivado/);
  console.log('✓ a five-person team persists without overwriting profiles or assigning inactive specialists');

  const before = JSON.stringify(Roster.get('marco').avatar), instructions = Roster.get('marco').instructions;
  const conv = Chat.ensureConv('marco', project.id);
  Chat.post(conv.id, { role: 'user', text: 'Historial conservado' });
  const docCount = Store.all('pdocs').length, callsBefore = modelCalls;
  const stale = Roster.get('marco');
  Roster.setEnabled('marco', false);
  const result = await Chat.send(conv.id, 'No debe ejecutarse', [{ kind: 'text', name: 'No importar', doc: true, text: 'Privado' }]);
  assert.equal(result, null); assert.equal(modelCalls, callsBefore);
  assert.equal(Store.all('pdocs').length, docCount);
  assert.equal((await Chat.messages(conv.id)).length, 1, 'deactivation must preserve chat history without adding messages');
  await assert.rejects(() => AI.call({ agent: stale, input: 'Stale profile' }), e => e.code === 'agent_disabled');
  Roster.setEnabled('marco', true);
  assert.equal(JSON.stringify(Roster.get('marco').avatar), before);
  assert.equal(Roster.get('marco').instructions, instructions);
  assert.ok(Prompt.team('daniel').includes('marco:'));
  await AI.call({ agent: Roster.get('marco'), input: 'Reactivated' });
  assert.equal(modelCalls, callsBefore + 1);
  assert.throws(() => Roster.setEnabled('missing-agent', true), /no existe/);
  console.log('✓ deactivation blocks new chat/model calls; reactivation retains avatar, instructions, documents and history');
} finally {
  Orch.setHold(true); await Store.flush();
}
