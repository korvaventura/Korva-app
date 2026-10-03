// Tests de la IMPORTACIÓN STRAVA con el motor unificado (Etapa 4A-7).
//
// Unitarios: repositorio Supabase REAL sobre la base en memoria (RPC atómica, trigger de legado,
// protección del serial, espejo version ↔ modalidad, upsert por external_id) + efectos con dobles.
// Caídas antes/después de CADA operación e intercalados aleatorios con otros writers del motor.
// Integración: index.js real con la API de Strava simulada (PRUEBA_STRAVA_JSON).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
const { crearResendFalso, crearExpoFalso, crearPdfFalso, crearSecuenciaSerial } = require('./helpers/efectosFalsos');
const { levantarBackend } = require('./helpers/backendHijo');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { importarActividadesStravaConMotor } = require('../lib/importacionStrava');
const { registrarActividadManualConMotor } = require('../lib/actividadManual');
const { eliminarActividadConMotor } = require('../lib/eliminarActividad');
const { recalcularProgresoUsuario, MODOS } = require('../lib/progresoServicio');
const { recuperarRecalculosPendientes } = require('../lib/recuperacionRecalculo');
const { crearEfectosCompletado } = require('../lib/efectosCompletado');
const { procesarEventosPendientes } = require('../lib/completionEventos');
const { stravaImportMotorActiva, writersActivos, algunWriterMotorActivo, WRITERS_CONOCIDOS } = require('../lib/flagsMotor');
const { sinCandado } = require('../lib/candadoUsuario');
const emails = require('../routes/emails');

// ---------------------------------------------------------------------------
// Escenario (igual que 4A-6): c1 Estándar 50 / Extendida 150 · c2 Estándar 100 / Extendida 300
//   uc1 activo, Estándar, km_base 30, a1 (02/09, 10 km)                → 40 / 50
//   uc2 activo, Extendida, PAUSADO desde 10/09, pausa cerrada 05–07/09  → 10 / 300
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
const A1 = { id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: U, distance_km: 10, recorded_at: '2026-09-02T07:00:00', excluida: false, source: 'manual', external_id: 'manual_1' };
const A9 = { id: 'aaaaaaaa-0000-4000-8000-000000000009', user_id: U2, distance_km: 3, recorded_at: '2026-09-03T07:00:00', excluida: false, source: 'manual', external_id: 'manual_9' };
const USUARIOS = [
  { id: U, name: 'Fabri Prueba', email: 'prueba@ejemplo.com', bib_number: '0042', shipping_address: 'Calle 1', push_token: 'ExponentPushToken[x]', strava_token: 'tok', strava_refresh_token: 'ref', strava_token_expires_at: 4102444800 },
  { id: U2, name: 'Otra', email: 'otra@ejemplo.com', bib_number: '0043', shipping_address: null, push_token: null },
];

/** Fila como la arma la ruta a partir de una actividad de Strava. */
const fila = (extId, km, recorded_at = '2026-09-12T08:00:00Z', sport_type = 'ride') => ({
  user_id: U, source: 'strava', external_id: String(extId), sport_type, distance_km: km, duration_seconds: 1800, recorded_at, challenge_id: 'c1',
});

