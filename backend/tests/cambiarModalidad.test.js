// Tests del writer CAMBIO DE MODALIDAD con el motor (Etapa 4A-3e) y su integración con los efectos.
//
// Escenario: Dubrovnik (run 19.4 / ride 58.2). uc1 en ride con 20 km: pasar a run lo COMPLETA.
// Invariante del protocolo en cada punto: km/estado incorrecto respecto del motor ⇒ hay marca.
// Convergencia: recuperación (marcas + efectos) hasta que no quede nada; sin duplicar seriales,
// "medalla lista", email al usuario ni push.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
const { crearResendFalso, crearExpoFalso, crearPdfFalso, crearSecuenciaSerial } = require('./helpers/efectosFalsos');
const { levantarBackend } = require('./helpers/backendHijo');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { cambiarModalidadConMotor } = require('../lib/cambiarModalidad');
const { eliminarActividadConMotor } = require('../lib/eliminarActividad');
const { reanudarDesafioConMotor } = require('../lib/reanudarDesafio');
const { recalcularProgresoUsuario, MODOS } = require('../lib/progresoServicio');
const { recuperarRecalculosPendientes } = require('../lib/recuperacionRecalculo');
const { crearEfectosCompletado } = require('../lib/efectosCompletado');
const { procesarEventosPendientes, MAX_INTENTOS } = require('../lib/completionEventos');
const { modalidadMotorActiva, efectosMotorActivos, algunWriterMotorActivo, writersActivos } = require('../lib/flagsMotor');
const { sinCandado } = require('../lib/candadoUsuario');
const emails = require('../routes/emails');

const U = '11111111-1111-4111-8111-111111111111';
const A1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const A2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const AHORA = Date.parse('2026-10-02T12:00:00Z');
const HORA = 60 * 60 * 1000;

const CHS = [
  { id: 'c1', title: 'Dubrovnik 19K', modalidades: [{ tipo: 'run', distancia_km: 19.4 }, { tipo: 'ride', distancia_km: 58.2 }], total_distance_km: 19.4 },
  { id: 'c2', title: 'Monte Fuji 68K', modalidades: [{ tipo: 'run', distancia_km: 68 }, { tipo: 'ride', distancia_km: 204 }], total_distance_km: 68 },
  { id: 'c3', title: 'Sin objetivo', modalidades: [], total_distance_km: null },
];
const uc = (extra = {}) => ({
  id: 'uc1', user_id: U, challenge_id: 'c1', status: 'active', modalidad: 'ride', started_at: '2026-09-01T00:00:00',
  completed_at: null, km_completed: 20, km_base: 0, km_base_motivo: null, pausado: false, pausado_at: null, periodos_pausados: [],
  group_id: null, certificado_serial: null, recalculo_pendiente_desde: null, ...extra,
});
const UC2 = () => uc({ id: 'uc2', challenge_id: 'c2', modalidad: 'run', pausado: true, pausado_at: '2026-09-10T00:00:00' });
const ACTS = () => [
  { id: A1, user_id: U, distance_km: 12, recorded_at: '2026-09-02T07:00:00', excluida: false },
  { id: A2, user_id: U, distance_km: 8, recorded_at: '2026-09-05T07:00:00', excluida: false },
];
const USUARIO = { id: U, name: 'Fabri Prueba', email: 'prueba@ejemplo.com', bib_number: '0042', shipping_address: 'Calle 1', push_token: 'ExponentPushToken[x]' };

