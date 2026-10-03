const test = require('node:test');
const assert = require('node:assert/strict');
const { decidirAccion, ACCIONES } = require('../lib/progresoDecision');
const { evaluarElegibilidadDia } = require('../lib/progresoHealthSombra');
const { calcularProgresoChallengeHealth } = require('../lib/progresoHealth');
const { recalcularProgresoUsuario, MODOS } = require('../lib/progresoServicio');

const ucBase = (extra = {}) => ({
  id: 'uc1', user_id: 'u1', challenge_id: 'c1', status: 'active',
  started_at: '2026-09-01T00:00:00Z', pausado: false, pausado_at: null,
  periodos_pausados: [], version: 'estandar', modalidad: 'estandar',
  km_completed: 60, km_base: 0, km_base_motivo: null, ...extra,
});
const challenge = { id: 'c1', title: 'Test', modalidades: null, total_distance_km: 68 };
const residual = ({ km, cerrado, fecha = '2026-09-20' }) => ({
  fecha, timezone: 'UTC',
  ventana_utc: { inicio: `${fecha}T00:00:00.000Z`, fin: `${fecha}T24:00:00.000Z` },
  residual: { total_crudo_km: km }, hipotesis_cierre: { se_cerraria: cerrado }, marcas: [],
});
// Date.parse no acepta T24 en todos los runtimes: generar fin del día siguiente explícitamente.
const r = (km, cerrado) => ({
  fecha: '2026-09-20', timezone: 'UTC',
  ventana_utc: { inicio: '2026-09-20T00:00:00.000Z', fin: '2026-09-21T00:00:00.000Z' },
  residual: { total_crudo_km: km }, hipotesis_cierre: { se_cerraria: cerrado }, marcas: [],
});

test('Health provisional mueve km visible pero no completa', () => {
  const uc = ucBase();
  const resultado = calcularProgresoChallengeHealth({ uc, challenge, actividades: [], residuales: [r(10, false)] });
  const d = decidirAccion(uc, resultado);
  assert.equal(resultado.exacto.kmProgreso, 10);
  assert.equal(resultado.exacto.kmAptoCompletar, 0);
  assert.equal(d.accion, ACCIONES.ACTUALIZAR_KM);
});

test('Health estable puede completar y congela solo el total estable', () => {
  const uc = ucBase({ km_completed: 67 });
  const actividades = [{ id: 'a1', distance_km: 60, recorded_at: '2026-09-10T12:00:00Z', excluida: false }];
  const resultado = calcularProgresoChallengeHealth({ uc, challenge, actividades, residuales: [r(8, true), { ...r(5, false), fecha: '2026-09-22', ventana_utc: { inicio: '2026-09-22T00:00:00.000Z', fin: '2026-09-23T00:00:00.000Z' } }] });
  const d = decidirAccion(uc, resultado);
  assert.equal(resultado.exacto.kmProgreso, 73);
  assert.equal(resultado.exacto.kmAptoCompletar, 68);
  assert.equal(d.accion, ACCIONES.COMPLETAR);
  assert.equal(d.kmNuevo, 68);
  assert.equal(d.kmVisible, 73);
});

test('sin kmAptoCompletar la decisión conserva 4A', () => {
  const d = decidirAccion(ucBase({ km_completed: 67 }), { exacto: { kmProgreso: 68, objetivoKm: 68 } });
  assert.equal(d.accion, ACCIONES.COMPLETAR);
  assert.equal(d.kmNuevo, 68);
});

test('pausa inválida vuelve inelegible el día Health', () => {
  const e = evaluarElegibilidadDia(ucBase({ periodos_pausados: [{ desde: 'mal', hasta: 'tambien-mal' }] }), r(5, true));
  assert.deepEqual(e, { elegible: false, motivo: 'pausa_invalida' });
});

test('servicio 4B escribe Health provisional pero no completa', async () => {
  const uc = ucBase({ km_completed: 0 });
  const writes = [];
  const repo = {
    leerEstadoUsuario: async (_userId, opciones) => {
      assert.equal(opciones.incluirHealth, true);
      return {
        userChallenges: [uc], challenges: new Map([['c1', challenge]]), actividades: [],
        dailyMovement: [{ fecha: '2026-09-20', timezone: 'UTC', distancia_caminando_km: 10, distancia_bici_km: 0, updated_at: '2026-09-21T01:00:00Z' }],
      };
    },
    actualizarKmCAS: async (x) => { writes.push(x); return true; },
    completarCAS: async () => { throw new Error('no debe completar'); },
    registrarEvento: async () => ({ creado: false, id: null }),
  };
  const informe = await recalcularProgresoUsuario({ repo, userId: 'u1', motivo: 'test', modo: MODOS.ESCRIBIR, incluirHealth: true, ahoraMs: Date.parse('2026-09-21T12:00:00Z') });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].kmNuevo, 10);
  assert.equal(informe.completados.length, 0);
});

test('servicio con Health apagado conserva camino 4A y no necesita dailyMovement', async () => {
  const uc = ucBase({ km_completed: 0 });
  let opcionesLeidas;
  const repo = {
    leerEstadoUsuario: async (_userId, opciones) => { opcionesLeidas = opciones; return { userChallenges: [uc], challenges: new Map([['c1', challenge]]), actividades: [] }; },
  };
  const informe = await recalcularProgresoUsuario({ repo, userId: 'u1', motivo: 'test', modo: MODOS.SIMULAR });
  assert.equal(opcionesLeidas.incluirHealth, false);
  assert.equal(informe.desafios[0].km_nuevo, 0);
});
