// Tests de la función pura del residual (Etapa 3, modo sombra).
// Ejecutar desde la carpeta backend:  npm test
// Usa el runner incluido en Node (node:test). No toca la base de datos.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  categorizarActividad,
  ventanaDiaUTC,
  recordedAtAMs,
  calcularResidualDia,
  CATEGORIAS,
} = require('../lib/residualMovimiento');

// Instante de referencia fijo (para que los tests no dependan del día en que se corren).
const AHORA = Date.parse('2026-10-10T12:00:00Z');

const dia = (fecha, timezone, pie, bici = 0, updated_at = '2026-10-05T10:00:00Z') => ({
  fecha,
  timezone,
  distancia_caminando_km: pie,
  distancia_bici_km: bici,
  updated_at,
  cerrado: false,
});

let contador = 0;
const act = ({ source = 'strava', sport_type = 'run', km, recorded_at, duration_seconds = null, excluida = false }) => ({
  id: `act-${++contador}`,
  source,
  sport_type,
  distance_km: km,
  recorded_at,
  duration_seconds,
  excluida,
});

const ZAGREB = 'Europe/Zagreb';
const BAIRES = 'America/Argentina/Buenos_Aires';

// ---------------------------------------------------------------------------
// Casos del documento
// ---------------------------------------------------------------------------

test('solo Health: sin actividades, el residual es todo lo de Salud', () => {
  const r = calcularResidualDia(dia('2026-09-28', ZAGREB, 7), [], AHORA);
  assert.equal(r.residual.pie_km, 7);
  assert.equal(r.residual.bici_km, 0);
  assert.equal(r.residual.total_crudo_km, 7);
  assert.equal(r.actividades.cantidad, 0);
});

test('corrida: Strava 10 km + Salud 13 km a pie → residual 3', () => {
  const r = calcularResidualDia(
    dia('2026-09-28', ZAGREB, 13),
    [act({ km: 10, recorded_at: '2026-09-28T07:00:00', duration_seconds: 3600 })],
    AHORA
  );
  assert.equal(r.actividades.pie_km, 10);
  assert.equal(r.residual.total_crudo_km, 3);
  assert.equal(r.para_umbrales.diferencia_pie_km, 3);
});

test('Health menor que la corrida → residual 0 y marca', () => {
  const r = calcularResidualDia(
    dia('2026-09-28', ZAGREB, 9.6),
    [act({ km: 10, recorded_at: '2026-09-28T07:00:00', duration_seconds: 3600 })],
    AHORA
  );
  assert.equal(r.residual.total_crudo_km, 0);
  assert.equal(r.para_umbrales.diferencia_pie_km, -0.4);
  assert.ok(r.marcas.includes('actividades_pie_superan_health_pie'));
});

test('bici sin Health Cycling: la bici no borra lo caminado', () => {
  const r = calcularResidualDia(
    dia('2026-09-28', ZAGREB, 6, 0),
    [act({ sport_type: 'ride', km: 40, recorded_at: '2026-09-28T08:00:00', duration_seconds: 7200 })],
    AHORA
  );
  assert.equal(r.residual.pie_km, 6);
  assert.equal(r.residual.bici_km, 0);
  assert.equal(r.residual.total_crudo_km, 6);
  assert.ok(r.marcas.includes('bici_sin_health_cycling'));
});

test('bici con Health Cycling: se resta de la bici de Salud', () => {
  const r = calcularResidualDia(
    dia('2026-09-28', ZAGREB, 6, 40),
    [act({ sport_type: 'ride', km: 40, recorded_at: '2026-09-28T08:00:00', duration_seconds: 7200 })],
    AHORA
  );
  assert.equal(r.residual.bici_km, 0);
  assert.equal(r.residual.total_crudo_km, 6);
});

test('natación (Strava): no compatible, no resta', () => {
  const r = calcularResidualDia(
    dia('2026-09-28', ZAGREB, 5),
    [act({ sport_type: 'swim', km: 2, recorded_at: '2026-09-28T06:00:00', duration_seconds: 2400 })],
    AHORA
  );
  assert.equal(r.residual.total_crudo_km, 5);
  assert.equal(r.actividades.no_compatibles_km, 2);
});

