const test = require('node:test');
const assert = require('node:assert/strict');
const { registrarActividadGpsConMotor } = require('../lib/actividadGps');

const sinCandado = (_k, fn) => fn();

test('repetir sessionId devuelve la actividad existente y no inserta', async () => {
  let inserts = 0;
  const existente = { id: 'a1', external_id: 'korva_gps_s1', source: 'korva_gps' };
  const repo = {
    buscarActividadPorExternalId: async ({ externalId }) => externalId === 'korva_gps_s1' ? existente : null,
    insertarActividadGps: async () => { inserts++; throw new Error('no debe insertar'); },
  };
  const r = await registrarActividadGpsConMotor({
    repo, userId: 'u1', sessionId: 's1', sportType: 'run',
    distanceKm: 1.2, durationSeconds: 360, recordedAt: '2026-10-03T20:00:00.000Z',
    candado: sinCandado,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.idempotente, true);
  assert.equal(r.body.actividad.id, 'a1');
  assert.equal(inserts, 0);
});

test('actividad nueva usa source korva_gps y external_id estable', async () => {
  let insertada = null;
  const repo = {
    buscarActividadPorExternalId: async () => null,
    buscarActividadEquivalenteGps: async () => null,
    leerMarcasDesafiosActivos: async () => [],
    insertarActividadGps: async ({ actividad }) => {
      insertada = actividad;
      return { id: 'a2', ...actividad };
    },
    leerEstadoCompleto: async () => ({
      userChallenges: [], challenges: new Map(), activities: [], dailyMovement: [],
    }),
  };

  // Sin desafíos activos el motor no tiene escrituras que hacer.
  const r = await registrarActividadGpsConMotor({
    repo, userId: 'u1', sessionId: 'abc-123', sportType: 'ride',
    distanceKm: 2.5, durationSeconds: 600, recordedAt: '2026-10-03T20:00:00.000Z',
    candado: sinCandado,
    esperasMs: [],
    esperar: async () => {},
  });

  assert.equal(insertada.source, 'korva_gps');
  assert.equal(insertada.external_id, 'korva_gps_abc-123');
  assert.equal(insertada.user_id, 'u1');
  assert.equal(insertada.challenge_id, null);
  assert.equal(insertada.sport_type, 'ride');
  assert.equal(r.status, 200);
});


test('GPS no duplica una salida equivalente que ya existe por Strava', async () => {
  let inserts = 0;
  const strava = {
    id: 'strava-1', source: 'strava', sport_type: 'run',
    distance_km: 5.02, recorded_at: '2026-10-03T20:05:00.000Z',
  };
  const repo = {
    buscarActividadPorExternalId: async () => null,
    buscarActividadEquivalenteGps: async () => strava,
    insertarActividadGps: async () => { inserts++; throw new Error('no debe insertar'); },
  };

  const r = await registrarActividadGpsConMotor({
    repo, userId: 'u1', sessionId: 'gps-duplicada', sportType: 'run',
    distanceKm: 5, durationSeconds: 1800, recordedAt: '2026-10-03T20:00:00.000Z',
    candado: sinCandado,
  });

  assert.equal(r.status, 200);
  assert.equal(r.body.idempotente, true);
  assert.equal(r.body.duplicado_equivalente, true);
  assert.equal(r.body.actividad.id, 'strava-1');
  assert.equal(inserts, 0);
});

test('GPS nueva continúa si no existe actividad equivalente', async () => {
  let consultoEquivalente = false;
  let insertada = null;
  const repo = {
    buscarActividadPorExternalId: async () => null,
    buscarActividadEquivalenteGps: async () => { consultoEquivalente = true; return null; },
    leerMarcasDesafiosActivos: async () => [],
    insertarActividadGps: async ({ actividad }) => {
      insertada = actividad;
      return { id: 'gps-nueva', ...actividad };
    },
    leerEstadoCompleto: async () => ({
      userChallenges: [], challenges: new Map(), activities: [], dailyMovement: [],
    }),
  };

  const r = await registrarActividadGpsConMotor({
    repo, userId: 'u1', sessionId: 'gps-nueva-1', sportType: 'ride',
    distanceKm: 12.4, durationSeconds: 2400, recordedAt: '2026-10-03T18:00:00.000Z',
    candado: sinCandado, esperasMs: [], esperar: async () => {},
  });

  assert.equal(consultoEquivalente, true);
  assert.equal(insertada.source, 'korva_gps');
  assert.equal(r.body.idempotente, false);
});
