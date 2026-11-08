# Vía Appia: escena 3D, revisión y prueba en el teléfono

Rama local `test/via-appia-3d-20261108`, desde `b37e283` (test/camino-integracion-20261108).
Todo es local: desafío inactivo, sin push, deploy, EAS Update, Supabase, Shopify ni correos.
Fuentes y licencias: `via-appia-fuentes.md`.

## Qué cambió

- **Escena propia** `via_appia` (traza Itiner-e real, NOAA, Natural Earth), registrada en
  el registro perezoso `services/mapa3d/escenas/index.js`. `MapaRecorrido` la usa
  automáticamente para el challenge `54865c93-…`; la pantalla de administrador
  «Vía Appia · prueba local» muestra el 3D con 0/50/100 %, Inicio, Benevento,
  Brindisi, General, ficha y créditos. El respaldo 2D sigue la misma traza.
- **Modo territorio por escena.** Las condiciones `escena.id === 'camino_santiago'`
  y `km === 775/69` de `MapaRecorrido3D` y `construirMundo` pasan a
  `escena.territorio` (General automático, límites de gestos, separación de pines,
  anclas de inspección, llegada y texto de cierre), `escena.suavizadoColor` y
  `atmosfera.bordePorProfundidad`. Santiago declara exactamente sus valores aprobados.
  Sólo queda una referencia por id: la carga de las miniaturas propias del Camino.
- `terrenoCore`: opción `corredor.respetarAgua` (Appia) y `relieve.requiereReal`.
  Sin esas opciones el cálculo es idéntico.
- `anclasCore.js` (nuevo, puro): anclas, cámaras por orientación y llegada.
- Distancia única: parche de fixtures y pantallas aplicado (commit propio).

## Regresión de Santiago

- Render del banco web antes/después de generalizar `construirMundo`: **0 píxeles
  distintos** en 0 %, 50 % y 100 %.
- `tests/mapa3dTerritorio.test.js`: cámaras de Mojón/Puente/Catedral, llegada,
  límites y textos idénticos a las fórmulas aprobadas.
- `test:camino` 35/35 (31 previas + 4 nuevas). El horneado de Santiago no cambió.
- Diferencia intencional: si el usuario giró más de media vuelta antes de la llegada,
  la cámara vuelve por el giro corto (antes podía dar la vuelta completa). La cámara final es la misma.

## Composición de Appia

- Rumbo 133°, inclinación 46°: Roma arriba a la izquierda, Brindisi a la derecha, Tirreno
  a la izquierda y Adriático a la derecha. Se comparó 112–175° y 42–54°: 133/46 es la
  única combinación probada con inicio y llegada rotulados en los 14 visores
  (320×480 a 430×932 y apaisados) y la que deja la ruta más larga en pantalla.
- General se calcula con `resolverGeneralCamino` (ruta + pines + HUD) y se recalcula al
  cambiar de tamaño; «⌖» lo recupera después de explorar.
- Nombres: Italia, Campania, Basilicata, Puglia y Mar Adriático caben en General; Lazio,
  Mar Tirreno, Mar Jónico y Albania aparecen al explorar (en General no había hueco
  sin tapar la ruta en todos los visores). Posiciones verificadas contra Natural Earth.
- Llegada sin miniatura: cámara desde el puerto (rumbo 350°, zoom 0,06, 34°); el final de
  la vía queda centrado; el mensaje aparece al terminar el movimiento (1,8 s).
- Agua más mate que el Camino (rugosidad 0,62): al girar contra el sol no se lava la vista.

## Métricas (Node, misma construcción que la app)

| | Vía Appia | Camino |
|---|---|---|
| Vértices de terreno | 223.440 (588×380) | 227.304 |
| Triángulos terreno/agua | 445.334 | 452.784 |
| Mallas de paisaje | 7 (terreno, océano, 5 lagos) | 3 |
| Geometría en memoria | 12,8 MB | 13,0 MB |
| Horneado | 1.772 KB | 1.809 KB |
| Construir el mundo | 214 ms (Node, escritorio) | 160 ms |
| Horneado offline | 3,5 s | 6,3 s |

Banco web (Chrome + SwiftShader): 7–9 draw calls con ruta. Son medidas de escritorio:
**no prueban fluidez ni memoria en iOS/Android**. Pendiente medir en el teléfono.

## Pruebas

| Suite (VM del equipo, Node 22) | Base | Ahora |
|---|---|---|
| mobile `test:gps` | 29/29 | 29/29 |
| mobile `test:camino` | 31/31 | 35/35 |
| mobile `test:appia` | 3/3 | 21/21 |
| mobile `npm test` | 158/173 | 184/199 |
| backend `test:camino` + `test:appia` | 13/13 | 13/13 |

Los 15 fallos de `npm test` son los mismos antes y después: los 7 documentados (San
Andrés, Islandia ×3, gestos ×2, comprobador de horneados) y 8 que fallan sólo en la VM
porque su Node 22 no carga módulos ESM con `require` (aportes de salud ×5, montaje real,
Islandia y San Andrés con constructor real). La suite completa del backend no termina
dentro del límite de la VM; se corrieron sus pruebas de Camino y Appia.

