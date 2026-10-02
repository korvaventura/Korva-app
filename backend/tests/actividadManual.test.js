// Tests del writer CARGA MANUAL con el motor unificado (Etapa 4A-6).
//
// Unitarios: repositorio Supabase REAL sobre un cliente en memoria (imita la RPC, el trigger de
// legado, la protección del serial y el espejo modalidad ↔ version) + efectos con dobles.
// Caídas: el "proceso" muere antes/después de CADA operación; se verifica la invariante del
// protocolo de marca y que la recuperación converge (km, completitud y efectos una sola vez).
// Integración: index.js real en un proceso hijo con la flag apagada y encendida.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
const { crearResendFalso, crearExpoFalso, crearPdfFalso, crearSecuenciaSerial } = require('./helpers/efectosFalsos');
const { levantarBackend } = require('./helpers/backendHijo');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { registrarActividadManualConMotor } = require('../lib/actividadManual');
const { eliminarActividadConMotor } = require('../lib/eliminarActividad');
const { reanudarDesafioConMotor } = require('../lib/reanudarDesafio');
const { recalcularProgresoUsuario, MODOS } = require('../lib/progresoServicio');
const { recuperarRecalculosPendientes } = require('../lib/recuperacionRecalculo');
const { crearEfectosCompletado } = require('../lib/efectosCompletado');
const { procesarEventosPendientes } = require('../lib/completionEventos');
const { actividadManualMotorActiva, writersActivos, algunWriterMotorActivo, WRITERS_CONOCIDOS } = require('../lib/flagsMotor');
const { sinCandado } = require('../lib/candadoUsuario');
const emails = require('../routes/emails');

// ---------------------------------------------------------------------------
// Escenario (versiones Estándar/Extendida como en producción)
//   c1: Estándar 50 / Extendida 150 · c2: Estándar 100 / Extendida 300
//   uc1 activo, Estándar, km_base 30, a1 (02/09, 10 km)                → 40 / 50
//   uc2 activo, Extendida, PAUSADO desde 10/09, pausa cerrada 05–07/09  → a1 cuenta → 10 / 300
//   uc3 completed (congelado) · uc4 pending · uc9 de OTRO usuario
// ---------------------------------------------------------------------------
const U = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const AHORA = Date.parse('2026-09-12T12:00:00Z');
const MIN = 60 * 1000;

const ver = (est, ext) => [{ tipo: 'run', label: 'Estándar', version: 'estandar', distancia_km: est }, { tipo: 'ride', label: 'Extendida', version: 'extendida', distancia_km: ext }];
const CHS = [
  { id: 'c1', title: 'Desafío 1', modalidades: ver(50, 150), total_distance_km: 50 },
  { id: 'c2', title: 'Desafío 2', modalidades: ver(100, 300), total_distance_km: 100 },
  { id: 'c3', title: 'Desafío 3', modalidades: ver(100, 300), total_distance_km: 100 },
  { id: 'c4', title: 'Desafío 4', modalidades: ver(100, 300), total_distance_km: 100 },
];
const base = (extra) => ({
  user_id: U, status: 'active', version: 'estandar', modalidad: 'run', started_at: '2026-09-01T00:00:00', pausado: false, pausado_at: null,
  periodos_pausados: [], km_base: 0, km_base_motivo: null, completed_at: null, recalculo_pendiente_desde: null,
  certificado_serial: null, group_id: null, ...extra,
});
const UC1 = (extra = {}) => base({ id: 'uc1', challenge_id: 'c1', km_base: 30, km_base_motivo: 'legado_historico', km_completed: 40, ...extra });
const UC2 = (extra = {}) => base({
  id: 'uc2', challenge_id: 'c2', version: 'extendida', modalidad: 'ride', pausado: true, pausado_at: '2026-09-10T00:00:00',
  periodos_pausados: [{ desde: '2026-09-05T00:00:00', hasta: '2026-09-07T00:00:00.000Z' }], km_completed: 10, ...extra,
});
const UC3 = () => base({ id: 'uc3', challenge_id: 'c3', status: 'completed', km_completed: 120, completed_at: '2026-09-09T00:00:00', certificado_serial: 'KORVA-2026-0001' });
const UC4 = () => base({ id: 'uc4', challenge_id: 'c4', status: 'pending', km_completed: 0 });
const UC9 = () => base({ id: 'uc9', user_id: U2, challenge_id: 'c1', km_completed: 3 });
const A1 = { id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: U, distance_km: 10, recorded_at: '2026-09-02T07:00:00', excluida: false, source: 'manual' };
const A9 = { id: 'aaaaaaaa-0000-4000-8000-000000000009', user_id: U2, distance_km: 3, recorded_at: '2026-09-03T07:00:00', excluida: false, source: 'manual' };
const USUARIOS = [
  { id: U, name: 'Fabri Prueba', email: 'prueba@ejemplo.com', bib_number: '0042', shipping_address: 'Calle 1', push_token: 'ExponentPushToken[x]' },
  { id: U2, name: 'Otra', email: 'otra@ejemplo.com', bib_number: '0043', shipping_address: null, push_token: null },
];

