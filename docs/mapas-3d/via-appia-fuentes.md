# Vía Appia: fuentes geográficas, licencias y preparación

Escena: `mobile/services/mapa3d/escenas/viaAppia.js` (id `via_appia`).
Preparación: `tools/mapa3d/preparar_appia.py` + `mobile/scripts/hornearMapa3D.js viaAppia`.
La app sólo carga la escena, la traza simplificada y el horneado; no descarga datos ni ejecuta Python.

## Tres capas separadas

1. **Geografía real (WGS84).** Traza de la Appia Antica, costa, lagos y elevación.
2. **Progreso virtual (0–611 km).** Los 13 hitos de `services/desafios/viaAppia.js`
   (IDs, orden y km sin cambios) se anclan al punto de la traza más cercano a su
   coordenada. Entre hitos el avance es proporcional a la distancia real. La traza
   mide 573,6 km y no se estira: 611 es la distancia del desafío, no una medición.
3. **Representación.** Exageración vertical ×3, colores por región, agua mate y
   anclas para miniaturas futuras. Nada de esto altera la traza ni el progreso.

Proyección local idéntica a `terrenoCore.crearProyeccion`: centro 41,2 N / 15,2 E,
equirectangular (x = este, z = sur, km). Las coordenadas canónicas siguen en WGS84.

## Traza: Itiner-e (CC BY 4.0)

- Dataset: *A High-Resolution Dataset of Roads of the Roman Empire: Itiner-e static
  version 2024*, v1.3 (de Soto, Pažout, Brughmans, Vahlstrup), Zenodo,
  doi:10.5281/zenodo.17122148. Artículo: de Soto et al., *Scientific Data* 12, 1731 (2025).
- Licencia: CC BY 4.0. Atribución visible en la pantalla de prueba.
- Descargado el 2026-11-08 (`itinere_roads.geojson`, EPSG:3395). Se guardó el recorte
  `tools/mapa3d/datos/via-appia-itinere.geojson`: 38 tramos cuyo `Itinerary`
  contiene «Via Appia» (bbox 11,8–18,7 E / 39,8–42,3 N), con su sha256 en
  `appia-verificacion.json`.
- Cadena: Tarracinae–Rome (*Certain*), Fundi, Minturnae, Capua, Caudium,
  Beneventum, Aeclanum, Aquilonia, Venusia, Tarentum, Uria, Brundisium (*Conjectured*).
  Unión sin huecos (salto máximo entre tramos 4,3 m). 2342 vértices → 867 tras
  Douglas-Peucker de 30 m, conservando los vértices de los hitos (573,6 km).
- **Variantes:** se excluye la Via Traiana (Benevento–Canosa–Bari–Egnazia). Las pruebas
  exigen pasar a <1,2 km de Benevento, Venosa, Gravina, Taranto y Oria, y a >15 km de
  Canosa, Bari y Egnazia. Porta San Sebastiano queda sobre el recorrido, no como inicio.
- **No es una traza de caminata** ni coincide metro a metro con cada resto
  arqueológico: es la reconstrucción académica de Itiner-e. Sólo Roma–Terracina figura
  como «Certain»; el resto es «Conjectured». Las rectas largas del Agro Pontino son la
  recta real de la vía (Decennovium), no uniones entre ciudades.

Se descartaron: OSM (no hay relación de ruta completa Roma–Brindisi; Overpass rechazó
las consultas), AWMC/Barrington (tramos incompletos, escala 1:500.000) y trazas de
plataformas cerradas.

## Relieve: NOAA DEM Global Mosaic

Servicio: https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer
(`exportImage`, F32, bilineal, EPSG:4326, 2026-11-08). Sin celdas sin datos.

| Archivo | bbox | Tamaño | Uso |
|---|---|---|---|
| `noaa-appia-corredor.tif` | 11,7 / 39,6 / 18,7 / 42,4 | 1750×700 (0,004°) | grilla de 0,8 km, pasabajos 0,35 km |
| `noaa-italia-contexto.tif` | −1 / 29,5 / 31,5 / 53 | 1625×1175 (0,02°) | grilla de 2 km, ±1300 km |

Los TIFF no se versionan (14 MB); sus sha256 y URLs están en
`mobile/scripts/mapa3d/viaAppia.relieve.json`. El horneado no reutiliza ni estira el
recorte de España: el contexto de Italia es una descarga propia.

En el horneado cada grilla tiene una pirámide de promedios; el nivel se elige según el
tamaño local de la celda de la malla. El corredor se funde con el contexto en 30 km.
Ninguna celda se extruye desde un borde: si el contexto no cubre la malla, el horneado falla.

