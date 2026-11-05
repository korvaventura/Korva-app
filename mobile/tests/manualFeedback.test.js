const test = require('node:test');
const assert = require('node:assert/strict');
const { resultadoCargaManual } = require('../services/manualFeedback');

test('actividad registrada pero sin avance no anuncia suma exitosa', () => {
  const r = resultadoCargaManual({
    data: { mensaje: 'Actividad registrada, pero no se sumaron kilómetros al desafío seleccionado', progreso: { recalculo: 'ok' } },
    challengeId: 'fuji',
    distancia: '4.82',
  });
  assert.equal(r.sinAvance, true);
  assert.equal(r.avanceConfirmado, false);
  assert.match(r.mensaje, /no se sumaron/);
});
test('recalculo pendiente no se anuncia como avance confirmado', () => {
  const r = resultadoCargaManual({
    data: { mensaje: 'Actividad registrada; los kilómetros se actualizarán cuando finalice el recálculo', progreso: { recalculo: 'pendiente' } },
    challengeId: 'fuji',
    distancia: '4.82',
  });
  assert.equal(r.pendiente, true);
  assert.equal(r.avanceConfirmado, false);
});
test('respuesta exitosa de motor se muestra literalmente', () => {
  const r = resultadoCargaManual({
    data: { mensaje: 'Actividad registrada y kilómetros sumados', progreso: { recalculo: 'ok' } },
    challengeId: 'fuji',
    distancia: '4.82',
  });
  assert.equal(r.mensaje, 'Actividad registrada y kilómetros sumados');
  assert.equal(r.avanceConfirmado, true);
});
test('modo libre no presume avance en desafíos', () => {
  const r = resultadoCargaManual({ data: {}, challengeId: null, distancia: '4.82' });
  assert.match(r.mensaje, /modo libre/);
  assert.equal(r.avanceConfirmado, false);
});