const filaActividad = ({ km, recorded_at = '2026-09-12T08:00:00.000Z', challenge_id = 'c1', sport_type = 'ride' } = {}) => ({
  user_id: U, challenge_id, source: 'manual', external_id: `manual_${U}_${km}_${recorded_at}`, sport_type, distance_km: km,
  duration_seconds: null, recorded_at, evidencia_url: null,
});

const montar = ({ ucs = [UC1(), UC2(), UC3(), UC4(), UC9()], actividades = [A1, A9], fallar } = {}) => {
  const reloj = { ahora: AHORA };
  const m = crearSupabaseMemoria({ users: USUARIOS, user_challenges: ucs, challenges: CHS, activities: actividades, progreso_eventos: [] },
    { fallar, reloj: () => reloj.ahora });
  const repo = crearRepositorioSupabase(m.cliente);
  const resend = crearResendFalso();
  const expo = crearExpoFalso();
  const pdf = crearPdfFalso();
  const efectos = crearEfectosCompletado({
    supabase: m.cliente, generarCertificado: pdf.generarCertificado, emails,
    obtenerResend: () => resend.cliente, fetchImpl: expo.fetchImpl, obtenerSerial: crearSecuenciaSerial().siguiente,
  });
  let n = 0;
  const generarMarca = (ms) => `${new Date(ms).toISOString().slice(0, -1)}${String(++n % 1000).padStart(3, '0')}Z`;
  const logs = [];
  const disparados = [];
  const esperar = async () => {};
  const registrar = (extra = {}) => {
    const { km = 5, recorded_at, challenge_id, sport_type, ...resto } = extra;
    const actividad = filaActividad({ km, recorded_at, challenge_id, sport_type });
    return registrarActividadManualConMotor({
      repo, userId: U, challengeId: challenge_id === undefined ? 'c1' : challenge_id, actividad, recordedAt: actividad.recorded_at,
      ahoraMs: AHORA, log: (l) => logs.push(l), esperar, generarMarca, candado: sinCandado,
      dispararEfectos: (ids) => disparados.push(...ids), ...resto,
    });
  };
  const procesar = (extra = {}) => procesarEventosPendientes({ repo, efectos, ahoraMs: reloj.ahora, generarToken: generarMarca, ...extra });
  const fila = (id) => m.db.user_challenges.find((x) => x.id === id);
  const marcas = () => m.db.user_challenges.filter((x) => x.recalculo_pendiente_desde !== null).map((x) => x.id).sort();
  const eventos = (tipo = 'completado') => m.db.progreso_eventos.filter((e) => e.tipo === tipo);
  const inconsistentes = async () => {
    const lista = [];
    for (const userId of [U, U2]) {
      const inf = await recalcularProgresoUsuario({ repo, userId, motivo: 'verificacion', modo: MODOS.SIMULAR, ahoraMs: AHORA });
      inf.desafios.filter((d) => d.accion !== 'nada').forEach((d) => lista.push(d.user_challenge_id));
    }
    return lista.sort();
  };
  const verificarInvariante = async (ctx = '') => {
    for (const id of await inconsistentes()) assert.notEqual(fila(id).recalculo_pendiente_desde, null, `${ctx}: ${id} incorrecto y SIN marca`);
    // terminal ⇔ un evento 'completado' (RPC atómica), en TODO momento
    for (const f of m.db.user_challenges) {
      const terminal = ['completed', 'cargado', 'shipped'].includes(f.status);
      const n = m.db.progreso_eventos.filter((e) => e.user_challenge_id === f.id && e.tipo === 'completado').length;
      if (f.id !== 'uc3') assert.equal(n, terminal ? 1 : 0, `${ctx}: ${f.id} terminal=${terminal} con ${n} eventos`);
    }
  };
  const converger = async () => {
    reloj.ahora = AHORA + 10 * MIN;
    for (let i = 0; i < 5 && marcas().length > 0; i++) {
      await recuperarRecalculosPendientes({ repo: crearRepositorioSupabase(m.cliente), ahoraMs: reloj.ahora, log: () => {}, esperar });
    }
    reloj.ahora += 10 * MIN; // pasa la gracia de los eventos que creó la recuperación
    await procesar();
  };
  return { m, repo, logs, disparados, registrar, procesar, fila, marcas, eventos, inconsistentes, verificarInvariante, converger, resend, expo, reloj };
};