`npx expo export --platform web` compila (bundle 22,7 MB, 59 s). En la VM no terminó en
3 min sobre la carpeta montada; se exportó en una copia idéntica con Expo 54.0.38.

Nuevas pruebas (`tests/mapa3dViaAppia.test.js`): traza e hitos; variante Antica vs
Traiana; km 0–611 crecientes sin estirar la geografía; horneado y relieve
reproducibles; ruta nunca enterrada ni en el mar; mar, montañas, islas y lagos reales;
bordes de la malla con relieve y resolución gradual; presupuesto; General en 14
visores; pines y etiquetas sin superposición; nombres geográficos; límites de gestos;
niebla en giros completos; anclas; llegada sin saltos; replay; carga perezosa.

## Límites pendientes

- **Prueba en el teléfono:** no se hizo. Todo lo anterior es Node y Chrome de escritorio.
- Muy de cerca (zoom de monumento) el relieve se ve suave: la malla fina es de 1,5 km.
  El puerto interior de Brindisi y el Lago Albano no se resuelven a esa escala.
- Rótulos largos: «BRINDISI · COLUMNAS ROMANAS» ocupa 240×42 px; en visores no probados
  puede ocultarse (el pin sigue visible).
- Propuestas de datos sin aplicar (coordenada de Porta Capena, km virtuales, capítulos):
  ver `via-appia-fuentes.md`.

## Checklist para Fabricio (teléfono, Admin → «Vía Appia · prueba local»)

1. **0 %:** General muestra Roma (arriba izq.) y Brindisi (der.) completos, con nombre;
   Campania/Puglia/Adriático legibles; nada debajo de la cabecera ni del botón.
2. **50 %:** tramo naranja hasta Aeclanum, «Próximo» Venosa, chip 305/611 km.
3. **100 %:** «✓ CONQUISTADO»; tocar «Revivir conquista»: la cámara sigue la vía sin
   saltos, se acerca a Brindisi y recién al detenerse aparece «DESAFÍO COMPLETADO»;
   el contador acompaña el recorrido.
4. **Gestos:** girar 360° con un dedo, inclinar, pellizcar hasta el límite y desplazar
   hasta el tope en cada dirección: nunca debe verse un borde, el reverso de la malla
   ni un rectángulo de mar distinto. «⌖» vuelve a General.
5. **Inicio / Benevento / Brindisi:** vistas de detalle centradas en el ancla, título en
   la cabecera; «General» vuelve.
6. **Historias:** tocar pines y la tira de hitos; abrir la historia de cada hito.
7. **Ficha:** «Ver ficha del desafío» muestra 611 km únicamente; «Inscribir» no abre Shopify.
8. **Camino de Santiago:** repetir 0/100 %, Catedral y replay: debe verse igual que antes.
9. Anotar fluidez, tiempo de apertura y calentamiento del equipo.

## Anclas para incorporar Meshy

Cada hito tiene un ancla en `viaAppia.js` (`territorio.anclas`): `hito`, `km`, `escala`,
`rotacionGrados`, `desplazamientoLateralKm` (+ = derecha de la marcha),
`ejeFrenteModelo`, `frenteGrados` (rumbo al que mira el frente) y
`camara { zoom, elevacionGrados, alturaObjetivoUnidades, azimutGrados? }`, `modelo: null`.
La cámara se ubica en el rumbo del frente: no copia rotaciones del Camino.

| Hito | km | Candidato | Frente (a validar) |
|---|---|---|---|
| roma | 0 | Tramo de basolato o monumento del inicio (no Coliseo) | 315° (mira hacia la marcha) |
| cecilia_metella | 7 | Mausoleo de Cecilia Metella | – |
| albano … oria | 25–580 | sin modelo previsto | – |
| benevento | 265 | Arco de Trajano | 45° (fachada hacia la Via Traiana) |
| brindisi | 611 | Columnas romanas (llegada) | 350° (hacia el puerto) |

Al llegar un modelo: fijar `modelo`, `escala`, `ejeFrenteModelo`, `frenteGrados` y
ajustar `camara.zoom`/`alturaObjetivoUnidades` a su tamaño (el Camino usa 0,025 / 0,065).
No se reutilizan la catedral ni el puente del Camino.

## Hacia un mapamundi continuo (no implementado)

- Rutas, hitos y etiquetas siguen en WGS84; la proyección local (`centro`) y las
  cámaras viven en la escena, separadas de los datos canónicos.
- Metadatos por desafío ya disponibles: `centro`, `limitesKm`, ruta, hitos, anclas.
- El encuadre del modo desafío está encapsulado en `escena.territorio` +
  `vistaCaminoCore`; un modo explorar podrá usar otras reglas sin tocarlo.
- Los relieves se prepararon por región (corredor 0,8 km + contexto 2 km con pirámide):
  la misma estructura sirve para teselas por región y LOD, cargadas bajo demanda.
- Sin decidir globo o superficie proyectada; sin bibliotecas nuevas ni cambio de motor.
