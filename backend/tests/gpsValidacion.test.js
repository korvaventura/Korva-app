const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularDistanciaGpsServidor } = require('../lib/gpsValidacion');

const p = (latitude, longitude, timestamp, accuracy = 5) =>
  ({ latitude, longitude, timestamp, accuracy });

test('servidor recalcula recorrido GPS valido sin confiar en distance_km', () => {
  const r = calcularDistanciaGpsServidor([
    p(0, 0, 1000),
    p(0, 0.0001, 3000),
    p(0, 0.0002, 5000),
  ]);
  assert.equal(r.ok, true);
  assert.ok(r.distanciaKm > 0.022 && r.distanciaKm < 0.023);
});

test('servidor descarta precision mala y saltos imposibles', () => {
  const r = calcularDistanciaGpsServidor([
    p(0, 0, 1000),
    p(0, 0.01, 2000),
    p(0, 0.0001, 3000, 100),
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.distanciaKm, 0);
});

test('servidor rechaza recorridos demasiado cortos', () => {
  const r = calcularDistanciaGpsServidor([
    p(0, 0, 1000),
    p(0, 0.00001, 3000),
  ]);
  assert.equal(r.ok, false);
});


test('devuelve para persistencia solo los puntos aceptados por el servidor', () => {
  const puntos = [
    p(0, 0, 1000, 5),
    p(0, 0.0001, 3000, 5),
    p(0, 0.0002, 5000, 80),
    p(0, 0.0002, 7000, 5),
  ];
  const r = calcularDistanciaGpsServidor(puntos);
  assert.equal(r.ok, true);
  assert.equal(r.puntosValidos.length, r.aceptados);
  assert.equal(r.puntosValidos.some((x) => x.accuracy === 80), false);
});
