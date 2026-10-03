const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluarElegibilidadDia, simularHealthParaDesafio } = require('../lib/progresoHealthSombra');

const dia = (inicio = '2026-10-01T22:00:00.000Z', fin = '2026-10-02T22:00:00.000Z', km = 5, cierre = true) => ({
  fecha: '2026-10-02', timezone: 'Europe/Zagreb',
  ventana_utc: { inicio, fin, horas: 24 },
  residual: { total_crudo_km: km }, hipotesis_cierre: { se_cerraria: cierre }, marcas: [],
});
const uc = (extra = {}) => ({ id: 'uc1', challenge_id: 'c1', status: 'active', started_at: '2026-09-20T10:00:00', periodos_pausados: [], pausado: false, pausado_at: null, ...extra });

// started_at sin zona se interpreta como UTC, igual que 4A.
test('día completo posterior al inicio es elegible', () => {
  assert.deepEqual(evaluarElegibilidadDia(uc(), dia()), { elegible: true, motivo: 'dia_completo_elegible' });
});

test('día tocado por started_at queda fuera', () => {
  const r = evaluarElegibilidadDia(uc({ started_at: '2026-10-02T08:00:00' }), dia());
  assert.equal(r.elegible, false); assert.equal(r.motivo, 'dia_tocado_por_inicio');
});

test('día tocado por pausa cerrada queda fuera', () => {
  const r = evaluarElegibilidadDia(uc({ periodos_pausados: [{ desde: '2026-10-02T09:00:00Z', hasta: '2026-10-02T10:00:00Z' }] }), dia());
  assert.equal(r.elegible, false); assert.equal(r.motivo, 'dia_tocado_por_pausa');
});

test('pausa que termina justo al comenzar el día no lo invalida', () => {
  const r = evaluarElegibilidadDia(uc({ periodos_pausados: [{ desde: '2026-10-01T20:00:00Z', hasta: '2026-10-01T22:00:00Z' }] }), dia());
  assert.equal(r.elegible, true);
});

test('pausa abierta que comienza dentro del día lo excluye', () => {
  const r = evaluarElegibilidadDia(uc({ pausado: true, pausado_at: '2026-10-02T12:00:00Z' }), dia());
  assert.equal(r.elegible, false); assert.equal(r.motivo, 'dia_tocado_por_pausa_abierta');
});

test('simulación separa elegibilidad de hipótesis de cierre y no altera 4A', () => {
  const r = simularHealthParaDesafio({
    uc: uc(),
    progreso4a: { km_reconstruido: 10, km_guardado: 10, km_base: 2, objetivo_km: 20 },
    residuales: [dia(undefined, undefined, 4, true), { ...dia('2026-10-02T22:00:00Z', '2026-10-03T22:00:00Z', 7, false), fecha: '2026-10-03' }],
  });
  assert.equal(r.km_4a, 10);
  assert.equal(r.residual_elegible_km, 11);
  assert.equal(r.residual_elegible_cierre_hipotetico_km, 4);
  assert.equal(r.km_4b_sombra_sin_resolver_cierre, 21);
  assert.equal(r.km_4b_sombra_con_cierre_hipotetico, 14);
  assert.equal(r.completaria_sin_resolver_cierre, true);
  assert.equal(r.completaria_con_cierre_hipotetico, false);
});
