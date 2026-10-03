// Tests del filtro que excluye muestras ingresadas a mano (HKWasUserEntered = true).
// Correr desde mobile/:  node --test services/health/__tests__/filtroIngresoManual.test.mjs
import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./cargador.mjs', import.meta.url);
const { conSinIngresoManual, CLAVE_INGRESO_MANUAL } = await import('../filtroIngresoManual.js');
const { leerMovimientoDiario, TIPOS } = await import('../healthkitLectura.ios.js');
const { llamadas, ComparisonPredicateOperator } = await import('./falsoHealthkit.mjs');

const SIN_MANUALES = { withMetadataKey: 'HKWasUserEntered', operatorType: 5, value: true };

test('conSinIngresoManual: agrega "HKWasUserEntered != true" sin perder ni modificar el filtro de fechas', () => {
  const fechas = { date: { startDate: new Date('2026-10-01T00:00:00'), endDate: new Date('2026-10-03T12:00:00') } };
  const copia = JSON.parse(JSON.stringify(fechas));
  const f = conSinIngresoManual(fechas, 5);
  assert.equal(CLAVE_INGRESO_MANUAL, 'HKWasUserEntered');
  assert.deepEqual(f.metadata, SIN_MANUALES);
  assert.equal(f.date, fechas.date);
  assert.deepEqual(JSON.parse(JSON.stringify(fechas)), copia, 'no modifica el filtro original');
});

test('leerMovimientoDiario: las 6 consultas (total y por fuente × caminando, bici, pasos) llevan el filtro', async () => {
  llamadas.length = 0;
  const r = await leerMovimientoDiario(3);
  assert.deepEqual(llamadas.map((l) => `${l.fn}:${l.id}`).sort(), [
    'consolidado:HKQuantityTypeIdentifierDistanceCycling',
    'consolidado:HKQuantityTypeIdentifierDistanceWalkingRunning',
    'consolidado:HKQuantityTypeIdentifierStepCount',
    'por_fuente:HKQuantityTypeIdentifierDistanceCycling',
    'por_fuente:HKQuantityTypeIdentifierDistanceWalkingRunning',
    'por_fuente:HKQuantityTypeIdentifierStepCount',
  ]);
  for (const l of llamadas) {
    assert.deepEqual(l.opciones.filter.metadata, { ...SIN_MANUALES, operatorType: ComparisonPredicateOperator.notEqualTo }, `${l.fn} ${l.id}`);
    assert.ok(l.opciones.filter.date.startDate instanceof Date && l.opciones.filter.date.endDate instanceof Date, 'conserva el rango de fechas');
    assert.equal(l.opciones.unit, Object.values(TIPOS).find((t) => t.id === l.id).unit);
  }
  // El resto de la lectura no cambia: 3 días, el de hoy con total y desglose.
  assert.equal(r.dias.length, 3);
  assert.equal(r.lecturaCompleta, true);
  const hoy = r.dias[r.dias.length - 1];
  assert.deepEqual([hoy.consolidado.caminando, hoy.porFuente.caminando.map((f) => f.valor)], [2.5, [2.5]]);
});
