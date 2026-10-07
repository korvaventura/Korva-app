const test = require('node:test');
const assert = require('node:assert/strict');
const { diaAutorizadoHealth, filtrarResidualesAutorizados } = require('../lib/consentimientoHealth');
const { calcularProgresoChallengeHealth } = require('../lib/progresoHealth');
const { recalcularProgresoUsuario } = require('../lib/progresoServicio');
const { progresoRutaLibre, ISLANDIA } = require('../lib/rutasLibres');
const ventana = { user_id: 'u', tipo: 'pago', participacion_id: 'p', timezone: 'UTC',
  version: 'movimiento-desafios-v1', desde: '2026-10-08T00:00:00Z', hasta: null };
const residual = (dia, km = 5) => ({ timezone: 'UTC', fecha: `2026-10-${dia}`,
  ventana_utc: { inicio: `2026-10-${dia}T00:00:00Z`, fin: `2026-10-${String(Number(dia) + 1).padStart(2, '0')}T00:00:00Z` },
  residual: { total_crudo_km: km }, hipotesis_cierre: { se_cerraria: true } });
const verificar = (r, ventanas = [ventana], extra = {}) => diaAutorizadoHealth({
  userId: 'u', tipo: 'pago', participacionId: 'p', ventanas, residual: r, ...extra });

test('sin autorización no cuenta, ni importa días anteriores', () => {
  assert.equal(verificar(residual('08'), []), false);
  assert.equal(verificar(residual('07')), false);
  assert.equal(verificar(residual('08')), true);
});
test('consentimiento de otra cuenta, participación, tipo, zona o versión no cuenta', () => {
  for (const cambio of [{ user_id: 'otro' }, { participacion_id: 'otro' }, { tipo: 'libre' },
    { timezone: 'Europe/Warsaw' }, { version: 'vieja' }]) {
    assert.equal(verificar(residual('08'), [{ ...ventana, ...cambio }]), false);
  }
});
test('desactivar conserva días completos anteriores, excluye el día parcial', () => {
  const cerrada = { ...ventana, hasta: '2026-10-09T12:00:00Z' };
  assert.equal(verificar(residual('08'), [cerrada]), true);
  assert.equal(verificar(residual('09'), [cerrada]), false);
  assert.equal(verificar(residual('10'), [cerrada]), false);
});
test('reactivar deja fuera el intervalo sin autorización y no duplica ventanas', () => {
  const ventanas = [{ ...ventana, hasta: '2026-10-09T00:00:00Z' },
    { ...ventana, desde: '2026-10-11T00:00:00Z' }, ventana, ventana];
  assert.equal(filtrarResidualesAutorizados({ userId: 'u', tipo: 'pago', participacionId: 'p',
    ventanas: ventanas.slice(0, 2), residuales: [residual('08'), residual('09'), residual('10'), residual('11')] }).length, 2);
  assert.equal(filtrarResidualesAutorizados({ userId: 'u', tipo: 'pago', participacionId: 'p',
    ventanas, residuales: [residual('08')] }).length, 1);
});
test('fechas inválidas y ventana vacía no autorizan', () => {
  for (const cambio of [{ desde: 'mal' }, { hasta: 'mal' }, { hasta: ventana.desde }]) {
    assert.equal(verificar(residual('08'), [{ ...ventana, ...cambio }]), false);
  }
  assert.equal(verificar({ ...residual('08'), ventana_utc: { inicio: 'mal', fin: 'mal' } }), false);
});
test('motor con consentimiento explícito solo suma a la participación seleccionada', () => {
  const uc = { id: 'p', user_id: 'u', challenge_id: 'c', status: 'active', started_at: '2026-10-01T00:00:00Z',
    pausado: false, periodos_pausados: [], km_base: 0, km_completed: 0, version: 'estandar' };
  const args = { uc, challenge: { id: 'c', title: 'Test', total_distance_km: 100 }, residuales: [residual('07'), residual('08')], consentimiento: [ventana] };
  assert.equal(calcularProgresoChallengeHealth(args).exacto.kmProgreso, 5);
  assert.equal(calcularProgresoChallengeHealth({ ...args, uc: { ...uc, id: 'otro' } }).exacto.kmProgreso, 0);
  assert.equal(calcularProgresoChallengeHealth({ ...args, consentimiento: [] }).exacto.kmProgreso, 0);
});
test('todos los recálculos conservan aportes autorizados aunque el writer no pase incluirHealth', async () => {
  const uc = { id: 'p', user_id: 'u', challenge_id: 'c', status: 'active', started_at: '2026-10-01T00:00:00Z',
    pausado: false, periodos_pausados: [], km_base: 0, km_completed: 0, version: 'estandar' };
  const repo = { leerEstadoUsuario: async () => ({ userChallenges: [uc, { ...uc, id: 'otro' }],
    challenges: new Map([['c', { id: 'c', title: 'Test', total_distance_km: 100 }]]), actividades: [],
    dailyMovement: [{ fecha: '2026-10-08', timezone: 'UTC', distancia_caminando_km: 5, distancia_bici_km: 0, updated_at: '2026-10-09T01:00:00Z' }],
    healthConsent: [ventana], incluirHealthAutorizado: true }) };
  const r = await recalcularProgresoUsuario({ repo, userId: 'u', motivo: 'recuperacion', ahoraMs: Date.parse('2026-10-11T00:00:00Z') });
  assert.equal(r.desafios[0].km_nuevo, 5); assert.equal(r.desafios[1].km_nuevo, 0);
});
test('ruta gratuita descuenta actividades, excluye Salud en pausa y conserva cierre guardado', () => {
  const p = { id: 'p', user_id: 'u', route_id: ISLANDIA.id, accepted_at: '2026-10-01T00:00:00Z', paused_at: null, pause_periods: [] };
  const actividades = [{ id: 'a', user_id: 'u', distance_km: 5, sport_type: 'walk', recorded_at: '2026-10-08T12:00:00Z', duration_seconds: 3600, excluida: false }];
  const health = { ventanas: [{ ...ventana, tipo: 'libre' }], dias: [{ fecha: '2026-10-08', timezone: 'UTC', distancia_caminando_km: 8, distancia_bici_km: 0, updated_at: '2026-10-09T01:00:00Z' }] };
  const ahora = Date.parse('2026-10-11T00:00:00Z');
  const r = progresoRutaLibre(p, actividades, 'u', ahora, health);
  assert.equal(r.km, 8); assert.equal(r.km_movimiento_diario, 3);
  assert.equal(progresoRutaLibre({ ...p, paused_at: '2026-10-08T01:00:00Z' }, [], 'u', ahora, health).km, 0);
  const cerrado = progresoRutaLibre({ ...p, health_completed_at: '2026-10-10T00:00:00Z' }, [], 'u', ahora, { ventanas: [], dias: [] });
  assert.equal(cerrado.km, 1400); assert.equal(cerrado.estado, 'completada');
});