const montar = ({ ucs = [UC1(), UC2(), UC3(), UC4(), UC9()], actividades = [A1, A9], fallar } = {}) => {
  const reloj = { ahora: AHORA };
  const m = crearSupabaseMemoria({ users: USUARIOS, user_challenges: ucs, challenges: CHS, activities: actividades, progreso_eventos: [] },
    { fallar, reloj: () => reloj.ahora });
  const repo = crearRepositorioSupabase(m.cliente);
  const resend = crearResendFalso();
  const expo = crearExpoFalso();
  const pdf = crearPdfFalso();
  const kmCertificados = [];
  const efectos = crearEfectosCompletado({
    supabase: m.cliente, generarCertificado: async (...a) => { kmCertificados.push(a[3]); return pdf.generarCertificado(...a); }, emails,
    obtenerResend: () => resend.cliente, fetchImpl: expo.fetchImpl, obtenerSerial: crearSecuenciaSerial().siguiente,
  });
  let n = 0;
  const generarMarca = (ms) => `${new Date(ms).toISOString().slice(0, -1)}${String(++n % 1000).padStart(3, '0')}Z`;
  const logs = [];
  const disparados = [];
  const esperar = async () => {};
  const comunes = { ahoraMs: AHORA, log: (l) => logs.push(l), esperar, generarMarca, candado: sinCandado };
  const importar = (filas, extra = {}) => importarActividadesStravaConMotor({
    repo, userId: U, filas, dispararEfectos: (ids) => disparados.push(...ids), ...comunes, ...extra,
  });
  const procesar = (extra = {}) => procesarEventosPendientes({ repo, efectos, ahoraMs: reloj.ahora, generarToken: generarMarca, ...extra });
  const fila_ = (id) => m.db.user_challenges.find((x) => x.id === id);
  const marcas = () => m.db.user_challenges.filter((x) => x.recalculo_pendiente_desde !== null).map((x) => x.id).sort();
  const eventos = () => m.db.progreso_eventos.filter((e) => e.tipo === 'completado');
  const actividadesDe = (userId = U) => m.db.activities.filter((a) => a.user_id === userId);
  const inconsistentes = async () => {
    const lista = [];
    for (const userId of [U, U2]) {
      const inf = await recalcularProgresoUsuario({ repo, userId, motivo: 'verificacion', modo: MODOS.SIMULAR, ahoraMs: AHORA });
      inf.desafios.filter((d) => d.accion !== 'nada').forEach((d) => lista.push(d.user_challenge_id));
    }
    return lista.sort();
  };
  const verificarInvariante = async (ctx = '') => {
    for (const id of await inconsistentes()) assert.notEqual(fila_(id).recalculo_pendiente_desde, null, `${ctx}: ${id} incorrecto y SIN marca`);
    for (const f of m.db.user_challenges) {
      if (f.id === 'uc3') continue;
      const terminal = ['completed', 'cargado', 'shipped'].includes(f.status);
      const k = m.db.progreso_eventos.filter((e) => e.user_challenge_id === f.id && e.tipo === 'completado').length;
      assert.equal(k, terminal ? 1 : 0, `${ctx}: ${f.id} terminal=${terminal} con ${k} eventos`);
    }
    const ext = actividadesDe().map((a) => a.external_id);
    assert.equal(new Set(ext).size, ext.length, `${ctx}: actividades duplicadas`);
  };
  const converger = async () => {
    reloj.ahora = Math.max(reloj.ahora, AHORA) + 10 * MIN; // el reloj nunca retrocede
    for (let i = 0; i < 5 && marcas().length > 0; i++) {
      await recuperarRecalculosPendientes({ repo: crearRepositorioSupabase(m.cliente), ahoraMs: reloj.ahora, log: () => {}, esperar });
    }
    reloj.ahora += 10 * MIN;
    await procesar();
  };
  return { m, repo, logs, disparados, comunes, importar, procesar, fila: fila_, marcas, eventos, actividadesDe, inconsistentes, verificarInvariante, converger, resend, expo, kmCertificados, reloj };
};

