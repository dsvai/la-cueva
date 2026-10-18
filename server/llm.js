/* ============================================================
   LA CUEVA · proveedores de IA en el servidor
   Las claves viven solo en variables de entorno de Vercel:
     ANTHROPIC_API_KEY  (Anthropic API, facturación en console.anthropic.com)
     OPENAI_API_KEY     (OpenAI API, facturación en platform.openai.com;
                         una suscripción a ChatGPT NO da acceso a la API)
   AI_PROVIDER fuerza uno ('anthropic' | 'openai'); si no, se usa el que tenga clave.
   Una llamada = un paso del modelo. El bucle de herramientas vive en
   shared/remote.cjs, porque las herramientas se ejecutan donde están los datos.
   ============================================================ */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const TIERS = ['quick', 'default', 'complex'];
const DEF_MODELS = {
  anthropic: { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5', complex: 'claude-opus-5-5' },
  openai: { quick: 'gpt-5-mini', default: 'gpt-5', complex: 'gpt-5' },
  mock: { quick: 'mock-rapido', default: 'mock', complex: 'mock-avanzado' }
};
const ENV_TIER = { quick: 'QUICK', default: 'DEFAULT', complex: 'COMPLEX' };

export class LlmError extends Error { constructor(code, message) { super(message || code); this.code = code; } }

export function provider() {
  const forced = (process.env.AI_PROVIDER || '').toLowerCase();
  if (forced === 'mock') return process.env.LC_ALLOW_MOCK === '1' ? 'mock' : null;
  if (forced === 'anthropic') return process.env.ANTHROPIC_API_KEY ? 'anthropic' : null;
  if (forced === 'openai') return process.env.OPENAI_API_KEY ? 'openai' : null;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}
export function modelFor(p, tier) {
  const t = TIERS.includes(tier) ? tier : 'default';
  const env = process.env[(p === 'anthropic' ? 'ANTHROPIC' : 'OPENAI') + '_MODEL_' + ENV_TIER[t]];
  return (p !== 'mock' && env) || DEF_MODELS[p][t];
}
export function info() {
  const p = provider();
  return { provider: p, models: p ? Object.fromEntries(TIERS.map(t => [t, modelFor(p, t)])) : null, maxTokens: maxTokens('default') };
}
function maxTokens(tier) { const n = parseInt(process.env.AI_MAX_TOKENS || '', 10); return n > 256 ? n : (tier === 'complex' ? 16000 : 8000); }

/* ---------- conversión desde el formato neutro ---------- */
// mensaje: { role: 'user'|'assistant', content: string | bloques }
// bloques: {type:'text',text} {type:'image',mediaType,data} {type:'tool_call',id,name,input} {type:'tool_result',id,content,isError}
function blocks(content) { return typeof content === 'string' ? [{ type: 'text', text: content }] : (Array.isArray(content) ? content : []); }
function mergeRoles(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const b = blocks(m.content).flatMap(x => (x && x.type === 'provider_raw' && x.provider !== 'anthropic') ? rawToNeutral(x.blocks) : [x]).filter(x => x && (x.type !== 'text' || x.text));
    if (!b.length) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content.push(...b); else out.push({ role: m.role, content: b.slice() });
  }
  if (out.length && out[0].role !== 'user') out.unshift({ role: 'user', content: [{ type: 'text', text: '…' }] });
  return out;
}

function toolResultContent(b) {
  const imgs = Array.isArray(b.images) ? b.images.filter(i => i && i.data) : [];
  if (!imgs.length) return String(b.content || '');
  return [{ type: 'text', text: String(b.content || '') || '…' }].concat(imgs.slice(0, 6).map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType || 'image/jpeg', data: i.data } })));
}
function toAnthropic(messages) {
  return mergeRoles(messages).map(m => ({
    role: m.role,
    content: m.content.flatMap(b => {
      if (b.type === 'provider_raw') return b.provider === 'anthropic' && Array.isArray(b.blocks) ? b.blocks : [];
      if (b.type === 'text') return [{ type: 'text', text: b.text }];
      if (b.type === 'image') return [{ type: 'image', source: { type: 'base64', media_type: b.mediaType, data: b.data } }];
      if (b.type === 'tool_call') return [{ type: 'tool_use', id: b.id, name: b.name, input: b.input || {} }];
      if (b.type === 'tool_result') return [{ type: 'tool_result', tool_use_id: b.id, content: toolResultContent(b), is_error: !!b.isError }];
      return [];
    })
  }));
}
/* bloques originales de Anthropic a formato neutro (para otros proveedores) */
function rawToNeutral(blocks) {
  const out = [];
  for (const x of blocks || []) {
    if (x.type === 'text' && x.text) out.push({ type: 'text', text: x.text });
    else if (x.type === 'tool_use') out.push({ type: 'tool_call', id: x.id, name: x.name, input: x.input || {} });
  }
  return out;
}

