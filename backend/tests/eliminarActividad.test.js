// Tests del writer ELIMINAR ACTIVIDAD con el motor unificado (Etapa 4A-3d) y del protocolo de la
// marca persistente compartido con REANUDAR.
//
// Unitarios: repositorio Supabase REAL sobre un cliente en memoria.
// Concurrencia: dos o más pedidos SIN candado (como si fueran procesos distintos), intercalados
// paso a paso por un planificador determinista, con caídas inyectadas ("el proceso muere acá").
// En cada punto se verifica la invariante del protocolo:
//     si el km_completed de un desafío activo no coincide con el motor → ese desafío tiene marca
// y al final, después de la recuperación, todo converge: km correctos y ninguna marca.
// Integración: index.js real en un proceso hijo, con la flag apagada y encendida.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
const { levantarBackend } = require('./helpers/backendHijo');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { eliminarActividadConMotor } = require('../lib/eliminarActividad');
const { reanudarDesafioConMotor } = require('../lib/reanudarDesafio');
const { recalcularProgresoUsuario, MODOS } = require('../lib/progresoServicio');
const { writerMotorActivo, writersActivos, algunWriterMotorActivo } = require('../lib/flagsMotor');
const { recuperarRecalculosPendientes, iniciarRecuperacion, logMotor } = require('../lib/recuperacionRecalculo');
const { crearCandado, sinCandado } = require('../lib/candadoUsuario');
const { distintaDe, aMicros, tomarMarca } = require('../lib/marcaRecalculo');

// ---------------------------------------------------------------------------
// Escenario
//   uc1 activo, con km_base 40, sin pausa                 → 40 + 10 + 7 + 5 = 62
//   uc2 activo, PAUSADO desde 08/09, con una pausa cerrada 05/09–07/09
//       a1 (02/09) cuenta; a2 (06/09) cae en la pausa cerrada; a3 (11/09) es posterior a pausado_at → 10
//   uc3 completed (terminal, congelado) · uc4 pending (sin cálculo) · uc9 de OTRO usuario
// ---------------------------------------------------------------------------
const U = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const A1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const A2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const A3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const A9 = 'aaaaaaaa-0000-4000-8000-000000000009';
const A_INEXISTENTE = 'aaaaaaaa-0000-4000-8000-000000000099';
const AHORA = Date.parse('2026-09-12T12:00:00Z');

const CHS = [
  { id: 'c1', title: 'Desafío 1', modalidades: [{ tipo: 'run', distancia_km: 103 }], total_distance_km: 103 },
  { id: 'c2', title: 'Desafío 2', modalidades: [{ tipo: 'run', distancia_km: 50 }], total_distance_km: 50 },
  { id: 'c3', title: 'Desafío 3', modalidades: [{ tipo: 'run', distancia_km: 100 }], total_distance_km: 100 },
  { id: 'c4', title: 'Desafío 4', modalidades: [{ tipo: 'run', distancia_km: 100 }], total_distance_km: 100 },
];
const base = (extra) => ({
  user_id: U, status: 'active', modalidad: 'run', started_at: '2026-09-01T00:00:00', pausado: false, pausado_at: null,
  periodos_pausados: [], km_base: 0, km_base_motivo: null, completed_at: null, recalculo_pendiente_desde: null, ...extra,
});
const UC1 = () => base({ id: 'uc1', challenge_id: 'c1', km_base: 40, km_base_motivo: 'legado_historico', km_completed: 62 });
const UC2 = () => base({
  id: 'uc2', challenge_id: 'c2', pausado: true, pausado_at: '2026-09-08T00:00:00',
  periodos_pausados: [{ desde: '2026-09-05T00:00:00', hasta: '2026-09-07T00:00:00.000Z' }], km_completed: 10,
});
const UC3 = () => base({ id: 'uc3', challenge_id: 'c3', status: 'completed', km_completed: 120, completed_at: '2026-09-09T00:00:00' });
const UC4 = () => base({ id: 'uc4', challenge_id: 'c4', status: 'pending', km_completed: 0 });
const UC9 = () => base({ id: 'uc9', user_id: U2, challenge_id: 'c1', km_completed: 3 });

const act = (id, userId, recorded_at, km) => ({ id, user_id: userId, distance_km: km, recorded_at, excluida: false });
const ACTS = () => [
  act(A1, U, '2026-09-02T07:00:00', 10),
  act(A2, U, '2026-09-06T07:00:00', 7),
  act(A3, U, '2026-09-11T07:00:00', 5),
  act(A9, U2, '2026-09-03T07:00:00', 3),
];

/** Marcas deterministas y únicas (como generarMarcaUnica, pero reproducibles). */
const crearGeneradorMarcas = () => {
  let n = 0;
  return (ms) => { n += 1; return `${new Date(ms).toISOString().slice(0, -1)}${String(n % 1000).padStart(3, '0')}Z`; };
};

