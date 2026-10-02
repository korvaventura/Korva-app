// Helper de versión del desafío (Estándar / Extendida) de la app. Corre con: npm test (node --test).
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../utils/versionDesafio');

// Formato real de producción (después de la migración) y formato viejo (sin version).
const FIN = { id: 'ae54af78-dc6f-4cf5-af31-2c077ba58048', title: 'Fin del Mundo', total_distance_km: 103, modalidades: [{ tipo: 'run', label: 'Estándar', version: 'estandar', distancia_km: 103 }, { tipo: 'ride', label: 'Extendida', version: 'extendida', distancia_km: 309 }] };
const FIN_LEGACY = { ...FIN, modalidades: [{ tipo: 'run', label: 'Running', distancia_km: 103 }, { tipo: 'ride', label: 'Ciclismo', distancia_km: 309 }] };
const DUB = { title: 'Dubrovnik 19K', total_distance_km: 19.4, modalidades: [{ tipo: 'run', label: 'Estándar', version: 'estandar', distancia_km: 19.4 }, { tipo: 'ride', label: 'Extendida', version: 'extendida', distancia_km: 58.2 }] };

test('versión: usa `version` del backend nuevo y cae a `modalidad` legacy (run/ride y Running/Ciclismo)', () => {
  assert.equal(V.versionDeInscripcion({ version: 'extendida', modalidad: 'Running' }), 'extendida'); // version manda
  assert.equal(V.versionDeInscripcion({ version: 'estandar', modalidad: 'ride' }), 'estandar');
  assert.equal(V.versionDeInscripcion({ modalidad: 'ride' }), 'extendida');
  assert.equal(V.versionDeInscripcion({ modalidad: 'Ciclismo' }), 'extendida'); // Home vieja
  assert.equal(V.versionDeInscripcion({ modalidad: 'run' }), 'estandar');
  assert.equal(V.versionDeInscripcion({ modalidad: 'Running' }), 'estandar');
  assert.equal(V.versionDeInscripcion({ modalidad: 'General' }), 'estandar');
  assert.equal(V.versionDeInscripcion({ modalidad: null }), 'estandar');
  assert.equal(V.versionDeInscripcion({ version: 'ride' }), 'estandar'); // valor inválido → regla legacy
  assert.equal(V.versionDeInscripcion(null), 'estandar');
});

test('etiquetas: Estándar / Extendida; prefiere version_label del backend', () => {
  assert.equal(V.etiquetaVersion('estandar'), 'Estándar');
  assert.equal(V.etiquetaVersion('extendida'), 'Extendida');
  assert.equal(V.etiquetaDeInscripcion({ version: 'extendida', version_label: 'Extendida' }), 'Extendida');
  assert.equal(V.etiquetaDeInscripcion({ modalidad: 'Ciclismo' }), 'Extendida');
  assert.equal(V.etiquetaDeInscripcion({ modalidad: 'Running' }), 'Estándar');
  for (const item of [{ modalidad: 'run' }, { modalidad: 'ride' }, { version: 'estandar' }, { version: 'extendida' }]) {
    assert.doesNotMatch(V.etiquetaDeInscripcion(item), /Running|Ciclismo|run|ride/i);
  }
});

test('versiones del desafío y distancia de cada una (formato nuevo y legacy iguales)', () => {
  const esperado = [{ version: 'estandar', label: 'Estándar', distancia_km: 103 }, { version: 'extendida', label: 'Extendida', distancia_km: 309 }];
  assert.deepEqual(V.versionesDelDesafio(FIN), esperado);
  assert.deepEqual(V.versionesDelDesafio(FIN_LEGACY), esperado);
  assert.equal(V.distanciaDeVersion(FIN, 'estandar'), 103);
  assert.equal(V.distanciaDeVersion(FIN, 'extendida'), 309);
  assert.equal(V.distanciaDeVersion(DUB, 'extendida'), 58.2);
  assert.equal(V.distanciaDeVersion({ modalidades: [] }, 'extendida'), null);
  assert.deepEqual(V.versionesDelDesafio({}), []);
});

test('distancia objetivo de una inscripción: versión elegida → primera → total_distance_km', () => {
  assert.equal(V.distanciaDeInscripcion({ version: 'estandar' }, FIN), 103);
  assert.equal(V.distanciaDeInscripcion({ version: 'extendida' }, FIN), 309);
  assert.equal(V.distanciaDeInscripcion({ modalidad: 'ride' }, FIN_LEGACY), 309); // fila vieja
  assert.equal(V.distanciaDeInscripcion({ version: 'extendida' }, { modalidades: [{ version: 'estandar', distancia_km: 50 }] }), 50);
  assert.equal(V.distanciaDeInscripcion({ version: 'extendida' }, { modalidades: [], total_distance_km: 42 }), 42);
  assert.equal(V.distanciaDeInscripcion({ version: 'extendida' }, { modalidades: null, total_distance_km: null }), null);
});

test('cambio de versión: solo cambia la distancia; los km acumulados (1:1, cualquier deporte) son los mismos', () => {
  const km = 5 + 10 + 30 + 7.5; // caminata + running + bici + mtb: todo suma igual
  const pct = (version) => Math.min((km / V.distanciaDeInscripcion({ version }, FIN)) * 100, 100);
  assert.equal(km, 52.5);
  assert.equal(Math.round(pct('estandar') * 10) / 10, 51);
  assert.equal(Math.round(pct('extendida') * 10) / 10, 17);
});

test('plan: escala por versión (distancia), no por deporte; modalidad legacy para el backend', () => {
  assert.deepEqual(V.planDeVersion('estandar'), { sesionesPorSemana: 4, factorDescanso: 0.6 });
  assert.deepEqual(V.planDeVersion('extendida'), { sesionesPorSemana: 5, factorDescanso: 0.75 });
  assert.deepEqual([V.modalidadLegacy('estandar'), V.modalidadLegacy('extendida')], ['run', 'ride']);
  assert.notEqual(V.iconoVersion('estandar'), 'walk-outline');
  assert.notEqual(V.iconoVersion('extendida'), 'bicycle-outline');
});