const escriturasConKmBase = (registro) =>
  registro.filter((op) => op.tipo !== 'select' && op.valores && ('km_base' in op.valores || 'km_base_motivo' in op.valores));

/** Gancho antes/después de cada operación del repo; 'morir' = el proceso muere en ese punto. */
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
const esperarHasta = async (cond, max = 10000) => {
  for (let i = 0; i < max && !cond(); i++) await new Promise((r) => setImmediate(r));
  if (!cond()) throw new Error('la condición nunca se cumplió');
};

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

test('flags: actividad_manual entra al motor SOLO con "efectos"; activa la recuperación', () => {
  assert.ok(WRITERS_CONOCIDOS.includes('actividad_manual'));
  assert.equal(actividadManualMotorActiva({ MOTOR_PROGRESO_WRITERS: 'reanudar,eliminar_actividad,efectos,modalidad' }), false);
  assert.equal(actividadManualMotorActiva({ MOTOR_PROGRESO_WRITERS: 'actividad_manual' }), false);
  assert.equal(actividadManualMotorActiva({ MOTOR_PROGRESO_WRITERS: 'reanudar,eliminar_actividad,efectos,modalidad,actividad_manual' }), true);
  assert.equal(actividadManualMotorActiva({}), false);
  assert.deepEqual(writersActivos({ MOTOR_PROGRESO_WRITERS: 'efectos, Actividad_Manual' }), ['efectos', 'actividad_manual']);
  assert.equal(algunWriterMotorActivo({ MOTOR_PROGRESO_WRITERS: 'actividad_manual' }), true);
});

// ---------------------------------------------------------------------------
// Funcionales
// ---------------------------------------------------------------------------

test('actividad que NO completa: se registra, suma 1:1 a los activos, sin eventos ni marcas', async () => {
  const s = montar();
  const r = await s.registrar({ km: 5 });
  assert.equal(r.status, 200);
  assert.equal(r.body.mensaje, 'Actividad registrada y kilómetros sumados');
  assert.equal(r.body.actividad.distance_km, 5);
  assert.equal(r.body.actividad.source, 'manual');
  assert.deepEqual([r.body.progreso.motor, r.body.progreso.recalculo, r.body.progreso.eventos_pendientes], [true, 'ok', 0]);
  assert.equal(s.fila('uc1').km_completed, 45); // 30 base + 10 + 5
  assert.equal(s.fila('uc1').status, 'active');
  assert.equal(s.fila('uc2').km_completed, 10); // pausado: lo posterior a pausado_at no cuenta
  assert.deepEqual([s.fila('uc3').status, s.fila('uc3').km_completed], ['completed', 120]);
  assert.deepEqual([s.fila('uc4').status, s.fila('uc4').km_completed], ['pending', 0]);
  assert.equal(s.fila('uc9').km_completed, 3);
  assert.deepEqual(s.marcas(), []);
  assert.deepEqual([s.eventos().length, s.disparados.length], [0, 0]);
  assert.equal(s.m.db.activities.filter((a) => a.user_id === U).length, 2);
});

