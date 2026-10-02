// Tests del motor unificado de progreso (Etapa 4A): decisión, servicio, eventos de
// completar y repositorio Supabase. No tocan la base de datos real: usan un repositorio
// en memoria que respeta la semántica de compare-and-set de la base.
const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularProgresoChallenge } = require('../lib/progresoDesafio');
const { decidirAccion, ACCIONES } = require('../lib/progresoDecision');
const { recalcularProgresoUsuario, MODOS, TIPOS_EVENTO } = require('../lib/progresoServicio');
const { procesarEvento, procesarEventosPendientes, ESTADOS } = require('../lib/completionEventos');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');

// ---------------------------------------------------------------------------
// Datos y repositorio en memoria
// ---------------------------------------------------------------------------

const CH = { id: 'c1', title: 'Fin del Mundo', modalidades: [{ tipo: 'run', distancia_km: 100 }], total_distance_km: 100 };
const CH2 = { id: 'c2', title: 'Dubrovnik', modalidades: [{ tipo: 'run', distancia_km: 20 }], total_distance_km: 20 };

const ucBase = (extra = {}) => ({
  id: 'uc1', user_id: 'u1', challenge_id: 'c1', status: 'active', started_at: '2026-09-01T00:00:00',
  pausado: false, pausado_at: null, periodos_pausados: [], modalidad: 'run',
  km_completed: 0, km_base: 0, km_base_motivo: null, completed_at: null, ...extra,
});
let n = 0;
const act = (recorded_at, km, extra = {}) => ({ id: `a${++n}`, user_id: 'u1', distance_km: km, recorded_at, excluida: false, ...extra });

const clonar = (o) => JSON.parse(JSON.stringify(o));

/** Repositorio en memoria con la misma semántica de CAS que la base real. */
const crearRepoMemoria = ({ userChallenges = [], challenges = [CH, CH2], actividades = [] } = {}) => {
  const db = { userChallenges: clonar(userChallenges), challenges: clonar(challenges), actividades: clonar(actividades), eventos: [] };
  const llamadas = [];
  const hooks = { antesDeEscribir: null };
  const repo = {
    db, llamadas, hooks,
    leerEstadoUsuario: async (userId) => {
      llamadas.push('leer');
      return {
        userChallenges: clonar(db.userChallenges.filter((u) => u.user_id === userId)),
        challenges: new Map(db.challenges.map((c) => [c.id, clonar(c)])),
        actividades: clonar(db.actividades.filter((a) => a.user_id === userId)),
      };
    },
    actualizarKmCAS: async ({ id, kmLeido, kmNuevo }) => {
      llamadas.push(`actualizar:${id}`);
      if (hooks.antesDeEscribir) await hooks.antesDeEscribir(id);
      const uc = db.userChallenges.find((u) => u.id === id);
      if (!uc || uc.status !== 'active' || uc.km_completed !== kmLeido) return false;
      uc.km_completed = kmNuevo;
      return true;
    },
    completarCAS: async ({ id, kmLeido, kmNuevo, completedAtIso }) => {
      llamadas.push(`completar:${id}`);
      if (hooks.antesDeEscribir) await hooks.antesDeEscribir(id);
      const uc = db.userChallenges.find((u) => u.id === id);
      if (!uc || uc.status !== 'active' || uc.km_completed !== kmLeido) return false;
      Object.assign(uc, { status: 'completed', completed_at: completedAtIso, km_completed: kmNuevo });
      return true;
    },
    registrarEvento: async ({ userChallengeId, userId, tipo, datos }) => {
      llamadas.push(`evento:${tipo}:${userChallengeId}`);
      if (db.eventos.some((e) => e.user_challenge_id === userChallengeId && e.tipo === tipo)) return { creado: false, id: null };
      const ev = { id: `ev${db.eventos.length + 1}`, user_challenge_id: userChallengeId, user_id: userId, tipo, datos, estado: 'pendiente', intentos: 0, resultado: {}, procesando_desde: null };
      db.eventos.push(ev);
      return { creado: true, id: ev.id };
    },
    listarEventosProcesables: async ({ limite, vencidoAntesDeIso, ids = null }) =>
      clonar(db.eventos.filter((e) => (ids === null || ids.includes(e.id)) &&
        (['pendiente', 'error'].includes(e.estado) || (e.estado === 'procesando' && e.procesando_desde < vencidoAntesDeIso))).slice(0, limite)),
    reclamarEvento: async ({ id, ahoraIso, vencidoAntesDeIso }) => {
      const e = db.eventos.find((x) => x.id === id);
      if (!e) return null;
      const libre = ['pendiente', 'error'].includes(e.estado) || (e.estado === 'procesando' && e.procesando_desde < vencidoAntesDeIso);
      if (!libre) return null;
      e.estado = 'procesando';
      e.procesando_desde = ahoraIso;
      return clonar(e);
    },
    guardarResultadoEvento: async ({ id, estado, resultado, ultimoError, intentos }) => {
      const e = db.eventos.find((x) => x.id === id);
      if (e.estado !== 'procesando') return;
      Object.assign(e, { estado, resultado: clonar(resultado), ultimo_error: ultimoError, intentos, procesando_desde: null });
    },
  };
  return repo;
};