## Costa y lagos: Natural Earth 1:10m (dominio público)

`land`, `minor_islands`, `lakes_europe` y `lakes` (repositorio nvkelso/natural-earth-vector,
commit ca96624). Recortes guardados en `tools/mapa3d/datos/appia-{tierra,lagos,regiones}-ne10m.geojson.gz`.

Reglas (en `preparar_appia.py`):
- El DEM decide donde es claro (>8 m tierra, <−8 m mar); Natural Earth resuelve la franja baja.
- En esa franja la altura sigue la fracción de tierra de la celda (sub-celda, sin dientes).
- Tierra ≥ 2 m (sobre el plano de mar a 1,5 m); mar ≤ −3 m; fondo acotado a −400 m.
- La franja de 0,9 km de la vía es siempre tierra: Natural Earth generaliza ~1 km la
  costa urbana de Formia y del istmo de Taranto (21 celdas corregidas).
- Lagos con nivel propio: Bolsena, Trasimeno, Bracciano, Skadar y uno en los Balcanes;
  las lagunas a nivel 0 (Lesina, Varano, Salpi) se tratan como mar.
- 18 islotes existen sólo en el DEM (Dalmacia, Egadi, Egeo): son reales, se conservan.
- Lago Albano no figura en Natural Earth 10m: se ve como cuenca, sin agua (pendiente).

## Hitos frente a la traza (`tools/mapa3d/datos/appia-verificacion.json`)

| Hito | km virtual | km real | desvío | razón del tramo |
|---|---|---|---|---|
| roma | 0 | 0,0 | 0,30 km | – |
| cecilia_metella | 7 | 4,5 | 0,08 | 1,55 |
| albano | 25 | 22,3 | 0,22 | 1,01 |
| terracina | 105 | 92,8 | 0,25 | 1,13 |
| formia | 150 | 132,1 | 0,05 | 1,15 |
| capua | 205 | 197,0 | 0,28 | 0,85 |
| benevento | 265 | 251,3 | 0,21 | 1,11 |
| aeclanum | 300 | 274,5 | 1,06 | 1,51 |
| venosa | 395 | 363,5 | 0,16 | 1,07 |
| gravina | 455 | 422,0 | 0,23 | 1,03 |
| taranto | 530 | 505,1 | 0,21 | 0,90 |
| oria | 580 | 542,2 | 0,09 | 1,35 |
| brindisi | 611 | 573,6 | 0,08 | 0,99 |

Promedio 611 / 573,6 = 1,065. Datos sin modificar; propuestas para decidir:

1. **Coordenada de `roma`.** 41,8865 / 12,4913 queda ~280 m al noreste de Piazza di
   Porta Capena (Via di San Gregorio). ToposText/Pleiades ubican la puerta en
   41,8847 / 12,4895; Itiner-e arranca a ~50 m de ahí. Propuesta: 41,8847 / 12,4895.
2. **Km virtuales.** Cecilia Metella (x1,55), Aeclanum (x1,51) y Oria (x1,35) avanzan más
   rápido que el resto; Capua (x0,85) y Taranto (x0,90), más lento. Proporcionales a la
   traza: Cecilia 5, Albano 24, Terracina 99, Formia 141, Capua 210, Benevento 268,
   Aeclanum 292, Venosa 387, Gravina 449, Taranto 538, Oria 578, Brindisi 611.
3. **Capítulos.** La traza entra en Campania en el km virtual ≈162 (dato: 165) y deja
   Campania en ≈355 (dato: 335; Aquilonia es Campania). Basilicata va de ≈364 a ≈437
   (dato: 430) y la vía sigue el límite Basilicata/Puglia hasta ≈482, pasada Gravina.

## Regenerar

```sh
# 1. Descargar los dos TIFF con las URLs de viaAppia.relieve.json (exportImage).
python tools/mapa3d/preparar_appia.py --dem-contexto noaa-italia-contexto.tif --dem-corredor noaa-appia-corredor.tif
#    (opcional) --natural-earth <carpeta con geojson 10m> para volver a extraer los recortes
# 2. Hornear
cd mobile && node scripts/hornearMapa3D.js viaAppia
# 3. Probar
npm run test:appia
```

Con los mismos TIFF y recortes, `viaAppia.relieve.bin` es idéntico byte a byte
(sha256 en el JSON); la prueba «horneado sincronizado» vuelve a hornear y compara.
Requiere Python 3 con numpy, scipy, Pillow y matplotlib (shapely sólo con `--natural-earth`).