test('actividad que COMPLETA (Estándar): RPC + un evento motor; efectos una vez; km_base intacto', async () => {
  const s = montar();
  const r = await s.registrar({ km: 15 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.progreso.completados, ['uc1']);
  assert.equal(s.fila('uc1').status, 'completed');
  assert.equal(s.fila('uc1').km_completed, 55); // 30 + 10 + 15 ≥ 50
  assert.equal(s.fila('uc1').completed_at, new Date(AHORA).toISOString());
  assert.equal(s.eventos().length, 1);
  assert.deepEqual([s.eventos()[0].estado, s.eventos()[0].datos.origen, s.eventos()[0].datos.motivo], ['pendiente', 'motor', 'actividad_manual']);
  assert.deepEqual(s.disparados, [s.eventos()[0].id]);
  // El camino viejo no escribió nada: la completitud fue por la RPC.
  const updatesStatus = s.m.registro.filter((op) => op.tipo === 'update' && op.tabla === 'user_challenges' && op.valores && 'status' in op.valores);
  assert.deepEqual(updatesStatus, []);
  assert.equal(s.m.registro.filter((op) => op.tipo === 'rpc').length, 1);
  // Efectos (los procesa el procesador, como en producción con "efectos")
  await s.procesar({ ids: s.disparados });
  assert.equal(s.eventos()[0].estado, 'hecho');
  assert.ok(s.fila('uc1').certificado_serial);
  assert.deepEqual([s.resend.entregadosDe('email_admin_medalla').length, s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1, 1]);
  // km_base nunca se escribe
  assert.equal(s.fila('uc1').km_base, 30);
  assert.deepEqual(escriturasConKmBase(s.m.registro), []);
});

test('km_base participa: sin la base la misma actividad no completaría', async () => {
  const conBase = montar();
  await conBase.registrar({ km: 15 });
  assert.equal(conBase.fila('uc1').status, 'completed');
  const sinBase = montar({ ucs: [UC1({ km_base: 0, km_base_motivo: null, km_completed: 10 }), UC2(), UC3(), UC4(), UC9()] });
  await sinBase.registrar({ km: 15 });
  assert.deepEqual([sinBase.fila('uc1').status, sinBase.fila('uc1').km_completed], ['active', 25]);
});

test('Estándar / Extendida: la misma actividad completa la Estándar y no la Extendida; cualquier deporte 1:1', async () => {
  const est = montar();
  await est.registrar({ km: 15, sport_type: 'walk' });
  assert.equal(est.fila('uc1').status, 'completed');
  const ext = montar({ ucs: [UC1({ version: 'extendida', modalidad: 'ride' }), UC2(), UC3(), UC4(), UC9()] });
  const r = await ext.registrar({ km: 15, sport_type: 'run' });
  assert.deepEqual(r.body.progreso.completados, []);
  assert.deepEqual([ext.fila('uc1').status, ext.fila('uc1').km_completed], ['active', 55]); // 55 < 150
  // fila vieja sin version (solo modalidad legacy): se resuelve por modalidad
  const legacy = montar({ ucs: [{ ...UC1({ modalidad: 'ride' }), version: undefined }, UC2(), UC3(), UC4(), UC9()] });
  await legacy.registrar({ km: 15 });
  assert.equal(legacy.fila('uc1').status, 'active');
});

test('pausado: nunca se completa; lo cargado durante la pausa abierta no suma; lo anterior a pausado_at sí', async () => {
  // uc2 pausado con km cerca del objetivo Extendida (300) gracias a una base grande
  const s = montar({ ucs: [UC1(), UC2({ km_base: 295, km_base_motivo: 'legado_historico', km_completed: 305 }), UC3(), UC4(), UC9()] });
  const r = await s.registrar({ km: 50, challenge_id: 'c2' }); // 12/09: posterior a pausado_at (10/09)
  assert.equal(r.status, 200);
  assert.equal(s.fila('uc2').status, 'active'); // ≥ 300 pero pausado: no se completa
  assert.equal(s.fila('uc2').km_completed, 305);
  const antes = montar();
  await antes.registrar({ km: 6, recorded_at: '2026-09-09T08:00:00.000Z' }); // antes de pausado_at, fuera de la pausa cerrada
  assert.equal(antes.fila('uc2').km_completed, 16);
  const enPausaCerrada = montar();
  await enPausaCerrada.registrar({ km: 6, recorded_at: '2026-09-06T08:00:00.000Z' });
  assert.equal(enPausaCerrada.fila('uc2').km_completed, 10);
  assert.equal(enPausaCerrada.fila('uc1').km_completed, 46); // para uc1 sí cuenta
});

test('started_at: una actividad anterior al inicio lo corre hacia atrás (máx. 30 días) y cuenta', async () => {
  const s = montar();
  const r = await s.registrar({ km: 4, recorded_at: '2026-08-20T08:00:00.000Z' });
  assert.equal(r.status, 200);
  assert.equal(s.fila('uc1').started_at, '2026-08-20T08:00:00.000Z');
  assert.equal(s.fila('uc1').km_completed, 44);
  const lejos = montar();
  await lejos.registrar({ km: 4, recorded_at: '2026-06-01T08:00:00.000Z' });
  assert.equal(new Date(lejos.fila('uc1').started_at).toISOString(), new Date(Date.parse('2026-09-01T00:00:00') - 30 * 24 * 3600 * 1000).toISOString());
  assert.equal(lejos.fila('uc1').km_completed, 40); // sigue fuera de la ventana
  // modo libre (sin challenge_id): no corre nada, pero suma a los activos
  const libre = montar();
  await libre.registrar({ km: 4, challenge_id: null });
  assert.equal(libre.fila('uc1').started_at, '2026-09-01T00:00:00');
  assert.equal(libre.fila('uc1').km_completed, 44);
});

test('orden: primero marca TODOS los activos, después inserta, después recalcula', async () => {
  const s = montar();
  const orden = [];
  const { repo } = conGanchos(s.repo, async (nombre, fase) => { if (fase === 'antes') orden.push(nombre); });
  await s.registrar({ km: 5, repo });
  const iMarca = orden.lastIndexOf('marcarRecalculoCAS') >= 0 ? orden.lastIndexOf('marcarRecalculoCAS') : orden.findIndex((x) => /marca/i.test(x));
  const iAlta = orden.indexOf('insertarActividadManual');
  const iLectura = orden.indexOf('leerEstadoUsuario');
  assert.ok(iMarca >= 0 && iMarca < iAlta, `marcas antes del alta: ${orden.join(',')}`);
  assert.ok(iAlta < iLectura, 'alta antes del recálculo');
  const marcadas = s.m.registro.filter((op) => op.tipo === 'update' && op.tabla === 'user_challenges' && op.valores && op.valores.recalculo_pendiente_desde)
    .map((op) => op.filtros.find(([t, c]) => t === 'eq' && c === 'id')[2]).sort();
  assert.deepEqual([...new Set(marcadas)], ['uc1', 'uc2']); // ni terminal, ni pending, ni otro usuario
});

test('si no se puede marcar: NO se inserta la actividad y responde el error viejo (500)', async () => {
  const s = montar({ fallar: (op) => op.tabla === 'user_challenges' && op.tipo === 'update' && op.valores && op.valores.recalculo_pendiente_desde });
  const r = await s.registrar({ km: 15 });
  assert.equal(r.status, 500);
  assert.equal(r.body.error, 'Error registrando actividad');
  assert.equal(s.m.db.activities.filter((a) => a.user_id === U).length, 1);
  assert.equal(s.fila('uc1').km_completed, 40);
});

test('falla el alta de la actividad: error 500 como el viejo; la marca queda y la recuperación converge', async () => {
  const s = montar({ fallar: (op) => op.tabla === 'activities' && op.tipo === 'insert' });
  const r = await s.registrar({ km: 15 });
  assert.equal(r.status, 500);
  assert.deepEqual(s.marcas(), ['uc1', 'uc2']);
  await s.converger();
  assert.deepEqual(s.marcas(), []);
  assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed], ['active', 40]);
  assert.equal(s.eventos().length, 0);
});

