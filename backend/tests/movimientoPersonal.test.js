const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularMovimientoPersonal } = require('../lib/movimientoPersonal');

const AHORA = Date.parse('2026-10-04T15:00:00Z');
const act = (extra = {}) => ({ id: 'a1', user_id: 'u1', source: 'korva_gps', sport_type: 'run',
  distance_km: 5, recorded_at: '2026-10-04T08:00:00', duration_seconds: 1800, excluida: false, ...extra });
const health = (extra = {}) => ({ user_id: 'u1', fecha: '2026-10-04', timezone: 'Europe/Zagreb',
  distancia_caminando_km: 8, distancia_bici_km: 0, pasos: 10000,
  updated_at: '2026-10-04T14:00:00Z', ...extra });
const calcular = (extra = {}) => calcularMovimientoPersonal({ userId: 'u1', timezone: 'Europe/Zagreb',
  ahoraMs: AHORA, actividades: [], dailyMovement: [], ...extra });

test('personal: cuenta sin desafíos, mantiene pasos ausentes como null y semana de lunes a hoy', () => {
  const r = calcular();
  assert.equal(r.hoy.km_movimiento, 0);
  assert.equal(r.hoy.pasos, null);
  assert.equal(r.hoy.health_estado, 'sin_datos');
  assert.equal(r.semana.desde, '2026-09-28');
  assert.equal(r.semana.dias.length, 7);
  assert.equal(r.semana.pasos_disponibles, null);
});

test('personal: una actividad cuenta una vez aunque alimente varios desafíos', () => {
  const a = act({ challenge_id: 'fuji' });
  const r = calcular({ actividades: [a], userChallenges: [
    { km_completed: 5 }, { km_completed: 5 }, { km_base: 100 },
  ] });
  assert.equal(r.historial.km_actividades, 5);
  assert.equal(r.hoy.km_movimiento, 5);
});

test('personal: actividad 5 + Health 8 = 8, pasos no se convierten a kilómetros', () => {
  const r = calcular({ actividades: [act()], dailyMovement: [health()] });
  assert.equal(r.hoy.km_actividades, 5);
  assert.equal(r.hoy.km_health_adicional, 3);
  assert.equal(r.hoy.km_movimiento, 8);
  assert.equal(r.hoy.pasos, 10000);
});

test('personal: Health menor que GPS no resta kilómetros de la actividad', () => {
  const r = calcular({ actividades: [act()], dailyMovement: [health({ distancia_caminando_km: 3 })] });
  assert.equal(r.hoy.km_movimiento, 5);
});

test('personal: categorías pie/bici y natación conservan residual por categoría', () => {
  const r = calcular({ actividades: [act(), act({ id: 'b', sport_type: 'ride', distance_km: 10 }),
    act({ id: 'c', sport_type: 'swim', distance_km: 2 })],
  dailyMovement: [health({ distancia_bici_km: 12 })] });
  assert.equal(r.hoy.km_actividades, 17);
  assert.equal(r.hoy.km_health_adicional, 5);
  assert.equal(r.hoy.km_movimiento, 22);
});

test('personal: manual sin clasificar resta del residual compatible', () => {
  const r = calcular({ actividades: [act({ source: 'manual', sport_type: 'manual', distance_km: 4 })],
    dailyMovement: [health()] });
  assert.equal(r.hoy.km_health_adicional, 4);
  assert.equal(r.hoy.km_movimiento, 8);
});

test('personal: ignora actividades excluidas y datos de otros usuarios', () => {
  const r = calcular({ actividades: [act({ excluida: true }), act({ id: 'otro', user_id: 'u2' })],
    dailyMovement: [health({ user_id: 'u2' })] });
  assert.equal(r.historial.cantidad_actividades, 0);
  assert.equal(r.hoy.health_estado, 'sin_datos');
});

test('personal: historial anterior a la compra cuenta, sin atribuirlo a hoy', () => {
  const r = calcular({ actividades: [act({ recorded_at: '2025-01-01T08:00:00' })] });
  assert.equal(r.historial.km_actividades, 5);
  assert.equal(r.semana.km_actividades, 0);
});

test('personal: cruce de medianoche reparte kilómetros y descuenta Health en ambos días', () => {
  // 23:30 sábado → 00:30 domingo, en Zagreb: 5 km en cada día.
  const a = act({ recorded_at: '2026-10-03T21:30:00Z', duration_seconds: 3600, distance_km: 10 });
  const r = calcular({ actividades: [a], dailyMovement: [
    health({ fecha: '2026-10-03', distancia_caminando_km: 5 }),
    health({ distancia_caminando_km: 5 }),
  ] });
  assert.equal(r.historial.km_actividades, 10);
  assert.equal(r.hoy.km_actividades, 5);
  assert.equal(r.semana.km_health_adicional, 0);
  assert.equal(r.semana.km_movimiento, 10);
});

