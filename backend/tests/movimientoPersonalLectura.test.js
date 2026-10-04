const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Module = require('node:module');
const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
const { leerMovimientoPersonal } = require('../lib/movimientoPersonalLectura');

// Usa Express y requireUser reales. Solo Supabase Auth se sustituye por un proveedor
// de tokens determinista, como Supabase DB en memoria. Ninguna petición sale a internet.
const original = Module._load;
const authCalls = [];
Module._load = function (nombre, ...args) {
  if (nombre === '@supabase/supabase-js') return { createClient: () => ({ auth: {
    async getUser(token) {
      authCalls.push(token);
      if (token === 'auth-error') throw new Error('falla auth simulada');
      return token === 'token-u1'
        ? { data: { user: { id: 'u1' } }, error: null }
        : { data: { user: null }, error: { message: 'invalid token' } };
    },
  } }) };
  return original.call(this, nombre, ...args);
};
let crearMovimientoPersonalRoutes;
try {
  ({ crearMovimientoPersonalRoutes } = require('../routes/movimientoPersonal'));
} finally { Module._load = original; }

const AHORA = Date.parse('2026-10-04T15:00:00Z');
const act = (extra = {}) => ({ id: 'a1', user_id: 'u1', source: 'korva_gps', sport_type: 'run',
  distance_km: 5, recorded_at: '2026-10-04T08:00:00', duration_seconds: 1800, excluida: false, ...extra });
const health = (extra = {}) => ({ id: 'h1', user_id: 'u1', fecha: '2026-10-04', timezone: 'Europe/Zagreb',
  distancia_caminando_km: 8, distancia_bici_km: 0, pasos: 10000,
  updated_at: '2026-10-04T14:00:00Z', ...extra });
const memoria = (tablas = {}, opciones = {}) => crearSupabaseMemoria({ activities: [], daily_movement: [], ...tablas }, opciones);