test('caída entre insertar y recalcular: la actividad queda, marcada; la recuperación completa y procesa efectos UNA vez', async () => {
  const s = montar();
  const { repo, estado } = conGanchos(s.repo, async (nombre, fase) => (nombre === 'insertarActividadManual' && fase === 'despues' ? 'morir' : undefined));
  s.registrar({ km: 15, repo });
  await esperarHasta(() => estado.murio);
  assert.equal(s.m.db.activities.filter((a) => a.user_id === U).length, 2);
  assert.equal(s.fila('uc1').status, 'active'); // todavía no recalculado...
  assert.deepEqual(s.marcas(), ['uc1', 'uc2']); // ...pero marcado
  await s.verificarInvariante('tras la caída');
  await s.converger(); // proceso nuevo: recuperación + procesador de efectos
  assert.deepEqual(s.marcas(), []);
  assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed], ['completed', 55]);
  assert.equal(s.eventos().length, 1);
  assert.equal(s.eventos()[0].estado, 'hecho');
  assert.deepEqual([s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1]);
  await s.converger(); // otra ronda: nada nuevo
  assert.deepEqual([s.eventos().length, s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1, 1]);
});

test('fallan todos los intentos de recálculo: 200 con la actividad y "pendiente"; la recuperación converge', async () => {
  let fallas = 0;
  const s = montar({ fallar: (op) => op.tabla === 'activities' && op.tipo === 'select' && fallas++ < 3 });
  const r = await s.registrar({ km: 15 });
  assert.equal(r.status, 200);
  assert.equal(r.body.mensaje, 'Actividad registrada y kilómetros sumados');
  assert.ok(r.body.actividad);
  assert.deepEqual([r.body.progreso.recalculo, r.body.progreso.recuperacion], ['pendiente', 'automatica']);
  assert.deepEqual(s.marcas(), ['uc1', 'uc2']);
  await s.converger();
  assert.deepEqual([s.fila('uc1').status, s.eventos().length, s.marcas().length], ['completed', 1, 0]);
});