const correr = (repo, extra = {}) => recalcularProgresoUsuario({ repo, userId: 'u1', motivo: 'test', modo: MODOS.ESCRIBIR, ahoraMs: Date.parse('2026-10-02T10:00:00Z'), ...extra });
const uc1 = (repo) => repo.db.userChallenges.find((u) => u.id === 'uc1');

// ---------------------------------------------------------------------------
// Decisión pura
// ---------------------------------------------------------------------------

const decidir = (ucExtra, actividades, challenge = CH) => {
  const uc = ucBase(ucExtra);
  return decidirAccion(uc, calcularProgresoChallenge({ uc, challenge, actividades }));
};

test('decisión: estados no activos nunca se escriben (D1)', () => {
  for (const status of ['pending', 'completed', 'cargado', 'shipped']) {
    const d = decidir({ status, km_completed: 50 }, [act('2026-09-02T00:00:00', 200)]);
    assert.equal(d.accion, ACCIONES.NADA, status);
  }
});

test('decisión: sin cambios no escribe; sube; baja', () => {
  assert.equal(decidir({ km_completed: 10 }, [act('2026-09-02T00:00:00', 10)]).accion, ACCIONES.NADA);
  const sube = decidir({ km_completed: 10 }, [act('2026-09-02T00:00:00', 10), act('2026-09-03T00:00:00', 5)]);
  assert.deepEqual([sube.accion, sube.motivo, sube.kmNuevo], [ACCIONES.ACTUALIZAR_KM, 'sube', 15]);
  const baja = decidir({ km_completed: 15 }, [act('2026-09-02T00:00:00', 10), act('2026-09-03T00:00:00', 5, { excluida: true })]);
  assert.deepEqual([baja.accion, baja.motivo, baja.kmNuevo], [ACCIONES.ACTUALIZAR_KM, 'baja', 10]);
});

test('decisión: diferencias de punto flotante menores a 1e-6 no escriben', () => {
  const d = decidir({ km_completed: 73.34, km_base: 63.2, km_base_motivo: 'legado_historico' }, [act('2026-09-02T00:00:00', 10.14)]);
  assert.equal(d.accion, ACCIONES.NADA);
});

test('decisión: completa al alcanzar el objetivo (con base + actividades)', () => {
  const d = decidir({ km_completed: 99.41, km_base: 99.41, km_base_motivo: 'legado_historico' }, [act('2026-09-02T00:00:00', 4)]);
  assert.equal(d.accion, ACCIONES.COMPLETAR);
  assert.equal(d.kmNuevo, 103.41);
});

test('decisión: pausado no completa aunque alcance el objetivo; sin objetivo nunca completa', () => {
  const pausado = decidir({ km_completed: 95, pausado: true, pausado_at: '2026-09-20T00:00:00' }, [act('2026-09-02T00:00:00', 120)]);
  assert.equal(pausado.accion, ACCIONES.ACTUALIZAR_KM);
  const sinObj = decidir({ km_completed: 0 }, [act('2026-09-02T00:00:00', 500)], { id: 'c1', title: 'x', modalidades: [], total_distance_km: null });
  assert.equal(sinObj.accion, ACCIONES.ACTUALIZAR_KM);
});

test('decisión: aviso del 75 % solo al cruzar', () => {
  assert.equal(decidir({ km_completed: 70 }, [act('2026-09-02T00:00:00', 76)]).cruzaAviso75, true);
  assert.equal(decidir({ km_completed: 76 }, [act('2026-09-02T00:00:00', 80)]).cruzaAviso75, false);
  assert.equal(decidir({ km_completed: 70 }, [act('2026-09-02T00:00:00', 74)]).cruzaAviso75, false);
});

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