async function pedir(m, { token = 'token-u1', query = 'timezone=Europe%2FZagreb' } = {}) {
  const app = express();
  app.use('/movimiento-personal', crearMovimientoPersonalRoutes({ supabase: m.cliente, ahora: () => AHORA, log: () => {} }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/movimiento-personal?${query}`, {
      headers: token == null ? {} : { Authorization: `Bearer ${token}` },
    });
    return { status: response.status, body: await response.json(),
      cache: response.headers.get('cache-control'), vary: response.headers.get('vary') };
  } finally {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  }
}

test('lectura personal HTTP: falta de sesión devuelve 401 sin leer la DB', async () => {
  const m = memoria(); const antes = authCalls.length;
  const r = await pedir(m, { token: null });
  assert.equal(r.status, 401);
  assert.equal(m.registro.length, 0);
  assert.equal(authCalls.length, antes);
  assert.match(r.cache, /no-store/);
});

test('lectura personal HTTP: token inválido se verifica y rechaza sin leer DB', async () => {
  const m = memoria();
  const r = await pedir(m, { token: 'expired' });
  assert.equal(r.status, 401);
  assert.equal(authCalls.at(-1), 'expired');
  assert.equal(m.registro.length, 0);
});

test('lectura personal HTTP: fallo de Auth no permite continuar a la DB', async () => {
  const m = memoria();
  const r = await pedir(m, { token: 'auth-error' });
  assert.equal(r.status, 401);
  assert.equal(m.registro.length, 0);
});

test('lectura personal HTTP: user_id en query no permite consultar otra persona', async () => {
  const m = memoria({ activities: [act(), act({ id: 'otra', user_id: 'u2', distance_km: 100 })],
    daily_movement: [health(), health({ id: 'otra-h', user_id: 'u2', pasos: 99999 })] });
  const originalDB = JSON.stringify(m.db);
  const r = await pedir(m, { query: 'timezone=Europe%2FZagreb&user_id=u2&userId=u2' });
  assert.equal(r.status, 200);
  assert.equal(r.body.historial.km_actividades, 5);
  assert.equal(r.body.hoy.km_movimiento, 8);
  assert.equal(r.body.hoy.pasos, 10000);
  assert.match(r.vary, /Authorization/);
  assert.equal(JSON.stringify(m.db), originalDB);
  assert.ok(m.registro.every((op) => op.tipo === 'select'
    && ['activities', 'daily_movement'].includes(op.tabla)
    && op.filtros.some(([tipo, campo, valor]) => tipo === 'eq' && campo === 'user_id' && valor === 'u1')));
});

test('lectura personal HTTP: zona ausente/inválida/repetida devuelve 400 sin consultar', async () => {
  for (const query of ['', 'timezone=no-existe', 'timezone=UTC&timezone=Europe%2FZagreb']) {
    const m = memoria(); const r = await pedir(m, { query });
    assert.equal(r.status, 400);
    assert.equal(m.registro.length, 0);
  }
});

test('lectura personal HTTP: sin desafíos ni Health devuelve actividades y pasos ausentes', async () => {
  const m = memoria({ activities: [act()] });
  const r = await pedir(m);
  assert.equal(r.status, 200);
  assert.equal(r.body.hoy.km_movimiento, 5);
  assert.equal(r.body.hoy.pasos, null);
  assert.equal(r.body.hoy.health_estado, 'sin_datos');
});

test('lectura personal: pagina más de 1000 actividades sin truncar el historial', async () => {
  const filas = Array.from({ length: 1001 }, (_, i) => act({ id: `a${i}`, distance_km: 1, recorded_at: '2025-01-01T08:00:00' }));
  const m = memoria({ activities: filas });
  const r = await leerMovimientoPersonal({ supabase: m.cliente, userId: 'u1', timezone: 'Europe/Zagreb', ahoraMs: AHORA });
  assert.equal(r.historial.km_actividades, 1001);
  assert.equal(r.historial.cantidad_actividades, 1001);
  const paginas = m.registro.filter((op) => op.tabla === 'activities');
  assert.deepEqual(paginas.map((op) => op.rango), [[0, 999], [1000, 1999]]);
  assert.equal(r.semana.km_actividades, 0);
});

test('lectura personal: Health se limita a la semana y omite actividades excluidas', async () => {
  const m = memoria({ activities: [act({ excluida: true })], daily_movement: [
    health({ id: 'antigua', fecha: '2026-09-01' }), health(),
    health({ id: 'futura', fecha: '2026-10-05' }),
  ] });
  const r = await leerMovimientoPersonal({ supabase: m.cliente, userId: 'u1', timezone: 'Europe/Zagreb', ahoraMs: AHORA });
  assert.equal(r.historial.km_actividades, 0);
  assert.equal(r.semana.km_movimiento, 8);
  assert.equal(r.semana.dias_con_datos_health, 1);
  const op = m.registro.find((x) => x.tabla === 'daily_movement');
  assert.ok(op.filtros.some(([t, c, v]) => t === 'gte' && c === 'fecha' && v === '2026-09-28'));
  assert.ok(op.filtros.some(([t, c, v]) => t === 'lte' && c === 'fecha' && v === '2026-10-04'));
});

test('lectura personal HTTP: fallo de cualquiera de las tablas da 500, nunca ceros falsos', async () => {
  for (const tabla of ['activities', 'daily_movement']) {
    const m = memoria({ activities: [act()], daily_movement: [health()] }, { fallar: (op) => op.tabla === tabla });
    const r = await pedir(m);
    assert.equal(r.status, 500);
    assert.deepEqual(Object.keys(r.body), ['error']);
    assert.ok(!r.body.error.includes('falla simulada'));
    assert.ok(m.registro.every((op) => op.tipo === 'select'));
  }
});

test('lectura personal HTTP: días Health duplicados son error explícito, no doble conteo', async () => {
  const m = memoria({ daily_movement: [health(), health({ id: 'h2' })] });
  const r = await pedir(m);
  assert.equal(r.status, 500);
});