const montar = ({ ucs = [UC1(), UC2(), UC3(), UC4(), UC9()], actividades = ACTS(), fallar } = {}) => {
  const m = crearSupabaseMemoria({ user_challenges: ucs, challenges: CHS, activities: actividades, progreso_eventos: [] }, { fallar });
  const repo = crearRepositorioSupabase(m.cliente);
  const logs = [];
  const esperas = [];
  const esperar = async (ms) => { esperas.push(ms); };
  const generarMarca = crearGeneradorMarcas();
  const eliminar = (extra = {}) => eliminarActividadConMotor({
    repo, userId: U, actividadId: A3, ahoraMs: AHORA, log: (l) => logs.push(l), esperar, generarMarca, candado: sinCandado, ...extra,
  });
  const reanudar = (extra = {}) => reanudarDesafioConMotor({
    repo, userId: U, challengeId: 'c2', ahoraMs: AHORA, log: (l) => logs.push(l), esperar, generarMarca, candado: sinCandado, ...extra,
  });
  const fila = (id) => m.db.user_challenges.find((x) => x.id === id);
  const actividad = (id) => m.db.activities.find((x) => x.id === id);
  const marcas = () => m.db.user_challenges.filter((x) => x.recalculo_pendiente_desde !== null).map((x) => x.id).sort();

  /** Desafíos cuyo km_completed NO coincide con el motor (según el estado actual de la base). */
  const inconsistentes = async () => {
    const lista = [];
    for (const userId of [U, U2]) {
      const inf = await recalcularProgresoUsuario({ repo, userId, motivo: 'verificacion', modo: MODOS.SIMULAR, ahoraMs: AHORA });
      inf.desafios.filter((d) => d.accion !== 'nada').forEach((d) => lista.push(d.user_challenge_id));
    }
    return lista.sort();
  };
  /** Invariante del protocolo: todo desafío inconsistente tiene marca. */
  const verificarInvariante = async (contexto = '') => {
    for (const id of await inconsistentes()) {
      assert.notEqual(fila(id).recalculo_pendiente_desde, null, `${contexto}: ${id} quedó con km incorrecto y SIN marca`);
    }
  };
  /** Recuperación (como al arrancar otro proceso más tarde) hasta que no quede ninguna marca. */
  const converger = async () => {
    for (let i = 0; i < 5 && marcas().length > 0; i++) {
      await recuperarRecalculosPendientes({ repo: crearRepositorioSupabase(m.cliente), ahoraMs: AHORA + 10 * 60 * 1000, log: () => {}, esperar });
    }
  };
  /** Estado final correcto: sin marcas, todo consistente, base y terminales intactos. */
  const verificarConvergencia = async (contexto = '') => {
    assert.deepEqual(marcas(), [], `${contexto}: quedaron marcas`);
    assert.deepEqual(await inconsistentes(), [], `${contexto}: quedaron desafíos inconsistentes`);
    assert.equal(fila('uc1').km_base, 40);
    assert.equal(fila('uc1').km_base_motivo, 'legado_historico');
    assert.deepEqual([fila('uc3').status, fila('uc3').km_completed], ['completed', 120]);
    assert.deepEqual([fila('uc4').status, fila('uc4').km_completed], ['pending', 0]);
    assert.equal(fila('uc9').km_completed, 3);
    assert.equal(actividad(A9).excluida, false);
  };
  return { m, repo, logs, esperas, esperar, generarMarca, eliminar, reanudar, fila, actividad, marcas, inconsistentes, verificarInvariante, converger, verificarConvergencia };
};

const escriturasConKmBase = (registro) =>
  registro.filter((op) => op.tipo !== 'select' && op.valores && ('km_base' in op.valores || 'km_base_motivo' in op.valores));
const updatesDe = (registro, tabla) => registro.filter((op) => op.tipo === 'update' && op.tabla === tabla);

/**
 * Envuelve un repo con un gancho antes y después de cada operación. El gancho puede devolver
 * 'morir': el "proceso" muere en ese punto (la promesa nunca se resuelve y no sigue ejecutando).
 */
const conGanchos = (repo, gancho) => {
  const estado = { llamadas: 0, murio: false };
  const envuelto = {};
  for (const [nombre, fn] of Object.entries(repo)) {
    envuelto[nombre] = async (...args) => {
      estado.llamadas += 1;
      const n = estado.llamadas;
      if ((await gancho(nombre, 'antes', n, args)) === 'morir') { estado.murio = true; return new Promise(() => {}); }
      const r = await fn(...args);
      if ((await gancho(nombre, 'despues', n, args)) === 'morir') { estado.murio = true; return new Promise(() => {}); }
      return r;
    };
  }
  return { repo: envuelto, estado };
};

const esperarHasta = async (condicion, maxVueltas = 10000) => {
  for (let i = 0; i < maxVueltas && !condicion(); i++) await new Promise((r) => setImmediate(r));
  if (!condicion()) throw new Error('la condición nunca se cumplió');
};

const barrera = () => { let abrir; const p = new Promise((r) => { abrir = r; }); return { p, abrir }; };

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

test('flags: eliminar_actividad es independiente de reanudar; cualquiera activa la recuperación', () => {
  assert.equal(writerMotorActivo('eliminar_actividad', {}), false);
  assert.equal(writerMotorActivo('eliminar_actividad', { MOTOR_PROGRESO_WRITERS: 'reanudar' }), false);
  assert.equal(writerMotorActivo('reanudar', { MOTOR_PROGRESO_WRITERS: 'eliminar_actividad' }), false);
  assert.equal(writerMotorActivo('eliminar_actividad', { MOTOR_PROGRESO_WRITERS: 'reanudar, Eliminar_Actividad ' }), true);
  assert.deepEqual(writersActivos({ MOTOR_PROGRESO_WRITERS: 'reanudar,eliminar_actividad,manual' }), ['reanudar', 'eliminar_actividad']);
  assert.equal(algunWriterMotorActivo({}), false);
  assert.equal(algunWriterMotorActivo({ MOTOR_PROGRESO_WRITERS: 'manual' }), false); // nombres desconocidos no cuentan
  assert.equal(algunWriterMotorActivo({ MOTOR_PROGRESO_WRITERS: 'eliminar_actividad' }), true);
  assert.equal(algunWriterMotorActivo({ MOTOR_PROGRESO_WRITERS: 'reanudar' }), true);
});

