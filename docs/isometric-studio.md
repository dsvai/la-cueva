# Estudio isométrico de La Cueva

## Objetivo y alcance

Implementar la opción 2 elegida por Daniel: oficina 3D isométrica, madera, verde bosque, beige, luz suave y personajes adultos animados. Se conserva el plano lógico de los doce departamentos, los 22 agentes, sus datos editables, las rutas y todos los flujos existentes. El concepto generado orienta materiales y ambiente; la implementación es una escena navegable, no un fondo estático.

## Implementación

1. Escena Three.js empaquetada localmente con esbuild; cámara ortográfica, mobiliario y materiales procedurales. Sin modelos remotos ni servicios de pago.
2. Conectar la escena al movimiento y a los estados reales del visor. Selección por raycasting, arrastre, zoom y cruceta/teclado en coordenadas de pantalla. Mantener el visor 2D como alternativa si WebGL no está disponible.
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

## Referencias

- [Three.js: cámara ortográfica](https://threejs.org/docs/#OrthographicCamera)
- [Three.js: renderer](https://threejs.org/docs/#WebGLRenderer)
- [Three.js: selección por rayos](https://threejs.org/docs/#Raycaster)