test('falla el 1.er recálculo y el reintento funciona: una sola completitud y un solo evento', async () => {
  let fallas = 0;
  const s = montar({ fallar: (op) => op.tabla === 'activities' && op.tipo === 'select' && fallas++ < 1 });
  const r = await s.registrar({ km: 15 });
  assert.deepEqual([r.body.progreso.recalculo, r.body.progreso.completados], ['ok', ['uc1']]);
  assert.equal(s.eventos().length, 1);
  assert.deepEqual(s.marcas(), []);
});

test('caída en CADA punto (antes y después de cada operación): invariante siempre y converge sin duplicar efectos', async () => {
  const normal = montar();
  const contador = conGanchos(normal.repo, async () => {});
  await normal.registrar({ km: 15, repo: contador.repo });
  const total = contador.estado.llamadas;
  assert.ok(total >= 8, `se esperaban al menos 8 operaciones, hubo ${total}`);
  for (let n = 1; n <= total; n++) {
    for (const momento of ['antes', 'despues']) {
      const s = montar();
      const { repo, estado } = conGanchos(s.repo, async (_nombre, fase, k) => (k === n && fase === momento ? 'morir' : undefined));
      s.registrar({ km: 15, repo });
      await esperarHasta(() => estado.murio);
      const ctx = `caída ${momento} de la operación ${n}/${total}`;
      await s.verificarInvariante(ctx);
      await s.converger();
      assert.deepEqual(s.marcas(), [], ctx);
      assert.deepEqual(await s.inconsistentes(), [], ctx);
      const insertada = s.m.db.activities.filter((a) => a.user_id === U).length === 2;
      // Si la actividad llegó a insertarse, el desafío termina completado (una vez); si no, queda igual.
      assert.equal(s.fila('uc1').status, insertada ? 'completed' : 'active', ctx);
      assert.equal(s.eventos().length, insertada ? 1 : 0, ctx);
      assert.ok(s.resend.entregadosDe('email_usuario').length <= 1 && s.expo.entregados.length <= 1, `${ctx}: efecto duplicado`);
      if (insertada) assert.equal(s.eventos()[0].estado, 'hecho', ctx);
      assert.equal(s.fila('uc1').km_base, 30, ctx);
    }
  }
});

test('dos cargas simultáneas sin candado (procesos distintos) que completan: UN evento y efectos una vez', async () => {
  const s = montar();
  const [r1, r2] = await Promise.all([s.registrar({ km: 8 }), s.registrar({ km: 9 })]);
  assert.deepEqual([r1.status, r2.status], [200, 200]);
  await s.converger();
  assert.equal(s.m.db.activities.filter((a) => a.user_id === U).length, 3);
  assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed], ['completed', 57]);
  assert.equal(s.eventos().length, 1);
  await s.procesar({ ids: s.disparados });
  assert.deepEqual([s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1]);
  assert.deepEqual(s.marcas(), []);
});

test('reintento del mismo recálculo / recuperación repetida: idempotente (sin escrituras ni eventos nuevos)', async () => {
  const s = montar();
  await s.registrar({ km: 15 });
  await s.procesar({ ids: s.disparados });
  const ops = s.m.registro.length;
  const inf = await recalcularProgresoUsuario({ repo: s.repo, userId: U, motivo: 'reintento', modo: MODOS.ESCRIBIR, ahoraMs: AHORA });
  assert.equal(inf.escrituras, 0);
  await s.converger();
  await s.converger();
  assert.equal(s.eventos().length, 1);
  assert.ok(s.m.registro.slice(ops).every((op) => op.tipo === 'select' || op.tabla === 'progreso_eventos'));
});