// ---------------------------------------------------------------------------
// Corrección del recálculo
// ---------------------------------------------------------------------------

test('con km_base: borrar una actividad baja exactamente sus km y conserva la base', async () => {
  const s = montar();
  const r = await s.eliminar();
  assert.equal(r.status, 200);
  assert.equal(r.body.mensaje, 'Actividad eliminada y km recalculados');
  assert.equal(r.body.progreso.motor, true);
  assert.equal(r.body.progreso.recalculo, 'ok');
  assert.equal(r.body.progreso.actividad_encontrada, true);
  assert.equal(s.actividad(A3).excluida, true);
  assert.equal(s.fila('uc1').km_completed, 57); // 62 − 5; la base de 40 sigue sumando
  assert.equal(s.fila('uc1').km_base, 40);
  assert.deepEqual(escriturasConKmBase(s.m.registro), []);
  const d1 = r.body.progreso.desafios.find((d) => d.user_challenge_id === 'uc1');
  assert.deepEqual([d1.km_antes, d1.km_despues], [62, 57]);
  assert.deepEqual(s.marcas(), []);
  await s.verificarConvergencia();
});

test('pausas: borrar una actividad de una pausa cerrada no cambia ese desafío', async () => {
  const s = montar();
  await s.eliminar({ actividadId: A2 });
  assert.equal(s.fila('uc2').km_completed, 10); // a2 no contaba para uc2 (pausa cerrada)
  assert.equal(s.fila('uc1').km_completed, 55); // para uc1 sí contaba
  await s.verificarConvergencia();
});

test('pausa abierta: lo posterior a pausado_at no cuenta, y un pausado nunca se completa', async () => {
  // uc2 con base 45: al borrar a3 queda en 45 + 10 = 55 ≥ 50, pero está pausado → no se completa.
  const uc2 = { ...UC2(), km_base: 45, km_base_motivo: 'legado_historico', km_completed: 55 };
  const s = montar({ ucs: [UC1(), uc2, UC3(), UC4(), UC9()] });
  const r = await s.eliminar();
  assert.equal(s.fila('uc2').status, 'active');
  assert.equal(s.fila('uc2').km_completed, 55);
  assert.equal(r.body.progreso.eventos_pendientes, 0);
  assert.equal(s.m.db.progreso_eventos.length, 0);
});

test('terminales congelados y pending sin cálculo: no se les escribe nada (el viejo sí)', async () => {
  const s = montar();
  await s.eliminar({ actividadId: A1 });
  const ids = updatesDe(s.m.registro, 'user_challenges').filter((op) => op.valores && 'km_completed' in op.valores)
    .flatMap((op) => op.filtros.filter(([t, c]) => t === 'eq' && c === 'id').map(([, , v]) => v));
  assert.ok(!ids.includes('uc3'));
  assert.ok(!ids.includes('uc4'));
  assert.deepEqual([s.fila('uc3').km_completed, s.fila('uc4').km_completed], [120, 0]);
  assert.deepEqual([s.fila('uc1').km_completed, s.fila('uc2').km_completed], [52, 0]);
});

test('todos los desafíos del usuario se recalculan con UNA sola lectura de actividades', async () => {
  const s = montar();
  await s.eliminar();
  const lecturas = s.m.registro.filter((op) => op.tipo === 'select' && op.tabla === 'activities');
  assert.equal(lecturas.length, 1);
});

test('si el borrado completa un desafío desfasado: un solo evento PENDIENTE, sin efectos', async () => {
  // uc1 guardado en 50 (desfasado, lo bajó un camino viejo); el motor da 40 + 10 + 7 + 50 = 107 ≥ 103.
  const acts = [...ACTS(), act('aaaaaaaa-0000-4000-8000-000000000004', U, '2026-09-04T07:00:00', 50)];
  const s = montar({ ucs: [{ ...UC1(), km_completed: 50 }, UC2(), UC3(), UC4(), UC9()], actividades: acts });
  const r = await s.eliminar();
  assert.equal(s.fila('uc1').status, 'completed');
  assert.equal(r.body.progreso.eventos_pendientes, 1);
  assert.equal(s.m.db.progreso_eventos.length, 1);
  assert.deepEqual([s.m.db.progreso_eventos[0].tipo, s.m.db.progreso_eventos[0].estado], ['completado', 'pendiente']);
  assert.deepEqual(s.marcas(), []);
});

// ---------------------------------------------------------------------------
// Casos borde de la actividad
// ---------------------------------------------------------------------------

test('actividad inexistente: no excluye nada, km iguales, marcas borradas', async () => {
  const s = montar();
  const antes = JSON.parse(JSON.stringify(s.m.db.activities));
  const r = await s.eliminar({ actividadId: A_INEXISTENTE });
  assert.equal(r.body.mensaje, 'Actividad eliminada y km recalculados'); // misma respuesta que el viejo
  assert.equal(r.body.progreso.actividad_encontrada, false);
  assert.deepEqual(s.m.db.activities, antes);
  assert.deepEqual([s.fila('uc1').km_completed, s.fila('uc2').km_completed], [62, 10]);
  assert.deepEqual(s.marcas(), []);
});

test('actividad de OTRO usuario: no se toca y el progreso de nadie cambia', async () => {
  const s = montar();
  const r = await s.eliminar({ actividadId: A9 });
  assert.equal(r.body.progreso.actividad_encontrada, false);
  assert.equal(s.actividad(A9).excluida, false);
  assert.equal(s.fila('uc9').km_completed, 3);
  assert.equal(s.fila('uc1').km_completed, 62);
  await s.verificarConvergencia();
});