const conGanchos = (repo, gancho) => {
  const estado = { llamadas: 0, murio: false };
  const envuelto = {};
  for (const [nombre, fn] of Object.entries(repo)) {
    envuelto[nombre] = async (...args) => {
      estado.llamadas += 1;
      const k = estado.llamadas;
      if ((await gancho(nombre, 'antes', k, args)) === 'morir') { estado.murio = true; return new Promise(() => {}); }
      const r = await fn(...args);
      if ((await gancho(nombre, 'despues', k, args)) === 'morir') { estado.murio = true; return new Promise(() => {}); }
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

test('flags: strava_import entra al motor SOLO con "efectos"; apagado por defecto', () => {
  assert.ok(WRITERS_CONOCIDOS.includes('strava_import'));
  assert.equal(stravaImportMotorActiva({}), false);
  assert.equal(stravaImportMotorActiva({ MOTOR_PROGRESO_WRITERS: 'reanudar,eliminar_actividad,efectos,modalidad,actividad_manual' }), false);
  assert.equal(stravaImportMotorActiva({ MOTOR_PROGRESO_WRITERS: 'strava_import' }), false);
  assert.equal(stravaImportMotorActiva({ MOTOR_PROGRESO_WRITERS: 'efectos,strava_import' }), true);
  assert.deepEqual(writersActivos({ MOTOR_PROGRESO_WRITERS: 'efectos, Strava_Import' }), ['efectos', 'strava_import']);
  assert.equal(algunWriterMotorActivo({ MOTOR_PROGRESO_WRITERS: 'strava_import' }), true);
});

// ---------------------------------------------------------------------------
// Funcionales
// ---------------------------------------------------------------------------

test('importación que NO completa: suma 1:1 a los activos, sin eventos ni marcas', async () => {
  const s = montar();
  const r = await s.importar([fila(101, 3), fila(102, 2, '2026-09-11T08:00:00Z', 'run')]);
  assert.equal(r.ok, true);
  assert.equal(r.importadas, 2);
  assert.deepEqual([r.progreso.motor, r.progreso.recalculo, r.progreso.completados, r.progreso.eventos_pendientes], [true, 'ok', [], 0]);
  assert.equal(s.fila('uc1').km_completed, 45);
  assert.equal(s.fila('uc2').km_completed, 10); // pausado: lo posterior a pausado_at no cuenta
  assert.deepEqual([s.fila('uc3').km_completed, s.fila('uc4').km_completed, s.fila('uc9').km_completed], [120, 0, 3]);
  assert.deepEqual([s.marcas(), s.eventos().length, s.disparados.length], [[], 0, 0]);
  assert.equal(s.actividadesDe().length, 3);
});

test('importación que COMPLETA: RPC + un evento motor (strava_import); efectos una vez con la distancia de la versión', async () => {
  const s = montar();
  const r = await s.importar([fila(201, 15)]);
  assert.deepEqual(r.progreso.completados, ['uc1']);
  assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed, s.fila('uc1').completed_at], ['completed', 55, new Date(AHORA).toISOString()]);
  assert.equal(s.eventos().length, 1);
  assert.deepEqual([s.eventos()[0].datos.origen, s.eventos()[0].datos.motivo, s.eventos()[0].estado], ['motor', 'strava_import', 'pendiente']);
  assert.deepEqual(s.disparados, [s.eventos()[0].id]);
  assert.ok(!s.m.registro.some((op) => op.tipo === 'update' && op.tabla === 'user_challenges' && op.valores && 'status' in op.valores), 'ningún UPDATE viejo de status');
  await s.procesar({ ids: s.disparados });
  assert.equal(s.eventos()[0].estado, 'hecho');
  assert.ok(s.fila('uc1').certificado_serial);
  assert.deepEqual(s.kmCertificados, [50]);
  assert.deepEqual([s.resend.entregadosDe('email_admin_medalla').length, s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1, 1]);
  assert.equal(s.fila('uc1').km_base, 30);
  assert.ok(!s.m.registro.some((op) => op.tipo !== 'select' && op.valores && 'km_base' in op.valores));
});

test('reimportar las mismas actividades: sin filas duplicadas, sin escrituras, sin eventos ni efectos nuevos', async () => {
  const s = montar();
  const filas = [fila(201, 15), fila(202, 2, '2026-09-11T08:00:00Z')];
  await s.importar(filas);
  await s.procesar({ ids: s.disparados });
  const antes = { acts: s.actividadesDe().length, km: s.fila('uc1').km_completed, emails: s.resend.entregados.length, push: s.expo.entregados.length };
  for (let i = 0; i < 3; i++) {
    const r = await s.importar(filas);
    assert.deepEqual([r.ok, r.importadas, r.progreso.completados, r.progreso.eventos_pendientes], [true, 2, [], 0]);
  }
  await s.converger();
  assert.equal(s.actividadesDe().length, antes.acts);
  assert.equal(s.fila('uc1').km_completed, antes.km);
  assert.equal(s.eventos().length, 1);
  assert.deepEqual([s.resend.entregados.length, s.expo.entregados.length], [antes.emails, antes.push]);
  assert.deepEqual(s.marcas(), []);
});

test('reimportar una actividad que el usuario eliminó: sigue excluida y no suma', async () => {
  const excluida = { id: 'bbbbbbbb-0000-4000-8000-000000000001', user_id: U, source: 'strava', external_id: '301', distance_km: 15, recorded_at: '2026-09-12T08:00:00Z', excluida: true };
  const s = montar({ actividades: [A1, A9, excluida] });
  const r = await s.importar([fila(301, 15)]);
  assert.equal(r.ok, true);
  assert.equal(s.actividadesDe().find((a) => a.external_id === '301').excluida, true);
  assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed], ['active', 40]);
  assert.equal(s.eventos().length, 0);
});

