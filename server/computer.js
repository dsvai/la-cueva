/* ============================================================
   LA CUEVA · ordenador en la nube para los agentes (Claude Managed Agents)
   Cada encargo abre una sesión con su propio ordenador: terminal, archivos,
   búsqueda web y las habilidades de Office/PDF de Anthropic. Los archivos que el
   agente guarda en /mnt/session/outputs/ quedan en la Files API de Anthropic y se
   descargan desde La Cueva a través del servidor (la clave nunca sale de aquí).
   - Se factura en la cuenta de API de Anthropic: tiempo de sesión activa + tokens.
   - Límites: encargos por día (LC_COMPUTER_DAILY, por defecto 10) y tope de coste
     por encargo (LC_COMPUTER_MAX_USD, por defecto 2 $).
   - El ordenador no tiene credenciales de las integraciones: para tocar Shopify,
     GitHub o Gmail los agentes siguen usando sus herramientas con aprobación.
   ============================================================ */
import Anthropic from '@anthropic-ai/sdk';
import { toFile } from '@anthropic-ai/sdk';
import { getMeta, setMeta } from './db.js';

const BETA = 'managed-agents-2026-04-01';
const AGENT_VERSION = 3;   // súbelo si cambia la definición base del agente
const SKILLS = ['xlsx', 'docx', 'pptx', 'pdf'];
let factory = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });
export function _setClientFactory(f) { factory = f; }      // solo pruebas
export class ComputerError extends Error { constructor(code, message) { super(message); this.code = code; this.expose = true; } }
export function available() { return !!process.env.ANTHROPIC_API_KEY || factory._mock === true; }
const client = () => { if (!available()) throw new ComputerError('not_configured', 'El ordenador en la nube necesita la clave de Anthropic API (ANTHROPIC_API_KEY) en Vercel.'); return factory(); };
const model = () => process.env.LC_COMPUTER_MODEL || process.env.ANTHROPIC_MODEL_DEFAULT || 'claude-sonnet-5-5';
const madridDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

const BASE_SYSTEM = `Eres el ordenador de trabajo de un agente de La Cueva, una agencia digital. Tienes terminal (bash), archivos, búsqueda y lectura web y habilidades para crear Excel, Word, PowerPoint y PDF.
- Haz el trabajo de verdad: ejecuta el código, comprueba los resultados y corrige los errores antes de terminar.
- Los documentos del proyecto que te pasen están en /mnt/session/uploads/ (solo lectura).
- Guarda TODOS los archivos finales para el cliente en /mnt/session/outputs/ con nombres claros en español. Lo que no esté ahí se pierde.
- No tienes acceso a las cuentas del cliente (tiendas, correo, repositorios) ni debes intentar conseguirlo. No publiques nada en internet ni envíes mensajes a nadie.
- No inventes datos: si algo no se puede comprobar, dilo.
- Termina con un resumen breve en español: qué has hecho, qué archivos has dejado en outputs y qué queda pendiente o supuesto.`;

async function ensureEnvironment(c) {
  const m = await getMeta('computer_env');
  if (m && m.id) return m.id;
  const env = await c.beta.environments.create({ name: 'la-cueva', description: 'Ordenadores de los agentes de La Cueva', config: { type: 'cloud', networking: { type: 'unrestricted' } }, betas: [BETA] });
  await setMeta('computer_env', { id: env.id, at: Date.now() });
  return env.id;
}
async function ensureAgent(c) {
  const m = await getMeta('computer_agent');
  if (m && m.id && m.v === AGENT_VERSION && m.model === model()) return { id: m.id, skills: m.skills };
  const base = { name: 'La Cueva · ordenador', model: model(), system: BASE_SYSTEM, tools: [{ type: 'agent_toolset_20260401', default_config: { enabled: true, permission_policy: { type: 'always_allow' } } }], betas: [BETA] };
  let agent, skills = true;
  try { agent = await c.beta.agents.create(Object.assign({}, base, { skills: SKILLS.map(s => ({ type: 'anthropic', skill_id: s })) })); }
  catch (e) { skills = false; agent = await c.beta.agents.create(base); }   // si las habilidades no están disponibles en la cuenta, sin ellas
  await setMeta('computer_agent', { id: agent.id, v: AGENT_VERSION, model: model(), skills, at: Date.now() });
  return { id: agent.id, skills };
}
async function reserveDaily() {
  const max = Math.max(0, parseInt(process.env.LC_COMPUTER_DAILY || '10', 10));
  const day = madridDay(), k = 'computer_usage', u = (await getMeta(k)) || {};
  const n = u.day === day ? u.n || 0 : 0;
  if (n >= max) throw new ComputerError('daily_limit', 'Se ha alcanzado el límite diario de encargos al ordenador en la nube (' + max + '). Mañana se reinicia, o súbelo con LC_COMPUTER_DAILY en Vercel.');
  await setMeta(k, { day, n: n + 1 });
}

