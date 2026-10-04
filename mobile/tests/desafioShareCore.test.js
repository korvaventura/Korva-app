const test = require('node:test');
const assert = require('node:assert/strict');
const { datosDesafioCompletado } = require('../services/desafioShareCore');

const dub = { title: 'Dubrovnik 19K', modalidades: [{ version: 'estandar', distancia_km: 19.4 }, { version: 'extendida', distancia_km: 58.2 }] };

test('compartir completado conserva la distancia objetivo decimal, no el excedente', () => {
  const d = datosDesafioCompletado({ status: 'completed', km_completed: 20.5, challenges: dub });
  assert.equal(d.distanciaTexto, '19.4');
  assert.equal(d.nombre, 'Dubrovnik 19K');
  assert.equal(d.version, 'Estándar');
});
test('versión extendida conserva su distancia y no depende del deporte', () => {
  const d = datosDesafioCompletado({ status: 'completed', version: 'extendida', sport_type: 'run', challenges: dub });
  assert.equal(d.distancia, 58.2);
  assert.equal(d.version, 'Extendida');
});
test('no permite compartir como completado un desafío pendiente o activo incompleto', () => {
  assert.equal(datosDesafioCompletado({ pending: true, status: 'completed', distancia_total: 68 }), null);
  assert.equal(datosDesafioCompletado({ status: 'active', km_completed: 5, distancia_total: 68 }), null);
});
test('no infiere completitud a partir de porcentaje o meta_fecha', () => {
  assert.equal(datosDesafioCompletado({ porcentaje: 100, meta_fecha: '2026-01-01', distancia_total: 68 }), null);
});
test('compatibilidad Home con progreso suficiente y estados terminales', () => {
  assert.equal(datosDesafioCompletado({ km_completados: '68', distancia_total: '68', challenge: 'Monte Fuji' }).nombre, 'Monte Fuji');
  for (const status of ['completed', 'shipped', 'cargado']) {
    assert.ok(datosDesafioCompletado({ status, distancia_total: 68 }));
  }
});
test('no publica distancia inválida ni inventa la fecha de completado', () => {
  for (const distancia_total of [0, -1, NaN, Infinity]) {
    assert.equal(datosDesafioCompletado({ status: 'completed', distancia_total }), null);
  }
  assert.equal(datosDesafioCompletado({ status: 'completed', distancia_total: 68 }).fecha, null);
  assert.equal(datosDesafioCompletado({ status: 'completed', distancia_total: 68, completed_at: 'invalid' }).fecha, null);
});
test('preparar la placa no modifica la inscripción ni sus kilómetros', () => {
  const item = { status: 'completed', distancia_total: 19.4, km_completed: 20.5, challenges: dub };
  const antes = JSON.stringify(item);
  datosDesafioCompletado(item);
  assert.equal(JSON.stringify(item), antes);
});


test('días publicados requieren fechas reales y ordenadas, sin usar fecha objetivo', () => {
  const base = { status: 'completed', distancia_total: 68 };
  assert.equal(datosDesafioCompletado({ ...base, started_at: '2026-10-01T12:00:00Z', completed_at: '2026-10-04T12:00:00Z' }).dias, 3);
  assert.equal(datosDesafioCompletado({ ...base, started_at: '2026-10-01', meta_fecha: '2026-10-04' }).dias, null);
  assert.equal(datosDesafioCompletado({ ...base, started_at: 'invalid', completed_at: '2026-10-04' }).dias, null);
  assert.equal(datosDesafioCompletado({ ...base, started_at: '2026-10-05', completed_at: '2026-10-04' }).dias, null);
});

test('dorsal usa únicamente el número asignado a este desafío', () => {
  const base = { status: 'completed', distancia_total: 68 };
  assert.equal(datosDesafioCompletado({ ...base, numero_bib: 321 }).dorsal, '0321');
  assert.equal(datosDesafioCompletado({ ...base, bib_number: 555 }).dorsal, null);
  assert.equal(datosDesafioCompletado({ ...base, numero_bib: 0 }).dorsal, null);
  assert.equal(datosDesafioCompletado({ ...base, numero_bib: 'invalid' }).dorsal, null);
});