test('servicio: simular no escribe nada', async () => {
  const repo = crearRepoMemoria({ userChallenges: [ucBase({ km_completed: 5 })], actividades: [act('2026-09-02T00:00:00', 30)] });
  const inf = await recalcularProgresoUsuario({ repo, userId: 'u1', motivo: 'test' });
  assert.equal(inf.modo, MODOS.SIMULAR);
  assert.equal(inf.desafios[0].accion, ACCIONES.ACTUALIZAR_KM);
  assert.equal(uc1(repo).km_completed, 5);
  assert.ok(!repo.llamadas.some((l) => l.startsWith('actualizar') || l.startsWith('completar') || l.startsWith('evento')));
});

test('servicio: escribe una vez y el segundo recálculo no escribe (idempotencia)', async () => {
  const repo = crearRepoMemoria({ userChallenges: [ucBase({ km_completed: 5 })], actividades: [act('2026-09-02T00:00:00', 30)] });
  const a = await correr(repo);
  assert.equal(a.escrituras, 1);
  assert.equal(uc1(repo).km_completed, 30);
  const b = await correr(repo);
  assert.equal(b.escrituras, 0);
  assert.equal(repo.llamadas.filter((l) => l.startsWith('actualizar')).length, 1);
});

test('servicio: corrige hacia abajo cuando se excluye una actividad (activo)', async () => {
  const repo = crearRepoMemoria({ userChallenges: [ucBase({ km_completed: 30 })], actividades: [act('2026-09-02T00:00:00', 20), act('2026-09-03T00:00:00', 10, { excluida: true })] });
  await correr(repo);
  assert.equal(uc1(repo).km_completed, 20);
});

test('servicio: terminales congelados aunque cambien las actividades (D1)', async () => {
  const repo = crearRepoMemoria({ userChallenges: [ucBase({ status: 'completed', km_completed: 103 })], actividades: [act('2026-09-02T00:00:00', 50, { excluida: true })] });
  const inf = await correr(repo);
  assert.equal(inf.escrituras, 0);
  assert.equal(uc1(repo).km_completed, 103);
  assert.equal(uc1(repo).status, 'completed');
});

test('servicio: km_base nunca cambia y la actividad nueva suma encima', async () => {
  const repo = crearRepoMemoria({ userChallenges: [ucBase({ km_completed: 61.29, km_base: 61.29, km_base_motivo: 'legado_historico' })] });
  await correr(repo);
  assert.equal(uc1(repo).km_completed, 61.29);
  repo.db.actividades.push(act('2026-09-20T00:00:00', 8));
  await correr(repo);
  assert.equal(uc1(repo).km_completed, 69.29);
  assert.equal(uc1(repo).km_base, 61.29);
  assert.equal(uc1(repo).km_base_motivo, 'legado_historico');
});

test('servicio: una actividad suma a todos los desafíos activos del usuario', async () => {
  const repo = crearRepoMemoria({
    userChallenges: [ucBase(), ucBase({ id: 'uc2', challenge_id: 'c2' })],
    actividades: [act('2026-09-02T00:00:00', 12)],
  });
  await correr(repo);
  assert.deepEqual(repo.db.userChallenges.map((u) => u.km_completed), [12, 12]);
});

test('servicio: challengeId limita a ese desafío', async () => {
  const repo = crearRepoMemoria({
    userChallenges: [ucBase(), ucBase({ id: 'uc2', challenge_id: 'c2' })],
    actividades: [act('2026-09-02T00:00:00', 12)],
  });
  await correr(repo, { challengeId: 'c2' });
  assert.deepEqual(repo.db.userChallenges.map((u) => u.km_completed), [0, 12]);
});

test('servicio: completa exactamente una vez y registra un solo evento', async () => {
  const repo = crearRepoMemoria({ userChallenges: [ucBase({ km_completed: 90 })], actividades: [act('2026-09-02T00:00:00', 104)] });
  const a = await correr(repo);
  const b = await correr(repo);
  assert.deepEqual(a.completados, ['uc1']);
  assert.deepEqual(b.completados, []);
  assert.equal(uc1(repo).status, 'completed');
  assert.equal(uc1(repo).completed_at, '2026-10-02T10:00:00.000Z');
  assert.equal(repo.db.eventos.filter((e) => e.tipo === TIPOS_EVENTO.COMPLETADO).length, 1);
});