const montar = ({ ucs = [uc(), UC2()], actividades = ACTS(), fallar } = {}) => {
  const reloj = { ahora: AHORA };
  const m = crearSupabaseMemoria({ users: [USUARIO], user_challenges: ucs, challenges: CHS, activities: actividades, progreso_eventos: [] },
    { fallar, reloj: () => reloj.ahora });
  const repo = crearRepositorioSupabase(m.cliente);
  const resend = crearResendFalso();
  const expo = crearExpoFalso();
  const pdf = crearPdfFalso();
  const secuencia = crearSecuenciaSerial();
  const efectos = crearEfectosCompletado({
    supabase: m.cliente, generarCertificado: pdf.generarCertificado, emails,
    obtenerResend: () => resend.cliente, fetchImpl: expo.fetchImpl, obtenerSerial: secuencia.siguiente,
  });
  let n = 0;
  const generarMarca = (ms) => `${new Date(ms).toISOString().slice(0, -1)}${String(++n % 1000).padStart(3, '0')}Z`;
  const logs = [];
  const disparados = [];
  const esperar = async () => {};
  const cambiar = (extra = {}) => cambiarModalidadConMotor({
    repo, userId: U, challengeId: 'c1', modalidad: 'run', ahoraMs: AHORA, log: (l) => logs.push(l), esperar, generarMarca,
    candado: sinCandado, dispararEfectos: (ids) => disparados.push(...ids), ...extra,
  });
  const fila = (id = 'uc1') => m.db.user_challenges.find((x) => x.id === id);
  const eventos = () => m.db.progreso_eventos;
  const marcas = () => m.db.user_challenges.filter((x) => x.recalculo_pendiente_desde !== null).map((x) => x.id).sort();
  const procesarEfectos = (extra = {}) => procesarEventosPendientes({ repo, efectos, ahoraMs: reloj.ahora, generarToken: generarMarca, ...extra });

  const inconsistentes = async () => {
    const inf = await recalcularProgresoUsuario({ repo, userId: U, motivo: 'verificacion', modo: MODOS.SIMULAR, ahoraMs: AHORA });
    return inf.desafios.filter((d) => d.accion !== 'nada').map((d) => d.user_challenge_id).sort();
  };
  const verificarInvariante = async (ctx = '') => {
    for (const id of await inconsistentes()) assert.notEqual(fila(id).recalculo_pendiente_desde, null, `${ctx}: ${id} incorrecto y SIN marca`);
    // 4A-3e-a: completitud y evento son atómicos → terminal ⇔ un evento 'completado', en TODO momento.
    for (const u of m.db.user_challenges) {
      const evs = m.db.progreso_eventos.filter((e) => e.user_challenge_id === u.id && e.tipo === 'completado').length;
      assert.equal(evs, ['completed', 'cargado', 'shipped'].includes(u.status) ? 1 : 0, `${ctx}: ${u.id} status=${u.status} con ${evs} eventos completado`);
    }
  };
  /** Recuperación completa (marcas y efectos), como las rondas de un proceso nuevo más tarde. */
  const converger = async () => {
    for (let i = 0; i < MAX_INTENTOS + 3; i++) {
      reloj.ahora += 9 * HORA;
      const r = await recuperarRecalculosPendientes({ repo, ahoraMs: reloj.ahora, log: () => {}, esperar });
      if (r.eventosCreados.length > 0) await procesarEfectos({ ids: r.eventosCreados });
      await procesarEfectos();
    }
  };
  /** Sin marcas, consistente, y efectos de completar sin duplicados (y completos si el evento terminó bien). */
  const verificarConvergencia = async (ctx = '') => {
    assert.deepEqual(marcas(), [], `${ctx}: quedaron marcas`);
    assert.deepEqual(await inconsistentes(), [], `${ctx}: quedaron desafíos inconsistentes`);
    const completados = m.db.user_challenges.filter((x) => x.status === 'completed').map((x) => x.id);
    for (const id of completados) {
      const evs = eventos().filter((e) => e.user_challenge_id === id && e.tipo === 'completado');
      assert.equal(evs.length, 1, `${ctx}: ${id} completado con ${evs.length} eventos`);
      const ev = evs[0];
      assert.ok(ev.estado === 'hecho' || (ev.estado === 'error' && ev.resultado.requiere_intervencion), `${ctx}: evento ${ev.estado}`);
      if (ev.estado === 'hecho') {
        assert.ok(fila(id).certificado_serial, `${ctx}: sin serial`);
        assert.equal(resend.entregadosDe('email_admin_medalla').length, 1, `${ctx}: "medalla lista"`);
        assert.equal(resend.entregadosDe('email_usuario').length, 1, `${ctx}: email al usuario`);
      }
    }
    assert.ok(resend.entregadosDe('email_admin_medalla').length <= completados.length, `${ctx}: "medalla lista" duplicado`);
    assert.ok(resend.entregadosDe('email_usuario').length <= completados.length, `${ctx}: email duplicado`);
    assert.ok(expo.entregados.length <= completados.length, `${ctx}: push duplicado ${JSON.stringify({ push: expo.entregados.map((e) => e.title), eventos: eventos().map((e) => [e.user_challenge_id, e.tipo, e.estado]), estados: m.db.user_challenges.map((x) => [x.id, x.status, x.km_completed, x.modalidad]) })}`);
    assert.ok(secuencia.usados() <= completados.length * 2, `${ctx}: demasiados seriales pedidos`);
    assert.equal(fila('uc1').km_base, 0);
  };
  return { m, repo, reloj, efectos, resend, expo, pdf, secuencia, logs, disparados, cambiar, fila, eventos, marcas, procesarEfectos, inconsistentes, verificarInvariante, converger, verificarConvergencia, generarMarca, esperar };
};

