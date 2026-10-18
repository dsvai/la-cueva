/* ============================================================
   LA CUEVA · documentación interna y arranque
   ============================================================ */
const ARCH_MD = `## Cómo está construida esta versión

**Frontend (esta app):** oficina pixel art en canvas, directorio, chat y paneles. Todo en un único archivo publicado como app dentro de Claude.

**Datos:** base de datos propia de La Cueva (documentos por colección: proyectos, conversaciones, tareas, entregables, reglas, actividad y consumo). Solo tú puedes leer y escribir. Si se abre fuera de Claude, cae a este navegador y lo indica en la cabecera.

**Orquestación:** cola de tareas persistente con estados (*pendiente → en cola → trabajando → esperando colaboración o aprobación → completada, fallida o cancelada*), dependencias, reintento automático único ante fallos temporales, pausa, cancelación, límites (tareas por plan, llamadas por plan, profundidad de delegación, colaboraciones por tarea, duración, tope diario) y recuperación de tareas interrumpidas al reabrir.

**IA:** cada agente llama a Claude con tu sesión mediante la capacidad *sample* del artefacto. Sin claves en el código. El modelo se elige por nivel (rápido, equilibrado o razonamiento avanzado) o por nombre. La capa está aislada en un único punto para añadir otro proveedor desde un servidor.

**Herramientas de los agentes:** funciones reales de La Cueva (crear planes, pedir colaboración, consultar documentos, registrar decisiones, proponer reglas, pedir aprobaciones, reportar bloqueos, programar). Se ofrecen según los permisos de la ficha; ningún texto puede ampliarlos.

**Memoria:** operativa automática por proyecto y normativa supervisada por ámbitos (agencia, proyecto, cliente, agente). El contexto de cada llamada solo incluye el proyecto en curso.

## Decisiones de arquitectura

**ADR-001 · IA dentro de Claude en lugar de OpenAI API.** Un artefacto no puede guardar claves de forma segura y la API de OpenAI exige servidor y facturación propia. Usar la sesión de Claude da IA real hoy, sin claves. *Consecuencia:* el consumo sale de tu plan de Claude; para otro proveedor hará falta el backend.

**ADR-002 · Orquestador en el cliente, persistente en base de datos.** Permite planes, colaboración y aprobaciones reales sin servidor. *Consecuencia:* solo avanza con la app abierta; el estado sobrevive al cierre y se recupera al volver. El mismo modelo de datos (planes, tareas, hilos y aprobaciones) se puede trasladar a un worker en el servidor.

**ADR-003 · Colaboración en dos fases.** Cuando un agente pide ayuda, su tarea pasa a *esperando colaboración*, la del compañero entra en cola y, al terminar, el solicitante continúa con el resultado. Evita llamadas bloqueadas, deja traza de cada paso y permite límites claros (sin círculos A→B→A, sin duplicados, profundidad máxima).

**ADR-004 · Aprobación como cambio de estado.** Una acción sensible deja la tarea en espera; tu decisión la reanuda con una nota. Aprobar no ejecuta nada externo mientras no existan integraciones.

## Qué cambia con el backend (Fase 4)

Repositorio en GitHub y despliegue en Vercel con funciones de servidor, base de datos (por ejemplo Postgres), cola y cron para trabajo con la app cerrada, credenciales cifradas por proyecto, proveedores de IA configurables (Anthropic u OpenAI por API) e integraciones. Esta app pasa a ser el frontend y la copia de seguridad JSON sirve de migración.`;

const NEXT_MD = `## Informe de esta entrega

**1. Implementado de verdad:** identidad de La Cueva con el logotipo oficial; oficina pixel art 2D con 12 espacios y 22 personajes únicos; navegación con WASD o flechas, ratón, zoom y directorio; chat real con todos los agentes (Markdown, código, adjuntos, herramientas, historial por proyecto); proyectos; orquestador con planes, tareas, colaboración, aprobaciones y límites; memoria operativa y normativa; fichas editables y contrataciones; panel de dirección con actividad y consumo reales; tareas programadas.

**2. Cómo probarlo:** abre el chat de Daniel (botón abajo a la derecha) y pídele, por ejemplo, *«Crea un proyecto para mi tienda de gorras y prepara con Alex, Mia y Clara una propuesta de tienda Shopify»*. Verás el plan en el chat; apruébalo y observa en la oficina quién trabaja. El resultado llega como informe de Daniel y como entregables descargables.

**3. Prototipo o limitado:** el orquestador y las tareas programadas solo avanzan con La Cueva abierta; la recuperación de contexto es por palabras clave; el coste es una estimación.

**4. Qué necesitas configurar:** nada para usarla hoy, salvo aceptar el permiso de Claude la primera vez. Para la Fase 4: repositorio en GitHub, proyecto en Vercel, una base de datos y una clave de API (Anthropic u OpenAI) con su facturación.

**5. Limitaciones detectadas:** cada respuesta consume tu uso de Claude; si llegas al límite, las tareas se pausan y se pueden reanudar. PDF y Word se adjuntan pero no se leen.

**6. Siguiente paso recomendado:** usarla con un proyecto real durante unos días y, después, abrir el backend en Claude Code sobre tu GitHub y Vercel, empezando por la cola de trabajos con cron y la conexión a Gmail y Drive.`;

(async function boot() {
  UI.header();
  const logo = new Image(); logo.onload = () => { World.setLogo(logo); View.rebuildStatic(); }; logo.src = LOGO_SRC;
  View.init($('#world'), { statusOf: id => Orch.agentStatus(id), onSelect: UI.onSelect, onOpenChat: id => ChatUI.open(id) });
  View.setAgents(Roster.enabled());
  Bus.on('view:hover', UI.onHover);
  let pf = 0; Bus.on('view:frame', () => { if (++pf % 3 === 0) UI.placeSel(); });
  UI.sysPills();
  await Promise.all([Store.init(), AI.init()]);
  const cfg = Config.get(); View.showNames = cfg.showNames; View.ambient = cfg.ambient;
  View.setAgents(Roster.enabled());
  Leader.start();
  const n = Orch.recover();
  UI.sysPills(); UI.badges();
  let bt = 0; Bus.on('store:any', () => { clearTimeout(bt); bt = setTimeout(() => { UI.badges(); if ($('#dir').classList.contains('open')) UI.renderDir(); if (UI.selId) UI.onSelect(UI.selId); }, 250); });
  Bus.on('live', () => { if (UI.selId) UI.onSelect(UI.selId); });
  Bus.on('roster', () => View.setAgents(Roster.enabled()));
  Bus.on('store:error', e => toast('No se pudo guardar un cambio: ' + ((e && e.message) || 'error desconocido'), true));
  Bus.on('ai:status', UI.sysPills);
  Sched.tick(); setInterval(Sched.tick, 30000);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => View.rebuildStatic());
  if (n) toast(n + ' tarea(s) quedaron interrumpidas al cerrar. Reanúdalas desde el panel de Dirección.');
  else toast(Store.all('convs').length ? 'Bienvenido de nuevo a La Cueva.' : (matchMedia('(pointer:coarse)').matches ? 'Muévete con la cruceta. Toca a cualquier trabajador para hablar con él.' : 'Muévete con WASD o las flechas. Haz clic en cualquier trabajador para hablar con él.'));
  window.__lc = { Store, Orch, AI, View, Roster, Chat, Config };
})();