test('concurrencia: dos recálculos simultáneos → una sola transición y un solo evento', async () => {
  const repo = crearRepoMemoria({ userChallenges: [ucBase({ km_completed: 90 })], actividades: [act('2026-09-02T00:00:00', 104)] });
  // Los dos leen antes de que cualquiera escriba.
  let liberar;
  const barrera = new Promise((r) => { liberar = r; });
  let esperando = 0;
  repo.hooks.antesDeEscribir = async () => { esperando += 1; if (esperando === 2) liberar(); await barrera; };
  const [a, b] = await Promise.all([correr(repo), correr(repo)]);
  assert.equal(a.completados.length + b.completados.length, 1);
  assert.equal(repo.db.eventos.length, 1);
  assert.equal(uc1(repo).status, 'completed');
});

test('concurrencia: una escritura con datos viejos pierde el CAS, relee y escribe el valor correcto', async () => {
  const repo = crearRepoMemoria({ userChallenges: [ucBase({ km_completed: 10 })], actividades: [act('2026-09-02T00:00:00', 10), act('2026-09-03T00:00:00', 5)] });
  let primera = true;
  repo.hooks.antesDeEscribir = async () => {
    if (primera) {
      primera = false;
      // Mientras tanto otro proceso agregó una actividad y escribió su valor.
      repo.db.actividades.push(act('2026-09-04T00:00:00', 7));
      uc1(repo).km_completed = 22;
    }
  };
  const inf = await correr(repo);
  assert.equal(inf.intentos, 2);
  assert.equal(uc1(repo).km_completed, 22);
  assert.deepEqual(inf.conflictos_sin_resolver, []);
});

test('concurrencia: si los conflictos no se resuelven, informa y no rompe', async () => {
  const repo = crearRepoMemoria({ userChallenges: [ucBase({ km_completed: 10 })], actividades: [act('2026-09-02T00:00:00', 30)] });
  repo.hooks.antesDeEscribir = async () => { uc1(repo).km_completed += 0.5; };
  const inf = await correr(repo, { maxIntentos: 3 });
  assert.equal(inf.intentos, 3);
  assert.deepEqual(inf.conflictos_sin_resolver, ['uc1']);
});

test('servicio: aviso del 75 % registra un evento único', async () => {
  const repo = crearRepoMemoria({ userChallenges: [ucBase({ km_completed: 70 })], actividades: [act('2026-09-02T00:00:00', 76)] });
  await correr(repo);
  repo.db.actividades.push(act('2026-09-05T00:00:00', 1));
  await correr(repo);
  assert.equal(repo.db.eventos.filter((e) => e.tipo === TIPOS_EVENTO.CRUCE_75).length, 1);
});

test('servicio: pausa abierta y cerrada respetadas al escribir', async () => {
  const repo = crearRepoMemoria({
    userChallenges: [ucBase({ km_completed: 0, periodos_pausados: [{ desde: '2026-09-05T00:00:00', hasta: '2026-09-06T00:00:00Z' }], pausado: true, pausado_at: '2026-09-10T00:00:00' })],
    actividades: [act('2026-09-02T00:00:00', 5), act('2026-09-05T12:00:00', 7), act('2026-09-11T00:00:00', 9)],
  });
  await correr(repo);
  assert.equal(uc1(repo).km_completed, 5);
});

test('servicio: paridad con el núcleo en 300 estados aleatorios (lo escrito = km_base + actividades)', async () => {
  for (let i = 0; i < 300; i++) {
    const kmBase = Math.random() < 0.3 ? Math.round(Math.random() * 500) / 10 : 0;
    const actividades = Array.from({ length: Math.floor(Math.random() * 8) }, () =>
      act(`2026-09-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}T12:00:00`, Math.round(Math.random() * 200) / 10, { excluida: Math.random() < 0.2 }));
    const uc = ucBase({ km_completed: Math.round(Math.random() * 900) / 10, km_base: kmBase, km_base_motivo: kmBase > 0 ? 'legado_historico' : null });
    const repo = crearRepoMemoria({ userChallenges: [uc], actividades });
    await correr(repo);
    const esperado = calcularProgresoChallenge({ uc, challenge: CH, actividades }).exacto.kmProgreso;
    assert.ok(Math.abs(uc1(repo).km_completed - esperado) < 1e-6, `caso ${i}`);
    assert.equal(uc1(repo).km_base, kmBase);
  }
});