const conGanchos = (repo, gancho) => {
  const estado = { llamadas: 0, murio: false };
  const envuelto = {};
  for (const [nombre, fn] of Object.entries(repo)) {
    envuelto[nombre] = async (...args) => {
      estado.llamadas += 1;
      const n = estado.llamadas;
      if ((await gancho(nombre, 'antes', n)) === 'morir') { estado.murio = true; return new Promise(() => {}); }
      const r = await fn(...args);
      if ((await gancho(nombre, 'despues', n)) === 'morir') { estado.murio = true; return new Promise(() => {}); }
      return r;
    };
  }
  return { repo: envuelto, estado };
};
const esperarHasta = async (cond, max = 10000) => {
  for (let i = 0; i < max && !cond(); i++) await new Promise((r) => setImmediate(r));
  if (!cond()) throw new Error('la condición nunca se cumplió');
};

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

test('flags: modalidad entra al motor SOLO con "efectos"; "efectos" activa la recuperación', () => {
  assert.equal(modalidadMotorActiva({ MOTOR_PROGRESO_WRITERS: 'reanudar,eliminar_actividad' }), false);
  assert.equal(modalidadMotorActiva({ MOTOR_PROGRESO_WRITERS: 'reanudar,eliminar_actividad,modalidad' }), false);
  assert.equal(modalidadMotorActiva({ MOTOR_PROGRESO_WRITERS: 'reanudar,eliminar_actividad,efectos' }), false);
  assert.equal(modalidadMotorActiva({ MOTOR_PROGRESO_WRITERS: 'reanudar,eliminar_actividad,efectos,modalidad' }), true);
  assert.equal(efectosMotorActivos({ MOTOR_PROGRESO_WRITERS: 'efectos' }), true);
  assert.equal(algunWriterMotorActivo({ MOTOR_PROGRESO_WRITERS: 'efectos' }), true);
  assert.deepEqual(writersActivos({ MOTOR_PROGRESO_WRITERS: 'reanudar,eliminar_actividad,efectos,modalidad' }), ['reanudar', 'eliminar_actividad', 'efectos', 'modalidad']);
});

// ---------------------------------------------------------------------------
// Casos funcionales
// ---------------------------------------------------------------------------

