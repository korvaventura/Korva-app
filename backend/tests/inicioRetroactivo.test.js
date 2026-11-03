const test = require('node:test');
const assert = require('node:assert/strict');
const { resolverInicioRetroactivo } = require('../lib/inicioRetroactivo');

const resolver = (fechaActividad, extra = {}) => resolverInicioRetroactivo({
  inicioActual: '2026-11-02T20:57:33.752Z', fechaActividad, ...extra,
});
test('retroactividad: una salida anterior legítima puede mover inicio sin superar 30 días', () => {
  assert.equal(resolver('2026-11-01T08:00:00Z'), '2026-11-01T08:00:00Z');
  assert.equal(resolver('2026-09-01T00:00:00Z'), '2026-10-03T20:57:33.752Z');
});
test('retroactividad: compara instantes, no textos con zonas distintas', () => {
  assert.equal(resolver('2026-11-02T23:00:00+03:00'), '2026-11-02T23:00:00+03:00');
  assert.equal(resolver('2026-11-02T22:00:00+01:00'), null); // es posterior al inicio UTC
});
test('retroactividad: fechas inválidas no desplazan el inicio', () => {
  assert.equal(resolver('invalido'), null);
  assert.equal(resolver(null), null);
  assert.equal(resolver('2026-11-03T08:00:00Z'), null);
});
test('retroactividad: piso de reinicio bloquea actividades anteriores', () => {
  const piso = '2026-11-02T20:57:33.752Z';
  assert.equal(resolver('2026-10-28T10:00:00Z', { inicioProtegido: piso }), null);
  assert.equal(resolver('2026-11-02T21:30:00Z', { inicioProtegido: piso }), null);
  assert.equal(resolver('2026-10-28T10:00:00Z', { inicioProtegido: 'invalido' }), null);
});
