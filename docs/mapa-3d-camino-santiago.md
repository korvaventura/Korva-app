# Mapa 3D — Camino de Santiago (775 km)

Rama `mapa3d/camino-santiago-20261105` (desde `1a0658f`). **No activado:** la
escena no está en `CONFIGS` ni en `escenas/index.js`, no tiene UUID y no se tocó
Supabase ni Shopify.

## Qué es real, qué es virtual y qué es artístico

| Capa | Origen | Estado |
| --- | --- | --- |
| Trazado | OpenStreetMap, superruta "Camiño Francés" (relación 2163573) y sus 6 etapas lineales, vía API de Waymarked Trails. © colaboradores de OSM, ODbL 1.0 | Real. Recortado en Roncesvalles, termina en la Praza do Obradoiro. Simplificado a 15 m (desvío máximo medido 15 m). 742,8 km reales |
| Variantes | La relación OSM ya sigue Villadangos–San Martín del Camino, el Real Camino (Bercianos, El Burgo Ranero, Reliegos) y San Xil | Verificado: a menos de 120 m de esas localidades y a más de 4 km de Villar de Mazarife, Calzadilla de los Hermanillos y Samos |
| Relieve | MDT500 del IGN (WCS `Elevacion4258_500`), CC BY 4.0 scne.es, promediado a 1 km | Real en España. Portugal y Francia: relleno artístico por difusión. Fuera de la grilla se repite el borde (sólo lejos, en la niebla) |
| Costa | En España, la del MDT del IGN; fuera, Natural Earth 1:10m (dominio público) | Real a ~1 km |
| Miño / Belesar | Polígono del Encoro de Belesar, IGN Hidrografía INSPIRE, CC BY 4.0 | Real, ensanchado 0,5 km para que se vea; nivel 331 m (mínimo del MDT en el polígono) |
| Km del desafío | 775 km y 13 hitos, anclados sobre el trazado | Virtual. Factor ~1,043 sobre la distancia real, parejo en todo el recorrido (0,5 %–8 % por tramo); no hizo falta redistribuir |
| Exageración vertical | ×3 | Artística |
| Colores por región, luz, niebla | Paleta Korva por regiones (`biomas`) | Artístico |
| Capítulos | Límites de comunidad autónoma de Natural Earth sobre el trazado | Navarra 0–136, La Rioja –204, Castilla y la Meseta –507 (Astorga), Montes de León y El Bierzo –614, Galicia –775 |

Hitos (km virtual / km real desde Roncesvalles): Roncesvalles 0/0 · Pamplona
44/41,9 · Puente la Reina 69/66,1 · Irache 94/90,4 · Santo Domingo 194/186,5 ·
Burgos 269/255,8 · Frómista 337/323,5 · León 456/437,4 · Astorga 507/485,7 ·
Ponferrada 562/538,7 · O Cebreiro 615/589,0 · Portomarín 679/650,0 ·
Santiago 775/742,8.

## Código

| Pieza | Archivo | Otros mapas |
| --- | --- | --- |
| Escena (datos) | `mobile/services/mapa3d/escenas/caminoSantiago.js` | — |
| Trazado (generado) | `…/escenas/caminoSantiago.trazado.js` | — |
| Horneado | `…/escenas/caminoSantiago.horneado.js` | — |
| Relieve real (sólo al hornear y en pruebas; no viaja en la app) | `mobile/scripts/mapa3d/caminoSantiago.relieveReal.js` + `.relieve.bin/.json` | — |
| `relieve.real` opcional | `terrenoCore.js` | Sin cambios: se re-hornean idénticos |
| `biomas` opcional | `terrenoCore.js` | Sin cambios |
| Niveles de agua horneados | `construirMundo.js` (une niveles declarados y horneados) | Mismos niveles que antes |
| `etiquetaFinal`, `etiquetasSeparadas` opcionales | `MapaRecorrido3D.js`, `etiquetasCore.js` | Sólo Camino los declara |
| Preparación | `tools/mapa3d/trazado_camino_santiago.py`, `preparar_relieve_camino.py`, datos en `tools/mapa3d/datos/` | — |

`etiquetaFinal` rotula siempre la última parada; `etiquetasSeparadas` hace que
las etiquetas esquiven todos los pines y, si quedan lejos, las une al pin con
una guía fina.

## Condiciones de uso antes de publicar

- OSM (ODbL): mostrar "© colaboradores de OpenStreetMap" en el mapa y poder
  ofrecer el trazado derivado (el generador y su entrada están en `tools/`).
- IGN (CC BY 4.0): citar "MDT y Hidrografía © Instituto Geográfico Nacional".
- Natural Earth: dominio público.
- Ninguno de los créditos se muestra todavía en la app.

## Verificación

- `node --test tests/mapa3dCaminoSantiago.test.js`: 12 pruebas (horneado
  sincronizado con el relieve IGN, 0→775 y 13 hitos, variantes, localidades,
  alturas IGN, agua, capítulos, ruta = trazado real, helpers de etiquetas).
- `npm test`: 160/167; las 7 que fallan ya fallaban en `1a0658f`.
- Fin del Mundo, Monte Fuji y Dubrovnik re-horneados idénticos.
- Capturas con el motor real en `tools/mapa3d/banco` (render por software de
  escritorio: no son FPS de teléfono).

## Pendiente

- Prueba en iPhone: encuadre, guías de etiquetas, replay, zoom y rendimiento.
- Créditos OSM/IGN visibles en la app.
- Textos, UUID y activación (otro chat).
