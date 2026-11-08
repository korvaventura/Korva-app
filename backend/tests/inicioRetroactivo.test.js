const test = require('node:test');
const assert = require('node:assert/strict');
const { resolverInicioRetroactivo } = require('../lib/inicioRetroactivo');

const resolver = (fechaActividad, extra = {}) => resolverInicioRetroactivo({
  inicioActual: '2026-11-02T20:57:33.752Z', fechaActividad, ...extra,
});
test('retroactividad: una salida anterior legítima puede mover inicio sin superar 30 días', () => {
  assert.equal(resolver('2026-11-01T08:00:00Z'), '2026-11-01T08:00:00Z');
  assert.equal(resolver('2026-09-01T00:00:00Z'), '2026-10-03T20:57:33.752Z');
});
test('retroactividad: compara instantes, no textos con zonas distintas', () => {
  assert.equal(resolver('2026-11-02T23:00:00+03:00'), '2026-11-02T23:00:00+03:00');
  assert.equal(resolver('2026-11-02T22:00:00+01:00'), null); // es posterior al inicio UTC
});
test('retroactividad: fechas inválidas no desplazan el inicio', () => {
  assert.equal(resolver('invalido'), null);
  assert.equal(resolver(null), null);
  assert.equal(resolver('2026-11-03T08:00:00Z'), null);
});
test('retroactividad: piso de reinicio bloquea actividades anteriores', () => {
  const piso = '2026-11-02T20:57:33.752Z';
  assert.equal(resolver('2026-10-28T10:00:00Z', { inicioProtegido: piso }), null);
  assert.equal(resolver('2026-11-02T21:30:00Z', { inicioProtegido: piso }), null);
  assert.equal(resolver('2026-10-28T10:00:00Z', { inicioProtegido: 'invalido' }), null);
});

test('concurrencia: un admin protege started_at entre lectura y actualización manual', async () => {
  const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
  const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
  const inicio = '2026-11-02T20:57:33.752Z';
  const userId = '11111111-1111-4111-8111-111111111111';
  const challengeId = '22222222-2222-4222-8222-222222222222';
  const registro = crearSupabaseMemoria({
    user_challenges: [{
      id: '33333333-3333-4333-8333-333333333333',
      user_id: userId, challenge_id: challengeId, started_at: inicio,
      inicio_protegido_at: null, status: 'active', version: 'estandar', modalidad: 'run',
    }],
  });
  let intercalo = false;
  const cliente = {
    ...registro.cliente,
    from(tabla) {
      const query = registro.cliente.from(tabla);
      if (tabla !== 'user_challenges') return query;
      return {
        ...query,
        update(valores) {
          if (Object.hasOwn(valores, 'started_at')) {
            // El administrador acaba de proteger exactamente el mismo started_at.
            // Si el CAS solo compara started_at, el writer lo sobreescribiría.
            registro.db.user_challenges[0].inicio_protegido_at = inicio;
            intercalo = true;
          }
          return query.update(valores);
        },
      };
    },
  };
  const repo = crearRepositorioSupabase(cliente);
  const movio = await repo.correrInicioPorActividad({
    userId, challengeId, recordedAt: '2026-10-30T08:00:00Z',
  });
  assert.equal(intercalo, true);
  assert.equal(movio, false);
  assert.equal(registro.db.user_challenges[0].started_at, inicio);
  assert.equal(registro.db.user_challenges[0].inicio_protegido_at, inicio);
  const update = registro.registro.find((op) => op.tabla === 'user_challenges' && op.tipo === 'update');
  assert.deepEqual(update.filtros.find(([tipo, columna]) => tipo === 'is' && columna === 'inicio_protegido_at'), ['is', 'inicio_protegido_at', null]);
});

test('concurrencia: sin reinicio, conserva el ajuste retroactivo normal', async () => {
  const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
  const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
  const userId = '11111111-1111-4111-8111-111111111111';
  const challengeId = '22222222-2222-4222-8222-222222222222';
  const db = crearSupabaseMemoria({ user_challenges: [{
    id: '33333333-3333-4333-8333-333333333333', user_id: userId,
    challenge_id: challengeId, started_at: '2026-11-02T20:57:33.752Z',
    inicio_protegido_at: null, status: 'active', version: 'estandar', modalidad: 'run',
  }] });
  const repo = crearRepositorioSupabase(db.cliente);
  const movio = await repo.correrInicioPorActividad({ userId, challengeId, recordedAt: '2026-10-30T08:00:00Z' });
  assert.equal(movio, true);
  assert.equal(db.db.user_challenges[0].started_at, '2026-10-30T08:00:00Z');
});
