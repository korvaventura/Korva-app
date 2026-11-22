const test = require('node:test');
const assert = require('node:assert/strict');
const { proyectarRuta, suavizarRuta } = require('../services/gps/rutaVisualCore');

const p = (latitude, longitude) => ({ latitude, longitude });

test('proyecta puntos GPS validos dentro del lienzo', () => {
  const salida = proyectarRuta([p(0, 0), p(0.01, 0.005), p(0.02, 0.02)], 300, 150);
  assert.equal(salida.length, 3);
  assert.ok(salida.every(x => Number.isFinite(x.x) && Number.isFinite(x.y)));
  assert.ok(salida.every(x => x.x >= 0 && x.x <= 300 && x.y >= 0 && x.y <= 150));
});

test('una escala visual menor produce una silueta menor', () => {
  const ruta = [p(0, 0), p(0.001, 0.001)];
  const a = proyectarRuta(ruta, 300, 150, { visualScale: 0.9 });
  const b = proyectarRuta(ruta, 300, 150, { visualScale: 0.6 });
  const span = xs => Math.hypot(xs[1].x - xs[0].x, xs[1].y - xs[0].y);
  assert.ok(span(b) < span(a));
});

test('el suavizado conserva inicio y final', () => {
  const ruta = [p(1,1), p(1.1,1.3), p(1.2,1.1), p(1.3,1.4), p(1.4,1.5)];
  const salida = suavizarRuta(ruta);
  assert.deepEqual(salida[0], ruta[0]);
  assert.deepEqual(salida.at(-1), ruta.at(-1));
});