test('DELETE repetido: la segunda vez no cambia nada (idempotente)', async () => {
  const s = montar();
  await s.eliminar();
  const escriturasKm = () => s.m.registro.filter((op) => op.tipo === 'update' && op.valores && 'km_completed' in op.valores).length;
  const antes = escriturasKm();
  const r2 = await s.eliminar();
  assert.equal(r2.body.progreso.recalculo, 'ok');
  assert.equal(r2.body.progreso.actividad_encontrada, true); // ya estaba excluida: misma fila
  assert.equal(escriturasKm(), antes);
  assert.equal(s.fila('uc1').km_completed, 57);
  assert.deepEqual(s.marcas(), []);
});

test('ids inválidos o sin user_id: misma respuesta de error que el viejo y ninguna escritura', async () => {
  const s = montar();
  for (const extra of [{ actividadId: 'no-es-uuid' }, { userId: undefined }, { userId: 'x' }]) {
    const r = await s.eliminar(extra);
    assert.equal(r.status, 200);
    assert.equal(r.body.error, 'Error eliminando actividad');
  }
  assert.equal(s.m.registro.filter((op) => op.tipo !== 'select').length, 0);
});

// ---------------------------------------------------------------------------
// Orden marca → exclusión → recálculo → borrado de marca, y fallas en cada paso
// ---------------------------------------------------------------------------

test('orden: primero marca TODOS los activos (no terminales ni pending), después excluye', async () => {
  const s = montar();
  await s.eliminar();
  const escrituras = s.m.registro.filter((op) => op.tipo !== 'select');
  const iExclusion = escrituras.findIndex((op) => op.tabla === 'activities');
  const marcasAntes = escrituras.slice(0, iExclusion)
    .filter((op) => op.tabla === 'user_challenges' && op.valores && op.valores.recalculo_pendiente_desde)
    .flatMap((op) => op.filtros.filter(([t, c]) => t === 'eq' && c === 'id').map(([, , v]) => v));
  assert.deepEqual(marcasAntes.sort(), ['uc1', 'uc2']);
  assert.equal(escrituras.slice(0, iExclusion).length, 2); // nada más antes de excluir
});

test('si no se puede marcar: NO se excluye la actividad y responde error', async () => {
  const s = montar({ fallar: (op) => op.tipo === 'update' && op.tabla === 'user_challenges' && op.valores && op.valores.recalculo_pendiente_desde });
  const r = await s.eliminar();
  assert.equal(r.body.error, 'Error eliminando actividad');
  assert.equal(s.actividad(A3).excluida, false);
  assert.ok(s.logs.some((l) => l.resultado === 'no_se_pudo_marcar'));
});

test('falla la exclusión (sin aplicarse): error como el viejo; la marca queda y la recuperación converge', async () => {
  let fallar = true;
  const s = montar({ fallar: (op) => fallar && op.tipo === 'update' && op.tabla === 'activities' });
  const r = await s.eliminar();
  assert.equal(r.body.error, 'Error eliminando actividad');
  assert.equal(s.actividad(A3).excluida, false);
  assert.deepEqual(s.marcas(), ['uc1', 'uc2']);
  await s.verificarInvariante();
  fallar = false;
  await s.converger();
  await s.verificarConvergencia();
  assert.equal(s.fila('uc1').km_completed, 62);
});

test('la exclusión SÍ se aplicó pero la respuesta falló (red): la marca cubre y la recuperación converge', async () => {
  const s = montar();
  const { repo } = conGanchos(s.repo, async (nombre, fase) => {
    if (nombre === 'excluirActividad' && fase === 'despues') throw new Error('se cortó la conexión');
  });
  const r = await s.eliminar({ repo });
  assert.equal(r.body.error, 'Error eliminando actividad');
  assert.equal(s.actividad(A3).excluida, true);
  assert.deepEqual(await s.inconsistentes(), ['uc1']); // km todavía en 62
  await s.verificarInvariante();
  await s.converger();
  await s.verificarConvergencia();
  assert.equal(s.fila('uc1').km_completed, 57);
});

test('falla el 1.er recálculo y el reintento funciona: ok y marcas borradas', async () => {
  let fallas = 1;
  const s = montar({ fallar: (op) => op.tabla === 'activities' && op.tipo === 'select' && fallas-- > 0 });
  const r = await s.eliminar();
  assert.equal(r.body.progreso.recalculo, 'ok');
  assert.deepEqual(s.esperas, [250]);
  assert.deepEqual(s.marcas(), []);
  assert.equal(s.fila('uc1').km_completed, 57);
});

test('fallan todos los intentos: respuesta "pendiente", marcas persistentes, la recuperación converge', async () => {
  let fallar = true;
  const s = montar({ fallar: (op) => fallar && op.tabla === 'activities' && op.tipo === 'select' });
  const r = await s.eliminar();
  assert.deepEqual(r.body.progreso, { motor: true, recalculo: 'pendiente', recuperacion: 'automatica', actividad_encontrada: true });
  assert.equal(s.actividad(A3).excluida, true);
  assert.deepEqual(s.marcas(), ['uc1', 'uc2']);
  fallar = false; // la base volvió (también hace falta para poder verificar)
  await s.verificarInvariante();
  await s.converger();
  await s.verificarConvergencia();
  assert.equal(s.fila('uc1').km_completed, 57);
});

