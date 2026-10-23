# La Cueva

Agencia digital de agentes de IA de **La Cueva by Daniel**: estudio 3D isométrico con 23 agentes editables y animados, chat real, proyectos, orquestador de tareas, memoria supervisada y aprobaciones.

**Marco · Mánager de alianzas y eventos** está en Ventas y Crecimiento. Investiga oportunidades, colaboraciones, festivales, desfiles y eventos; compara proveedores y prepara propuestas y negociaciones. Selecciona un proyecto en su chat para darle su documentación y memoria. La investigación web requiere el backend con Anthropic y su permiso de internet activo. Prepara las comunicaciones y acuerdos para revisión; no los envía ni firma. Se incorpora también a las instalaciones con fichas guardadas, conservando las personalizaciones del equipo.

La oficina usa Three.js empaquetado con esbuild, materiales procedurales, cámara ortográfica y mobiliario agrupado para reducir llamadas de dibujo. Conserva el plano lógico y las rutas del visor anterior, con selección por rayos, zoom, arrastre y controles de pantalla tanto con teclado como con joystick. Los retratos de listas y chats se renderizan a partir del mismo personaje. La animación de trabajo depende del estado real de cada agente. Sin WebGL se activa la vista 2D compatible; los modelos no requieren descargas externas. Ver [diseño y verificación del estudio](docs/isometric-studio.md).

Del mismo código salen dos versiones:

| Versión | Dónde vive | IA | Datos | Segundo plano |
| --- | --- | --- | --- | --- |
| **Artefacto** (`dist/la-cueva.html`) | Dentro de Claude | Tu sesión de Claude (`sample`) | Base de datos del artefacto | Solo con la app abierta |
| **Servidor** (`public/` + `api/`) | Vercel | Anthropic API u OpenAI API con clave en el servidor | Postgres (Neon) | Sí, con la app cerrada |

```bash
npm install
node build.js        # genera dist/la-cueva.html y public/
npm run dev          # servidor local en http://localhost:3210 (PGlite en memoria si no hay DATABASE_URL)
npm test             # pruebas del backend (PGlite + IA simulada)
```

## Despliegue en Vercel

El proyecto está vinculado al repositorio: cada push a `main` despliega producción. En el plan Hobby, Vercel solo despliega automáticamente commits de otros autores si el repositorio es público; con repositorio privado hay que desplegar a mano desde Vercel (Deployments → Create Deployment → `main`).

Variables de entorno (Project → Settings → Environment Variables). **Nunca** van en el código ni en el navegador:

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | Sí | La crea la integración de Neon (Storage → Neon). Región recomendada: Frankfurt (`aws-eu-central-1`), igual que las funciones (`fra1`). |
| `ADMIN_PASSWORD` | Sí | Contraseña de acceso (mínimo 10 caracteres). Cambiarla cierra todas las sesiones. |
| `CRON_SECRET` | Sí | Cadena aleatoria larga. Vercel la envía al cron horario para despertar al worker. |
| `ANTHROPIC_API_KEY` | Una de las dos | Claude por API (facturación en console.anthropic.com, aparte de la suscripción a Claude). |
| `OPENAI_API_KEY` | Una de las dos | OpenAI API (facturación en platform.openai.com; ChatGPT Plus no da acceso a la API). |
| `AI_PROVIDER` | No | `anthropic` u `openai` si tienes las dos claves. |
| `ANTHROPIC_MODEL_QUICK/DEFAULT/COMPLEX`, `OPENAI_MODEL_*` | No | Modelo por nivel. Por defecto: `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5` / `gpt-5-mini`, `gpt-5`. |
| `AI_MAX_TOKENS` | No | Tope de salida por respuesta (por defecto 8.000; 16.000 en razonamiento avanzado). |
| `LC_TIMEZONE` | No | Zona horaria de las programaciones (por defecto `Europe/Madrid`). |
| `LC_SECRET_KEY` | Recomendable | Clave para cifrar las credenciales de integraciones. Si no existe, se deriva de `ADMIN_PASSWORD` (y cambiar la contraseña obliga a reconectarlas). |
| `SHOPIFY_API_VERSION` | No | Versión de la Admin API de Shopify (por defecto `2026-07`). |