// ---------------------------------------------------------------------------
// Eventos de completar (outbox)
// ---------------------------------------------------------------------------

const efectosContados = (fallar = {}) => {
  const llamados = { certificado: 0, push_completado: 0, push_aviso_direccion: 0 };
  const efectos = {};
  for (const nombre of Object.keys(llamados)) {
    efectos[nombre] = async () => {
      llamados[nombre] += 1;
      if (fallar[nombre] && fallar[nombre] >= llamados[nombre]) throw new Error(`falla simulada ${nombre}`);
    };
  }
  return { efectos, llamados };
};

const repoConEvento = async () => {
  const repo = crearRepoMemoria({ userChallenges: [ucBase({ km_completed: 90 })], actividades: [act('2026-09-02T00:00:00', 104)] });
  await correr(repo);
  return repo;
};

test('eventos: completar dispara certificado y push una sola vez', async () => {
  const repo = await repoConEvento();
  const { efectos, llamados } = efectosContados();
  const r1 = await procesarEventosPendientes({ repo, efectos });
  const r2 = await procesarEventosPendientes({ repo, efectos });
  assert.equal(r1[0].estado, ESTADOS.HECHO);
  assert.equal(r2.length, 0);
  assert.deepEqual(llamados, { certificado: 1, push_completado: 1, push_aviso_direccion: 0 });
});

test('eventos: dos procesadores a la vez → solo uno reclama el evento', async () => {
  const repo = await repoConEvento();
  const { efectos, llamados } = efectosContados();
  const [evento] = await repo.listarEventosProcesables({ limite: 10, vencidoAntesDeIso: '2000-01-01T00:00:00Z' });
  const [a, b] = await Promise.all([procesarEvento({ repo, efectos, evento }), procesarEvento({ repo, efectos, evento })]);
  assert.equal([a, b].filter((r) => r.procesado).length, 1);
  assert.equal(llamados.certificado, 1);
});

test('eventos: si falla el push, el reintento NO reenvía el certificado', async () => {
  const repo = await repoConEvento();
  const { efectos, llamados } = efectosContados({ push_completado: 1 });
  const r1 = await procesarEventosPendientes({ repo, efectos });
  assert.equal(r1[0].estado, ESTADOS.ERROR);
  const r2 = await procesarEventosPendientes({ repo, efectos });
  assert.equal(r2[0].estado, ESTADOS.HECHO);
  assert.deepEqual(llamados, { certificado: 1, push_completado: 2, push_aviso_direccion: 0 });
});

test('eventos: un procesamiento colgado se puede reclamar después del plazo, no antes', async () => {
  const repo = await repoConEvento();
  const ev = repo.db.eventos[0];
  ev.estado = 'procesando';
  ev.procesando_desde = '2026-10-02T10:00:00.000Z';
  const { efectos, llamados } = efectosContados();
  const antes = await procesarEventosPendientes({ repo, efectos, ahoraMs: Date.parse('2026-10-02T10:05:00Z'), leaseMs: 10 * 60 * 1000 });
  assert.equal(antes.length, 0);
  const despues = await procesarEventosPendientes({ repo, efectos, ahoraMs: Date.parse('2026-10-02T10:11:00Z'), leaseMs: 10 * 60 * 1000 });
  assert.equal(despues[0].estado, ESTADOS.HECHO);
  assert.equal(llamados.certificado, 1);
});

test('eventos: efecto no configurado queda en error (no se pierde en silencio)', async () => {
  const repo = await repoConEvento();
  const r = await procesarEventosPendientes({ repo, efectos: {} });
  assert.equal(r[0].estado, ESTADOS.ERROR);
  assert.match(repo.db.eventos[0].ultimo_error, /no configurado/);
});

test('eventos: después de max intentos deja de reintentar', async () => {
  const repo = await repoConEvento();
  repo.db.eventos[0].intentos = 5;
  repo.db.eventos[0].estado = 'error';
  const { efectos, llamados } = efectosContados();
  const r = await procesarEventosPendientes({ repo, efectos, maxIntentosPorEvento: 5 });
  assert.equal(r[0].motivo, 'max_intentos');
  assert.equal(llamados.certificado, 0);
});

// ---------------------------------------------------------------------------
// Repositorio Supabase (con cliente simulado): qué escribe y con qué condiciones
// ---------------------------------------------------------------------------