test('ride → run que completa: completed una vez, evento, efectos una vez cada uno, sin marca', async () => {
  const s = montar();
  const r = await s.cambiar();
  assert.equal(r.status, 200);
  assert.equal(r.body.mensaje, 'Modalidad actualizada y kilómetros recalculados');
  assert.equal(r.body.data.modalidad, 'run');
  assert.deepEqual([r.body.progreso.motor, r.body.progreso.completado, r.body.progreso.eventos_pendientes], [true, true, 1]);
  assert.equal(s.fila().status, 'completed');
  assert.equal(s.fila().completed_at, new Date(AHORA).toISOString());
  assert.equal(s.fila().recalculo_pendiente_desde, null);
  assert.equal(s.eventos().length, 1);
  assert.deepEqual(s.disparados, [s.eventos()[0].id]);
  // La respuesta no esperó a los efectos: el evento sigue pendiente hasta que se procesa.
  assert.equal(s.eventos()[0].estado, 'pendiente');
  await s.procesarEfectos({ ids: s.disparados });
  assert.equal(s.eventos()[0].estado, 'hecho');
  assert.equal(s.fila().certificado_serial, 'KORVA-2026-0001');
  assert.deepEqual([s.resend.entregadosDe('email_admin_medalla').length, s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1, 1]);
});

test('run → ride que NO completa: solo cambia la modalidad, sin eventos ni efectos', async () => {
  const s = montar({ ucs: [uc({ modalidad: 'run', km_completed: 20, status: 'active' }), UC2()], actividades: ACTS() });
  // 20 km en run ya completaría: usamos un desafío con menos km para que en ride siga activo.
  s.m.db.activities[0].excluida = true;
  s.m.db.user_challenges[0].km_completed = 8;
  const r = await s.cambiar({ modalidad: 'ride' });
  assert.equal(r.body.progreso.accion, 'nada');
  assert.equal(r.body.progreso.completado, false);
  assert.equal(s.fila().modalidad, 'ride');
  assert.equal(s.fila().status, 'active');
  assert.equal(s.fila().recalculo_pendiente_desde, null);
  assert.deepEqual([s.eventos().length, s.disparados.length], [0, 0]);
});

test('con km_base: la base suma para completar y nunca se escribe', async () => {
  const s = montar({ ucs: [uc({ km_base: 15, km_base_motivo: 'legado_historico', km_completed: 23 }), UC2()], actividades: [ACTS()[1]] });
  const r = await s.cambiar();
  assert.equal(r.body.progreso.completado, true); // 15 + 8 = 23 ≥ 19.4
  assert.equal(s.fila().km_base, 15);
  const conBase = s.m.registro.filter((op) => op.tipo !== 'select' && op.valores && ('km_base' in op.valores || 'km_base_motivo' in op.valores));
  assert.deepEqual(conBase, []);
});

test('pausado que alcanza el objetivo nuevo: NO se completa', async () => {
  const s = montar({ ucs: [uc({ pausado: true, pausado_at: '2026-09-20T00:00:00' }), UC2()] });
  const r = await s.cambiar();
  assert.equal(r.body.progreso.completado, false);
  assert.equal(s.fila().status, 'active');
  assert.equal(s.fila().modalidad, 'run');
  assert.equal(s.eventos().length, 0);
});

test('pending: solo cambia la modalidad (sin marca ni recálculo), como el viejo', async () => {
  const s = montar({ ucs: [uc({ status: 'pending', km_completed: 0 }), UC2()] });
  const r = await s.cambiar();
  assert.equal(r.status, 200);
  assert.equal(r.body.progreso.recalculo, 'no_aplica');
  assert.equal(s.fila().modalidad, 'run');
  assert.equal(s.fila().status, 'pending');
  assert.equal(s.fila().recalculo_pendiente_desde, null);
  assert.equal(s.m.registro.filter((op) => op.tipo === 'select' && op.tabla === 'activities').length, 0);
});

test('no encontrado / terminal → 404 como el viejo; duplicado → 500 SIN escribir nada', async () => {
  const noEsta = montar({ ucs: [] });
  assert.deepEqual(await noEsta.cambiar(), { status: 404, body: { error: 'No tenés este desafío activo', detalle: 'Tu sesión puede estar desactualizada. Cerrá sesión y volvé a entrar.' } });
  const terminal = montar({ ucs: [uc({ status: 'completed' })] });
  assert.equal((await terminal.cambiar()).status, 404);
  assert.equal(terminal.fila().modalidad, 'ride');
  const dup = montar({ ucs: [uc(), uc({ id: 'uc1b' })] });
  const r = await dup.cambiar();
  assert.equal(r.status, 500);
  assert.equal(r.body.error, 'Error actualizando modalidad');
  assert.equal(dup.m.registro.filter((op) => op.tipo !== 'select').length, 0);
});