test('marca previa de otro pedido: la renueva, NO la borra; la recuperación la limpia', async () => {
  const s = montar({ ucs: [UC1({ recalculo_pendiente_desde: '2026-09-12T11:00:00.000001Z' }), UC2(), UC3(), UC4(), UC9()] });
  const r = await s.registrar({ km: 5 });
  assert.equal(r.body.progreso.marcas_para_recuperacion, 1);
  assert.deepEqual(s.marcas(), ['uc1']);
  assert.equal(s.fila('uc1').km_completed, 45);
  await s.converger();
  assert.deepEqual(s.marcas(), []);
});

/** Intercala operaciones de varios pedidos según una semilla; uno puede morir en su paso N. */
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
    pedidos[i].correr(repo).then((res) => { e.terminado = true; e.resultado = res; }, (err) => { e.terminado = true; e.error = err; });
  });
  const quietos = () => estados.every((e) => e.terminado || e.esperando);
  for (let v = 0; v < 3000; v++) {
    await esperarHasta(quietos);
    if (alPaso) await alPaso();
    const listos = estados.filter((e) => !e.terminado && e.esperando);
    if (listos.length === 0) return estados;
    const el = listos[Math.floor(azar() * listos.length)];
    const seguir = el.esperando; el.esperando = null; seguir();
  }
  throw new Error('el intercalado no terminó');
};

test('intercalado aleatorio MANUAL + MANUAL + ELIMINAR + REANUDAR (con caídas): invariante y convergencia, un evento por desafío', async () => {
  let corridas = 0;
  let pasos = 0;
  for (let semilla = 1; semilla <= 200; semilla++) {
    const s = montar();
    const comunes = { ahoraMs: AHORA, log: () => {}, esperar: async () => {}, candado: sinCandado };
    const pedidos = [
      { nombre: 'manual_8', correr: (repo) => s.registrar({ km: 8, repo }) },
      { nombre: 'manual_9', correr: (repo) => s.registrar({ km: 9, repo, recorded_at: '2026-09-09T08:00:00.000Z' }) },
      { nombre: 'eliminar_a1', correr: (repo) => eliminarActividadConMotor({ repo, userId: U, actividadId: A1.id, ...comunes }) },
      { nombre: 'reanudar_uc2', correr: (repo) => reanudarDesafioConMotor({ repo, userId: U, challengeId: 'c2', ...comunes }) },
    ];
    const caida = semilla % 4 === 0 ? null : { pedido: semilla % pedidos.length, paso: 1 + (semilla * 7) % 14 };
    const ctx = `semilla ${semilla}${caida ? `, muere ${pedidos[caida.pedido].nombre} en el paso ${caida.paso}` : ''}`;
    const estados = await intercalar({ s, pedidos, semilla, caida, alPaso: () => { pasos += 1; return s.verificarInvariante(ctx); } });
    for (const e of estados) if (e.error && !/No se pudo cerrar la pausa/.test(e.error.message)) throw new Error(`${ctx}: ${e.nombre}: ${e.error.stack}`);
    await s.converger();
    assert.deepEqual(s.marcas(), [], ctx);
    assert.deepEqual(await s.inconsistentes(), [], ctx);
    await s.verificarInvariante(`${ctx} (final)`);
    assert.ok(s.eventos().every((e) => e.estado === 'hecho'), `${ctx}: evento sin procesar`);
    assert.ok(s.resend.entregadosDe('email_usuario').length <= s.eventos().length && s.expo.entregados.length <= s.eventos().length, `${ctx}: efecto duplicado`);
    assert.equal(s.fila('uc1').km_base, 30, ctx);
    assert.deepEqual([s.fila('uc3').status, s.fila('uc3').km_completed], ['completed', 120], ctx);
    corridas += 1;
  }
  assert.equal(corridas, 200);
  assert.ok(pasos >= 2000, `verificaciones de la invariante: ${pasos}`);
});

// ---------------------------------------------------------------------------
// Integración: index.js real
// ---------------------------------------------------------------------------

const tablasIntegracion = () => ({
  users: USUARIOS, user_challenges: [UC1(), UC2(), UC3(), UC4(), UC9()], challenges: CHS, activities: [A1, A9], progreso_eventos: [],
});
const cargar = (b, km = 15) => b.pedir({ metodo: 'POST', ruta: '/actividades/manual', body: { user_id: U, challenge_id: 'c1', sport_type: 'Caminata', distance_km: km, recorded_at: '2026-09-12T08:00:00.000Z' } });
const correr = async (flag, km = 15) => {
  const b = await levantarBackend({ flag, tablas: tablasIntegracion(), entorno: { PRUEBA_PDF_FALSO: '1' } });
  const r = await cargar(b, km);
  // dar tiempo al procesamiento de efectos disparado sin esperar
  await new Promise((res) => setTimeout(res, 300));
  const salida = await b.cerrar();
  assert.equal(salida.exitCode, 0, salida.logs);
  return { r, ...salida, fila: (id) => salida.db.user_challenges.find((x) => x.id === id) };
};