const clienteSupabaseSimulado = (respuestas = {}) => {
  const registro = [];
  const from = (tabla) => {
    const op = { tabla, metodo: null, payload: null, filtros: [] };
    registro.push(op);
    const q = {
      select: (c) => { if (!op.metodo) op.metodo = 'select'; op.select = c; return q; },
      update: (p) => { op.metodo = 'update'; op.payload = p; return q; },
      insert: (p) => { op.metodo = 'insert'; op.payload = p; return q; },
      eq: (c, v) => { op.filtros.push(`eq:${c}=${v}`); return q; },
      is: (c, v) => { op.filtros.push(`is:${c}=${v}`); return q; },
      in: (c, v) => { op.filtros.push(`in:${c}`); return q; },
      or: (f) => { op.filtros.push(`or:${f}`); return q; },
      order: () => q, range: () => q, limit: () => q,
      single: async () => respuestas.single || { data: { id: 'ev1' }, error: null },
      maybeSingle: async () => respuestas.maybeSingle || { data: null, error: null },
      then: (res) => res(respuestas[op.metodo] || { data: [], error: null }),
    };
    return q;
  };
  return { cliente: { from }, registro };
};

test('repo Supabase: actualizar km es condicional y nunca incluye km_base', async () => {
  const { cliente, registro } = clienteSupabaseSimulado({ update: { data: [{ id: 'uc1' }], error: null } });
  const repo = crearRepositorioSupabase(cliente);
  assert.equal(await repo.actualizarKmCAS({ id: 'uc1', kmLeido: 10, kmNuevo: 15 }), true);
  const op = registro.find((r) => r.metodo === 'update');
  assert.deepEqual(op.payload, { km_completed: 15 });
  assert.deepEqual(op.filtros, ['eq:id=uc1', 'eq:status=active', 'eq:km_completed=10']);
});

test('repo Supabase: completar es condicional a active y al km leído; payload sin km_base', async () => {
  const { cliente, registro } = clienteSupabaseSimulado({ update: { data: [], error: null } });
  const repo = crearRepositorioSupabase(cliente);
  assert.equal(await repo.completarCAS({ id: 'uc1', kmLeido: null, kmNuevo: 103, completedAtIso: '2026-10-02T10:00:00.000Z' }), false);
  const op = registro.find((r) => r.metodo === 'update');
  assert.deepEqual(Object.keys(op.payload).sort(), ['completed_at', 'km_completed', 'status']);
  assert.deepEqual(op.filtros, ['eq:id=uc1', 'eq:status=active', 'is:km_completed=null']);
});

test('repo Supabase: evento duplicado (23505) devuelve creado=false sin error', async () => {
  const { cliente } = clienteSupabaseSimulado({ single: { data: null, error: { code: '23505', message: 'duplicate' } } });
  const repo = crearRepositorioSupabase(cliente);
  assert.deepEqual(await repo.registrarEvento({ userChallengeId: 'uc1', userId: 'u1', tipo: 'completado' }), { creado: false, id: null });
});

test('repo Supabase: solo escribe en user_challenges y progreso_eventos', async () => {
  const { cliente, registro } = clienteSupabaseSimulado({ update: { data: [{ id: 'x' }], error: null } });
  const repo = crearRepositorioSupabase(cliente);
  await repo.leerEstadoUsuario('u1');
  await repo.actualizarKmCAS({ id: 'uc1', kmLeido: 1, kmNuevo: 2 });
  await repo.registrarEvento({ userChallengeId: 'uc1', userId: 'u1', tipo: 'completado' });
  await repo.reclamarEvento({ id: 'ev1', ahoraIso: 'a', vencidoAntesDeIso: 'b' });
  await repo.guardarResultadoEvento({ id: 'ev1', estado: 'hecho', resultado: {}, intentos: 1 });
  const escrituras = registro.filter((r) => r.metodo === 'update' || r.metodo === 'insert');
  assert.ok(escrituras.every((r) => ['user_challenges', 'progreso_eventos'].includes(r.tabla)));
  assert.ok(escrituras.every((r) => !('km_base' in (r.payload || {})) && !('km_base_motivo' in (r.payload || {}))));
  const lecturas = registro.filter((r) => r.metodo === 'select');
  assert.ok(lecturas.every((r) => ['user_challenges', 'challenges', 'activities'].includes(r.tabla)));
});