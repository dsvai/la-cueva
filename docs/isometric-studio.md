# Estudio isométrico de La Cueva

## Objetivo y alcance

Implementar la opción 2 elegida por Daniel: oficina 3D isométrica, madera, verde bosque, beige, luz suave y personajes adultos animados. Se conserva el plano lógico de los doce departamentos, los 22 agentes, sus datos editables, las rutas y todos los flujos existentes. El concepto generado orienta materiales y ambiente; la implementación es una escena navegable, no un fondo estático.

## Implementación

1. Escena Three.js empaquetada localmente con esbuild; cámara ortográfica, mobiliario y materiales procedurales. Sin modelos remotos ni servicios de pago.
2. Conectar la escena al movimiento y a los estados reales del visor. Selección por raycasting, arrastre, zoom y joystick/teclado en coordenadas de pantalla. Mantener el visor 2D como alternativa si WebGL no está disponible o es por software (SwiftShader, llvmpipe): ese render bloquea la página varios segundos por fotograma. `?3d=1` fuerza el 3D para pruebas.
3. Personajes articulados con apariencia editable y retratos coherentes en directorio/chat. Respetar movimiento reducido y limitar resolución en móvil.
4. Verificar en navegador local, escritorio y móvil; ejecutar las regresiones, revisar el diff, subir a GitHub y verificar el despliegue automático.

## Archivos y convenciones

- `src/studio/`: geometría y escena 3D, funciones pequeñas, materiales reutilizados y recursos liberados al retirar personajes.
- `src/50_view.js`: conserva la simulación y la interfaz pública de View.
- `build.js`: incluye la escena en el artefacto autocontenido y en la aplicación servida por Vercel.
- Los componentes visuales no escriben en la base de datos ni invocan la IA.

## Verificación y límites

- `node build.js` y `node ../../review-tools/npm/package/bin/npm-cli.js test`.
- Navegador: render sin errores, selección/charla, desplazamiento, zoom, vista completa y foco por directorio. Comprobar 390 px y escritorio; reducción de movimiento y fallback sin WebGL.
- Verificar rutas libres y proyección/inversa de cámara con pruebas de geometría.
- Conservar autenticación, datos y configuración de Vercel. No iniciar tareas pagadas para probar la escena.

## Despachos, esperas y animaciones de estado

- Planta en `ROOM_GRID` (`src/20_data.js`): cada espacio indica cuántas columnas ocupa. Daniel tiene el despacho más grande, en la esquina con ventanas y bajo el rótulo. Marco tiene el segundo, independiente. Ambos tienen mamparas de vidrio con puerta (`World.walls`) y esperan en su propio despacho.
- Quien no trabaja espera sentado en la sala de reuniones o en la zona común, y en la recepción si se llenan (`World.pois.wait`). Al abrir La Cueva se colocan directamente. Cuando tienen trabajo vuelven caminando a su puesto. Nadie se mueve hasta que se cargan las tareas reales.
- Sobre cada personaje se muestra un icono animado: trabajando (bocadillo con puntos), tarea terminada en los últimos 15 minutos (✓), tarea pendiente en cola (reloj de arena), pendiente de aprobación, colaborando o necesita revisión. Se respeta `prefers-reduced-motion`.
- La pantalla de cada ordenador es un lienzo que muestra lo mismo: contenido del oficio mientras trabaja, ✓ terminada, en cola, aprobación o revisión, y reposo si no hay nada.
- Todo sale de `Orch.agentStatus` (tareas y llamadas reales); la vista nunca inventa actividad.

## Controles y revisión móvil

- Joystick de ocho direcciones con velocidad proporcional, zona muerta y captura del puntero. Al soltar, cancelar, cambiar de orientación o abrir un menú, vuelve a cero.
- La oficina, los cajones y los controles siguen `visualViewport`, incluidos los cambios de altura del teclado. Los campos móviles usan 16 px para evitar el zoom de enfoque.
- Ocho accesos superiores visibles; paneles con cabecera y pestañas que no se encogen, contenido desplazable y rejillas que caben a 320 px. El chat ampliado oculta sus columnas laterales en móvil.
- Comprobar 320 px, 390 px, altura reducida para teclado y 844 × 390 en horizontal. Al cerrar menús y chat deben seguir visibles el joystick, Daniel y los controles de cámara.

## Referencias

- [Three.js: cámara ortográfica](https://threejs.org/docs/#OrthographicCamera)
- [Three.js: renderer](https://threejs.org/docs/#WebGLRenderer)
- [Three.js: selección por rayos](https://threejs.org/docs/#Raycaster)