test('sin objetivo: nunca se completa', async () => {
  const s = montar({ ucs: [uc({ challenge_id: 'c3', km_completed: 500 })], actividades: [{ ...ACTS()[0], distance_km: 500 }] });
  const r = await s.cambiar({ challengeId: 'c3' });
  assert.equal(r.body.progreso.completado, false);
  assert.equal(s.fila().status, 'active');
});

test('marca previa de otro pedido: la renueva y NO la borra; la recuperación converge', async () => {
  const s = montar({ ucs: [uc({ recalculo_pendiente_desde: '2026-10-01T00:00:00.000001Z' }), UC2()] });
  await s.cambiar();
  assert.notEqual(s.fila().recalculo_pendiente_desde, null);
  assert.ok(s.logs.some((l) => l.resultado === 'marca_compartida'));
  await s.procesarEfectos({ ids: s.disparados });
  await s.converger();
  await s.verificarConvergencia();
});

test('la marca cambia entre la lectura y el update: relee y cambia UNA vez', async () => {
  const s = montar();
  let primera = true;
  const { repo } = conGanchos(s.repo, async (nombre, fase) => {
    if (nombre === 'cambiarModalidadCAS' && fase === 'antes' && primera) {
      primera = false;
      await s.repo.marcarRecalculoCAS({ id: 'uc1', marcaLeida: null, marcaNueva: '2026-10-02T11:59:59.000001Z' });
    }
  });
  const r = await s.cambiar({ repo });
  assert.equal(r.status, 200);
  assert.equal(s.fila().modalidad, 'run');
  assert.notEqual(s.fila().recalculo_pendiente_desde, null); // no era dueño
  await s.procesarEfectos({ ids: s.disparados });
  await s.converger();
  await s.verificarConvergencia();
});

test('si el recálculo falla siempre: responde "pendiente", la marca queda y la recuperación completa + efectos', async () => {
  let fallar = true;
  const s = montar({ fallar: (op) => fallar && op.tabla === 'activities' && op.tipo === 'select' });
  const r = await s.cambiar();
  assert.equal(r.body.progreso.recalculo, 'pendiente');
  assert.equal(s.fila().modalidad, 'run');
  assert.equal(s.fila().status, 'active');
  assert.deepEqual(s.marcas(), ['uc1']);
  fallar = false;
  await s.verificarInvariante();
  await s.converger();
  await s.verificarConvergencia();
  assert.equal(s.fila().status, 'completed');
  assert.equal(s.eventos()[0].estado, 'hecho');
});

test('DELETE concurrente entre la lectura y la RPC: la RPC pierde → ni completitud ni evento; nada queda a medias', async () => {
  const s = montar();
  let yaBorro = false;
  const { repo } = conGanchos(s.repo, async (nombre, fase) => {
    // Entre la lectura del motor y la RPC de completar, otro pedido borra 8 km (20 → 12 < 19.4).
    if (nombre === 'completarCAS' && fase === 'antes' && !yaBorro) {
      yaBorro = true;
      await eliminarActividadConMotor({ repo: s.repo, userId: U, actividadId: A2, ahoraMs: AHORA, log: () => {}, esperar: s.esperar, generarMarca: s.generarMarca, candado: sinCandado });
    }
  });
  const r = await s.cambiar({ repo });
  assert.equal(r.body.progreso.completado, false);
  assert.equal(s.fila().status, 'active');
  assert.equal(s.eventos().length, 0); // la RPC perdió el CAS: no hay evento
  assert.deepEqual([s.expo.entregados.length, s.resend.entregados.length, s.secuencia.usados()], [0, 0, 0]);
  // Más tarde llega una actividad y el motor completa: evento y efectos una sola vez.
  s.m.db.activities.push({ id: 'aaaaaaaa-0000-4000-8000-000000000003', user_id: U, distance_km: 10, recorded_at: '2026-09-06T07:00:00', excluida: false });
  const inf = await recalcularProgresoUsuario({ repo: s.repo, userId: U, motivo: 'test', modo: MODOS.ESCRIBIR, ahoraMs: AHORA });
  assert.deepEqual(inf.completados, ['uc1']);
  await s.procesarEfectos({ ids: inf.eventos_para_procesar });
  assert.equal(s.eventos().length, 1);
  assert.equal(s.eventos()[0].estado, 'hecho');
  assert.deepEqual([s.resend.entregadosDe('email_admin_medalla').length, s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1, 1]);
});

