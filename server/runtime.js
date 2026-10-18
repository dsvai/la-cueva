/* ============================================================
   LA CUEVA · worker del servidor
   Ejecuta el MISMO orquestador que el navegador (src/60–75), sin interfaz,
   dentro de un contexto aislado de Node. Lee y escribe en Postgres y llama al
   proveedor de IA con la clave del servidor. Trabaja por tandas: deja de coger
   tareas nuevas antes del límite de la función y devuelve a la cola lo que no
   termine, para que la siguiente tanda lo continúe.
   ============================================================ */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runOps } from './docs.js';
import { step, provider } from './llm.js';
import { setMeta } from './db.js';

const require = createRequire(import.meta.url);
const remote = require('../shared/remote.cjs');
const FILES = ['10_core.js', '11_chars.js', '20_data.js', '60_store.js', '65_agents.js', '70_ai.js', '72_chat.js', '75_orch.js'];
let CODE = null;

function source() {
  if (CODE) return CODE;
  const dir = path.join(process.cwd(), 'src');
  CODE = 'const toast = () => {}; const View = { setAgents() {} };\n' +
    FILES.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') +
    '\n;({ Store, Orch, Sched, Leader, Activity, Config, Roster, Chat, Bus, AI })';
  return CODE;
}

/* carga los módulos del orquestador en un contexto aislado con la base de datos y la IA dadas */
export function loadRuntime(db, sample, runtime) {
  const g = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, performance, Blob, AbortController, URL, Intl, TextEncoder, TextDecoder, structuredClone, queueMicrotask,
    LC_SERVER: true, LC_RUNTIME: runtime || 'worker'
  };
  g.window = g;
  g.claude = { use: async n => (n === 'db' ? db : n === 'sample' ? sample : null) };
  return vm.runInContext(source(), vm.createContext(g), { filename: 'la-cueva-' + (runtime || 'worker') + '.js' });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function runWorker(opts) {
  opts = opts || {};
  const t0 = Date.now();
  const soft = opts.softMs || 200000;     // a partir de aquí no se cogen tareas nuevas
  const hard = opts.hardMs || 270000;     // a partir de aquí lo que siga en curso vuelve a la cola
  const log = opts.log || (() => {});
  const transport = ops => runOps(ops, { allowLease: true });
  const db = remote.makeRemoteDb(transport, { strictLease: true, pollMs: 2000, full: ['config', 'agents', 'projects', 'convs', 'plans', 'tasks', 'approvals', 'rules', 'notes', 'deliverables', 'schedules', 'pdocs', 'usage', 'activity'] });
  await db.start();
  const sample = provider() ? remote.makeSample(step) : null;
  if (sample) sample.provider = provider();
  const rt = loadRuntime(db, sample, 'worker');
  const { Store, Orch, Sched, Leader, Config, AI } = rt;
  const summary = { startedAt: new Date(t0).toISOString(), ran: false, tasksStarted: 0, more: false, reason: '' };
  rt.Bus.on('store:tasks', () => {});
  try {
    const mode = await Store.init();
    if (mode !== 'db') { summary.reason = 'Sin base de datos'; return summary; }
    await AI.init();
    process.env.TZ = Config.get().timezone || process.env.LC_TIMEZONE || 'Europe/Madrid';
    // contrato: si otro worker ya está trabajando, se espera un poco por si está terminando
    let lead = false;
    for (let i = 0; i < (opts.waitLeaseTries || 8) && !lead; i++) { lead = await Leader.start(); if (!lead) await sleep(3000); }
    if (!lead) { summary.reason = 'Otro worker está trabajando'; await Leader.stop(); return summary; }
    summary.ran = true;
    const before = new Set([...Orch.running.keys()]);
    let idle = 0, lastRecover = Date.now();
    Orch.recover();
    for (;;) {
      const el = Date.now() - t0;
      if (el > soft) break;
      Orch.reconcile();
      if (Date.now() - lastRecover > 30000) { Orch.recover(); lastRecover = Date.now(); }
      Sched.tick();
      Orch.pump();
      for (const id of Orch.running.keys()) before.add(id);
      const busy = Orch.running.size || Orch.consolidating.size || Orch.hasQueued() || Store.pending();
      if (!busy) { if (++idle >= 3) break; } else idle = 0;
      await sleep(1000);
    }
    summary.tasksStarted = before.size;
    Orch.setHold(true);
    while ((Orch.running.size || Orch.consolidating.size) && Date.now() - t0 < hard) { Orch.reconcile(); await sleep(500); }
    let handedOff = false;
    if (Orch.running.size) { handedOff = true; Orch.drain('handoff'); for (let i = 0; i < 40 && Orch.running.size; i++) await sleep(250); }
    await Store.flush(15000);
    summary.more = handedOff || Orch.hasQueued();
    summary.reason = summary.more ? 'Queda trabajo para la siguiente tanda' : 'Sin trabajo pendiente';
    return summary;
  } catch (e) {
    summary.reason = 'Error: ' + (e && e.message ? e.message : String(e));
    log(e);
    return summary;
  } finally {
    try { await Store.flush(5000); } catch (_) { }
    try { await Leader.stop(); } catch (_) { }
    db.stop();
    summary.endedAt = new Date().toISOString(); summary.ms = Date.now() - t0;
    try { if (summary.ran) await setMeta('worker_last', summary); } catch (_) { }
  }
}