test('personal: actividad del domingo anterior aporta solo el solape con esta semana', () => {
  const r = calcular({ actividades: [act({ recorded_at: '2026-09-27T21:30:00Z',
    duration_seconds: 3600, distance_km: 10 })] });
  assert.equal(r.historial.km_actividades, 10);
  assert.equal(r.semana.km_actividades, 5);
});

test('personal: timestamp sin zona se interpreta UTC, no con la zona del servidor', () => {
  const r = calcular({ actividades: [act({ recorded_at: '2026-10-03T23:30:00', duration_seconds: 0 })] });
  assert.equal(r.hoy.km_actividades, 5);
});

test('personal: zonas equivalentes conservan Health; ventanas diferentes no se suman', () => {
  assert.equal(calcular({ dailyMovement: [health({ timezone: 'Europe/Warsaw' })] }).hoy.km_movimiento, 8);
  const r = calcular({ actividades: [act()], dailyMovement: [health({ timezone: 'America/Argentina/Buenos_Aires' })] });
  assert.equal(r.hoy.km_movimiento, 5);
  assert.equal(r.hoy.pasos, null);
  assert.equal(r.hoy.health_estado, 'zona_incompatible');
  assert.deepEqual(r.advertencias, ['health_zona_incompatible']);
});

test('personal: día de 25 horas usa la ventana local correcta', () => {
  const r = calcular({ ahoraMs: Date.parse('2026-10-25T15:00:00Z'),
    actividades: [act({ recorded_at: '2026-10-24T22:30:00Z' })],
    dailyMovement: [health({ fecha: '2026-10-25' })] });
  assert.equal(r.hoy.km_movimiento, 8);
});

test('personal: día Health con cero pasos es conocido, no dato ausente', () => {
  const r = calcular({ dailyMovement: [health({ distancia_caminando_km: 0, pasos: 0 })] });
  assert.equal(r.hoy.pasos, 0);
  assert.equal(r.hoy.health_estado, 'disponible');
  assert.equal(r.semana.dias_con_datos_pasos, 1);
});

test('personal: Health inválido no produce un total engañoso', () => {
  const r = calcular({ actividades: [act()], dailyMovement: [health({ distancia_caminando_km: null })] });
  assert.equal(r.hoy.km_movimiento, 5);
  assert.equal(r.hoy.health_estado, 'datos_invalidos');
  assert.deepEqual(r.advertencias, ['health_datos_invalidos']);
});

test('personal: correcciones posteriores pueden bajar el total; no congela métricas', () => {
  const antes = calcular({ actividades: [act()], dailyMovement: [health()] });
  const despues = calcular({ actividades: [act()], dailyMovement: [health({ distancia_caminando_km: 6 })] });
  assert.equal(antes.hoy.km_movimiento, 8);
  assert.equal(despues.hoy.km_movimiento, 6);
  assert.equal(despues.hoy.revisable, true);
});

test('personal: no acepta duplicados de filas para evitar conteo repetido', () => {
  assert.throws(() => calcular({ actividades: [act(), act()] }), /repetida/);
  assert.throws(() => calcular({ dailyMovement: [health(), health()] }), /repetido/);
});

test('personal: entradas inválidas y futuras se reportan sin sumarlas', () => {
  const r = calcular({ actividades: [act({ distance_km: -1 }),
    act({ id: 'f', recorded_at: '2026-10-05T08:00:00Z' })],
  dailyMovement: [health({ fecha: '2026-02-30' })] });
  assert.equal(r.historial.km_actividades, 0);
  assert.deepEqual(r.advertencias, ['actividad_futura', 'actividad_invalida', 'health_fecha_invalida']);
});

test('personal: el cálculo no muta los datos recibidos', () => {
  const entrada = { actividades: [act()], dailyMovement: [health()] };
  const copia = JSON.stringify(entrada);
  Object.freeze(entrada.actividades[0]); Object.freeze(entrada.dailyMovement[0]);
  calcular(entrada);
  assert.equal(JSON.stringify(entrada), copia);
});

test('personal: exige usuario, zona válida y reloj explícito', () => {
  assert.throws(() => calcular({ userId: '' }), /userId/);
  assert.throws(() => calcular({ timezone: 'no-existe' }), /timezone/);
  assert.throws(() => calcular({ ahoraMs: undefined }), /ahoraMs/);
});