test('caída en CADA punto (antes y después de cada operación): invariante siempre, y converge', async () => {
  // Corrida normal para contar las operaciones.
  const normal = montar();
  const contador = conGanchos(normal.repo, async () => {});
  await normal.eliminar({ repo: contador.repo });
  const total = contador.estado.llamadas;
  assert.ok(total >= 8, `se esperaban al menos 8 operaciones, hubo ${total}`);

  for (let n = 1; n <= total; n++) {
    for (const momento of ['antes', 'despues']) {
      const s = montar();
      const { repo, estado } = conGanchos(s.repo, async (_nombre, fase, k) => (k === n && fase === momento ? 'morir' : undefined));
      s.eliminar({ repo }); // el "proceso" muere en el medio: esta promesa nunca termina
      await esperarHasta(() => estado.murio);
      const contexto = `caída ${momento} de la operación ${n}/${total}`;
      await s.verificarInvariante(contexto);
      // Reinicio / deploy: un proceso NUEVO arranca la recuperación y corre su ronda.
      await s.converger();
      await s.verificarConvergencia(contexto);
    }
  }
});

test('reinicio/deploy entre la exclusión y el recálculo: la recuperación del proceso nuevo lo resuelve', async () => {
  const s = montar();
  const { repo, estado } = conGanchos(s.repo, async (nombre, fase) => (nombre === 'excluirActividad' && fase === 'despues' ? 'morir' : undefined));
  s.eliminar({ repo });
  await esperarHasta(() => estado.murio);
  assert.equal(s.actividad(A3).excluida, true);
  assert.equal(s.fila('uc1').km_completed, 62); // desactualizado...
  assert.deepEqual(s.marcas(), ['uc1', 'uc2']); // ...pero marcado
  // Proceso nuevo: la recuperación arranca en modo activo y su primera ronda lo resuelve.
  const pendientes = [];
  const temporizadores = { setTimeout: (fn) => { pendientes.push(fn); return { unref() {} }; }, clearTimeout: () => {} };
  const rec = await iniciarRecuperacion({ crearRepo: () => crearRepositorioSupabase(s.m.cliente), motorActivo: true, log: () => {}, temporizadores });
  assert.equal(rec.modo, 'activo');
  await pendientes.shift()();
  rec.detener();
  await s.verificarConvergencia();
  assert.equal(s.fila('uc1').km_completed, 57);
});

test('si pasaron más de 30 s entre marcar y excluir, renueva las marcas (y sigue siendo dueño)', async () => {
  const s = montar();
  let t = 0;
  const reloj = () => { const v = t; t += 31 * 1000; return v; };
  const r = await s.eliminar({ reloj });
  assert.ok(s.logs.some((l) => l.resultado === 'marcas_renovadas'));
  assert.equal(r.body.progreso.marcas_para_recuperacion, 0);
  assert.deepEqual(s.marcas(), []);
  assert.equal(s.fila('uc1').km_completed, 57);
});

// ---------------------------------------------------------------------------
// Marca más nueva / marca previa
// ---------------------------------------------------------------------------

test('marca más nueva que la del intento actual: no la borra; km correcto; la recuperación la limpia', async () => {
  const s = montar();
  const { repo } = conGanchos(s.repo, async (nombre, fase, _n, args) => {
    // Justo antes de borrar su marca de uc1, otro pedido marca uc1 encima.
    if (nombre === 'limpiarRecalculoPendienteCAS' && fase === 'antes' && args[0].id === 'uc1') {
      const actual = s.fila('uc1').recalculo_pendiente_desde;
      await s.repo.marcarRecalculoCAS({ id: 'uc1', marcaLeida: actual, marcaNueva: '2026-09-12T12:00:05.000000Z' });
    }
  });
  const r = await s.eliminar({ repo });
  assert.equal(r.body.progreso.recalculo, 'ok');
  assert.equal(r.body.progreso.marcas_para_recuperacion, 1);
  assert.equal(s.fila('uc1').recalculo_pendiente_desde, '2026-09-12T12:00:05.000000Z'); // la más nueva sigue
  assert.equal(s.fila('uc2').recalculo_pendiente_desde, null);
  assert.equal(s.fila('uc1').km_completed, 57);
  await s.converger();
  await s.verificarConvergencia();
});

test('había una marca previa (pendiente de otro pedido): la renueva, NO la borra, y la recuperación la limpia', async () => {
  const s = montar({ ucs: [{ ...UC1(), recalculo_pendiente_desde: '2026-09-01T00:00:00.000001Z' }, UC2(), UC3(), UC4(), UC9()] });
  const r = await s.eliminar();
  assert.equal(r.body.progreso.recalculo, 'ok');
  assert.equal(r.body.progreso.marcas_para_recuperacion, 1);
  assert.notEqual(s.fila('uc1').recalculo_pendiente_desde, null);
  assert.notEqual(s.fila('uc1').recalculo_pendiente_desde, '2026-09-01T00:00:00.000001Z'); // renovada
  assert.equal(s.fila('uc2').recalculo_pendiente_desde, null); // esa sí era propia
  assert.equal(s.fila('uc1').km_completed, 57);
  await s.converger();
  await s.verificarConvergencia();
});

test('marca nueva siempre distinta de la leída (aunque el generador repita el valor)', async () => {
  assert.notEqual(distintaDe('2026-09-12T12:00:00.000123Z', '2026-09-12T12:00:00.000123Z'), '2026-09-12T12:00:00.000123Z');
  // Mismo instante escrito como lo devuelve PostgREST (+00:00): también se considera igual y se corre.
  assert.equal(distintaDe('2026-09-12T12:00:00.000123Z', '2026-09-12T12:00:00.000123+00:00'), '2026-09-12T12:00:00.000124Z');
  assert.equal(distintaDe('2026-09-12T12:00:00.999999Z', '2026-09-12 12:00:00.999999+00'), '2026-09-12T12:00:01.000000Z');
  assert.equal(aMicros('2026-09-12T14:00:00.5+02:00'), aMicros('2026-09-12T12:00:00.500000Z'));
  assert.equal(distintaDe('2026-09-12T12:00:00.000123Z', '2026-09-12T12:00:00.000124+00:00'), '2026-09-12T12:00:00.000123Z');
  const s = montar({ ucs: [{ ...UC1(), recalculo_pendiente_desde: '2026-09-12T12:00:00.000001Z' }] });
  const m = await tomarMarca({ repo: s.repo, id: 'uc1', marcaLeida: '2026-09-12T12:00:00.000001Z', ahoraMs: AHORA, generarMarca: () => '2026-09-12T12:00:00.000001Z' });
  assert.equal(m.propia, false);
  assert.notEqual(m.marca, '2026-09-12T12:00:00.000001Z');
});