/* abre una sesión con el encargo; documentos = [{ nombre, texto }] ya filtrados por proyecto */
export async function start({ projectId, agentName, agentRole, projectName, encargo, documentos }) {
  const task = String(encargo || '').trim();
  if (task.length < 10) throw new ComputerError('invalid', 'Describe el encargo con más detalle.');
  if (task.length > 30000) throw new ComputerError('invalid', 'El encargo es demasiado largo; resume y pasa los datos como documentos.');
  const c = client();
  await reserveDaily();
  const [envId, agent] = await Promise.all([ensureEnvironment(c), ensureAgent(c)]);
  const resources = [];
  for (const d of (documentos || []).slice(0, 20)) {
    const name = String(d.nombre || 'documento').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 80) + (/\.\w{2,5}$/.test(d.nombre || '') ? '.txt' : '.txt');
    const f = await c.beta.files.upload({ file: await toFile(Buffer.from(String(d.texto || ''), 'utf8'), name, { type: 'text/plain' }), betas: ['files-api-2025-04-14'] });
    resources.push({ type: 'file', file_id: f.id, mount_path: '/' + name });
  }
  const who = (agentName ? agentName + (agentRole ? ', ' + agentRole : '') : 'Un agente') + (projectName ? ' (proyecto «' + projectName + '»)' : '');
  const text = 'Encargo de ' + who + ':\n\n' + task + (resources.length ? '\n\nDocumentos del proyecto disponibles en /mnt/session/uploads/: ' + resources.map(r => r.mount_path.slice(1)).join(', ') : '');
  const maxUsd = Math.max(.2, Math.min(50, Number(process.env.LC_COMPUTER_MAX_USD || 2)));
  const s = await c.beta.sessions.create({
    agent: agent.id, environment_id: envId, title: ('La Cueva · ' + (agentName || 'agente') + ' · ' + task.slice(0, 60)).slice(0, 120),
    metadata: { project: String(projectId || '').slice(0, 100), app: 'la-cueva' }, resources,
    budget: { type: 'limit', max_list_cost: { amount: maxUsd.toFixed(2), currency: 'USD' } },
    initial_events: [{ type: 'user.message', content: [{ type: 'text', text }] }], betas: [BETA]
  });
  return { sessionId: s.id, startedAt: Date.now(), maxUsd };
}

/* estado de una sesión; si ha terminado, el resumen final y los archivos de salida */
export async function status(sessionId, { withResult = true } = {}) {
  if (!/^[\w-]{6,120}$/.test(String(sessionId || ''))) throw new ComputerError('invalid', 'Sesión no válida.');
  const c = client();
  const s = await c.beta.sessions.retrieve(sessionId, { betas: [BETA] });
  const done = s.status === 'idle' || s.status === 'terminated';
  const out = { sessionId, status: s.status, done, activeSeconds: (s.stats && s.stats.active_seconds) || 0 };
  if (!done || !withResult) return out;
  const texts = [], usage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }; let stop = null, error = null;
  for await (const ev of c.beta.sessions.events.list(sessionId, { order: 'asc', betas: [BETA] })) {
    if (ev.type === 'agent.message') for (const b of ev.content || []) if (b.type === 'text') texts.push(b.text);
    if (ev.type === 'span.model_request_end' && ev.model_usage) { usage.in += ev.model_usage.input_tokens || 0; usage.out += ev.model_usage.output_tokens || 0; usage.cacheRead += ev.model_usage.cache_read_input_tokens || 0; usage.cacheWrite += ev.model_usage.cache_creation_input_tokens || 0; }
    if (ev.type === 'session.status_idle') stop = ev.stop_reason && ev.stop_reason.type;
    if (ev.type === 'session.error') error = (ev.error && (ev.error.message || ev.error.type)) || 'error';
  }
  // los archivos pueden tardar unos segundos en aparecer después de quedar inactiva
  let files = [];
  for (let i = 0; i < 3; i++) {
    files = [];
    for await (const f of c.beta.files.list({ scope_id: sessionId, betas: [BETA, 'files-api-2025-04-14'] })) files.push({ id: f.id, name: f.filename, size: f.size_bytes, type: f.mime_type });
    if (files.length || i === 2) break;
    await new Promise(r => setTimeout(r, 2500));
  }
  const final = texts.slice(-3).join('\n\n').trim();
  return Object.assign(out, { stop, error, summary: final.slice(-12000), files: files.slice(0, 50), usage });
}
export async function stop(sessionId) {
  const c = client();
  try { await c.beta.sessions.events.send(sessionId, { events: [{ type: 'user.interrupt' }], betas: [BETA] }); } catch (_) { /* ya parada */ }
}
/* espera (en el servidor) a que termine, hasta maxMs; pensado para el chat */
export async function waitFor(sessionId, maxMs) {
  const t0 = Date.now();
  for (;;) {
    const st = await status(sessionId, { withResult: false });
    if (st.done) return status(sessionId);
    if (Date.now() - t0 > maxMs) return st;
    await new Promise(r => setTimeout(r, 4000));
  }
}
/* descarga de un archivo de salida (solo si pertenece a una sesión de La Cueva) */
export async function download(fileId) {
  if (!/^file_[\w-]{6,120}$/.test(String(fileId || ''))) throw new ComputerError('invalid', 'Archivo no válido.');
  const c = client();
  const meta = await c.beta.files.retrieveMetadata(fileId, { betas: ['files-api-2025-04-14'] });
  const res = await c.beta.files.download(fileId, { betas: ['files-api-2025-04-14'] });
  return { name: meta.filename, type: meta.mime_type || 'application/octet-stream', body: Buffer.from(await res.arrayBuffer()) };
}
/* coste aproximado: tiempo activo (0,08 $/h) + tokens a tarifa del modelo por defecto */
export function estimateUsd(r, rates) {
  const k = rates || { in: 3, out: 15 };
  const u = r.usage || {};
  return (r.activeSeconds || 0) / 3600 * 0.08 + ((u.in || 0) + (u.cacheWrite || 0) * 1.25 + (u.cacheRead || 0) * 0.1) / 1e6 * k.in + (u.out || 0) / 1e6 * k.out;
}