test('manual desconocida: sin clasificar, resta del total y marca fecha aproximada', () => {
  const r = calcularResidualDia(
    dia('2026-09-28', ZAGREB, 8),
    [act({ source: 'manual', sport_type: 'manual', km: 5, recorded_at: '2026-09-28T18:00:00' })],
    AHORA
  );
  assert.equal(r.actividades.sin_clasificar_km, 5);
  assert.equal(r.residual.pie_km, 8);
  assert.equal(r.residual.total_crudo_km, 3);
  const a = r.detalle_actividades[0];
  assert.equal(a.es_manual, true);
  assert.equal(a.fecha_manual_aproximada, true);
  assert.equal(a.metodo_asignacion, 'manual_dia_de_carga_aproximado');
  assert.ok(r.marcas.includes('manual_fecha_aproximada'));
  assert.ok(r.marcas.includes('hay_actividades_sin_clasificar'));
});

test('manual "Natación": no compatible, no resta', () => {
  const r = calcularResidualDia(
    dia('2026-09-28', ZAGREB, 8),
    [act({ source: 'manual', sport_type: 'Natación', km: 2, recorded_at: '2026-09-28T18:00:00' })],
    AHORA
  );
  assert.equal(r.residual.total_crudo_km, 8);
  assert.equal(r.detalle_actividades[0].categoria, CATEGORIAS.NO_COMPATIBLE);
  assert.ok(r.marcas.includes('categoria_por_texto_libre'));
});

test('UTC vs Argentina: corrida 21:30 local (00:30 UTC del día siguiente) cae en el día local correcto', () => {
  const corrida = act({ km: 8, recorded_at: '2026-09-29T00:30:00', duration_seconds: 2400 });
  const dia28 = calcularResidualDia(dia('2026-09-28', BAIRES, 10), [corrida], AHORA);
  const dia29 = calcularResidualDia(dia('2026-09-29', BAIRES, 4), [corrida], AHORA);
  assert.equal(dia28.ventana_utc.inicio, '2026-09-28T03:00:00.000Z');
  assert.equal(dia28.ventana_utc.fin, '2026-09-29T03:00:00.000Z');
  assert.equal(dia28.actividades.pie_km, 8);
  assert.equal(dia28.residual.total_crudo_km, 2);
  assert.equal(dia29.actividades.cantidad, 0);
  assert.equal(dia29.residual.total_crudo_km, 4);
});

test('Argentina: carga manual "Ayer" hecha a las 23:50 local va al día de ayer local', () => {
  // Cargada el 29/09 a las 23:50 local con "Ayer" → recorded_at = 28/09 23:50 local = 29/09 02:50 UTC.
  const manual = act({ source: 'manual', sport_type: 'Caminata', km: 3, recorded_at: '2026-09-29T02:50:00' });
  const r = calcularResidualDia(dia('2026-09-28', BAIRES, 5), [manual], AHORA);
  assert.equal(r.actividades.pie_km, 3);
  assert.equal(r.residual.total_crudo_km, 2);
});

test('Europa/Zagreb: corrida 00:30 local (22:30 UTC del día anterior) cae en el día local correcto', () => {
  const corrida = act({ km: 5, recorded_at: '2026-09-27T22:30:00', duration_seconds: 1800 });
  const r28 = calcularResidualDia(dia('2026-09-28', ZAGREB, 9), [corrida], AHORA);
  const r27 = calcularResidualDia(dia('2026-09-27', ZAGREB, 6), [corrida], AHORA);
  assert.equal(r28.ventana_utc.inicio, '2026-09-27T22:00:00.000Z');
  assert.equal(r28.actividades.pie_km, 5);
  assert.equal(r28.residual.total_crudo_km, 4);
  assert.equal(r27.actividades.cantidad, 0);
});