test('Estándar / Extendida y cualquier deporte 1:1: la misma importación completa la Estándar y no la Extendida', async () => {
  const est = montar();
  await est.importar([fila(401, 7, undefined, 'walk'), fila(402, 8, undefined, 'run')]);
  assert.deepEqual([est.fila('uc1').status, est.fila('uc1').km_completed], ['completed', 55]);
  const ext = montar({ ucs: [UC1({ version: 'extendida', modalidad: 'ride' }), UC2(), UC3(), UC4(), UC9()] });
  await ext.importar([fila(401, 7, undefined, 'walk'), fila(402, 8, undefined, 'ride')]);
  assert.deepEqual([ext.fila('uc1').status, ext.fila('uc1').km_completed], ['active', 55]); // 55 < 150
  assert.equal(ext.eventos().length, 0);
});

test('pausado: nunca se completa; lo importado dentro de una pausa no suma; lo anterior a pausado_at sí', async () => {
  const s = montar({ ucs: [UC1(), UC2({ km_base: 295, km_base_motivo: 'legado_historico', km_completed: 305 }), UC3(), UC4(), UC9()] });
  await s.importar([fila(501, 50)]); // 12/09: posterior a pausado_at
  assert.deepEqual([s.fila('uc2').status, s.fila('uc2').km_completed], ['active', 305]);
  const antes = montar();
  await antes.importar([fila(502, 6, '2026-09-09T08:00:00Z')]);
  assert.equal(antes.fila('uc2').km_completed, 16);
  const cerrada = montar();
  await cerrada.importar([fila(503, 6, '2026-09-06T08:00:00Z')]);
  assert.deepEqual([cerrada.fila('uc2').km_completed, cerrada.fila('uc1').km_completed], [10, 46]);
});

test('sin filas para importar: no marca, no escribe, no recalcula', async () => {
  const s = montar();
  const r = await s.importar([]);
  assert.deepEqual([r.ok, r.importadas, r.progreso], [true, 0, null]);
  assert.ok(s.m.registro.every((op) => op.tipo === 'select'));
});

test('si no se puede marcar: NO se escribe ninguna actividad y responde error', async () => {
  const s = montar({ fallar: (op) => op.tabla === 'user_challenges' && op.tipo === 'update' && op.valores && op.valores.recalculo_pendiente_desde });
  const r = await s.importar([fila(601, 15)]);
  assert.equal(r.ok, false);
  assert.equal(s.actividadesDe().length, 1);
  assert.equal(s.fila('uc1').km_completed, 40);
});

test('falla el upsert de UNA actividad: las demás se importan, se recalcula y se informa la fallida', async () => {
  const s = montar({ fallar: (op) => op.tabla === 'activities' && op.tipo === 'upsert' && op.valores.external_id === '702' });
  const r = await s.importar([fila(701, 3), fila(702, 50), fila(703, 2)]);
  assert.deepEqual([r.ok, r.importadas, r.fallidas.map((f) => f.external_id)], [true, 2, ['702']]);
  assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed], ['active', 45]);
  assert.deepEqual(s.marcas(), []);
});

test('fallan todos los intentos de recálculo: actividades guardadas, "pendiente"; la recuperación completa y procesa efectos UNA vez', async () => {
  let fallas = 0;
  const s = montar({ fallar: (op) => op.tabla === 'activities' && op.tipo === 'select' && fallas++ < 3 });
  const r = await s.importar([fila(801, 15)]);
  assert.deepEqual([r.ok, r.importadas, r.progreso.recalculo], [true, 1, 'pendiente']);
  assert.deepEqual(s.marcas(), ['uc1', 'uc2']);
  await s.converger();
  assert.deepEqual([s.fila('uc1').status, s.eventos().length, s.eventos()[0].estado, s.marcas().length], ['completed', 1, 'hecho', 0]);
  assert.deepEqual([s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1]);
});

