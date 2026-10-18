// Admission/accounting per provider request, shared by browser and workers.
import { tx, ensureSchema } from './db.js';
import { getDoc } from './docs.js';
export class UsageError extends Error { constructor(code, message) { super(message || code); this.code = code; } }
export function usageContext(value) {
  const out = {};
  for (const key of ['agentId', 'projectId', 'planId']) {
    const id = value && value[key];
    if (id == null) { out[key] = null; continue; }
    if (typeof id !== 'string' || !/^[\w.~:@+-]{1,160}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new UsageError('invalid_request', 'Contexto de consumo no válido.');
    out[key] = id;
  }
  return out;
}
export function usageDay(timezone) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (_) { return usageDay('Europe/Madrid'); }
}
async function read(run, collection, id) {
  const r = await run('SELECT data FROM lc_docs WHERE collection=$1 AND id=$2 AND NOT deleted', [collection, id]);
  return r.rows[0] ? r.rows[0].data : null;
}
async function save(run, collection, id, data) {
  await run(`INSERT INTO lc_docs (collection,id,data) VALUES ($1,$2,$3::jsonb)
    ON CONFLICT (collection,id) DO UPDATE SET data=excluded.data, deleted=false,
    v=lc_docs.v+1, seq=nextval('lc_seq'), updated_at=clock_timestamp()`, [collection, id, JSON.stringify({ ...data, id })]);
}
function groups(u, ctx) {
  u.byAgent ||= {}; u.byProject ||= {};
  const agent = u.byAgent[ctx.agentId || '_general'] ||= { calls: 0, inTok: 0, outTok: 0 };
  const project = u.byProject[ctx.projectId || '_general'] ||= { calls: 0, inTok: 0, outTok: 0 };
  return [u, agent, project];
}
// Separate quota counters cannot be reset by a stale tab or restoring a UI document.
async function quota(run, key, initial, limit, code) {
  const r = await run('SELECT v FROM lc_meta WHERE k=$1', [key]);
  const calls = r.rows[0] ? r.rows[0].v.calls : (Number(initial) || 0);
  if (calls >= limit) throw new UsageError(code);
  await run(`INSERT INTO lc_meta (k,v) VALUES ($1,$2::jsonb)
    ON CONFLICT (k) DO UPDATE SET v=excluded.v, updated_at=now()`, [key, JSON.stringify({ calls: calls + 1 })]);
  return calls + 1;
}
export async function reserveCall(value) {
  await ensureSchema();
  const context = usageContext(value);
  const config = (await getDoc('config', 'main')).data || {};
  const day = usageDay(config.timezone || process.env.LC_TIMEZONE);
  return tx(async run => {
    const keys = ['usage/' + day]; if (context.planId) keys.push('plans/' + context.planId);
    for (const key of keys.sort()) await run('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
    const u = await read(run, 'usage', day) || { id: day, calls: 0, inTok: 0, outTok: 0 };
    const dailyLimit = Math.max(1, Math.min(2000, Number(config.dailyCalls) || 150));
    const dailyCalls = await quota(run, 'quota/day/' + day, u.calls, dailyLimit, 'daily_limit');
    if (context.planId) {
      const plan = await read(run, 'plans', context.planId);
      if (!plan || (plan.projectId || null) !== context.projectId) throw new UsageError('invalid_request', 'El plan no corresponde al proyecto.');
      plan.calls = await quota(run, 'quota/plan/' + context.planId, plan.calls, Number(plan.maxCalls) || 40, 'plan_limit');
      await save(run, 'plans', context.planId, plan);
    }
    for (const g of groups(u, context)) g.calls = (g.calls || 0) + 1;
    u.calls = dailyCalls;
    u.requestAccounting = true;
    await save(run, 'usage', day, u);
    return { day, context };
  });
}
export async function recordUsage(reservation, usage, provider, model, failed) {
  const { day, context } = reservation;
  await tx(async run => {
    await run('SELECT pg_advisory_xact_lock(hashtext($1))', ['usage/' + day]);
    const u = await read(run, 'usage', day);
    const amounts = { inTok: Math.max(0, Number(usage.in) || 0), outTok: Math.max(0, Number(usage.out) || 0), searches: Math.max(0, Number(usage.searches) || 0) };
    for (const g of groups(u, context)) for (const [key, amount] of Object.entries(amounts)) g[key] = (g[key] || 0) + amount;
    u.byModel ||= {};
    const key = provider + ':' + model;
    const m = u.byModel[key] ||= { calls: 0, inTok: 0, outTok: 0, searches: 0 };
    m.calls++; for (const [k, amount] of Object.entries(amounts)) m[k] = (m[k] || 0) + amount;
    if (failed) u.failedCalls = (u.failedCalls || 0) + 1;
    await save(run, 'usage', day, u);
  });
}
