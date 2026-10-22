// Búsqueda y lectura por partes en documentos grandes del proyecto (hojas de cálculo convertidas a texto).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
process.env.ADMIN_PASSWORD = 'local-regression-password-123';
process.env.LC_ALLOW_MOCK = '1'; process.env.AI_PROVIDER = 'mock';
const require = createRequire(import.meta.url);
const { usePglite } = await import('../server/dev.js'); await usePglite();
const { runOps } = await import('../server/docs.js');
const { loadRuntime } = await import('../server/runtime.js');
const R = require('../shared/remote.cjs');
const T = ops => runOps(ops, { allowLease: true });
const db = R.makeRemoteDb(T, { observer: true, pollMs: 60000, full: ['projects', 'pdocs'] }); await db.start();
const B = loadRuntime(db, null, 'browser');
await B.Store.init();
const pid = 'pr-test';
B.Store.put('projects', { id: pid, name: 'Prueba', status: 'activo', createdAt: Date.now() });
B.Store.put('projects', { id: 'pr-otro', name: 'Otro', status: 'activo', createdAt: Date.now() });
// hoja «Eventos»: título + cabecera + 900 filas, una sola línea en blanco al principio
const rows = ['Hoja: Eventos', '', 'Evento | Ciudad | Fecha | Tipo | Contacto'];
for (let i = 0; i < 900; i++) rows.push('Evento ' + i + ' | ' + ['Milán', 'París', 'Berlín', 'Londres'][i % 4] + ' | 2027-0' + (1 + i % 9) + '-1' + (i % 9) + ' | ' + (i % 3 ? 'Feria' : 'Desfile') + ' | info' + i + '@ejemplo.test');
rows[700] = 'Pitti Uomo Florencia | Florencia | 2027-01-12 | Feria de moda masculina | prensa@pitti.test';
const text = rows.join('\n');
const add = (id, p, name, t) => { B.Store.put('pdocs', { id, projectId: p, name, size: t.length, ts: Date.now() }); B.Store.put('ptext', { id, text: t }); };
add('pd-ev', pid, 'Why Hats Europa 2027 · Excel · Eventos', text);
add('pd-x', 'pr-otro', 'Documento de otro cliente', 'Pitti Uomo Florencia confidencial');
await B.Store.flush();
let n = 0; const ok = m => { n++; console.log('✓', m); };

const r = await B.Memory.search(pid, 'Pitti Uomo Florencia', 6);
assert.ok(r.length, 'hay resultados');
assert.match(r[0].text, /Pitti Uomo Florencia/, 'el primer fragmento contiene la fila buscada');
assert.match(r[0].text, /^Evento \| Ciudad \| Fecha/, 'el fragmento lleva la cabecera de la tabla');
assert.ok(!r.some(x => /otro cliente|confidencial/.test(x.src + x.text)), 'no mezcla documentos de otro proyecto');
assert.ok(r[0].text.length <= 1700);
ok('la búsqueda devuelve la fila exacta con su cabecera, también al final de una hoja grande');

const all = await B.Memory.search(pid, 'Desfile Milán', 10);
assert.ok(all.length <= 3, 'como mucho 3 fragmentos por documento');
ok('limita fragmentos por documento');

const p1 = await B.Memory.readPart(pid, 'eventos', 1);
assert.ok(p1.parts >= 4 && p1.part === 1 && p1.text.startsWith('Hoja: Eventos'));
const last = await B.Memory.readPart(pid, 'Why Hats Europa 2027 · Excel · Eventos', 99);
assert.equal(last.part, last.parts); assert.match(last.text, /Evento 899/);
let joined = ''; for (let k = 1; k <= p1.parts; k++) joined += (await B.Memory.readPart(pid, 'eventos', k)).text + '\n';
for (const probe of ['Evento 0 |', 'Pitti Uomo Florencia', 'Evento 450 |', 'Evento 899 |']) assert.ok(joined.includes(probe), 'lectura completa sin huecos: ' + probe);
const miss = await B.Memory.readPart(pid, 'no existe', 1); assert.ok(miss.error);
const cross = await B.Memory.readPart(pid, 'Documento de otro cliente', 1); assert.ok(cross.error, 'no lee documentos de otro proyecto');
ok('lectura por partes completa, ordenada y aislada por proyecto');

const agent = B.Roster.get('marco') || B.Roster.get('hugo');
const tools = B.Tools.build(agent, { mode: 'chat', agent, project: B.Store.get('projects', pid), events: [], signals: {} });
assert.ok(tools.some(t => t.name === 'leer_documento') && tools.some(t => t.name === 'consultar_documentos'));
const out = await tools.find(t => t.name === 'leer_documento').execute({ documento: 'eventos', parte: 2 });
assert.match(out, /parte 2 de \d+/);
ok('herramientas consultar_documentos y leer_documento disponibles para los agentes');
db.stop();
console.log('\n' + n + ' pruebas de documentos superadas');
process.exit(0);
