const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { toleranciaDuplicadoKm, rangoDuplicadoKm } = require('../lib/toleranciaDuplicados');

test('margen de duplicado: 5 % con mínimo de 0,3 km', () => {
  assert.equal(toleranciaDuplicadoKm(3), 0.3);
  assert.equal(toleranciaDuplicadoKm(6), 0.3);
  assert.equal(toleranciaDuplicadoKm(10), 0.5);
  assert.ok(Math.abs(toleranciaDuplicadoKm(42.2) - 2.11) < 1e-9);
  assert.equal(toleranciaDuplicadoKm(null), 0.3);
  assert.deepEqual(rangoDuplicadoKm(10), { min: 9.5, max: 10.5 });
  assert.deepEqual(rangoDuplicadoKm(0.1), { min: 0, max: 0.4 });
});

test('la misma salida de 10 km medida 10,4 km por otra app se reconoce como duplicada', () => {
  const r = rangoDuplicadoKm(10.4);
  assert.ok(10 >= r.min && 10 <= r.max);
  const viejo = { min: 10.4 - 0.3, max: 10.4 + 0.3 };
  assert.ok(!(10 >= viejo.min && 10 <= viejo.max));
});

test('Strava (todas sus entradas) y Korva GPS usan la misma regla', () => {
  const strava = fs.readFileSync(path.join(__dirname, '..', 'routes', 'strava.js'), 'utf8');
  assert.match(strava, /const rango = rangoDuplicadoKm\(km\);/);
  assert.doesNotMatch(strava, /TOLERANCIA_KM/);
  const repo = fs.readFileSync(path.join(__dirname, '..', 'lib', 'progresoRepositorioSupabase.js'), 'utf8');
  assert.match(repo, /rangoDuplicadoKm\(distanceKm\)\.min/);
  assert.doesNotMatch(repo, /distanceKm - 0\.3/);
});
