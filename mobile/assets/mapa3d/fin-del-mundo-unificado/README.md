# Fin del Mundo: modelo completo móvil

Fuente: `Meshy_AI_Tierra_Del_Fuego_3D_T_1006185315_image-to-3d-texture.glb`,
aportado por Fabricio el 6 de octubre de 2026. Una malla completa, sin
rotaciones, reflejos ni mezcla de paisajes. Escala uniforme 3 y traslación
vertical común para fijar el datum del modelo.

946.112 caras originales → 219.994 caras; 130.724 vértices; error de
simplificación 0,00016434. Textura de color 2048 × 2048, sin mapas extra de
normal/metallic en runtime. Activos geométricos cuantizados y preparados
fuera de la app, sin parsear GLB ni usar meshoptimizer en el teléfono.

La ruta se calibró sobre una vista cenital de esta fuente, con anclas
0 / 20 / 45 / 80 / 103 km para los checkpoints existentes. Es una aproximación
visual y no una validación cartográfica del modelo de IA. No cambia las
coordenadas históricas ni el progreso guardado del usuario. Alturas de la
línea calculadas por intersección vertical sobre la malla cuantizada final.

Regenerar con `mobile/scripts/empacarModeloUnificado.mjs` y
`mobile/scripts/finDelMundo.calibracion.json`; meshoptimizer se instala sólo
en el entorno offline. Pasar el GLB original, la textura JPEG reducida,
el directorio de salida, el directorio de diagnóstico y la calibración.
Los buffers de diagnóstico no se publican en la app.

La interacción usa la base compartida de `docs/mapas-3d-base.md`: replay de
25 segundos, cámara bajo demanda y línea mediante drawRange. El rendimiento
visual necesita verificación en iOS/Android; las pruebas Node no miden FPS.
