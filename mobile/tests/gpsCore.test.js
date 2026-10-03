import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distanciaHaversineM, crearSesionGps, agregarPuntoGps,
  pausarSesionGps, reanudarSesionGps, finalizarSesionGps, resumenSesionGps,
} from '../services/gps/gpsCore.js';

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