test('DST Zagreb: 25/10/2026 dura 25 h y 29/03/2026 dura 23 h', () => {
  const otono = ventanaDiaUTC('2026-10-25', ZAGREB);
  assert.equal(new Date(otono.inicioMs).toISOString(), '2026-10-24T22:00:00.000Z');
  assert.equal(new Date(otono.finMs).toISOString(), '2026-10-25T23:00:00.000Z');
  assert.equal(otono.horas, 25);
  const primavera = ventanaDiaUTC('2026-03-29', ZAGREB);
  assert.equal(primavera.horas, 23);

  // 22:30 UTC del 25/10 es 23:30 local del 25/10 (ya en horario de invierno, UTC+1).
  const corrida = act({ km: 4, recorded_at: '2026-10-25T22:30:00', duration_seconds: 1200 });
  const r = calcularResidualDia(dia('2026-10-25', ZAGREB, 6), [corrida], Date.parse('2026-11-01T00:00:00Z'));
  assert.equal(r.actividades.pie_km, 4);
  assert.ok(r.marcas.includes('cambio_de_horario'));
});

test('cruce de medianoche: reparto proporcional por duración en los dos días', () => {
  // 23:30–00:30 local Zagreb (21:30–22:30 UTC), 10 km.
  const corrida = act({ km: 10, recorded_at: '2026-09-28T21:30:00', duration_seconds: 3600 });
  const r28 = calcularResidualDia(dia('2026-09-28', ZAGREB, 12), [corrida], AHORA);
  const r29 = calcularResidualDia(dia('2026-09-29', ZAGREB, 7), [corrida], AHORA);
  const a28 = r28.detalle_actividades[0];
  const a29 = r29.detalle_actividades[0];
  assert.equal(a28.cruza_medianoche, true);
  assert.equal(a28.km_originales, 10);
  assert.equal(a28.km_asignados, 5);
  assert.equal(a28.metodo_asignacion, 'proporcional_por_duracion_aproximado');
  assert.equal(a29.km_asignados, 5);
  assert.equal(r28.residual.total_crudo_km, 7);
  assert.equal(r29.residual.total_crudo_km, 2);
  assert.ok(r28.marcas.includes('cruza_medianoche'));
});

test('sin duración y cerca del fin del día: marca posible cruce', () => {
  const r = calcularResidualDia(
    dia('2026-09-28', ZAGREB, 12),
    [act({ km: 10, recorded_at: '2026-09-28T21:00:00' })],
    AHORA
  );
  assert.equal(r.detalle_actividades[0].metodo_asignacion, 'completa_sin_duracion');
  assert.ok(r.marcas.includes('posible_cruce_medianoche_sin_duracion'));
});

test('excluidas: no restan, pero se informan', () => {
  const r = calcularResidualDia(
    dia('2026-09-28', ZAGREB, 13),
    [act({ km: 10, recorded_at: '2026-09-28T07:00:00', duration_seconds: 3600, excluida: true })],
    AHORA
  );
  assert.equal(r.residual.total_crudo_km, 13);
  assert.equal(r.actividades.excluidas_km, 10);
  assert.equal(r.actividades.pie_km, 0);
  assert.equal(r.detalle_actividades[0].excluida, true);
  assert.ok(r.marcas.includes('hay_actividades_excluidas'));
});

test('nunca residual negativo (casos aleatorios)', () => {
  const tipos = ['run', 'ride', 'swim', 'manual', 'Caminata', 'workout'];
  for (let i = 0; i < 300; i++) {
    const actividades = Array.from({ length: Math.floor(Math.random() * 6) }, (_, j) =>
      act({
        source: j % 2 ? 'manual' : 'strava',
        sport_type: tipos[Math.floor(Math.random() * tipos.length)],
        km: Math.random() * 50,
        recorded_at: `2026-09-28T${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:00:00`,
        duration_seconds: Math.random() < 0.5 ? null : Math.floor(Math.random() * 20000),
        excluida: Math.random() < 0.2,
      })
    );
    const r = calcularResidualDia(dia('2026-09-28', ZAGREB, Math.random() * 20, Math.random() * 20), actividades, AHORA);
    assert.ok(r.residual.pie_km >= 0);
    assert.ok(r.residual.bici_km >= 0);
    assert.ok(r.residual.total_crudo_km >= 0);
    assert.ok(r.residual.total_crudo_km <= r.residual.pie_km + r.residual.bici_km + 0.002); // tolerancia de redondeo a 3 decimales
  }
});

