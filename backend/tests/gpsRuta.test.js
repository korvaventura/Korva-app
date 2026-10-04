const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarPuntosRuta, guardarRutaGps, leerRutaGps } = require('../lib/gpsRuta');

test('normaliza puntos del trazado antes de persistir', () => {
  const puntos = normalizarPuntosRuta([{ latitude: '1', longitude: '2', accuracy: '5', timestamp: '10' }]);
  assert.deepEqual(puntos, [{ latitude: 1, longitude: 2, accuracy: 5, timestamp: 10 }]);
});

test('ruta GPS hace upsert idempotente por usuario y session', async () => {
  const op = {};
  const q = {
    upsert(payload, opciones) { op.payload = payload; op.opciones = opciones; return q; },
    select(campos) { op.select = campos; return q; },
    async maybeSingle() { return { data: { id: 'r1', activity_id: 'a1', session_id: 'sesion_123', point_count: 2 }, error: null }; },
  };
  const supabase = { from(tabla) { op.tabla = tabla; return q; } };
  const r = await guardarRutaGps({
    supabase, userId: 'u1', activityId: 'a1', sessionId: 'sesion_123',
    puntos: [
      { latitude: 1, longitude: 2, accuracy: 5, timestamp: 10 },
      { latitude: 1.1, longitude: 2.1, accuracy: 6, timestamp: 20 },
    ],
  });
  assert.equal(op.tabla, 'gps_routes');
  assert.deepEqual(op.opciones, { onConflict: 'user_id,session_id', ignoreDuplicates: true });
  assert.equal(op.payload.point_count, 2);
  assert.equal(r.id, 'r1');
});


test('lee ruta GPS restringida por usuario y actividad', async () => {
  const op = { filtros: [] };
  const q = {
    select(campos) { op.select = campos; return q; },
    eq(campo, valor) { op.filtros.push([campo, valor]); return q; },
    async maybeSingle() {
      return { data: { activity_id: 'a1', session_id: 's1', points: [{ latitude: 1, longitude: 2 }], point_count: 1 }, error: null };
    },
  };
  const supabase = { from(tabla) { op.tabla = tabla; return q; } };
  const r = await leerRutaGps({ supabase, userId: 'u1', activityId: 'a1' });
  assert.equal(op.tabla, 'gps_routes');
  assert.deepEqual(op.filtros, [['user_id', 'u1'], ['activity_id', 'a1']]);
  assert.equal(r.activity_id, 'a1');
});
