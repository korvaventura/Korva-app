const test = require('node:test');
const assert = require('node:assert/strict');
const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
const { pausarDesafio } = require('../lib/pausarDesafio');

const inicial = () => ({
  id: 'uc1', user_id: 'u1', challenge_id: 'c1', status: 'active',
  pausado: false, pausado_at: null, km_completed: 19.5769, km_base: 4,
  periodos_pausados: [{ desde: '2026-10-01T10:00:00Z', hasta: '2026-10-01T12:00:00Z' }],
});
const montar = (fila = inicial(), fallar) => {
  const m = crearSupabaseMemoria({ user_challenges: [fila], activities: [{ id: 'a1', user_id: 'u1', distance_km: 3 }] }, { fallar });
  const pedir = (ahora = '2026-11-03T18:00:00Z') => pausarDesafio({
    supabase: m.cliente, userId: 'u1', challengeId: 'c1', ahora: () => ahora,
  });
  return { m, pedir };
};

test('pausa confirmada por Supabase; no altera kilómetros, historial ni actividades', async () => {
  const { m, pedir } = montar();
  const anterior = JSON.stringify(m.db.user_challenges[0].periodos_pausados);
  const r = await pedir();
  assert.equal(r.status, 200);
  assert.equal(r.body.mensaje, 'Desafío pausado');
  assert.equal(m.db.user_challenges[0].pausado, true);
  assert.equal(m.db.user_challenges[0].pausado_at, '2026-11-03T18:00:00Z');
  assert.equal(m.db.user_challenges[0].km_completed, 19.5769);
  assert.equal(m.db.user_challenges[0].km_base, 4);
  assert.equal(JSON.stringify(m.db.user_challenges[0].periodos_pausados), anterior);
  assert.equal(m.db.activities.length, 1);
});

test('dos pausas consecutivas conservan la primera fecha y avisan que ya estaba pausado', async () => {
  const { m, pedir } = montar();
  const primero = await pedir();
  const segundo = await pedir('2026-11-03T20:00:00Z');
  assert.equal(primero.body.mensaje, 'Desafío pausado');
  assert.equal(segundo.body.mensaje, 'Ya estaba pausado');
  assert.equal(m.db.user_challenges[0].pausado_at, '2026-11-03T18:00:00Z');
});

test('fallo de actualización de Supabase no devuelve éxito ni escribe cambios', async () => {
  const { m, pedir } = montar(inicial(), (op) => op.tabla === 'user_challenges' && op.tipo === 'update');
  await assert.rejects(pedir(), (error) => error?.message === 'falla simulada');
  assert.equal(m.db.user_challenges[0].pausado, false);
  assert.equal(m.db.user_challenges[0].pausado_at, null);
});

test('desafío inexistente no escribe y responde 404', async () => {
  const { m } = montar();
  const r = await pausarDesafio({ supabase: m.cliente, userId: 'u2', challengeId: 'c1' });
  assert.equal(r.status, 404);
  assert.equal(m.db.user_challenges[0].pausado, false);
});

test('dos pausas simultáneas: solo una establece la fecha inicial', async () => {
  const { m, pedir } = montar();
  const [a,b] = await Promise.all([pedir('2026-11-03T18:00:00Z'),pedir('2026-11-03T19:00:00Z')]);
  assert.deepEqual([a.status,b.status], [200,200]);
  assert.deepEqual([a.body.mensaje,b.body.mensaje].sort(), ['Desafío pausado','Ya estaba pausado']);
  assert.ok(['2026-11-03T18:00:00Z','2026-11-03T19:00:00Z'].includes(m.db.user_challenges[0].pausado_at));
});