test('sin clasificar mayor que el residual → total 0, no negativo', () => {
  const r = calcularResidualDia(
    dia('2026-09-28', ZAGREB, 3),
    [act({ source: 'manual', sport_type: 'manual', km: 10, recorded_at: '2026-09-28T12:00:00' })],
    AHORA
  );
  assert.equal(r.residual.total_crudo_km, 0);
});

// ---------------------------------------------------------------------------
// Piezas auxiliares
// ---------------------------------------------------------------------------

test('mapeo de sport_type', () => {
  const casos = {
    run: 'pie', walk: 'pie', hike: 'pie', ride: 'bici', swim: 'no_compatible',
    alpineski: 'no_compatible', workout: 'sin_clasificar', soccer: 'sin_clasificar',
    velomobile: 'sin_clasificar', manual: 'sin_clasificar', Running: 'pie',
    Caminata: 'pie', Correr: 'pie', Carrera: 'pie', 'Trail Running': 'pie',
    'correr en cinta': 'pie', Ciclismo: 'bici', Natación: 'no_compatible',
    'correr y bici': 'sin_clasificar', '': 'sin_clasificar', null: 'sin_clasificar',
  };
  for (const [entrada, esperado] of Object.entries(casos)) {
    const valor = entrada === 'null' ? null : entrada;
    assert.equal(categorizarActividad(valor).categoria, esperado, `sport_type "${entrada}"`);
  }
  assert.equal(categorizarActividad('correr y bici').metodo, 'ambiguo');
});

test('recorded_at se interpreta siempre como UTC', () => {
  const esperado = Date.parse('2026-09-28T07:00:00Z');
  assert.equal(recordedAtAMs('2026-09-28T07:00:00'), esperado);
  assert.equal(recordedAtAMs('2026-09-28 07:00:00'), esperado);
  assert.equal(recordedAtAMs('2026-09-28T07:00:00Z'), esperado);
  assert.equal(recordedAtAMs('2026-09-28T07:00:00.000+00:00'), esperado);
  assert.equal(recordedAtAMs('basura'), null);
});

test('hipótesis de cierre: 48 h + sync posterior al fin del día', () => {
  // Día 28/09 Zagreb termina 28/09 22:00 UTC.
  const cerrable = calcularResidualDia(dia('2026-09-28', ZAGREB, 5, 0, '2026-09-29T08:00:00Z'), [], Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(cerrable.hipotesis_cierre.sync_posterior_al_fin_del_dia, true);
  assert.equal(cerrable.hipotesis_cierre.cumple_48h, true);
  assert.equal(cerrable.hipotesis_cierre.se_cerraria, true);
  assert.equal(cerrable.hipotesis_cierre.se_cerraria_desde, '2026-09-30T22:00:00.000Z');

  const sinSyncPosterior = calcularResidualDia(dia('2026-09-28', ZAGREB, 5, 0, '2026-09-28T18:00:00Z'), [], Date.parse('2026-10-05T00:00:00Z'));
  assert.equal(sinSyncPosterior.hipotesis_cierre.se_cerraria, false);
  assert.ok(sinSyncPosterior.marcas.includes('foto_health_anterior_al_fin_del_dia'));

  const reciente = calcularResidualDia(dia('2026-09-28', ZAGREB, 5, 0, '2026-09-29T08:00:00Z'), [], Date.parse('2026-09-29T12:00:00Z'));
  assert.equal(reciente.hipotesis_cierre.cumple_48h, false);
  assert.equal(reciente.hipotesis_cierre.se_cerraria, false);

  const hoy = calcularResidualDia(dia('2026-09-28', ZAGREB, 5, 0, '2026-09-28T10:00:00Z'), [], Date.parse('2026-09-28T12:00:00Z'));
  assert.ok(hoy.marcas.includes('dia_en_curso'));
  assert.equal(hoy.cerrado_actual, false);
});