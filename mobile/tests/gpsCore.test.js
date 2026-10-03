const test = require('node:test');
const assert = require('node:assert/strict');
const {
  distanciaHaversineM, normalizarPuntoGps, crearSesionGps, agregarPuntoGps,
  pausarSesionGps, reanudarSesionGps, finalizarSesionGps, resumenSesionGps,
} = require('../services/gps/gpsCore');

const p = (latitude, longitude, timestamp, accuracy = 5) => ({ latitude, longitude, timestamp, accuracy });

test('haversine calcula una distancia geografica razonable', () => {
  const m = distanciaHaversineM(p(0, 0, 1), p(0, 0.001, 2));
  assert.ok(m > 110 && m < 112);
});

test('primer punto fija ancla pero no suma distancia', () => {
  let s = crearSesionGps({ ahoraMs: 1000 });
  s = agregarPuntoGps(s, p(-34, -58, 1000));
  assert.equal(s.distanciaM, 0);
  assert.equal(s.puntos.length, 1);
});

test('segmento valido suma distancia', () => {
  let s = crearSesionGps({ ahoraMs: 1000 });
  s = agregarPuntoGps(s, p(0, 0, 1000));
  s = agregarPuntoGps(s, p(0, 0.0001, 3000));
  assert.ok(s.distanciaM > 11 && s.distanciaM < 12);
  assert.equal(s.puntos.length, 2);
});

test('descarta precision mala sin mover el ancla', () => {
  let s = crearSesionGps({ ahoraMs: 1000 });
  s = agregarPuntoGps(s, p(0, 0, 1000));
  s = agregarPuntoGps(s, p(0, 0.0001, 3000, 80));
  assert.equal(s.distanciaM, 0);
  assert.equal(s.puntos.length, 1);
  assert.equal(s.descartados.precision, 1);
});

test('descarta salto de velocidad imposible', () => {
  let s = crearSesionGps({ ahoraMs: 1000 });
  s = agregarPuntoGps(s, p(0, 0, 1000));
  s = agregarPuntoGps(s, p(0, 0.01, 2000));
  assert.equal(s.distanciaM, 0);
  assert.equal(s.descartados.salto, 1);
});

test('ruido menor al umbral no suma kilometros', () => {
  let s = crearSesionGps({ ahoraMs: 1000 });
  s = agregarPuntoGps(s, p(0, 0, 1000));
  s = agregarPuntoGps(s, p(0, 0.000005, 3000));
  assert.equal(s.distanciaM, 0);
  assert.equal(s.descartados.minimo, 1);
});

test('pausa corta continuidad GPS y reanudar no une puntos a traves de la pausa', () => {
  let s = crearSesionGps({ ahoraMs: 1000 });
  s = agregarPuntoGps(s, p(0, 0, 1000));
  s = pausarSesionGps(s, 5000);
  assert.equal(s.estado, 'pausada');
  assert.equal(s.duracionActivaMs, 4000);

  s = reanudarSesionGps(s, 20000);
  s = agregarPuntoGps(s, p(0, 0.01, 20000));
  assert.equal(s.distanciaM, 0);
  assert.equal(s.puntos.length, 2);
});

test('finalizar conserva solo duracion activa y produce resumen estable', () => {
  let s = crearSesionGps({ deporte: 'ride', ahoraMs: 1000 });
  s = agregarPuntoGps(s, p(0, 0, 1000));
  s = agregarPuntoGps(s, p(0, 0.0001, 3000));
  s = pausarSesionGps(s, 5000);
  s = reanudarSesionGps(s, 15000);
  s = finalizarSesionGps(s, 19000);
  const r = resumenSesionGps(s);
  assert.equal(s.estado, 'finalizada');
  assert.equal(r.duration_seconds, 8);
  assert.equal(r.sport_type, 'ride');
  assert.equal(r.puntos, 2);
  assert.ok(r.distancia_km > 0.011 && r.distancia_km < 0.012);
});


