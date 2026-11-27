# Modo demo del mapa 3D — 27/11/2026

Base: `release/1.1.0` en `328660bee29e0acdc99247bebae62d4f94e6666d`.
Rama: `feat/mapa3d-demo-admin-20261127`.

## Comportamiento

- El botón 🎬 aparece únicamente con el `esAdmin` que ya calcula App. Un contexto con valor predeterminado `false` comparte esa decisión con todos los mapas, incluidos los modales. No agrega consultas ni permisos.
- Duración configurable entre 1 y 120 segundos; por defecto 12. El recorrido completo avanza con ease-in-out, independientemente de los kilómetros reales.
- Ruta construida una sola vez por sesión: el shader revela su longitud progresivamente. Marcador, checkpoints y cámara se actualizan en el frame de Three, sin reconstruir geometría por frame.
- Vista amplia inicial, descenso y seguimiento amortiguado según la tangente de la ruta. En la meta realiza un giro/acercamiento durante 2 segundos y queda quieto, conservando el 100 % visual hasta salir.
- Checkpoints con cambio de color y pulso breve al alcanzarlos. En modo limpio se conservan sus puntos, sin etiquetas ni botones.
- Pantalla limpia abre un modal de pantalla completa con mapa y nombre del desafío; oculta la interfaz externa y la barra de estado. Mantener presionado el nombre durante 900 ms permite salir. En Android también se puede usar Atrás.
- Sin pantalla limpia muestra el avance, el cierre existente y el botón Salir de demo.
- La demo se pausa si la aplicación pasa a segundo plano. Al salir restaura el último progreso recibido y la cámara anterior. Si se pierde el permiso de admin también sale.
- No hay llamadas de red, guardados, eventos de selección de checkpoints ni modificaciones de los cálculos reales. Strava, Garmin, Health y backend no cambian.

## Archivos

- `mobile/App.js`: proveedor del chequeo de admin existente.
- `mobile/context/AdminContext.js`: acceso compartido, cerrado por defecto.
- `mobile/components/MapaRecorrido3D.js`: panel de demo, estado local, restauración, modal limpio y dibujo de ruta estática durante demo.
- `mobile/components/mapa3d/DemoRecorrido.js`: movimiento, cámara y puntos de checkpoints dentro del render 3D.
- `mobile/services/mapa3d/demoCore.js`: tiempos, easing y cámara, sin React ni persistencia.
- `mobile/tests/mapa3dDemo.test.js`: duración, cámaras de las cuatro escenas, pausa, congelado, restauración y rechazo de usuarios comunes.
- `mobile/tests/mapa3dInteraccion.test.js`: verifica también que la cámara normal ceda el control a la demo.
- `mobile/package.json`: incluye las nuevas pruebas en `npm test`; no cambia dependencias.
- Este documento.

No fue necesario cambiar escenas, `MapaRecorrido.js`, `MapaConGlobo.js`, Supabase ni backend. El contexto evita propagar la autorización a través de todas las pantallas.

## Validación realizada

- 29 pruebas pasan con:

  ```sh
  node --test tests/mapa3dDemo.test.js tests/mapa3dInteraccion.test.js tests/replayHitos.test.js tests/onboardingLegal.test.js tests/korvaMundi.test.js
  ```

- Sintaxis JS/JSX validada en todos los archivos modificados.
- Montaje de React con adaptadores de React Native/Canvas: acceso oculto a usuarios comunes, entrada admin, modal limpio, salida, pérdida de admin y restauración del render bajo demanda.
- Simulación de 850 frames con React y objetos Three: llegada congelada, puntos, cámara, cambio de geometría y salida sin errores. Es una simulación, no una medición del render nativo ni de la GPU.
- `mapa3dCore.test.js` tiene siete fallos preexistentes, reproducidos en una copia sin el parche: horneado San Andrés; tres casos de Islandia; dos casos de gestos; compatibilidad de horneados. No se modificaron esos datos ni los gestos.
- Pendiente prueba visual y medición en teléfono. La demo elimina el límite habitual de cámara a 30 Hz, usa render por frame y limita DPR a 1.5; no se garantiza 60 fps sin medir el dispositivo.

## Cómo probar en el teléfono

1. Traer la rama y abrir el dev client habitual desde `mobile` con `npx expo start --dev-client --lan --clear`.
2. Iniciar sesión con una cuenta admin existente y abrir Ver mapa de un desafío. Esperar a que termine la carga de texturas.
3. Tocar 🎬, dejar 12 segundos y Pantalla limpia. Preparar la grabación de pantalla del teléfono y tocar Iniciar demo.
4. Comprobar inicio amplio, línea continua, marcador, encendido de checkpoints y llegada con giro. A los 14 segundos la imagen debe quedar quieta.
5. Mantener presionado el nombre del desafío para salir; comprobar que los kilómetros reales siguen iguales. Repetir con duración distinta y sin pantalla limpia.
6. Repetir en Fin del Mundo, Monte Fuji, San Andrés y Dubrovnik; comprobar también un desafío sin kilómetros y uno completado.
7. Enviar la app a segundo plano durante una demo: al regresar debe continuar sin saltar a la meta.
8. Entrar con una cuenta común: 🎬 no debe aparecer; Ver mi viaje, checkpoints y gestos deben seguir como antes.

No se publicó un OTA, build ni se modificó producción como parte de este cambio.