Tras cambiar variables hay que volver a desplegar (Deployments → Redeploy).

**Migrar datos desde la versión de Claude:** en el artefacto, Ajustes → Descargar copia; en la versión de Vercel, Ajustes → Restaurar desde archivo.

## Arquitectura del servidor

| Ruta | Función |
| --- | --- |
| `api/session.js` | Estado de configuración, entrar (cookie HttpOnly firmada, bloqueo tras 10 fallos) y salir |
| `api/db.js` | Operaciones de documentos para el navegador (lectura, consulta, parches, cambios) |
| `api/llm.js` | Un paso del modelo con la clave del servidor, en streaming (NDJSON) |
| `api/worker.js` | Orquestador en segundo plano: cron horario (`CRON_SECRET`), aviso del navegador o relanzamiento propio |
| `api/health.js` | Estado del servidor (nunca devuelve valores de claves) |
| `api/integrations.js` | Integraciones por proyecto: conectar, consultar y ejecutar acciones ya aprobadas |
| `server/integrations.js` | Credenciales cifradas (AES-256-GCM) por proyecto y cliente de Shopify (Admin GraphQL, client credentials) |
| `server/github.js` | Cliente de GitHub por proyecto (token fino de un solo repositorio): lecturas y escrituras solo aprobadas, siempre en rama nueva con pull request en borrador |
| `server/db.js` | Conexión a Postgres y esquema (solo `CREATE … IF NOT EXISTS`, nunca borra) |
| `server/docs.js` | Documentos con versión, parches en transacción con bloqueo por documento, feed de cambios, contratos |
| `server/llm.js` | Proveedores Anthropic / OpenAI (y simulador solo para pruebas) |
| `server/runtime.js` | Carga los módulos del orquestador de `src/` en un contexto aislado de Node y trabaja por tandas |
| `shared/remote.cjs` | Común a navegador y worker: base de datos remota (parches + fusión a tres bandas) y bucle de herramientas |
| `src/server_boot.js` | Arranque en Vercel: acceso, configuración pendiente y carga de la app |

Claves de diseño:

- **Un único orquestador.** El worker ejecuta los mismos `src/60–75` que el artefacto; el navegador con backend solo observa y avisa al worker (`Leader` nunca le da el contrato).
- **Escrituras sin pisarse.** Cada escritura es un parche (`set`, `unset`, `append`, `inc`). Consumo se suma, actividad y registros se añaden, el resto se fusiona por campos.
- **Tandas.** Hobby limita cada función a 300 s: el worker deja de coger tareas a los 200 s, devuelve a la cola lo que siga a los 270 s y se relanza mientras quede trabajo (máximo 20 tandas seguidas; después lo retoma el cron).
- **Cron horario en Hobby.** Hobby solo admite crons diarios, así que `vercel.json` define 24 (uno por hora). Las programaciones pueden arrancar hasta una hora tarde.

## Capacidades de los agentes en la versión con servidor

