# Herramientas del mapa 3D del Camino de Santiago

No forman parte de la app. Sirven para regenerar y revisar la escena.

## 1. Trazado (geografía real)

    python3 tools/mapa3d/trazado_camino_santiago.py \
      tools/mapa3d/datos/camino-frances-referencia.geojson \
      /tmp/camino-trazado.json \
      tools/mapa3d/referencias_camino_santiago.json

- `datos/camino-frances-referencia.geojson`: traza de referencia de
  caminofrances.info (copia publicada en `vaadin/docs`). Licencia de datos sin
  declarar: ver `docs/mapa-3d-camino-santiago.md` §8.
- `referencias_camino_santiago.json`: localidades de control y su fuente.
- La salida incluye la verificación (distancia de cada localidad al trazado).
  `mobile/services/mapa3d/escenas/caminoSantiago.trazado.js` es esa salida
  (`puntos`, `anclas`, `largoGeograficoKm`) envuelta en `module.exports`.

## 2. Horneado (relieve artístico)

    cd mobile && node scripts/hornearMapa3D.js caminoSantiago

## 3. Pruebas

    cd mobile && node --test tests/mapa3dCaminoSantiago.test.js

## 4. Banco web (capturas con el motor real)

    cd tools/mapa3d/banco && npm install && node generarCheckpoints.js && npm run build
    pip install playwright && python3 captura.py '{"general":"km=0"}' /tmp

Parámetros de URL: `km` (progreso), `sel` (hito), `foco` + `zoom`, `seguir`
(simula el seguimiento del replay), `cam=azimut,elevacion,distancia`.
