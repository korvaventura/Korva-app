const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { giroHacia, avanzarTope, destinosParaGlobo, UMBRAL_TOPE } = require('../services/globoKorvaCore');
const { DESTINOS_PRUEBA } = require('../services/korvaMundiCore');

const leer = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('giroHacia usa la misma orientación que Korva Mundi', () => {
  const { giroX, giroY } = giroHacia(42.88, -8.55);
  assert.ok(Math.abs(giroY - (8.55 * Math.PI / 180 - Math.PI / 2)) < 1e-9);
  assert.ok(Math.abs(giroX - 42.88 * Math.PI / 180 * 0.72) < 1e-9);
  assert.equal(giroHacia(89, 0).giroX, 0.62);
});

test('giroHacia toma el camino corto desde el giro actual', () => {
  const actual = 10 * Math.PI;
  const { giroY } = giroHacia(0, 0, actual);
  assert.ok(Math.abs(giroY - actual) <= Math.PI);
});

const muestra = (anterior, actual, zoomAntes, zoomDespues) => ({ n: 2, distanciaAnterior: anterior, distanciaActual: actual, zoomAntes, zoomDespues });

test('alejar: sólo cambia de vista si sigue pellizcando contra el tope', () => {
  let acc = 1; let cambio = false;
  // El zoom todavía se mueve: no cuenta.
  for (let d = 200; d > 120; d -= 10) {
    const r = avanzarTope(acc, muestra(d, d - 10, 1, 1.05), { direccion: 'alejar' });
    acc = r.acumulado; cambio ||= r.cambiar;
  }
  assert.equal(cambio, false);
  assert.equal(acc, 1);
  // Ya en el tope: juntar los dedos acumula hasta el umbral.
  let d = 200;
  while (!cambio && d > 20) {
    const r = avanzarTope(acc, muestra(d, d - 8, 1.15, 1.15), { direccion: 'alejar' });
    acc = r.acumulado; cambio = r.cambiar; d -= 8;
  }
  assert.equal(cambio, true);
  assert.ok(d / 200 <= UMBRAL_TOPE + 0.05);
});

test('alejar: separar los dedos o usar un dedo reinicia la cuenta', () => {
  const r1 = avanzarTope(1, muestra(200, 180, 1.15, 1.15));
  assert.ok(r1.acumulado < 1);
  assert.equal(avanzarTope(r1.acumulado, muestra(180, 190, 1.15, 1.1)).acumulado, 1);
  assert.equal(avanzarTope(r1.acumulado, { n: 1 }).acumulado, 1);
});

test('acercar en el globo: abrir los dedos en el tope vuelve a la ruta', () => {
  let acc = 1; let cambio = false; let d = 100;
  while (!cambio && d < 300) {
    const r = avanzarTope(acc, { n: 2, distanciaAnterior: d, distanciaActual: d + 6, enTope: true }, { direccion: 'acercar' });
    acc = r.acumulado; cambio = r.cambiar; d += 6;
  }
  assert.equal(cambio, true);
});

test('destinosParaGlobo pone primero el desafío actual y no lo duplica', () => {
  const santiago = DESTINOS_PRUEBA[0];
  const lista = destinosParaGlobo([
    { id: 'a', latitude: 1, longitude: 2 }, { ...santiago }, { id: 'malo', latitude: null, longitude: 'x' },
  ], santiago);
  assert.equal(lista[0].id, santiago.id);
  assert.equal(lista[0].esActual, true);
  assert.equal(lista.filter((d) => d.id === santiago.id).length, 1);
  assert.equal(lista.some((d) => d.id === 'malo'), false);
});