test('integración flag OFF (flags productivas actuales): corre el camino viejo, respuesta vieja', async () => {
  const x = await correr('reanudar,eliminar_actividad,efectos,modalidad');
  assert.equal(x.r.status, 200);
  assert.deepEqual(Object.keys(x.r.body).sort(), ['actividad', 'mensaje']);
  assert.equal(x.r.body.mensaje, 'Actividad registrada y kilómetros sumados');
  // el viejo ignora km_base para completar: 10 + 15 = 25 < 50 → con Math.max queda 40 y activo
  assert.deepEqual([x.fila('uc1').status, x.fila('uc1').km_completed], ['active', 40]);
  assert.ok(x.registro.some((op) => op.tipo === 'select' && op.tabla === 'user_challenges' && /challenges\(title, modalidades, total_distance_km\)/.test(op.campos || '') && op.filtros.some(([t, c, v]) => t === 'eq' && c === 'pausado' && v === false)), 'debe pasar por recalcularKmUsuario');
  assert.doesNotMatch(x.logs, /"writer":"actividad_manual"/);
});

test('integración "actividad_manual" SIN "efectos": camino viejo y lo deja en el log', async () => {
  const x = await correr('reanudar,eliminar_actividad,actividad_manual');
  assert.equal(x.r.body.progreso, undefined);
  assert.match(x.logs, /"writer":"actividad_manual","resultado":"ignorado_sin_efectos"/);
});

test('integración flag ON: motor (completa con km_base), evento motor, efectos una vez, sin escrituras viejas', async () => {
  const x = await correr('reanudar,eliminar_actividad,efectos,modalidad,actividad_manual');
  assert.equal(x.r.status, 200);
  assert.equal(x.r.body.mensaje, 'Actividad registrada y kilómetros sumados');
  assert.equal(x.r.body.actividad.distance_km, 15);
  assert.deepEqual([x.r.body.progreso.motor, x.r.body.progreso.recalculo, x.r.body.progreso.completados], [true, 'ok', ['uc1']]);
  assert.deepEqual([x.fila('uc1').status, x.fila('uc1').km_completed, x.fila('uc1').km_base], ['completed', 55, 30]);
  assert.equal(x.fila('uc2').km_completed, 10);
  assert.ok(x.db.user_challenges.every((f) => f.recalculo_pendiente_desde === null));
  const ev = x.db.progreso_eventos.filter((e) => e.user_challenge_id === 'uc1');
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].datos.origen, ev[0].datos.motivo, ev[0].estado], ['motor', 'actividad_manual', 'hecho']);
  assert.ok(x.fila('uc1').certificado_serial);
  // efectos una vez: certificado (con la distancia de la versión), mail al usuario, push de completitud
  assert.deepEqual(x.efectos.certificados.map((c) => c.km), [50]);
  assert.equal(x.efectos.emails.filter((e) => e.para === 'prueba@ejemplo.com').length, 1);
  assert.equal(x.efectos.push.filter((p) => /Lo lograste|Completaste|completaste/i.test(JSON.stringify(p))).length, 1);
  // ningún UPDATE viejo de km/status: solo la RPC escribió la completitud
  assert.ok(!x.registro.some((op) => op.tipo === 'update' && op.tabla === 'user_challenges' && op.valores && 'status' in op.valores));
  assert.match(x.logs, /"message":"motor_progreso actividad_manual registrada"/);
});

test('integración flag ON, actividad que no completa: respuesta compatible y km 1:1', async () => {
  const x = await correr('reanudar,eliminar_actividad,efectos,modalidad,actividad_manual', 4);
  assert.deepEqual([x.r.body.progreso.recalculo, x.r.body.progreso.completados], ['ok', []]);
  assert.deepEqual([x.fila('uc1').status, x.fila('uc1').km_completed], ['active', 44]);
  assert.equal(x.db.progreso_eventos.length, 0);
  assert.equal(x.efectos.emails.length, 0);
});
