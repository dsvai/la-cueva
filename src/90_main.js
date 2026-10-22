/* ============================================================
   LA CUEVA · documentación interna y arranque
   ============================================================ */
const ARCH_MD = `## Cómo está construida esta versión

**Frontend (esta app):** oficina 3D isométrica con Three.js, directorio, chat y paneles. El artefacto incluye el motor; si el navegador no tiene WebGL, mantiene la oficina 2D compatible.

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

const ARCH_SERVER_MD = `## Cómo está construida esta versión (con backend)

**Frontend:** oficina 3D isométrica, directorio, chat y paneles, servidos por Vercel. El motor y los materiales están incluidos en la aplicación; no descarga modelos de terceros. Entras con tu contraseña de administrador; la sesión es una cookie protegida que el navegador no puede leer. Sin WebGL se conserva la oficina 2D compatible.

**Servidor (Vercel Functions):** \`/api/session\` (acceso), \`/api/db\` (datos), \`/api/llm\` (un paso del modelo de IA), \`/api/worker\` (orquestador en segundo plano) y \`/api/health\` (estado). Las claves (IA, base de datos, contraseña) viven solo en variables de entorno de Vercel.

**Datos:** Postgres. Cada colección de La Cueva es una tabla de documentos con versión. Las escrituras son parches (solo lo que cambia) aplicados en una transacción con bloqueo por documento, así tu navegador y el worker no se pisan: los contadores de consumo se suman y las listas (actividad, registros, mensajes) se añaden. Cada dispositivo sincroniza los cambios de los demás cada pocos segundos.

**Orquestador:** el mismo código que en la versión de Claude, ejecutado en el servidor. Trabaja por tandas de hasta 5 minutos: deja de coger tareas antes del límite, devuelve a la cola lo que no termine y lanza la siguiente tanda mientras quede trabajo. Un contrato en la base de datos garantiza que solo un worker ejecute a la vez. Tu navegador avisa al worker cuando hay trabajo nuevo; un cron cada hora recoge programaciones y cualquier resto.

**IA:** Anthropic API u OpenAI API con la clave del servidor. El bucle de herramientas se ejecuta donde están los datos (en tu navegador durante un chat, en el worker durante una tarea); el servidor solo hace cada paso del modelo. Consumo con tokens reales.

## Decisiones de arquitectura

**ADR-005 · Reutilizar el orquestador en el servidor.** Los módulos de datos, memoria, chat y orquestación se cargan tal cual en un contexto aislado de Node. *Consecuencia:* un único comportamiento en las dos versiones y las mismas pruebas.

**ADR-006 · Tandas encadenadas en lugar de un proceso permanente.** El plan Hobby de Vercel limita cada función a 5 minutos y los crons a uno diario. *Consecuencia:* el trabajo largo se reparte en tandas; las programaciones se revisan con 24 crons diarios (uno por hora), con un margen de hasta una hora.

**ADR-007 · Fusión por campos en lugar de bloqueo global.** Escritores concurrentes con parches y fusión a tres bandas. *Consecuencia:* si dos sitios cambian el mismo campo a la vez, gana el último; los contadores y las listas nunca se pierden.`;

const NEXT_SERVER_MD = `## Informe de la Fase 4 (backend)

**1. Implementado de verdad:** servidor en Vercel con acceso por contraseña, base de datos Postgres compartida entre dispositivos, IA por API (Anthropic u OpenAI) con la clave en el servidor, orquestador en segundo plano que trabaja con La Cueva cerrada, cron horario para programaciones y restos, sincronización entre tu navegador y el servidor, y migración desde la versión de Claude con la copia de seguridad.

**2. Cómo probarlo:** pide a Daniel un trabajo para el equipo, apruébalo y cierra la pestaña. Vuelve en unos minutos: verás las tareas completadas y el informe de Daniel en su chat.

**3. Prototipo o limitado:** las programaciones se revisan una vez por hora; una respuesta muy larga que supere los 5 minutos de una tanda se repite en la siguiente; las imágenes adjuntas no se guardan en el servidor.

**4. Qué necesitas configurar:** en Vercel, la base de datos Neon y las variables ADMIN_PASSWORD, CRON_SECRET y ANTHROPIC_API_KEY (u OPENAI_API_KEY).

**5. Limitaciones detectadas:** cada llamada de IA se factura en tu cuenta del proveedor (no en tu plan de Claude). El límite diario de llamadas de Ajustes protege de sustos.

**6. Siguiente paso recomendado:** primera integración real (Gmail o Drive con OAuth propio y permisos por proyecto) con permisos por proyecto.`;