test('todos los mapas 3D de desafíos pasan por el globo Korva', () => {
  const mapa = leer('components/MapaRecorrido3D.js');
  assert.match(mapa, /if \(onAlejarRef\.current && anteriorGesto/);
  assert.match(mapa, /\{!!onAlejarAlGlobo && \(/);
  assert.match(leer('screens/CaminoSantiagoPruebaScreen.js'), /<MapaConGlobo /);
  assert.match(leer('screens/ViaAppiaPruebaScreen.js'), /<MapaConGlobo /);
  const recorrido = leer('screens/MapaRecorrido.js');
  assert.match(recorrido, /<MapaConGlobo\s+key=\{mapa3D\.escena\.id\}\s+destinoActual=\{destinoGlobo\}/);
  assert.doesNotMatch(recorrido, /<MapaRecorrido3D/);
});

test('resolverActual: coordenadas locales, del catálogo o ninguna', () => {
  const { resolverActual } = require('../services/globoKorvaCore');
  const { ISLANDIA_MUNDI } = require('../services/rutaLibreMundiCore');
  const santiago = resolverActual({ id: DESTINOS_PRUEBA[0].id, title: 'x' });
  assert.equal(santiago.latitude, DESTINOS_PRUEBA[0].latitude);
  assert.equal(resolverActual({ id: ISLANDIA_MUNDI.id }).latitude, 65);
  const fuji = resolverActual({ id: 'fuji', title: 'Monte Fuji' }, [{ id: 'fuji', latitude: '35.36', longitude: 138.72, title: 'Monte Fuji 68K' }]);
  assert.deepEqual([fuji.latitude, fuji.longitude, fuji.title], [35.36, 138.72, 'Monte Fuji']);
  const sinDatos = resolverActual({ id: 'nada' }, [{ id: 'nada', latitude: null, longitude: null }]);
  assert.equal(sinDatos.latitude, null);
  assert.equal(destinosParaGlobo([{ id: 'a', latitude: 1, longitude: 1 }], sinDatos).length, 1);
});

test('el mapa del Camino pide más recorrido de pellizco (umbral 0.5) antes del globo', () => {
  let acc = 1; let d = 200; let cambio = false;
  while (!cambio && d > 10) {
    const r = avanzarTope(acc, muestra(d, d - 5, 1.15, 1.15), { direccion: 'alejar', umbral: 0.5 });
    acc = r.acumulado; cambio = r.cambiar; d -= 5;
  }
  assert.equal(cambio, true);
  assert.ok(d / 200 <= 0.52 && d / 200 > 0.4);
  assert.match(leer('components/MapaConGlobo.js'), /const UMBRAL_ALEJAR = 0\.5;/);
  assert.match(leer('components/MapaConGlobo.js'), /memo\(MapaRecorrido3D\)/);
});

test('girar el globo desde la ruta no re-renderiza React en cada movimiento', () => {
  const src = leer('components/MapaConGlobo.js');
  assert.doesNotMatch(src, /setGiro|setZoom/);
  assert.match(src, /<KorvaGlobe3D destinos=\{destinos\} controlRef=\{controlRef\}/);
  assert.match(leer('components/KorvaGlobe3D.js'), /const c = controlRef\?\.current;/);
});

test('con el globo visible el mapa pesado de la ruta se desmonta y vuelve al regresar', () => {
  const src = leer('components/MapaConGlobo.js');
  assert.match(src, /\{rutaMontada && <MapaRuta /);
  assert.match(src, /if \(finished\) \{ rutaMontadaRef\.current = false; setRutaMontada\(false\); \}/);
  assert.match(src, /if \(remontar\) \{ rutaMontadaRef\.current = true; setRecentrar\(null\); setRutaMontada\(true\); \}/);
});

test('arrastrar fuera de la ruta: borde por radio y empuje contra el límite', () => {
  const { bordeDeRuta, fueraDeBorde, avanzarBloqueoPan, UMBRAL_BORDE_PX } = require('../services/globoKorvaCore');
  const borde = bordeDeRuta([{ x: -2, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 1 }]);
  assert.deepEqual([borde.cx, borde.cz, borde.radio], [0, 0.5, Math.hypot(2, 0.5)]);
  assert.equal(fueraDeBorde([1, 0, 0.5], borde), false);
  assert.equal(fueraDeBorde([borde.radio * 1.6, 0, 0.5], borde), true);
  assert.equal(fueraDeBorde([0, 0, 0], null), false);
  let acc = 0; let cambio = false; let pasos = 0;
  while (!cambio) { const r = avanzarBloqueoPan(acc, { bloqueado: true, px: 20 }); acc = r.acumulado; cambio = r.cambiar; pasos += 1; }
  assert.equal(pasos, Math.ceil(UMBRAL_BORDE_PX / 20));
  assert.equal(avanzarBloqueoPan(100, { bloqueado: false, px: 20 }).acumulado, 0);
  const mapa = leer('components/MapaRecorrido3D.js');
  assert.match(mapa, /if \(empuje\.cambiar \|\| \(!escena\.territorio && fueraDeBorde\(final, bordeRutaRef\.current\)\)\)/);
});