// ---------------------------------------------------------------------------
// Concurrencia SIN candado (como procesos distintos): interleavings peligrosos explícitos
// ---------------------------------------------------------------------------

test('dos DELETE: A marca, B marca encima y termina; A excluye y muere → la marca sobrevive y converge', async () => {
  const s = montar();
  const aEnExclusion = barrera();
  const soltarA = barrera();
  const ganchoA = conGanchos(s.repo, async (nombre, fase) => {
    if (nombre === 'excluirActividad' && fase === 'antes') { aEnExclusion.abrir(); await soltarA.p; }
    if (nombre === 'leerEstadoUsuario' && fase === 'antes') return 'morir'; // A muere antes de recalcular
    return undefined;
  });
  s.eliminar({ repo: ganchoA.repo, actividadId: A3 }); // A (borra a3)
  await aEnExclusion.p;
  const rB = await s.eliminar({ actividadId: A1 }); // B (borra a1) corre entero en el medio
  assert.equal(rB.body.progreso.recalculo, 'ok');
  soltarA.abrir();
  await esperarHasta(() => ganchoA.estado.murio);
  assert.equal(s.actividad(A3).excluida, true);
  assert.deepEqual(await s.inconsistentes(), ['uc1']); // B calculó antes de que A excluyera
  await s.verificarInvariante('A muerto después de excluir');
  await s.converger();
  await s.verificarConvergencia();
  assert.equal(s.fila('uc1').km_completed, 47); // 62 − 10 − 5
});

test('dos DELETE: A (dueño) lee; B marca, excluye y muere; A escribe y NO puede borrar → converge', async () => {
  const s = montar();
  const aLeyo = barrera();
  const soltarA = barrera();
  const ganchoA = conGanchos(s.repo, async (nombre, fase) => {
    if (nombre === 'leerEstadoUsuario' && fase === 'despues') { aLeyo.abrir(); await soltarA.p; }
  });
  const ganchoB = conGanchos(s.repo, async (nombre, fase) => (nombre === 'leerEstadoUsuario' && fase === 'antes' ? 'morir' : undefined));
  const promA = s.eliminar({ repo: ganchoA.repo, actividadId: A3 });
  await aLeyo.p;
  s.eliminar({ repo: ganchoB.repo, actividadId: A1 });
  await esperarHasta(() => ganchoB.estado.murio);
  soltarA.abrir();
  const rA = await promA;
  assert.equal(rA.body.progreso.recalculo, 'ok');
  assert.ok(rA.body.progreso.marcas_para_recuperacion > 0); // B renovó las marcas de A
  await s.verificarInvariante('B muerto después de excluir');
  await s.converger();
  await s.verificarConvergencia();
  assert.equal(s.fila('uc1').km_completed, 47);
  assert.equal(s.fila('uc2').km_completed, 0);
});

test('dos DELETE simultáneos sin candado (Promise.all): ambos terminan y todo converge', async () => {
  const s = montar();
  const [a, b] = await Promise.all([s.eliminar({ actividadId: A3 }), s.eliminar({ actividadId: A1 })]);
  assert.equal(a.body.progreso.recalculo, 'ok');
  assert.equal(b.body.progreso.recalculo, 'ok');
  await s.verificarInvariante();
  await s.converger();
  await s.verificarConvergencia();
  assert.equal(s.fila('uc1').km_completed, 47);
});

test('DELETE y REANUDAR simultáneos sin candado: ambos terminan y todo converge', async () => {
  const s = montar();
  const [d, r] = await Promise.all([s.eliminar({ actividadId: A1 }), s.reanudar()]);
  assert.equal(d.body.progreso.recalculo, 'ok');
  assert.equal(r.body.progreso.recalculo, 'ok');
  assert.equal(s.fila('uc2').pausado, false);
  await s.verificarInvariante();
  await s.converger();
  await s.verificarConvergencia();
  assert.equal(s.fila('uc2').km_completed, 0); // a1 eliminada; a2 y a3 dentro de pausas
});

test('con el candado del proceso: los pedidos del mismo usuario se serializan y no dejan marcas', async () => {
  const s = montar();
  const candado = crearCandado();
  const [a, b, r] = await Promise.all([
    s.eliminar({ actividadId: A3, candado }), s.eliminar({ actividadId: A1, candado }), s.reanudar({ candado }),
  ]);
  for (const x of [a, b]) assert.equal(x.body.progreso.marcas_para_recuperacion, 0);
  assert.equal(r.body.progreso.recalculo, 'ok');
  assert.deepEqual(s.marcas(), []); // sin solapamiento, nada quedó para la recuperación
  await s.verificarConvergencia();
});

// ---------------------------------------------------------------------------
// Intercalado exhaustivo con planificador determinista + caídas (sin candado)
// ---------------------------------------------------------------------------

/**
 * Corre varios pedidos intercalando sus operaciones una por una según una semilla. Opcionalmente
 * uno de ellos "muere" en su paso N. Después de cada paso verifica la invariante.
 */
