# Herramientas de los mapas 3D (Camino de Santiago y Vía Appia)

No forman parte de la app. Sirven para regenerar y revisar la escena.

## 1. Trazado (OpenStreetMap)

    cd tools/mapa3d
    python3 trazado_camino_santiago.py datos/camino-frances-osm-etapas.json.gz \
      referencias_camino_santiago.json datos/regiones-espana-ne10m.geojson.gz \
      /tmp/verificacion-trazado.json ../../mobile/services/mapa3d/escenas/caminoSantiago.trazado.js

- Entrada: etapas de la relación OSM 2163573 (© colaboradores de OSM, ODbL)
  obtenidas de la API de Waymarked Trails el 2026-11-06.
- La salida JSON trae la verificación (variantes, localidades, desvío).

## 1b. Relieve real (IGN)

    python3 preparar_relieve_camino.py

- MDT500 del IGN, Natural Earth (tierra y límites) y Encoro de Belesar (IGN).
- Escribe `mobile/scripts/mapa3d/caminoSantiago.relieve.bin/.json`.

## 2. Horneado (relieve artístico)

    cd mobile && node scripts/hornearMapa3D.js caminoSantiago

## 3. Pruebas

    cd mobile && node --test tests/mapa3dCaminoSantiago.test.js

## 4. Banco web (capturas con el motor real)

    cd tools/mapa3d/banco && npm install && node generarCheckpoints.js && npm run build
    pip install playwright && python3 captura.py '{"general":"km=0"}' /tmp

Parámetros de URL: `km` (progreso), `sel` (hito), `foco` + `zoom`, `seguir`
(simula el seguimiento del replay), `cam=azimut,elevacion,distancia`.

## Vía Appia

Fuentes, licencias y reglas: `docs/mapas-3d/via-appia-fuentes.md`.

    python3 tools/mapa3d/preparar_appia.py --dem-contexto noaa-italia-contexto.tif --dem-corredor noaa-appia-corredor.tif
    cd mobile && node scripts/hornearMapa3D.js viaAppia && npm run test:appia

Revisión visual con el motor real (General, gestos, anclas, llegada):

    cd tools/mapa3d/banco && npm install && npm run build:territorio
    python3 capturaTerritorio.py '{"general":"escena=viaAppia&km=305&w=390&h=640","llegada":"escena=viaAppia&km=611&vista=llegada"}' /tmp

Parámetros: `escena` (viaAppia, caminoSantiago), `w`, `h`, `km`, `sel`,
`vista=general|ancla:<hito>|llegada|seguir:<km>`, `az`/`el` (grados), `zoom`, `pan=dx,dz`.