test('falla la RPC de completar (rollback): ni completitud ni evento; la marca queda y la recuperación completa una vez', async () => {
  let fallar = true;
  const s = montar({ fallar: (op) => fallar && op.tabla === 'rpc' });
  const r = await s.cambiar();
  assert.equal(r.body.progreso.recalculo, 'pendiente');
  assert.equal(s.fila().status, 'active');
  assert.equal(s.eventos().length, 0);
  assert.deepEqual(s.marcas(), ['uc1']);
  fallar = false;
  await s.verificarInvariante();
  await s.converger();
  await s.verificarConvergencia();
  assert.equal(s.fila().status, 'completed');
  assert.equal(s.eventos().length, 1);
  assert.equal(s.eventos()[0].estado, 'hecho');
});

// ---------------------------------------------------------------------------
// Caídas en cada punto y concurrencia sin candado
// ---------------------------------------------------------------------------

test('caída antes y después de CADA operación: invariante siempre; la recuperación completa y procesa efectos', async () => {
  const normal = montar();
  const contador = conGanchos(normal.repo, async () => {});
  await normal.cambiar({ repo: contador.repo });
  const total = contador.estado.llamadas;
  assert.ok(total >= 5, `operaciones: ${total}`);
  for (let n = 1; n <= total; n++) {
    for (const momento of ['antes', 'despues']) {
      const s = montar();
      const { repo, estado } = conGanchos(s.repo, async (_nom, fase, k) => (k === n && fase === momento ? 'morir' : undefined));
      s.cambiar({ repo });
      await esperarHasta(() => estado.murio);
      const ctx = `caída ${momento} de la operación ${n}/${total}`;
      await s.verificarInvariante(ctx);
      await s.converger();
      await s.verificarConvergencia(ctx);
      if (s.fila().modalidad === 'run') assert.equal(s.fila().status, 'completed', `${ctx}: run sin completar`);
    }
  }
});

test('intercalado aleatorio SIN candado: MODALIDAD + ELIMINAR + REANUDAR (+ caídas): siempre converge sin duplicar efectos', async () => {
  let conCaida = 0;
  let completados = 0;
  for (let semilla = 1; semilla <= 250; semilla++) {
    const s = montar();
    const pedidos = [
      (repo) => s.cambiar({ repo }),
      (repo) => eliminarActividadConMotor({ repo, userId: U, actividadId: A2, ahoraMs: AHORA, log: () => {}, esperar: s.esperar, generarMarca: s.generarMarca, candado: sinCandado }),
      (repo) => reanudarDesafioConMotor({ repo, userId: U, challengeId: 'c2', ahoraMs: AHORA, log: () => {}, esperar: s.esperar, generarMarca: s.generarMarca, candado: sinCandado }),
    ];
    let x = (semilla * 2654435761) >>> 0 || 1;
    const azar = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    const caida = semilla % 4 === 0 ? null : { pedido: semilla % 3, paso: 1 + (semilla * 7) % 7 };
    const estados = pedidos.map(() => ({ esperando: null, terminado: false, pasos: 0 }));
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
      pedidos[i](repo).then(() => { e.terminado = true; }, (err) => { e.terminado = true; e.error = err; });
    });
    const ctx = `semilla ${semilla}`;
    for (let v = 0; v < 3000; v++) {
      await esperarHasta(() => estados.every((e) => e.terminado || e.esperando));
      await s.verificarInvariante(ctx);
      const listos = estados.filter((e) => !e.terminado && e.esperando);
      if (listos.length === 0) break;
      const elegido = listos[Math.floor(azar() * listos.length)];
      const seguir = elegido.esperando;
      elegido.esperando = null;
      seguir();
    }
    for (const e of estados) if (e.error && !/No se pudo cerrar la pausa/.test(e.error.message)) throw new Error(`${ctx}: ${e.error.stack}`);
    if (estados.some((e) => e.murio)) conCaida += 1;
    // Los efectos que el pedido de modalidad haya disparado, y después la recuperación.
    if (s.disparados.length > 0) await s.procesarEfectos({ ids: s.disparados });
    await s.converger();
    await s.verificarConvergencia(ctx);
    if (s.fila().status === 'completed') completados += 1;
  }
  assert.ok(conCaida >= 120, `corridas con caída: ${conCaida}`);
  assert.ok(completados > 20 && completados < 250, `deben darse los dos resultados (completa o no según el orden): ${completados}`);
});

