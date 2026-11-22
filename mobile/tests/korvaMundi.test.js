const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { coordenadasValidas, conUbicacion, destinosPrueba, DESTINOS_PRUEBA } = require('../services/korvaMundiCore');

test('coordenadas: descarta vacías, nulas, no numéricas y fuera de rango', () => {
  for (const [lat, lon] of [
    [null, -8.5], [undefined, 12], ['', 12], ['   ', 12], [42, null], [42, ''],
    ['abc', 12], [NaN, 12], [Infinity, 12], [42, -Infinity], [true, 12], [42, false],
    [{}, 12], [[], 12], [90.0001, 0], [-90.5, 0], [10, 180.01], [10, -181],
  ]) {
    assert.equal(coordenadasValidas(lat, lon), null, `${String(lat)}, ${String(lon)}`);
  }
});

test('coordenadas: acepta números y textos numéricos en rango, incluidos los bordes', () => {
  assert.deepEqual(coordenadasValidas('42.88', '-8.54'), { latitude: 42.88, longitude: -8.54 });
  assert.deepEqual(coordenadasValidas(-54.8, -68.3), { latitude: -54.8, longitude: -68.3 });
  assert.deepEqual(coordenadasValidas(90, -180), { latitude: 90, longitude: -180 });
  assert.deepEqual(coordenadasValidas(0, 0), { latitude: 0, longitude: 0 });
});

test('catálogo: sólo pasan desafíos con ubicación válida, ya convertida a número', () => {
  const catalogo = [
    { id: 'a', latitude: '35.36', longitude: '138.73' },
    { id: 'b', latitude: null, longitude: null }, // antes: pin en (0, 0)
    { id: 'c', latitude: '', longitude: '' },     // antes: pin en (0, 0)
    { id: 'd', latitude: 120, longitude: 10 },
    null,
  ];
  assert.deepEqual(conUbicacion(catalogo), [{ id: 'a', latitude: 35.36, longitude: 138.73 }]);
  assert.deepEqual(conUbicacion(undefined), []);
});

test('cuenta normal: los destinos válidos del catálogo no cambian y no hay pines de prueba', () => {
  const catalogo = [
    { id: 'fin', latitude: -54.8, longitude: -68.3 },
    { id: 'fuji', latitude: 35.36, longitude: 138.73 },
    { id: 'dub', latitude: '42.64', longitude: '18.11' },
  ];
  const antes = catalogo.filter((c) => Number.isFinite(Number(c.latitude)) && Number.isFinite(Number(c.longitude)));
  assert.deepEqual(conUbicacion(catalogo).map((c) => c.id), antes.map((c) => c.id));
  assert.deepEqual(destinosPrueba({ esAdmin: false, desarrollo: true, catalogo }), []);
  assert.deepEqual(destinosPrueba({ esAdmin: false, desarrollo: false, catalogo }), []);
  assert.deepEqual(destinosPrueba({ esAdmin: true, desarrollo: false, catalogo }), [], 'admin en build de producción');
  assert.deepEqual(destinosPrueba(), []);
  assert.deepEqual(destinosPrueba({ esAdmin: 'true', desarrollo: 1 }), [], 'sólo booleanos verdaderos');
});

test('admin en desarrollo: dos pines, Santiago y Roma, con sus pantallas de prueba', () => {
  const d = destinosPrueba({ esAdmin: true, desarrollo: true, catalogo: [] });
  assert.deepEqual(d.map((x) => x.pantallaPrueba), ['CaminoSantiagoPrueba', 'ViaAppiaPrueba']);
  assert.deepEqual(d.map((x) => x.total_distance_km), [775, 611]);
  d.forEach((x) => assert.ok(coordenadasValidas(x.latitude, x.longitude)));
  // No se duplican si el desafío ya viene en el catálogo.
  const conSantiago = destinosPrueba({ esAdmin: true, desarrollo: true, catalogo: [{ id: d[0].id }] });
  assert.deepEqual(conSantiago.map((x) => x.id), [d[1].id]);
});

test('pines: IDs, distancias y ubicación coinciden con la llegada de cada escena', () => {
  const camino = require('../services/desafios/caminoSantiagoMapa');
  const appia = require('../services/desafios/viaAppiaMapa');
  const trazCamino = require('../services/mapa3d/escenas/caminoSantiago.trazado');
  const trazAppia = require('../services/mapa3d/escenas/viaAppia.recorrido');
  const [santiago, roma] = DESTINOS_PRUEBA;
  assert.equal(santiago.id, camino.CHALLENGE_ID);
  assert.equal(roma.id, appia.CHALLENGE_ID);
  assert.equal(santiago.total_distance_km, require('../services/desafios/caminoSantiago').distanciaKm);
  assert.equal(roma.total_distance_km, require('../services/desafios/viaAppia').distanciaKm);
  assert.deepEqual([santiago.latitude, santiago.longitude], trazCamino.puntos.at(-1), 'Obradoiro');
  assert.deepEqual([roma.latitude, roma.longitude], trazAppia.puntos.at(-1), 'Roma, fin de la traza');
  // Appia conserva el sentido Brindisi -> Roma.
  assert.ok(trazAppia.puntos[0][1] > 17.5 && trazAppia.puntos[0][0] < 41, 'empieza en Brindisi');
});

test('acceso: KorvaMundi recibe esAdmin y las pantallas de prueba siguen detrás de esAdmin && __DEV__', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(app, /<KorvaMundiScreen \{\.\.\.props\} esAdmin=\{esAdmin\} \/>/);
  assert.match(app, /esAdmin && __DEV__ && <Stack\.Screen name="CaminoSantiagoPrueba"/);
  assert.match(app, /esAdmin && __DEV__ && <Stack\.Screen name="ViaAppiaPrueba"/);
  const mundi = fs.readFileSync(path.join(__dirname, '..', 'screens', 'KorvaMundiScreen.js'), 'utf8');
  assert.match(mundi, /destinosPrueba\(\{ esAdmin, desarrollo: __DEV__, catalogo \}\)/);
  assert.doesNotMatch(mundi, /Number\.isFinite\(Number\(c\.latitude\)\)/, 'sin la validación vieja');
});