test('caída entre los upserts y el recálculo: queda todo marcado; la recuperación completa y los efectos salen una vez', async () => {
  const s = montar();
  const { repo, estado } = conGanchos(s.repo, async (nombre, fase) => (nombre === 'upsertActividadStrava' && fase === 'despues' ? 'morir' : undefined));
  s.importar([fila(901, 15)], { repo });
  await esperarHasta(() => estado.murio);
  assert.equal(s.actividadesDe().length, 2);
  assert.equal(s.fila('uc1').status, 'active');
  assert.deepEqual(s.marcas(), ['uc1', 'uc2']);
  await s.verificarInvariante('tras la caída');
  await s.converger();
  await s.converger();
  assert.deepEqual([s.fila('uc1').status, s.eventos().length, s.eventos()[0].estado], ['completed', 1, 'hecho']);
  assert.deepEqual([s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1]);
});

test('caída en CADA punto (antes y después de cada operación): invariante siempre, converge, sin duplicar filas ni efectos', async () => {
  const filas = [fila(1001, 7), fila(1002, 8, '2026-09-11T08:00:00Z')];
  const normal = montar();
  const contador = conGanchos(normal.repo, async () => {});
  await normal.importar(filas, { repo: contador.repo });
  const total = contador.estado.llamadas;
  assert.ok(total >= 8, `se esperaban al menos 8 operaciones, hubo ${total}`);
  for (let k = 1; k <= total; k++) {
    for (const momento of ['antes', 'despues']) {
      const s = montar();
      const { repo, estado } = conGanchos(s.repo, async (_n, fase, j) => (j === k && fase === momento ? 'morir' : undefined));
      s.importar(filas, { repo });
      await esperarHasta(() => estado.murio);
      const ctx = `caída ${momento} de la operación ${k}/${total}`;
      await s.verificarInvariante(ctx);
      await s.converger();
      // Strava reintenta: el usuario vuelve a sincronizar después de la caída (proceso nuevo).
      await s.importar(filas);
      await s.converger();
      assert.deepEqual(s.marcas(), [], ctx);
      assert.deepEqual(await s.inconsistentes(), [], ctx);
      await s.verificarInvariante(`${ctx} (final)`);
      assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed, s.actividadesDe().length, s.eventos().length], ['completed', 55, 3, 1], ctx);
      assert.equal(s.eventos()[0].estado, 'hecho', ctx);
      assert.ok(s.resend.entregadosDe('email_usuario').length <= 1 && s.expo.entregados.length <= 1, `${ctx}: efecto duplicado`);
      assert.equal(s.fila('uc1').km_base, 30, ctx);
    }
  }
});

test('dos importaciones simultáneas de las MISMAS actividades (procesos distintos): una fila por actividad, un evento, efectos una vez', async () => {
  const s = montar();
  const filas = [fila(1101, 15)];
  const [r1, r2] = await Promise.all([s.importar(filas), s.importar(filas)]);
  assert.deepEqual([r1.ok, r2.ok], [true, true]);
  await s.converger();
  await s.procesar({ ids: s.disparados });
  assert.equal(s.actividadesDe().length, 2);
  assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed, s.eventos().length], ['completed', 55, 1]);
  assert.deepEqual([s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1]);
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