function toOpenAI(messages) {
  const out = [];
  for (const m of mergeRoles(messages)) {
    if (m.role === 'assistant') {
      const text = m.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n');
      const calls = m.content.filter(b => b.type === 'tool_call').map(b => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) } }));
      out.push(Object.assign({ role: 'assistant', content: text || null }, calls.length ? { tool_calls: calls } : {}));
    } else {
      const toolImgs = [];
      for (const b of m.content.filter(x => x.type === 'tool_result')) { out.push({ role: 'tool', tool_call_id: b.id, content: String(b.content || '') }); for (const i of (b.images || [])) toolImgs.push({ type: 'image', mediaType: i.mediaType || 'image/jpeg', data: i.data }); }
      const parts = m.content.filter(b => b.type === 'text' || b.type === 'image').concat(toolImgs).map(b => b.type === 'text' ? { type: 'text', text: b.text } : { type: 'image_url', image_url: { url: 'data:' + b.mediaType + ';base64,' + b.data } });
      if (toolImgs.length && parts.length === toolImgs.length) parts.unshift({ type: 'text', text: 'Imágenes devueltas por la herramienta:' });
      if (parts.length) out.push({ role: 'user', content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts });
    }
  }
  return out;
}

function mapError(e, signal) {
  if (signal && signal.aborted) return new LlmError('cancelled');
  if (e instanceof LlmError) return e;
  const st = e && (e.status || (e.response && e.response.status));
  const msg = String((e && e.message) || '');
  if (e && (e.name === 'AbortError' || /aborted/i.test(msg))) return new LlmError('cancelled');
  if (st === 429) return new LlmError('rate_limited');
  if (st === 401 || st === 403) return new LlmError('provider_auth');
  if (st === 404) return new LlmError('model_not_found');
  if (st === 400 || st === 413) {
    if (/too long|context|too many tokens|maximum context/i.test(msg)) return new LlmError('prompt_too_large');
    if (/image/i.test(msg)) return new LlmError('image_rejected');
    return new LlmError('invalid_request', msg.slice(0, 300));
  }
  return new LlmError('upstream_error');
}

/* ---------- Anthropic ---------- */
async function anthropicStep(req) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 280000 });
  const params = { model: req.modelId, max_tokens: maxTokens(req.tier), messages: toAnthropic(req.messages) };
  if (req.tools && req.tools.length) params.tools = req.tools.map(t => ({ name: t.name, description: t.description || '', input_schema: t.inputSchema || { type: 'object', properties: {} } }));
  if (req.web) params.tools = (params.tools || []).concat([{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }, { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 5, max_content_tokens: 20000 }]);
  const stream = client.messages.stream(params, { signal: req.signal });
  let cum = '';
  stream.on('text', d => { cum += d; if (req.onText) req.onText(d, cum); });
  const msg = await stream.finalMessage();
  let text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const toolCalls = msg.content.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, input: b.input || {} }));
  const stop = msg.stop_reason === 'tool_use' ? 'tool_use' : msg.stop_reason === 'max_tokens' ? 'max_tokens' : msg.stop_reason === 'refusal' ? 'refusal' : msg.stop_reason === 'pause_turn' ? 'pause' : 'end';
  // fuentes citadas en búsquedas web
  const src = new Map();
  for (const b of msg.content) if (b.type === 'text' && Array.isArray(b.citations)) for (const c of b.citations) if (c.url && !src.has(c.url)) src.set(c.url, c.title || c.url);
  const searches = (msg.usage && msg.usage.server_tool_use && msg.usage.server_tool_use.web_search_requests) || 0;
  if (src.size && stop !== 'tool_use' && stop !== 'pause') text += '\n\n**Fuentes:**\n' + [...src].slice(0, 12).map(([u, t]) => '- [' + String(t).replace(/[\[\]]/g, '') + '](' + u + ')').join('\n');
  const hasServer = msg.content.some(b => b.type === 'server_tool_use' || /_tool_result$/.test(b.type));
  return { text, toolCalls, stop, usage: { in: (msg.usage && msg.usage.input_tokens) || 0, out: (msg.usage && msg.usage.output_tokens) || 0, searches }, model: msg.model || req.modelId, raw: hasServer || stop === 'pause' ? msg.content : undefined };
}

