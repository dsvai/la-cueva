# La Cueva

Agencia digital de agentes de IA de **La Cueva by Daniel**: oficina pixel art 2D con 22 agentes, chat real, proyectos, orquestador de tareas, memoria supervisada y aprobaciones. Esta versión se publica como app (artefacto) dentro de Claude.

## Inicio rápido

```bash
node build.js          # genera dist/la-cueva.html (un único archivo, sin dependencias)
```

`dist/la-cueva.html` se publica como artefacto de Claude con estas capacidades:

| Capacidad | Para qué |
| --- | --- |
| `db` (lectura y escritura solo del propietario) | Proyectos, conversaciones, tareas, entregables, memoria, actividad |
| `sample` (con imágenes) | Las respuestas de los agentes, con la sesión de Claude de quien abre la app |
| `downloads` | Descargar entregables y copias de seguridad |
| `assets` | Guardar adjuntos |

Fuera de Claude la app funciona, pero sin IA y guardando solo en el navegador; la cabecera lo indica.

## Estructura

| Archivo | Contenido |
| --- | --- |
| `src/00_head.html` | Título, fuentes y sistema de diseño (tokens CSS) |
| `src/05_body.html` | Estructura: cabecera, oficina, directorio, chat, paneles |
| `src/10_core.js` | Utilidades, color, pincel de píxeles, bus de eventos |
| `src/11_chars.js` | Generador de personajes (4 orientaciones, caminar, sentado) |
| `src/12_tiles.js`, `src/13_props.js` | Suelos, muros, muebles y decoración |
| `src/20_data.js` | Salas, plantilla de 22 agentes, herramientas, permisos, integraciones |
| `src/30_world.js` | Mapa continuo, puestos, rutas (A*) y capa estática |
| `src/50_view.js` | Cámara, dibujo, estados visibles, tu personaje, entrada |
| `src/60_store.js` | Persistencia (db → navegador → memoria), actividad y consumo |
| `src/65_agents.js` | Configuración, plantilla editable, memoria |
| `src/70_ai.js` | Capa de IA (un único punto) y contexto de cada agente |
| `src/72_chat.js` | Conversaciones, adjuntos y envío |
| `src/75_orch.js` | Orquestador, herramientas de los agentes, proyectos, programación |
| `src/80_ui.js`, `src/85_panels.js` | Interfaz: directorio, chat, paneles, fichas |
| `src/90_main.js` | Arranque y textos de arquitectura |
| `assets/logo.png` | Logotipo oficial (fondo transparente) |
| `test/` | Pruebas de extremo a extremo con un entorno simulado de Claude (Playwright) |

## Pruebas

```bash
cd test && npm install && node app_test.js
```

Simula la base de datos y la IA, recorre un plan completo (Daniel → Alex → colaboración de Mia → Clara → consolidación) y abre todos los paneles.

## Fase 4

La migración al backend (GitHub + Vercel) está descrita en el documento «La Cueva — Plan técnico y arquitectura». Los datos se trasladan con la copia JSON de Ajustes.