const intercalar = async ({ s, pedidos, semilla, caida, alPaso }) => {
  let x = (semilla * 2654435761) >>> 0 || 1;
  const azar = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const estados = pedidos.map((p) => ({ nombre: p.nombre, esperando: null, terminado: false, pasos: 0 }));
  estados.forEach((e, i) => {
    const repo = {};
    for (const [nombre, fn] of Object.entries(s.repo)) {
      repo[nombre] = async (...args) => {
        e.pasos += 1;
        if (caida && caida.pedido === i && caida.paso === e.pasos) { e.terminado = true; e.murio = true; return new Promise(() => {}); }
        await new Promise((r) => { e.esperando = r; });
        return fn(...args);
      };
    }
    pedidos[i].correr(repo).then(
      (res) => { e.terminado = true; e.resultado = res; },
      (err) => { e.terminado = true; e.error = err; },
    );
  });
  const quietos = () => estados.every((e) => e.terminado || e.esperando);
  for (let vueltas = 0; vueltas < 2000; vueltas++) {
    await esperarHasta(quietos);
    if (alPaso) await alPaso();
    const listos = estados.filter((e) => !e.terminado && e.esperando);
    if (listos.length === 0) return estados;
    const elegido = listos[Math.floor(azar() * listos.length)];
    const seguir = elegido.esperando;
    elegido.esperando = null;
    seguir();
  }
  throw new Error('el intercalado no terminó');
};

const pedidosDeCarrera = (s, conRecuperacion) => {
  const pedidos = [
    { nombre: 'delete_a3', correr: (repo) => s.eliminar({ repo, actividadId: A3 }) },
    { nombre: 'delete_a1', correr: (repo) => s.eliminar({ repo, actividadId: A1 }) },
    { nombre: 'reanudar_uc2', correr: (repo) => s.reanudar({ repo }) },
  ];
  if (conRecuperacion) {
    // Una recuperación concurrente que solo toma marcas viejas (la marca previa sembrada en uc1).
    pedidos.push({ nombre: 'recuperacion', correr: (repo) => recuperarRecalculosPendientes({ repo, ahoraMs: AHORA + 60 * 1000, log: () => {}, esperar: s.esperar }) });
  }
  return pedidos;
};

test('intercalado aleatorio de DELETE + DELETE + REANUDAR (+ recuperación), con y sin caídas: siempre converge', async () => {
  let corridas = 0;
  let conCaida = 0;
  let pasosVerificados = 0;
  for (let semilla = 1; semilla <= 300; semilla++) {
    const conRecuperacion = semilla % 2 === 0;
    const ucs = [conRecuperacion ? { ...UC1(), recalculo_pendiente_desde: '2026-09-01T00:00:00.000001Z' } : UC1(), UC2(), UC3(), UC4(), UC9()];
    const s = montar({ ucs });
    const pedidos = pedidosDeCarrera(s, conRecuperacion);
    // 3 de cada 4 corridas: un pedido muere en un paso al azar (entre 1 y 14).
    const caida = semilla % 4 === 0 ? null : { pedido: semilla % pedidos.length, paso: 1 + (semilla * 7) % 14 };
    const contexto = `semilla ${semilla}${caida ? `, muere ${pedidos[caida.pedido].nombre} en el paso ${caida.paso}` : ''}`;
    const estados = await intercalar({ s, pedidos, semilla, caida, alPaso: () => { pasosVerificados += 1; return s.verificarInvariante(contexto); } });
    if (estados.some((e) => e.murio)) conCaida += 1;
    for (const e of estados) {
      if (e.error && !/No se pudo cerrar la pausa/.test(e.error.message)) throw new Error(`${contexto}: ${e.nombre} falló: ${e.error.stack}`);
    }
    await s.verificarInvariante(`${contexto} (final)`);
    await s.converger();
    await s.verificarConvergencia(contexto);
    corridas += 1;
  }
  assert.equal(corridas, 300);
  assert.ok(conCaida >= 150, `se esperaban muchas corridas con caída, hubo ${conCaida}`);
  assert.ok(pasosVerificados >= 3000, `se esperaban miles de verificaciones de la invariante, hubo ${pasosVerificados}`);
});

// ---------------------------------------------------------------------------
// REANUDAR con el protocolo de marca (4A-3d)
// ---------------------------------------------------------------------------

test('reanudar con una marca previa: cierra igual, la renueva, NO la borra; la recuperación la limpia', async () => {
  const s = montar({ ucs: [UC1(), { ...UC2(), recalculo_pendiente_desde: '2026-09-01T00:00:00.000001Z' }, UC3(), UC4(), UC9()] });
  const r = await s.reanudar();
  assert.equal(r.body.progreso.recalculo, 'ok');
  assert.equal(s.fila('uc2').pausado, false);
  assert.notEqual(s.fila('uc2').recalculo_pendiente_desde, null);
  assert.ok(s.logs.some((l) => l.resultado === 'marca_compartida'));
  await s.converger();
  await s.verificarConvergencia();
});

test('reanudar: si la marca cambia entre la lectura y el cierre, relee y cierra UNA vez', async () => {
  const s = montar();
  let primera = true;
  const { repo } = conGanchos(s.repo, async (nombre, fase) => {
    if (nombre === 'cerrarPausaCAS' && fase === 'antes' && primera) {
      primera = false; // otro pedido (ej. un DELETE) marca uc2 justo antes del cierre
      await s.repo.marcarRecalculoCAS({ id: 'uc2', marcaLeida: null, marcaNueva: '2026-09-12T11:59:59.000001Z' });
    }
  });
  const r = await s.reanudar({ repo });
  assert.equal(r.body.mensaje, 'Desafío reanudado y km recalculados');
  assert.equal(s.fila('uc2').periodos_pausados.length, 2); // la cerrada previa + la nueva: un solo cierre
  assert.notEqual(s.fila('uc2').recalculo_pendiente_desde, null); // no era dueño: queda para la recuperación
  await s.converger();
  await s.verificarConvergencia();
});