/* ---------- OpenAI ---------- */
async function openaiStep(req) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2, timeout: 280000 });
  const params = { model: req.modelId, messages: toOpenAI(req.messages), max_completion_tokens: maxTokens(req.tier), stream: true, stream_options: { include_usage: true } };
  if (req.tools && req.tools.length) params.tools = req.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.inputSchema || { type: 'object', properties: {} } } }));
  const stream = await client.chat.completions.create(params, { signal: req.signal });
  let text = '', finish = null, usage = { in: 0, out: 0 }, model = req.modelId; const calls = [];
  for await (const ch of stream) {
    if (ch.model) model = ch.model;
    if (ch.usage) usage = { in: ch.usage.prompt_tokens || 0, out: ch.usage.completion_tokens || 0 };
    const c = ch.choices && ch.choices[0]; if (!c) continue;
    if (c.delta && c.delta.content) { text += c.delta.content; if (req.onText) req.onText(c.delta.content, text); }
    for (const tc of (c.delta && c.delta.tool_calls) || []) {
      const i = tc.index || 0; const cur = calls[i] || (calls[i] = { id: '', name: '', args: '' });
      if (tc.id) cur.id = tc.id; if (tc.function && tc.function.name) cur.name += tc.function.name; if (tc.function && tc.function.arguments) cur.args += tc.function.arguments;
    }
    if (c.finish_reason) finish = c.finish_reason;
  }
  const toolCalls = calls.filter(Boolean).map(c => { let input = {}; try { input = c.args ? JSON.parse(c.args) : {}; } catch (_) { input = {}; } return { id: c.id || ('call_' + Math.random().toString(36).slice(2)), name: c.name, input }; });
  const stop = toolCalls.length && finish === 'tool_calls' ? 'tool_use' : finish === 'length' ? 'max_tokens' : finish === 'content_filter' ? 'refusal' : (toolCalls.length ? 'tool_use' : 'end');
  return { text, toolCalls, stop, usage, model };
}