test('rechaza coordenadas invalidas', () => {
  assert.equal(normalizarPuntoGps(p(91, 0, 1000)), null);
  assert.equal(normalizarPuntoGps(p(0, 181, 1000)), null);
  assert.equal(normalizarPuntoGps(p(0, 0, 0)), null);
});

test('timestamp fuera de orden reancla sin sumar un salto', () => {
  let s = crearSesionGps({ ahoraMs: 1000 });
  s = agregarPuntoGps(s, p(0, 0, 2000));
  s = agregarPuntoGps(s, p(0, 0.001, 1500));
  assert.equal(s.distanciaM, 0);
  assert.equal(s.descartados.salto, 1);
  assert.equal(s.puntos.length, 2);
});

test('gap largo reancla y no une dos tramos separados', () => {
  let s = crearSesionGps({ ahoraMs: 1000 });
  s = agregarPuntoGps(s, p(0, 0, 1000));
  s = agregarPuntoGps(s, p(0, 0.001, 200000));
  assert.equal(s.distanciaM, 0);
  assert.equal(s.descartados.salto, 1);
  s = agregarPuntoGps(s, p(0, 0.0011, 202000));
  assert.ok(s.distanciaM > 11 && s.distanciaM < 12);
});

test('ignora puntos mientras esta pausada o finalizada', () => {
  let s = crearSesionGps({ ahoraMs: 1000 });
  s = agregarPuntoGps(s, p(0, 0, 1000));
  s = pausarSesionGps(s, 2000);
  const pausada = agregarPuntoGps(s, p(0, 0.001, 3000));
  assert.equal(pausada.puntos.length, 1);
  s = reanudarSesionGps(pausada, 4000);
  s = finalizarSesionGps(s, 5000);
  const finalizada = agregarPuntoGps(s, p(0, 0.002, 6000));
  assert.equal(finalizada.puntos.length, 1);
});

test('micro movimientos terminan sumando al superar el umbral desde el ancla', () => {
  let s = crearSesionGps({ ahoraMs: 1000 });
  s = agregarPuntoGps(s, p(0, 0, 1000));
  s = agregarPuntoGps(s, p(0, 0.000005, 2000));
  s = agregarPuntoGps(s, p(0, 0.00003, 3000));
  assert.ok(s.distanciaM > 3 && s.distanciaM < 4);
});


test('duracion activa larga no queda limitada por frecuencia GPS', () => {
  const inicio = 1_700_000_000_000;
  let sesion = crearSesionGps({ ahoraMs: inicio });
  sesion = pausarSesionGps(sesion, inicio + 10 * 60 * 1000);
  assert.equal(resumenSesionGps(sesion).duration_seconds, 600);
});

test('duracion excluye pausas largas entre dos tramos', () => {
  const inicio = 1_700_000_000_000;
  let sesion = crearSesionGps({ ahoraMs: inicio });
  sesion = pausarSesionGps(sesion, inicio + 5 * 60 * 1000);
  sesion = reanudarSesionGps(sesion, inicio + 35 * 60 * 1000);
  sesion = finalizarSesionGps(sesion, inicio + 40 * 60 * 1000);
  assert.equal(resumenSesionGps(sesion).duration_seconds, 600);
});


test('sessionId se conserva y puede fijarse para idempotencia', () => {
  const sesion = crearSesionGps({ ahoraMs: 1_700_000_000_000, sessionId: 'sesion_test_123' });
  assert.equal(sesion.sessionId, 'sesion_test_123');
  const pausada = pausarSesionGps(sesion, 1_700_000_001_000);
  const reanudada = reanudarSesionGps(pausada, 1_700_000_002_000);
  const finalizada = finalizarSesionGps(reanudada, 1_700_000_003_000);
  assert.equal(finalizada.sessionId, 'sesion_test_123');
});