- **Internet:** búsqueda (`web_search`) y lectura de páginas o PDF públicos (`web_fetch`) de Anthropic, con fuentes citadas. Solo con Anthropic como proveedor. Permiso «Buscar en internet» en cada ficha.
- **PDF y Word:** texto con pdf.js / mammoth en el navegador; los PDF de imágenes los transcribe la IA. Hasta 20 páginas se guardan como imagen y los agentes pueden verlas con `ver_paginas_documento`.
- **Shopify:** se conecta por proyecto (Proyectos → Integraciones) con el Client ID y el Client secret de una app del Dev Dashboard. Lectura libre para los agentes del proyecto; las escrituras (crear borrador, editar, cambiar estado) se proponen, aparecen en Aprobaciones con el cambio exacto y el servidor las ejecuta una sola vez al aprobarlas.
- **GitHub:** un repositorio por proyecto (Proyectos → Integraciones) con un token de acceso fino (fine-grained) limitado a ese repositorio. Los agentes consultan estado, archivos, búsqueda de código, issues y pull requests (`github_consultar`). Crear issues, comentar o proponer código (`github_proponer_cambio`) pasa por Aprobaciones; el código va siempre a una rama nueva con un pull request en borrador: nunca escribe en la rama principal ni fusiona. Las pruebas usan un GitHub simulado (`LC_GITHUB_TEST_BASE`, solo con `LC_ALLOW_MOCK=1`).

## Estructura del frontend

| Archivo | Contenido |
| --- | --- |
| `src/00_head.html`, `src/05_body.html` | Sistema de diseño (tokens CSS) y estructura |
| `src/10_core.js` | Utilidades, pincel de píxeles, bus de eventos, modo de ejecución |
| `src/11_chars.js`, `src/12_tiles.js`, `src/13_props.js` | Personajes, suelos, muros y muebles |
| `src/20_data.js` | Salas, 23 agentes, herramientas, permisos, integraciones |
| `src/30_world.js`, `src/50_view.js` | Mapa, rutas, cámara, dibujo y entrada |
| `src/60_store.js` | Persistencia, fusión de cambios remotos, actividad, consumo y contrato del orquestador |
| `src/65_agents.js`, `src/70_ai.js`, `src/72_chat.js`, `src/75_orch.js` | Plantilla, memoria, IA, chat, orquestador y herramientas |
| `src/80_ui.js`, `src/85_panels.js`, `src/90_main.js` | Interfaz, paneles y arranque |

## Pruebas

### Fiabilidad de la versión con servidor

- Cada aprobación de Shopify se reserva dentro de la transacción antes de llamar a la tienda. Las pestañas antiguas no pueden restablecer su estado de ejecución. Si una petición queda sin resultado confirmado, hay que revisar la aprobación; no se reenvía automáticamente una escritura externa.
- Las tareas guardan el contexto y los resultados de herramientas entre pasos. Una entrega cortada continúa desde ese avance hasta dos veces; si sigue incompleta, queda pausada para revisión. No desbloquea dependientes ni se presenta como entrega completa. Al reintentar una tarea fallida, sus dependientes bloqueados por ese fallo pueden volver a avanzar.
- El servidor reserva cada petición al proveedor, incluidos los pasos internos y los intentos de reserva de modelo. Los SDK no hacen reintentos ocultos. El presupuesto diario y el del plan se comprueban en una transacción compartida; restaurar contadores de la interfaz no restablece la cuota.
- El consumo se guarda por petición, agente, proyecto y modelo, con las búsquedas que devuelve el proveedor. Los fallos sin datos de consumo cuentan como intento, pero no se inventan tokens. Los registros anteriores conservan sus cifras históricas. La estimación de coste usa las tarifas manuales de entrada y salida; no incluye búsquedas ni otros cargos.
- No hay migraciones destructivas: se reutilizan `lc_docs` y `lc_meta`. Se mantienen los proyectos y las tareas existentes; publicar una corrección no reintenta trabajos anteriores.

`npm test` incluye las regresiones de concurrencia, continuación y presupuestos en `test/reliability_test.mjs`, siempre con base de datos en memoria y servicios externos simulados.

```bash
npm test                                   # backend: parches, concurrencia, contratos, bucle de herramientas, worker, pausa y traspaso
cd test && node app_test.js                # artefacto con entorno simulado de Claude (Playwright)
cd test && node server_e2e.cjs             # versión con backend: acceso, chat, plan ejecutado por el worker, dos dispositivos
```