/* ---------- proveedor de pruebas (solo con LC_ALLOW_MOCK=1, nunca en producción) ---------- */
let mockCalls = 0;
async function mockStep(req) {
  mockCalls++;
  const sleep = ms => new Promise((r, j) => { const t = setTimeout(r, ms); if (req.signal) req.signal.addEventListener('abort', () => { clearTimeout(t); j(new LlmError('cancelled')); }, { once: true }); });
  const msgs = req.messages; const last = msgs[msgs.length - 1];
  const lastText = blocks(last.content).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const all = msgs.map(m => blocks(m.content).filter(b => b.type === 'text').map(b => b.text).join('\n')).join('\n');
  const first = blocks(msgs[0].content).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const has = n => (req.tools || []).some(t => t.name === n);
  const results = blocks(last.content).filter(b => b.type === 'tool_result');
  await sleep(/LENTO/.test(all) ? 2500 : 120);
  const done = (text, toolCalls) => { const t = text || ''; if (req.onText && t) { req.onText(t.slice(0, 12), t.slice(0, 12)); req.onText(t.slice(12), t); } return { text: t, toolCalls: toolCalls || [], stop: toolCalls && toolCalls.length ? 'tool_use' : 'end', usage: { in: Math.ceil(all.length / 4), out: Math.ceil(t.length / 4) }, model: 'mock' }; };
  if (results.length) return done('Hecho. ' + results.map(r => r.content + (r.images && r.images.length ? ' [he visto ' + r.images.length + ' imágenes]' : '')).join(' '));
  const call = (name, input) => done('', [{ id: 'mock_' + mockCalls, name, input }]);
  if (/^Eres Daniel/.test(first) && /PLANPRUEBA/.test(lastText) && has('crear_plan')) return call('crear_plan', { titulo: 'Propuesta de tienda Shopify', objetivo: 'Tienda de gorras lista para lanzar' + (/LENTO/.test(lastText) ? ' (LENTO)' : ''), tareas: [
    { clave: 't1', titulo: 'Estructura de tienda y catálogo', instrucciones: 'Define estructura de la tienda Shopify. colabora con mia', responsable: 'alex' },
    { clave: 't2', titulo: 'Textos de la home y fichas', instrucciones: 'Escribe los textos', responsable: 'clara', depende_de: ['t1'] }] });
  if (/REGLAPRUEBA/.test(lastText) && has('proponer_regla_memoria')) return call('proponer_regla_memoria', { alcance: 'agencia', texto: 'Tutea siempre al cliente', motivo: 'Lo pidió el administrador' });
  if (/## TAREA ASIGNADA/.test(all) && /colabora con mia/.test(lastText) && has('pedir_colaboracion')) return call('pedir_colaboracion', { agente: 'mia', peticion: 'Propón la navegación y la home' });
  if (/PAGINASPRUEBA/.test(lastText) && has('ver_paginas_documento')) return call('ver_paginas_documento', { documento: 'plan_texto.pdf', paginas: '1-2' });
  if (/SHOPIFYPRUEBA/.test(lastText) && has('shopify_proponer_cambio')) return call('shopify_proponer_cambio', { accion: 'crear_producto_borrador', titulo: 'Gorra de prueba', descripcion_html: '<p>Prueba</p>', motivo: 'Prueba' });
  if (/APROBACIONPRUEBA/.test(lastText) && has('solicitar_aprobacion')) return call('solicitar_aprobacion', { accion: 'Publicar el tema en producción', detalle: 'Cambios en la home' });
  return done('## Respuesta simulada del servidor\n\nRespuesta de prueba número ' + mockCalls + ' (' + req.modelId + ').\n\n- punto uno\n- punto dos');
}

/* un paso del modelo con reserva al nivel si el modelo concreto no existe */
export async function step(req) {
  const p = provider();
  if (!p) throw new LlmError('no_provider');
  const run = p === 'anthropic' ? anthropicStep : p === 'openai' ? openaiStep : mockStep;
  const explicit = typeof req.model === 'string' && /^[\w.:\-/]{2,80}$/.test(req.model) ? req.model : '';
  const tierModel = modelFor(p, req.tier);
  try {
    return await run(Object.assign({}, req, { modelId: explicit || tierModel }));
  } catch (e) {
    const err = mapError(e, req.signal);
    // si la búsqueda web está desactivada en la organización de Anthropic, se sigue sin ella
    if (req.web && err.code === 'invalid_request' && /web.?(search|fetch)/i.test(String(e && e.message))) {
      try { const r = await run(Object.assign({}, req, { web: false, modelId: explicit || tierModel })); r.text = (r.text || '') + '\n\n_(La búsqueda web está desactivada en tu cuenta de Anthropic: actívala en Settings → Capabilities de la consola.)_'; return r; } catch (e2) { throw mapError(e2, req.signal); }
    }
    if (explicit && (err.code === 'model_not_found' || err.code === 'invalid_request') && explicit !== tierModel) {
      try { return await run(Object.assign({}, req, { modelId: tierModel })); } catch (e2) { throw mapError(e2, req.signal); }
    }
    throw err;
  }
}

/* validación del cuerpo que llega del navegador */
export function validateRequest(b) {
  if (!b || !Array.isArray(b.messages) || !b.messages.length || b.messages.length > 400) throw new LlmError('invalid_request', 'Mensajes no válidos');
  const tools = Array.isArray(b.tools) ? b.tools.slice(0, 20).filter(t => t && typeof t.name === 'string' && /^[\w-]{1,64}$/.test(t.name)) : [];
  return { messages: b.messages, tools, tier: TIERS.includes(b.tier) ? b.tier : 'default', model: typeof b.model === 'string' ? b.model : '', web: !!b.web };
}