test('intercalado aleatorio IMPORT + IMPORT (mismas) + MANUAL + ELIMINAR (con caídas): invariante, convergencia y efectos únicos', async () => {
  let corridas = 0;
  let pasos = 0;
  for (let semilla = 1; semilla <= 200; semilla++) {
    const s = montar();
    const filas = [fila(1201, 8), fila(1202, 9, '2026-09-11T08:00:00Z')];
    const manual = {
      user_id: U, challenge_id: 'c1', source: 'manual', external_id: `manual_intercalado_${semilla}`, sport_type: 'walk', distance_km: 4,
      duration_seconds: null, recorded_at: '2026-09-12T09:00:00.000Z', evidencia_url: null,
    };
    const pedidos = [
      { nombre: 'import_a', correr: (repo) => s.importar(filas, { repo }) },
      { nombre: 'import_b', correr: (repo) => s.importar(filas, { repo }) },
      { nombre: 'manual', correr: (repo) => registrarActividadManualConMotor({ repo, userId: U, challengeId: 'c1', actividad: manual, recordedAt: manual.recorded_at, ...s.comunes }) },
      { nombre: 'eliminar_a1', correr: (repo) => eliminarActividadConMotor({ repo, userId: U, actividadId: A1.id, ...s.comunes }) },
    ];
    const caida = semilla % 4 === 0 ? null : { pedido: semilla % pedidos.length, paso: 1 + (semilla * 7) % 14 };
    const ctx = `semilla ${semilla}${caida ? `, muere ${pedidos[caida.pedido].nombre} en el paso ${caida.paso}` : ''}`;
    const estados = await intercalar({ s, pedidos, semilla, caida, alPaso: () => { pasos += 1; return s.verificarInvariante(ctx); } });
    for (const e of estados) if (e.error) throw new Error(`${ctx}: ${e.nombre}: ${e.error.stack}`);
    await s.converger();
    assert.deepEqual(s.marcas(), [], ctx);
    assert.deepEqual(await s.inconsistentes(), [], ctx);
    await s.verificarInvariante(`${ctx} (final)`);
    assert.ok(s.eventos().every((e) => e.estado === 'hecho'), `${ctx}: evento sin procesar`);
    assert.ok(s.resend.entregadosDe('email_usuario').length <= s.eventos().length && s.expo.entregados.length <= s.eventos().length, `${ctx}: efecto duplicado`);
    assert.ok(s.actividadesDe().filter((a) => a.source === 'strava').length <= 2, `${ctx}: actividades Strava duplicadas`);
    assert.equal(s.fila('uc1').km_base, 30, ctx);
    assert.deepEqual([s.fila('uc3').status, s.fila('uc3').km_completed], ['completed', 120], ctx);
    corridas += 1;
  }
  assert.equal(corridas, 200);
  assert.ok(pasos >= 2000, `verificaciones de la invariante: ${pasos}`);
});

// ---------------------------------------------------------------------------
// Integración: index.js real con la API de Strava simulada
// ---------------------------------------------------------------------------

const STRAVA = (lista) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'korva-strava-'));
  const archivo = path.join(dir, 'strava.json');
  fs.writeFileSync(archivo, JSON.stringify(lista));
  return { archivo, borrar: () => fs.rmSync(dir, { recursive: true, force: true }) };
};
const actStrava = (id, km, start_date = '2026-09-12T08:00:00Z', type = 'Ride') => ({ id, name: `Salida ${id}`, type, distance: km * 1000, moving_time: 1800, start_date });
const tablasIntegracion = (extra = {}) => ({
  users: USUARIOS, user_challenges: [UC1(), UC2(), UC3(), UC4(), UC9()], challenges: CHS, activities: [A1, A9], progreso_eventos: [], ...extra,
});
const importarDesdeApp = (b) => b.pedir({ metodo: 'GET', ruta: `/strava/actividades/${U}` });
const correr = async ({ flag, lista, veces = 1, tablas = tablasIntegracion() }) => {
  const strava = STRAVA(lista);
  const b = await levantarBackend({ flag, tablas, entorno: { PRUEBA_PDF_FALSO: '1', PRUEBA_STRAVA_JSON: strava.archivo } });
  const rs = [];
  try {
    for (let i = 0; i < veces; i++) {
      rs.push(await importarDesdeApp(b));
      await new Promise((r) => setTimeout(r, 300)); // efectos disparados sin esperar
    }
  } finally {
    strava.borrar();
  }
  const salida = await b.cerrar();
  assert.equal(salida.exitCode, 0, salida.logs);
  return { rs, r: rs[0], ...salida, fila: (id) => salida.db.user_challenges.find((x) => x.id === id) };
};
const FLAGS_PROD = 'reanudar,eliminar_actividad,efectos,modalidad,actividad_manual';

test('integración flag OFF (flags productivas actuales): camino viejo, respuesta vieja', async () => {
  const x = await correr({ flag: FLAGS_PROD, lista: [actStrava(9001, 15)] });
  assert.equal(x.r.status, 200);
  assert.deepEqual(Object.keys(x.r.body).sort(), ['actividades', 'importadas', 'mensaje', 'salteadas']);
  assert.equal(x.r.body.importadas, 1);
  // el viejo ignora km_base para completar: max(10 + 15, 40) = 40 < 50 → activo
  assert.deepEqual([x.fila('uc1').status, x.fila('uc1').km_completed], ['active', 40]);
  assert.doesNotMatch(x.logs, /"writer":"strava_import"/);
});

