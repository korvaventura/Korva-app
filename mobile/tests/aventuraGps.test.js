const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { desafiosParaAventura, kmAventura, controlPersecucion } = require('../services/gps/aventuraGpsCore');

const leer = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('sólo desafíos activos, no pausados, el más avanzado primero', () => {
  const r = desafiosParaAventura([
    { challenge_id: 'a', status: 'active', km_completed: 10, challenges: { id: 'a' } },
    { challenge_id: 'b', status: 'active', km_completed: 50, challenges: { id: 'b' } },
    { challenge_id: 'c', status: 'active', pausado: true, km_completed: 90, challenges: { id: 'c' } },
    { challenge_id: 'd', status: 'completed', km_completed: 100, challenges: { id: 'd' } },
    { challenge_id: 'e', status: 'active', km_completed: 5, challenges: null },
  ]);
  assert.deepEqual(r.map((x) => x.challenge_id), ['b', 'a']);
});

test('km de vista previa: suma la salida y no pasa del total', () => {
  assert.deepEqual(kmAventura({ kmPrevio: 100, kmSesion: 5.5, total: 775 }), { km: 105.5, progreso: 105.5 / 775, completado: false });
  assert.equal(kmAventura({ kmPrevio: 770, kmSesion: 9, total: 775 }).km, 775);
  assert.equal(kmAventura({ kmPrevio: 770, kmSesion: 9, total: 775 }).completado, true);
  assert.equal(kmAventura({ kmPrevio: null, kmSesion: undefined, total: 0 }).progreso, 0);
});

// Misma fórmula que configurarCamara para ubicar la cámara.
const camaraEn = (control, camara) => {
  const el = camara.elevacionGrados * Math.PI / 180 + control.elevacion;
  const az = camara.azimutGrados * Math.PI / 180 + control.azimut;
  const [tx, ty, tz] = control.objetivo;
  return { x: tx + Math.sin(az) * Math.cos(el), y: ty + Math.sin(el), z: tz - Math.cos(az) * Math.cos(el) };
};

test('la cámara queda detrás del corredor, mirando hacia donde sigue la ruta', () => {
  const camara = { azimutGrados: 116, elevacionGrados: 46, distancia: 13.5, zoomMin: 0.015 };
  for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [0.6, -0.8]]) {
    const p = { x: 2, y: 0.1, z: -3 };
    const c = controlPersecucion({ p, a: { x: p.x - dx, z: p.z - dz }, b: { x: p.x + dx, z: p.z + dz }, radioRuta: 10, camara });
    const cam = camaraEn(c, camara);
    const haciaCamara = { x: cam.x - p.x, z: cam.z - p.z };
    const n = Math.hypot(haciaCamara.x, haciaCamara.z);
    assert.ok((haciaCamara.x * dx + haciaCamara.z * dz) / n < -0.99, `detrás para ${dx},${dz}`);
    assert.ok(cam.y > p.y);
    assert.ok(Math.abs(camara.elevacionGrados + c.elevacion * 180 / Math.PI - 24) < 1e-9);
  }
});

test('la distancia de persecución escala con el tamaño de la ruta', () => {
  const camara = { azimutGrados: 0, elevacionGrados: 40, distancia: 10, zoomMin: 0.01 };
  const p = { x: 0, y: 0, z: 0 };
  const chico = controlPersecucion({ p, a: p, b: { x: 1, z: 0 }, radioRuta: 3, camara });
  const grande = controlPersecucion({ p, a: p, b: { x: 1, z: 0 }, radioRuta: 12, camara });
  assert.ok(grande.zoom > chico.zoom);
  assert.ok(chico.zoom >= 0.025 && grande.zoom <= 1);
});

test('el GPS tiene pantalla de datos y pantalla de mapa sin tocar cómo se graba', () => {
  const gps = leer('screens/GpsTrackerScreen.js');
  assert.match(gps, /pagingEnabled/);
  assert.match(gps, /\{pagina === 1 && \(\s*<GpsAventura/);
  assert.match(gps, /\['Datos', 'Mapa'\]/);
  const aventura = leer('components/GpsAventura.js');
  assert.match(aventura, /seguirMarcador/);
  assert.doesNotMatch(aventura, /\.update\(|\.insert\(|\.upsert\(|confirmarActividadGps/);
  assert.match(leer('components/MapaRecorrido3D.js'), /seguirMarcador = false,/);
});

test('Islandia (ruta gratuita) aparece en el GPS si la estás haciendo', () => {
  const { entradaRutaLibre } = require('../services/gps/aventuraGpsCore');
  const { ISLANDIA_MUNDI } = require('../services/rutaLibreMundiCore');
  const e = entradaRutaLibre({ km: 120.5, estado: 'en_curso' }, ISLANDIA_MUNDI);
  assert.equal(e.challenge_id, ISLANDIA_MUNDI.id);
  assert.equal(e.km_completed, 120.5);
  assert.equal(e.challenges.total_distance_km, 1400);
  for (const p of [null, { abandonado: true }, { pausado: true }, { estado: 'completada' }]) assert.equal(entradaRutaLibre(p, ISLANDIA_MUNDI), null);
  const lista = desafiosParaAventura([{ challenge_id: 'fuji', status: 'active', km_completed: 30, challenges: { id: 'fuji' } }, e]);
  assert.deepEqual(lista.map((x) => x.challenge_id), [ISLANDIA_MUNDI.id, 'fuji']);
  assert.match(leer('components/GpsAventura.js'), /consultarRutaLibre\(\)/);
});

test('el GPS aclara que la salida suma a todos los desafíos activos', () => {
  const src = leer('components/GpsAventura.js');
  const fuente = src.slice(src.indexOf('export function notaSuma'), src.indexOf('function Dato'));
  const notaSuma = new Function(`${fuente.replace('export ', '')}; return notaSuma;`)();
  assert.match(notaSuma(2), /suma a tus 2 desafíos activos\. El mapa es sólo para verte\./);
  assert.match(notaSuma(1), /suma a tu desafío activo/);
  assert.match(src, /Elegí en qué mapa verte · la salida suma a todos/);
});