// ---------------------------------------------------------------------------
// Integración: index.js real
// ---------------------------------------------------------------------------

const tablasIntegracion = () => ({
  users: [USUARIO],
  user_challenges: [uc({ modalidad: 'run', km_completed: 8 }), UC2()],
  challenges: CHS,
  activities: [{ ...ACTS()[0], excluida: true }, ACTS()[1]],
  progreso_eventos: [],
});
const cambiarDesdeApp = (b, modalidad = 'ride') => b.pedir({ metodo: 'PUT', ruta: '/usuarios/modalidad', body: { user_id: U, challenge_id: 'c1', modalidad } });

test('integración: sin "modalidad" corre el código viejo (respuesta vieja)', async () => {
  const b = await levantarBackend({ flag: 'reanudar,eliminar_actividad', tablas: tablasIntegracion() });
  const r = await cambiarDesdeApp(b);
  const { db, exitCode } = await b.cerrar();
  assert.equal(exitCode, 0);
  assert.equal(r.status, 200);
  assert.equal(r.body.mensaje, 'Modalidad actualizada y kilómetros recalculados');
  assert.equal(r.body.progreso, undefined);
  assert.equal(db.user_challenges[0].modalidad, 'ride');
});

test('integración: "modalidad" SIN "efectos" → camino viejo y lo deja en el log', async () => {
  const b = await levantarBackend({ flag: 'reanudar,eliminar_actividad,modalidad', tablas: tablasIntegracion() });
  const r = await cambiarDesdeApp(b);
  const { logs } = await b.cerrar();
  assert.equal(r.body.progreso, undefined);
  assert.match(logs, /"resultado":"ignorado_sin_efectos"/);
});

test('integración: "efectos,modalidad" → motor (cambio que no completa), sin marcas; recuperación activa', async () => {
  const b = await levantarBackend({ flag: 'reanudar,eliminar_actividad,efectos,modalidad', tablas: tablasIntegracion() });
  const r = await cambiarDesdeApp(b);
  const { db, logs, exitCode } = await b.cerrar();
  assert.equal(exitCode, 0);
  assert.equal(r.status, 200);
  assert.equal(r.body.mensaje, 'Modalidad actualizada y kilómetros recalculados');
  assert.equal(r.body.data.modalidad, 'ride');
  assert.deepEqual([r.body.progreso.motor, r.body.progreso.recalculo, r.body.progreso.completado], [true, 'ok', false]);
  assert.equal(db.user_challenges[0].modalidad, 'ride');
  assert.equal(db.user_challenges[0].status, 'active');
  assert.ok(db.user_challenges.every((x) => x.recalculo_pendiente_desde === null));
  assert.equal(db.progreso_eventos.length, 0);
  assert.match(logs, /"message":"motor_progreso modalidad modalidad_cambiada"/);
  assert.match(logs, /"resultado":"iniciada","modo":"activo"/);
});