test('integración "strava_import" SIN "efectos": camino viejo y lo deja en el log', async () => {
  const x = await correr({ flag: 'reanudar,eliminar_actividad,strava_import', lista: [actStrava(9002, 3)] });
  assert.equal(x.r.body.progreso, undefined);
  assert.match(x.logs, /"writer":"strava_import","resultado":"ignorado_sin_efectos"/);
});

test('integración flag ON: completa con el motor (km_base), evento strava_import, efectos una vez, sin escrituras viejas', async () => {
  const x = await correr({ flag: `${FLAGS_PROD},strava_import`, lista: [actStrava(9003, 15)] });
  assert.equal(x.r.status, 200);
  assert.deepEqual([x.r.body.importadas, x.r.body.salteadas, x.r.body.actividades.length], [1, 0, 1]);
  assert.match(x.r.body.mensaje, /^1 actividades importadas de Strava/);
  assert.deepEqual([x.r.body.progreso.motor, x.r.body.progreso.recalculo, x.r.body.progreso.completados], [true, 'ok', ['uc1']]);
  assert.deepEqual([x.fila('uc1').status, x.fila('uc1').km_completed, x.fila('uc1').km_base], ['completed', 55, 30]);
  assert.ok(x.db.user_challenges.every((f) => f.recalculo_pendiente_desde === null));
  const ev = x.db.progreso_eventos.filter((e) => e.user_challenge_id === 'uc1');
  assert.deepEqual(ev.map((e) => [e.datos.origen, e.datos.motivo, e.estado]), [['motor', 'strava_import', 'hecho']]);
  assert.deepEqual(x.efectos.certificados.map((c) => c.km), [50]);
  assert.equal(x.efectos.emails.filter((e) => e.para === 'prueba@ejemplo.com').length, 1);
  assert.equal(x.efectos.push.length, 1);
  assert.ok(!x.registro.some((op) => op.tipo === 'update' && op.tabla === 'user_challenges' && op.valores && 'status' in op.valores));
  assert.match(x.logs, /"message":"motor_progreso strava_import importada"/);
});

test('integración flag ON: sincronizar 3 veces las mismas actividades → una fila, un evento, efectos una vez', async () => {
  const x = await correr({ flag: `${FLAGS_PROD},strava_import`, lista: [actStrava(9004, 15), actStrava(9005, 2, '2026-09-11T08:00:00Z')], veces: 3 });
  assert.ok(x.rs.every((r) => r.status === 200 && r.body.importadas === 2));
  assert.deepEqual(x.rs.map((r) => r.body.progreso.completados), [['uc1'], [], []]);
  assert.equal(x.db.activities.filter((a) => a.source === 'strava').length, 2);
  assert.equal(x.db.progreso_eventos.filter((e) => e.tipo === 'completado' && e.user_challenge_id === 'uc1').length, 1);
  assert.equal(x.efectos.emails.filter((e) => e.para === 'prueba@ejemplo.com').length, 1);
  assert.equal(x.efectos.push.length, 1);
  assert.equal(x.fila('uc1').km_completed, 57);
});

test('integración flag ON: anti-duplicados del mismo día con una carga manual (se saltea, como el viejo)', async () => {
  const manualHoy = { id: 'cccccccc-0000-4000-8000-000000000001', user_id: U, source: 'manual', external_id: 'manual_hoy', distance_km: 5.1, recorded_at: '2026-09-12T07:00:00Z', excluida: false };
  const x = await correr({ flag: `${FLAGS_PROD},strava_import`, lista: [actStrava(9006, 5)], tablas: tablasIntegracion({ activities: [A1, A9, manualHoy] }) });
  assert.deepEqual([x.r.body.importadas, x.r.body.salteadas], [0, 1]);
  assert.match(x.r.body.mensaje, /\(1 ya estaban cargadas\)/);
  assert.equal(x.r.body.progreso, undefined); // nada que importar: no marca ni recalcula
  assert.equal(x.db.activities.filter((a) => a.source === 'strava').length, 0);
});