// ---------------------------------------------------------------------------
// Candado, recuperación y logs
// ---------------------------------------------------------------------------

test('candado por usuario: serializa la misma clave, no bloquea otras y se libera ante errores', async () => {
  const candado = crearCandado();
  const orden = [];
  const tarea = (nombre, ms) => () => new Promise((r) => setTimeout(() => { orden.push(nombre); r(nombre); }, ms));
  await Promise.all([candado('u1', tarea('a', 20)), candado('u1', tarea('b', 1)), candado('u2', tarea('c', 5))]);
  assert.deepEqual(orden, ['c', 'a', 'b']);
  await assert.rejects(candado('u1', async () => { throw new Error('x'); }));
  assert.equal(await candado('u1', async () => 'sigue'), 'sigue');
});

test('recuperación: modo activo con SOLO eliminar_actividad encendido', async () => {
  const s = montar();
  const pendientes = [];
  const t = { setTimeout: (fn) => { pendientes.push(fn); return { unref() {} }; }, clearTimeout: () => {} };
  const rec = await iniciarRecuperacion({
    crearRepo: () => s.repo, motorActivo: algunWriterMotorActivo({ MOTOR_PROGRESO_WRITERS: 'eliminar_actividad' }), log: () => {}, temporizadores: t,
  });
  assert.equal(rec.modo, 'activo');
  assert.equal(pendientes.length, 1);
  rec.detener();
});

test('logs: una línea JSON con "message" (Railway lo usa como texto) y los atributos', () => {
  const lineas = [];
  const original = console.log;
  console.log = (l) => lineas.push(l);
  try {
    logMotor({ writer: 'eliminar_actividad', resultado: 'eliminada', recalculo: 'ok' });
  } finally {
    console.log = original;
  }
  const obj = JSON.parse(lineas[0]);
  assert.equal(obj.message, 'motor_progreso eliminar_actividad eliminada');
  assert.equal(obj.evento, 'motor_progreso');
  assert.equal(obj.writer, 'eliminar_actividad');
  assert.equal(obj.resultado, 'eliminada');
});

// ---------------------------------------------------------------------------
// Integración: index.js real con la flag apagada y encendida
// ---------------------------------------------------------------------------

const tablasIntegracion = () => ({ user_challenges: [UC1(), UC2(), UC3(), UC4(), UC9()], challenges: CHS, activities: ACTS(), progreso_eventos: [], users: [] });
const borrarDesdeApp = (b) => b.pedir({ metodo: 'DELETE', ruta: `/actividades/${A3}`, body: { user_id: U } });

test('integración flag OFF: corre el DELETE viejo (y muestra sus bugs)', async () => {
  const b = await levantarBackend({ flag: 'reanudar', tablas: tablasIntegracion() });
  const r = await borrarDesdeApp(b);
  const { db, exitCode, signal } = await b.cerrar();
  assert.equal(exitCode, 0);
  assert.equal(signal, null);
  assert.deepEqual(r, { status: 200, body: { mensaje: 'Actividad eliminada y km recalculados' } }); // respuesta vieja
  const fila = (id) => db.user_challenges.find((x) => x.id === id);
  assert.equal(db.activities.find((a) => a.id === A3).excluida, true);
  assert.equal(fila('uc1').km_completed, 17); // BUG: 40 de base perdidos (10 + 7)
  assert.equal(fila('uc1').km_base, 40); // la base sigue guardada
  assert.equal(fila('uc2').km_completed, 17); // BUG: cuenta la actividad de la pausa
  assert.equal(fila('uc3').km_completed, 17); // BUG: reescribe un terminal (status sigue completed)
  assert.equal(fila('uc3').status, 'completed');
});

test('integración flag ON ("eliminar_actividad"): corre el motor, conserva la base y no deja marcas', async () => {
  const b = await levantarBackend({ flag: 'eliminar_actividad', tablas: tablasIntegracion() });
  const r = await borrarDesdeApp(b);
  const { db, registro, logs, exitCode, signal } = await b.cerrar();
  assert.equal(exitCode, 0);
  assert.equal(signal, null);
  assert.equal(r.status, 200);
  assert.equal(r.body.mensaje, 'Actividad eliminada y km recalculados');
  assert.equal(r.body.progreso.motor, true);
  assert.equal(r.body.progreso.recalculo, 'ok');
  const fila = (id) => db.user_challenges.find((x) => x.id === id);
  assert.equal(fila('uc1').km_completed, 57);
  assert.equal(fila('uc1').km_base, 40);
  assert.equal(fila('uc2').km_completed, 10);
  assert.equal(fila('uc3').km_completed, 120);
  assert.equal(fila('uc4').km_completed, 0);
  assert.ok(db.user_challenges.every((x) => x.recalculo_pendiente_desde === null));
  assert.deepEqual(escriturasConKmBase(registro), []);
  // Arranque con SOLO eliminar_actividad: la recuperación quedó activa, y los logs llevan "message".
  assert.match(logs, /"message":"motor_progreso recuperacion iniciada","evento":"motor_progreso","writer":"recuperacion","resultado":"iniciada","modo":"activo"/);
  assert.match(logs, /"message":"motor_progreso eliminar_actividad eliminada"/);
});