const NEXT_MD = `## Informe de esta entrega

**1. Implementado de verdad:** identidad de La Cueva con el logotipo oficial; oficina isométrica 3D con 12 espacios y personajes editables, incluido Marco, mánager de alianzas y eventos; navegación con WASD o flechas, joystick en móvil, ratón, zoom y directorio; chat real con todos los agentes (Markdown, código, adjuntos, herramientas, historial por proyecto); proyectos; orquestador con planes, tareas, colaboración, aprobaciones y límites; memoria operativa y normativa; fichas editables y contrataciones; panel de dirección con actividad y consumo reales; tareas programadas.

**2. Cómo probarlo:** abre el chat de Daniel (botón abajo a la derecha) y pídele, por ejemplo, *«Crea un proyecto para mi tienda de gorras y prepara con Alex, Mia y Clara una propuesta de tienda Shopify»*. Verás el plan en el chat; apruébalo y observa en la oficina quién trabaja. El resultado llega como informe de Daniel y como entregables descargables.

**3. Prototipo o limitado:** el orquestador y las tareas programadas solo avanzan con La Cueva abierta; la recuperación de contexto es por palabras clave; el coste es una estimación.

**4. Qué necesitas configurar:** nada para usarla hoy, salvo aceptar el permiso de Claude la primera vez. Para la Fase 4: repositorio en GitHub, proyecto en Vercel, una base de datos y una clave de API (Anthropic u OpenAI) con su facturación.

**5. Limitaciones detectadas:** cada respuesta consume tu uso de Claude; si llegas al límite, las tareas se pausan y se pueden reanudar. PDF y Word se leen en el navegador; los PDF de imágenes los transcribe la IA.

**6. Siguiente paso recomendado:** usarla con un proyecto real durante unos días y, después, abrir el backend en Claude Code sobre tu GitHub y Vercel, empezando por la cola de trabajos con cron y la conexión a Gmail y Drive.`;

(async function boot() {
  TouchControls.viewport();
  const logo = new Image(); logo.onload = () => { World.setLogo(logo); View.rebuildStatic(); }; logo.src = LOGO_SRC;
  View.init($('#world'), { statusOf: id => Orch.agentStatus(id), onSelect: UI.onSelect, onOpenChat: id => ChatUI.open(id) });
  UI.header();
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
  Bus.on('store:agents', () => View.setAgents(Roster.enabled()));
  Bus.on('store:error', e => toast('No se pudo guardar un cambio: ' + ((e && e.message) || 'error desconocido'), true));
  Bus.on('ai:status', UI.sysPills);
  Sched.tick(); setInterval(Sched.tick, 30000);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => View.rebuildStatic());
  if (n) toast(n + ' tarea(s) quedaron interrumpidas al cerrar. Reanúdalas desde el panel de Dirección.');
  else toast(Store.all('convs').length ? 'Bienvenido de nuevo a La Cueva.' : (matchMedia('(pointer:coarse),(max-width:760px)').matches ? 'Muévete con el joystick. Toca a cualquier trabajador para hablar con él.' : 'Muévete con WASD o las flechas. Haz clic en cualquier trabajador para hablar con él.'));
  window.__lc = { Store, Orch, AI, View, Roster, Chat, Config };
})();
