# Base de interacción de los mapas 3D

Cierre de Dubrovnik: 6 de octubre de 2026. Base aceptada por Fabricio tras
restaurar el comportamiento de `578da94`, conservar sólo la línea turquesa
(`721a777`) y fijar el replay en 25 segundos (`b054d49`). Es una base usable,
no una afirmación de rendimiento perfecto en todos los teléfonos.

## Alcance común

Dubrovnik, San Andrés, Fin del Mundo (`default`) y Monte Fuji usan
`MapaRecorrido3D` a través del registro `services/mapa3d/escenas/index.js`.
Los mapas futuros deben entrar por ese registro, sin duplicar el motor.
Los tiempos y sensibilidad se centralizan en `ajustesInteraccion.js`.

| Comportamiento | Base conservada |
| --- | --- |
| Revivir conquista | 25 segundos; curva smoothstep; dt máximo 80 ms |
| Cámara y proyección de puntos | Actualización conjunta cada 33 ms; render bajo demanda |
| Fichas de actividad durante replay | Cada 100 ms |
| Inicio del replay | Centro propio de la escena, órbita restablecida y zoom 1 |
| Seguimiento | Peso 0,45; amortiguación 750 ms |
| Interacción manual | Suspende seguimiento 1200 ms; no cancela el replay |
| Arrastre | Umbral 10 px; sensibilidad incremental 0,65 |
| Selección | Ignora los 180 ms posteriores al arrastre; separación 350 ms entre taps |
| Ruta procedural | Reconstrucción limitada a cada 120 ms durante replay |
| Ruta sobre modelo Meshy | Tubos preparados una vez; avance con drawRange, sin reconstruir por frame |

Sólo finalizar, pulsar Detener o desmontar el componente cancela el replay.
Seleccionar un checkpoint, girar, hacer zoom, centrar o mover la página no
lo cancela. El gesto manual tiene prioridad sobre el seguimiento automático.

## Scroll y checkpoints

Un tap no bloquea el scroll de la página. Sólo un arrastre real del mapa
activa el bloqueo, y release, cancel y terminate lo liberan. Las pantallas
DetalleScreen y DetalleRetoScreen conservan recuperación adicional del scroll
al empezar/terminar un toque o empezar a desplazar la página.

La selección usa un único handler con debounce y un hit test al pin más
cercano. Abrir la historia provoca un solo desplazamiento de la página;
no repetir scrollTo desde onLayout. Las etiquetas conservan offsets mientras
quepan y evitan colisiones con el HUD. Tallo y pie se proyectan desde la
misma cámara: el tallo no es una línea vertical fija en pantalla.

## Modelos y color

Cada escena conserva su objetivo, cámara, alturas, grosor y recorrido propios.
El color turquesa de la línea de Dubrovnik es una excepción visual por sus
tejados naranja; los otros mapas conservan el naranja de Korva.

Para integrar otro modelo completo: preservar ejes y composición, aplicar
sólo escala uniforme, calibrar una ruta propia sobre su superficie y verificar
las anclas de checkpoints. No reutilizar coordenadas de otro modelo ni
combinar paisajes que no encajen. Requerir todas las texturas estáticas con
rutas existentes en git, para que Metro pueda resolverlas.

Referencia del modelo móvil de Dubrovnik: unas 220 mil caras, textura de
2048 px y activos de unos 6,4 MB. Son presupuestos de referencia, no garantías
de FPS. Su optimización de drawRange usa una curva poligonal y distancia 3D;
no trasladarla sin más a los otros mapas que usan CatmullRom y terreno procedural.

## Cambios descartados y verificación

No recuperar en bloque los cambios de `2e148e3`, `7e4fe31` o `9bf6803`:
la publicación de cámara mediante commits React, los pines GL, los cambios
de sensibilidad/seguimiento y el render continuo no dieron un resultado
aceptable en el teléfono. Fueron revertidos. El color, por sí solo, no
requiere ninguno de esos cambios. El dpr pasado al Canvas nativo no sirve
como garantía de bajar resolución: Fiber nativo configura PixelRatio.get().

Antes de optimizar, cambiar una variable por vez y comparar contra esta base
en teléfono. Probar replay completo, empezar con mapa rotado, arrastrar y
hacer zoom durante replay, detener, elegir un checkpoint y volver a hacer
scroll. Observar el final del recorrido y el calentamiento tras repeticiones.
Las pruebas Node verifican lógica/geometría; no sustituyen FPS ni la prueba
visual en iOS/Android. Los otros tres mapas requieren esa validación propia.

No cambiar progreso de usuarios, distancias de desafío, backend o Supabase
para resolver problemas de render del mapa.
