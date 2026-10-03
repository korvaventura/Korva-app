// Tests del WEBHOOK DE STRAVA con el motor unificado (Etapa 4A-8, con bandeja persistente y lápidas).
//
// Unitarios: repositorio Supabase REAL sobre la base en memoria (RPC atómicas de completitud y de
// guardado/borrado de Strava con lápidas, trigger de legado, espejo de versión) + efectos con dobles.
//  - bandeja: registro idempotente antes del ACK, toma con CAS + arriendo, reintentos, caídas;
//  - create / update / delete, delete ANTES de create (lápida), concurrencia SIN candado (procesos
//    distintos) contra la importación y contra otros writers, caídas en cada punto.
// Integración: index.js real con la API de Strava simulada; webhook por HTTP; caída y reinicio del
// proceso después del ACK (la base se vuelca en el instante de la caída y la usa un proceso nuevo).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
const { crearResendFalso, crearExpoFalso, crearPdfFalso, crearSecuenciaSerial } = require('./helpers/efectosFalsos');
const { levantarBackend } = require('./helpers/backendHijo');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { procesarWebhookStravaConMotor, operacionDeEvento } = require('../lib/webhookStrava');
const {
  claveDeEvento, filaDeEvento, crearRepositorioBandeja, procesarEventoBandeja, recuperarBandeja, ARRIENDO_MS, MAX_INTENTOS, esperaReintentoMs,
} = require('../lib/bandejaWebhookStrava');
const { importarActividadesStravaConMotor } = require('../lib/importacionStrava');
const { registrarActividadManualConMotor } = require('../lib/actividadManual');
const { eliminarActividadConMotor } = require('../lib/eliminarActividad');
const { recalcularProgresoUsuario, MODOS } = require('../lib/progresoServicio');
const { recuperarRecalculosPendientes } = require('../lib/recuperacionRecalculo');
const { crearEfectosCompletado } = require('../lib/efectosCompletado');
const { procesarEventosPendientes } = require('../lib/completionEventos');
const { stravaWebhookMotorActiva, stravaImportMotorActiva, writersActivos, WRITERS_CONOCIDOS } = require('../lib/flagsMotor');
const { sinCandado } = require('../lib/candadoUsuario');
const emails = require('../routes/emails');

// ---------------------------------------------------------------------------
// Escenario (igual que 4A-6 / 4A-7): c1 Estándar 50 / Extendida 150 · c2 Estándar 100 / Extendida 300
//   uc1 activo, Estándar, km_base 30, a1 (02/09, 10 km)                → 40 / 50
//   uc2 activo, Extendida, PAUSADO desde 10/09, pausa cerrada 05–07/09  → 10 / 300
//   uc3 completed (congelado) · uc4 pending · uc9 de OTRO usuario
// ---------------------------------------------------------------------------
const U = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const ATLETA = 777001;
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
  { id: U, name: 'Fabri Prueba', email: 'prueba@ejemplo.com', bib_number: '0042', shipping_address: 'Calle 1', push_token: 'ExponentPushToken[x]', strava_token: 'tok', strava_refresh_token: 'ref', strava_token_expires_at: 4102444800, strava_athlete_id: ATLETA },
  { id: U2, name: 'Otra', email: 'otra@ejemplo.com', bib_number: '0043', shipping_address: null, push_token: null },
];

/** Fila como la arma la ruta a partir de una actividad de Strava. */
const fila = (extId, km, recorded_at = '2026-09-12T08:00:00Z', sport_type = 'ride') => ({
  user_id: U, source: 'strava', external_id: String(extId), sport_type, distance_km: km, duration_seconds: 1800, recorded_at, challenge_id: 'c1',
});
const filaStrava = (extId, km, extra = {}) => ({ id: `bbbbbbbb-0000-4000-8000-${String(extId).padStart(12, '0')}`, ...fila(extId, km), excluida: false, ...extra });
/** Evento del webhook como lo manda Strava. */
const ev = (aspect, objectId, extra = {}) => ({ aspect_type: aspect, object_type: 'activity', object_id: objectId, owner_id: ATLETA, subscription_id: 1, event_time: 1757664000, updates: {}, ...extra });

const montar = ({ ucs = [UC1(), UC2(), UC3(), UC4(), UC9()], actividades = [A1, A9], fallar, lapidas = [] } = {}) => {
  const reloj = { ahora: AHORA };
  const m = crearSupabaseMemoria({
    users: USUARIOS, user_challenges: ucs, challenges: CHS, activities: actividades, progreso_eventos: [],
    strava_webhook_eventos: [], strava_actividades_borradas: lapidas,
  }, { fallar, reloj: () => reloj.ahora });
  const repo = crearRepositorioSupabase(m.cliente);
  const repoLapidas = crearRepositorioSupabase(m.cliente, { lapidasStrava: true });
  const bandeja = crearRepositorioBandeja(m.cliente);
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
  let t = 0;
  const generarToken = () => `tok-${++t}`;
  const logs = [];
  const disparados = [];
  const esperar = async () => {};
  const comunes = { ahoraMs: AHORA, log: (l) => logs.push(l), esperar, generarMarca, candado: sinCandado };
  // Lo que Strava devuelve hoy para cada actividad (un id ausente = 404, como una actividad borrada).
  const stravaApi = new Map();
  const prepararDe = (objectId) => async () => {
    const km = stravaApi.get(String(objectId));
    return km === undefined ? { ignorar: 'no_encontrada_en_strava' } : { fila: fila(objectId, km) };
  };
  /** create/update directo al motor (sin bandeja). */
  const webhook = (f, extra = {}) => procesarWebhookStravaConMotor({
    repo, userId: U, operacion: 'upsert', externalId: f.external_id, prepararFila: async () => ({ fila: f }),
    dispararEfectos: (ids) => disparados.push(...ids), ...comunes, ...extra,
  });
  const borrar = (externalId, extra = {}) => procesarWebhookStravaConMotor({
    repo, userId: U, operacion: 'delete', externalId: String(externalId), ownerId: ATLETA,
    dispararEfectos: (ids) => disparados.push(...ids), ...comunes, ...extra,
  });
  /** La importación de la Home con el webhook en el motor (guardado con lápidas). */
  const importar = (filas, extra = {}) => importarActividadesStravaConMotor({
    repo: repoLapidas, userId: U, filas, dispararEfectos: (ids) => disparados.push(...ids), ...comunes, ...extra,
  });
  /** Igual que manejarEventoBandeja de la ruta (usuario resuelto, Strava simulado). */
  const manejarCon = (r = repo) => async (e) => {
    const operacion = operacionDeEvento(e);
    if (!operacion) return { estado: 'ignorado', resultado: 'evento_no_soportado' };
    if (e.owner_id !== ATLETA) return { estado: 'ignorado', resultado: 'atleta_desconocido' };
    const x = await procesarWebhookStravaConMotor({
      repo: r, userId: U, operacion, externalId: String(e.object_id), ownerId: e.owner_id, eventoId: e.id,
      prepararFila: prepararDe(e.object_id), dispararEfectos: (ids) => disparados.push(...ids), ...comunes, ahoraMs: reloj.ahora,
    });
    if (!x.ok) return { reintentar: true, error: x.error || x.resultado };
    if (x.resultado === 'ignorada') return { estado: 'ignorado', resultado: x.motivo };
    return { estado: 'hecho', resultado: x.resultado };
  };
  /** ACK: registrar en la bandeja (lo que hace la ruta antes de responder 200). */
  const recibir = async (e, b = bandeja) => b.registrar({ fila: filaDeEvento(e, reloj.ahora) });
  const procesarEv = (id, extra = {}) => procesarEventoBandeja({
    repo: bandeja, id, manejar: manejarCon(), reloj: () => reloj.ahora, generarToken, log: (l) => logs.push(l), ...extra,
  });
  const recuperar = (extra = {}) => recuperarBandeja({
    repo: bandeja, manejar: manejarCon(), reloj: () => reloj.ahora, generarToken, log: (l) => logs.push(l), ...extra,
  });
  const procesar = (extra = {}) => procesarEventosPendientes({ repo, efectos, ahoraMs: reloj.ahora, generarToken: generarMarca, ...extra });
  const fila_ = (id) => m.db.user_challenges.find((x) => x.id === id);
  const marcas = () => m.db.user_challenges.filter((x) => x.recalculo_pendiente_desde !== null).map((x) => x.id).sort();
  const eventos = () => m.db.progreso_eventos.filter((e) => e.tipo === 'completado');
  const actividadesDe = (userId = U) => m.db.activities.filter((a) => a.user_id === userId);
  const strava = (extId) => m.db.activities.filter((a) => a.external_id === String(extId));
  const bandejaFilas = () => m.db.strava_webhook_eventos;
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
    // Lápida ⇒ la actividad (si existe) está excluida.
    for (const l of m.db.strava_actividades_borradas) {
      for (const a of m.db.activities.filter((x) => x.external_id === l.external_id)) assert.equal(a.excluida, true, `${ctx}: ${l.external_id} con lápida y contando`);
    }
  };
  const converger = async () => {
    reloj.ahora = Math.max(reloj.ahora, AHORA) + 10 * MIN; // el reloj nunca retrocede
    for (let i = 0; i < 5 && marcas().length > 0; i++) {
      await recuperarRecalculosPendientes({ repo: crearRepositorioSupabase(m.cliente), ahoraMs: reloj.ahora, log: () => {}, esperar });
    }
    reloj.ahora += 10 * MIN;
    await procesar();
  };
  /** Pasa el tiempo y corre la recuperación de la bandeja hasta que no queden vencidos. */
  const drenarBandeja = async () => {
    for (let i = 0; i < MAX_INTENTOS + 2; i++) {
      reloj.ahora += ARRIENDO_MS + 61 * MIN;
      const r = await recuperar();
      if (r.revisados === 0) break;
    }
  };
  return {
    m, repo, repoLapidas, bandeja, logs, disparados, comunes, stravaApi, webhook, borrar, importar, manejarCon, recibir, procesarEv, recuperar,
    procesar, fila: fila_, marcas, eventos, actividadesDe, strava, bandejaFilas, inconsistentes, verificarInvariante, converger, drenarBandeja,
    resend, expo, kmCertificados, reloj, generarToken,
  };
};

const conGanchos = (repo, gancho, estado = { llamadas: 0, murio: false }) => {
  const envuelto = {};
  for (const [nombre, fn] of Object.entries(repo)) {
    envuelto[nombre] = async (...args) => {
      if (estado.murio) return new Promise(() => {});
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
const sinEscriturasViejas = (s) => !s.m.registro.some((op) => op.tipo === 'update' && op.tabla === 'user_challenges' && op.valores && 'status' in op.valores);

/** Intercala operaciones de varios pedidos según una semilla; uno puede morir en su paso N. Sin candado: procesos distintos. */
const intercalar = async ({ s, pedidos, semilla, caida, alPaso }) => {
  let x = (semilla * 2654435761) >>> 0 || 1;
  const azar = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const estados = pedidos.map((p) => ({ nombre: p.nombre, esperando: null, terminado: false, pasos: 0 }));
  estados.forEach((e, i) => {
    const envolver = (original) => {
      const r = {};
      for (const [nombre, fn] of Object.entries(original)) {
        r[nombre] = async (...args) => {
          e.pasos += 1;
          if (caida && caida.pedido === i && caida.paso === e.pasos) { e.terminado = true; e.murio = true; return new Promise(() => {}); }
          await new Promise((res) => { e.esperando = res; });
          return fn(...args);
        };
      }
      return r;
    };
    pedidos[i].correr(envolver(s.repo), envolver(s.repoLapidas)).then((res) => { e.terminado = true; e.resultado = res; }, (err) => { e.terminado = true; e.error = err; });
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

// ---------------------------------------------------------------------------
// Flags y eventos
// ---------------------------------------------------------------------------

test('flags: strava_webhook entra al motor SOLO con "efectos"; apagado por defecto; independiente de strava_import', () => {
  assert.ok(WRITERS_CONOCIDOS.includes('strava_webhook'));
  assert.equal(stravaWebhookMotorActiva({}), false);
  assert.equal(stravaWebhookMotorActiva({ MOTOR_PROGRESO_WRITERS: 'reanudar,eliminar_actividad,efectos,modalidad,actividad_manual,strava_import' }), false);
  assert.equal(stravaWebhookMotorActiva({ MOTOR_PROGRESO_WRITERS: 'strava_webhook' }), false);
  assert.equal(stravaWebhookMotorActiva({ MOTOR_PROGRESO_WRITERS: 'efectos,strava_webhook' }), true);
  assert.equal(stravaImportMotorActiva({ MOTOR_PROGRESO_WRITERS: 'efectos,strava_webhook' }), false);
  assert.deepEqual(writersActivos({ MOTOR_PROGRESO_WRITERS: 'efectos, Strava_Webhook' }), ['efectos', 'strava_webhook']);
});

test('eventos de Strava: create/update → upsert, delete → delete, atleta y desconocidos → ignorados; cuerpo inválido no se registra', () => {
  assert.equal(operacionDeEvento({ object_type: 'activity', aspect_type: 'create' }), 'upsert');
  assert.equal(operacionDeEvento({ object_type: 'activity', aspect_type: 'update', updates: { title: 'x' } }), 'upsert');
  assert.equal(operacionDeEvento({ object_type: 'activity', aspect_type: 'delete' }), 'delete');
  assert.equal(operacionDeEvento({ object_type: 'athlete', aspect_type: 'update', updates: { authorized: 'false' } }), null);
  assert.equal(operacionDeEvento({ object_type: 'activity', aspect_type: 'otro' }), null);
  assert.equal(operacionDeEvento(null), null);
  assert.equal(filaDeEvento({ object_type: 'activity', aspect_type: 'create', object_id: 'x', owner_id: 1 }), null);
  assert.equal(filaDeEvento({ object_type: 'activity', aspect_type: 'create', object_id: 5 }), null);
  assert.equal(filaDeEvento(ev('create', 10)).object_id, 10);
});

// ---------------------------------------------------------------------------
// Bandeja: persistencia antes del ACK, toma, reintentos, caídas
// ---------------------------------------------------------------------------

test('ACK: el evento queda guardado (pendiente); el MISMO evento reenviado por Strava no se duplica; otro event_time sí es otro', async () => {
  const s = montar();
  const a = await s.recibir(ev('create', 100));
  const b = await s.recibir(ev('create', 100));
  const c = await s.recibir(ev('create', 100, { updates: {} }));
  assert.equal(a.id, b.id);
  assert.equal(a.id, c.id);
  assert.equal(a.estado, 'pendiente');
  assert.equal(s.bandejaFilas().length, 1);
  assert.equal(claveDeEvento(ev('update', 100, { updates: { title: 'a', type: 'Run' } })), claveDeEvento(ev('update', 100, { updates: { type: 'Run', title: 'a' } })));
  await s.recibir(ev('update', 100, { event_time: 1757664999, updates: { title: 'Nuevo' } }));
  assert.equal(s.bandejaFilas().length, 2);
  // Nada se aplicó todavía: solo quedó registrado.
  assert.deepEqual([s.strava(100).length, s.fila('uc1').km_completed, s.marcas()], [0, 40, []]);
});

test('procesar: pendiente → procesando → hecho; reprocesar un hecho no hace nada', async () => {
  const s = montar();
  s.stravaApi.set('110', 15);
  const { id } = await s.recibir(ev('create', 110));
  const r = await s.procesarEv(id);
  assert.deepEqual([r.resultado, r.cerrado, r.intentos], ['hecho', true, 1]);
  const f = s.bandejaFilas()[0];
  assert.deepEqual([f.estado, f.resultado, f.intentos], ['hecho', 'escrita', 1]);
  assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed, s.eventos().length], ['completed', 55, 1]);
  const operaciones = s.m.registro.length;
  assert.equal((await s.procesarEv(id)).resultado, 'ya_cerrado');
  assert.ok(s.m.registro.slice(operaciones).every((op) => op.tipo === 'select'));
  await s.recibir(ev('create', 110)); // Strava lo reenvía después de procesado: no se reabre
  assert.equal(s.bandejaFilas()[0].estado, 'hecho');
});

test('caída DESPUÉS del ACK y antes de procesar: el evento sigue pendiente y la recuperación lo procesa (una vez)', async () => {
  const s = montar();
  s.stravaApi.set('120', 15);
  await s.recibir(ev('create', 120)); // el proceso muere acá: nunca llama a procesar
  assert.equal(s.bandejaFilas()[0].estado, 'pendiente');
  const r = await s.recuperar();
  assert.equal(r.revisados, 1);
  assert.equal(s.bandejaFilas()[0].estado, 'hecho');
  await s.converger();
  assert.deepEqual([s.fila('uc1').status, s.eventos().length, s.eventos()[0].estado], ['completed', 1, 'hecho']);
  assert.deepEqual([s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1]);
  assert.equal((await s.recuperar()).revisados, 0);
});

test('caída A MITAD del proceso: no se retoma antes de que venza el arriendo; después otro proceso lo retoma y el viejo no pisa el cierre', async () => {
  const s = montar();
  s.stravaApi.set('130', 15);
  const { id } = await s.recibir(ev('create', 130));
  let revivir;
  const colgado = new Promise((r) => { revivir = r; });
  const viejo = s.procesarEv(id, { manejar: async () => { await colgado; return { estado: 'hecho', resultado: 'viejo' }; } });
  await esperarHasta(() => s.bandejaFilas()[0].estado === 'procesando');
  s.reloj.ahora += ARRIENDO_MS - MIN;
  assert.equal((await s.recuperar()).revisados, 0, 'arriendo vigente: nadie lo toma');
  s.reloj.ahora += 2 * MIN;
  const r = await s.recuperar();
  assert.equal(r.resultados[0].resultado, 'hecho');
  assert.match(JSON.stringify(s.logs), /arriendo_vencido_retomado/);
  revivir();
  const rv = await viejo;
  assert.equal(rv.cerrado, false, 'el proceso viejo no pisa el cierre del nuevo');
  assert.deepEqual([s.bandejaFilas()[0].estado, s.bandejaFilas()[0].resultado, s.bandejaFilas()[0].intentos], ['hecho', 'escrita', 2]);
  assert.equal(s.strava(130).length, 1);
});

test('dos procesos toman el MISMO evento a la vez: solo uno lo aplica', async () => {
  const s = montar();
  s.stravaApi.set('140', 15);
  const { id } = await s.recibir(ev('create', 140));
  let aplicados = 0;
  const manejar = s.manejarCon();
  const contar = async (e) => { aplicados += 1; return manejar(e); };
  const rs = await Promise.all([s.procesarEv(id, { manejar: contar }), s.procesarEv(id, { manejar: contar }), s.recuperar({ manejar: contar })]);
  assert.equal(aplicados, 1);
  assert.equal(rs.filter((r) => r.resultado === 'hecho').length + (rs[2].resultados || []).filter((r) => r.resultado === 'hecho').length, 1);
  assert.deepEqual([s.eventos().length, s.strava(140).length], [1, 1]);
});

test('fallas transitorias: reintentos con espera creciente; después de MAX_INTENTOS queda en "error" (no se pierde)', async () => {
  const s = montar();
  const { id } = await s.recibir(ev('create', 150));
  const fallar = async () => { throw new Error('Strava respondió 503'); };
  let r = await s.procesarEv(id, { manejar: fallar });
  assert.equal(r.resultado, 'pendiente');
  assert.equal(Date.parse(s.bandejaFilas()[0].siguiente_intento_at) - s.reloj.ahora, esperaReintentoMs(1));
  assert.equal((await s.procesarEv(id, { manejar: fallar })).resultado, 'no_vencido');
  for (let i = 2; i <= MAX_INTENTOS; i++) {
    s.reloj.ahora += esperaReintentoMs(i - 1);
    r = await s.procesarEv(id, { manejar: fallar });
  }
  assert.equal(r.resultado, 'error');
  assert.deepEqual([s.bandejaFilas()[0].estado, s.bandejaFilas()[0].intentos, s.bandejaFilas()[0].ultimo_error], ['error', MAX_INTENTOS, 'Strava respondió 503']);
  assert.deepEqual([s.marcas(), s.strava(150).length], [[], 0]);
});

test('ignorados (atleta desconocido, no encontrada en Strava): "ignorado", no se reintentan ni escriben', async () => {
  const s = montar();
  const a = await s.recibir(ev('create', 160, { owner_id: 1 }));
  const b = await s.recibir(ev('create', 161)); // Strava responde 404
  assert.equal((await s.procesarEv(a.id)).resultado, 'ignorado');
  assert.equal((await s.procesarEv(b.id)).resultado, 'ignorado');
  assert.deepEqual(s.bandejaFilas().map((f) => f.resultado), ['atleta_desconocido', 'no_encontrada_en_strava']);
  assert.ok(!s.m.registro.some((op) => op.tabla === 'user_challenges' && op.tipo === 'update'));
  s.reloj.ahora += 2 * 60 * MIN;
  assert.equal((await s.recuperar()).revisados, 0);
});

test('Strava reintenta el mismo evento ANTES, DURANTE y DESPUÉS de procesarlo: una fila en la bandeja, aplicado una vez, efectos una vez', async () => {
  const s = montar();
  s.stravaApi.set('170', 15);
  const a = await s.recibir(ev('create', 170));
  await s.recibir(ev('create', 170));
  const p = s.procesarEv(a.id);
  await s.recibir(ev('create', 170));
  await p;
  await s.recibir(ev('create', 170));
  await s.recuperar();
  await s.converger();
  assert.equal(s.bandejaFilas().length, 1);
  assert.deepEqual([s.strava(170).length, s.eventos().length], [1, 1]);
  assert.deepEqual([s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1]);
});

// ---------------------------------------------------------------------------
// create / update / delete (motor)
// ---------------------------------------------------------------------------

test('create que NO completa: suma 1:1 a los activos, sin eventos ni marcas; el pausado no suma lo posterior', async () => {
  const s = montar();
  const r = await s.webhook(fila(201, 3));
  assert.deepEqual([r.ok, r.resultado, r.insertada, r.progreso.recalculo, r.progreso.completados, r.eventos.length], [true, 'escrita', true, 'ok', [], 0]);
  assert.equal(s.fila('uc1').km_completed, 43);
  assert.equal(s.fila('uc2').km_completed, 10);
  assert.deepEqual([s.fila('uc3').km_completed, s.fila('uc4').km_completed, s.fila('uc9').km_completed], [120, 0, 3]);
  assert.deepEqual([s.marcas(), s.eventos().length, s.disparados.length], [[], 0, 0]);
  const uc1 = r.desafios.find((d) => d.user_challenge_id === 'uc1');
  assert.deepEqual([uc1.status_leido, uc1.accion, uc1.escrito, uc1.km_antes, uc1.km_despues], ['active', 'actualizar_km', true, 40, 43]);
  assert.ok(sinEscriturasViejas(s));
  assert.equal((await s.webhook(fila(201, 3))).insertada, false, 'reprocesar: ya no es nueva (sin push de racha)');
});

test('create que COMPLETA: RPC + UN evento motor (strava_webhook); efectos una vez con la distancia de la versión; km_base intacto', async () => {
  const s = montar();
  const r = await s.webhook(fila(202, 15));
  assert.deepEqual(r.progreso.completados, ['uc1']);
  assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed], ['completed', 55]);
  assert.equal(s.eventos().length, 1);
  assert.deepEqual([s.eventos()[0].datos.origen, s.eventos()[0].datos.motivo], ['motor', 'strava_webhook']);
  assert.deepEqual(s.disparados, [s.eventos()[0].id]);
  assert.ok(sinEscriturasViejas(s));
  await s.procesar({ ids: s.disparados });
  assert.deepEqual(s.kmCertificados, [50]);
  assert.deepEqual([s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1]);
  assert.equal(s.fila('uc1').km_base, 30);
  assert.ok(!s.m.registro.some((op) => op.tipo !== 'select' && op.valores && 'km_base' in op.valores));
});

test('update que SUBE y que BAJA la distancia: la misma fila se reescribe y el motor ajusta los km (sin Math.max)', async () => {
  const s = montar();
  await s.webhook(fila(301, 5));
  assert.equal(s.fila('uc1').km_completed, 45);
  await s.webhook(fila(301, 8));
  assert.deepEqual([s.strava(301).length, s.strava(301)[0].distance_km, s.fila('uc1').km_completed], [1, 8, 48]);
  await s.webhook(fila(301, 3));
  assert.deepEqual([s.strava(301).length, s.fila('uc1').km_completed], [1, 43]);
  assert.deepEqual([s.marcas(), s.eventos().length], [[], 0]);
});

test('update de una actividad que el usuario eliminó en Korva: sigue excluida y no suma', async () => {
  const s = montar({ actividades: [A1, A9, filaStrava(401, 15, { excluida: true })] });
  const r = await s.webhook(fila(401, 16));
  assert.deepEqual([r.resultado, r.detalle.excluida], ['escrita', true]);
  assert.deepEqual([s.strava(401)[0].excluida, s.strava(401)[0].distance_km], [true, 16]);
  assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed, s.eventos().length], ['active', 40, 0]);
});

test('delete: lápida + excluye la actividad (no borra la fila), bajan los km; repetir el delete es idempotente', async () => {
  const s = montar({ actividades: [A1, A9, filaStrava(501, 6)], ucs: [UC1({ km_completed: 46 }), UC2(), UC3(), UC4(), UC9()] });
  const r = await s.borrar(501);
  assert.deepEqual([r.ok, r.resultado, r.detalle], [true, 'escrita', { lapida_nueva: true, excluidas: 1 }]);
  assert.deepEqual([s.strava(501).length, s.strava(501)[0].excluida], [1, true]);
  assert.deepEqual(s.m.db.strava_actividades_borradas.map((l) => [l.external_id, l.owner_id, l.user_id]), [['501', ATLETA, U]]);
  assert.deepEqual([s.fila('uc1').km_completed, s.marcas()], [40, []]);
  const r2 = await s.borrar(501);
  assert.deepEqual(r2.detalle, { lapida_nueva: false, excluidas: 0 });
  assert.deepEqual([s.m.db.strava_actividades_borradas.length, s.fila('uc1').km_completed, s.marcas()], [1, 40, []]);
});

test('delete de una actividad de OTRO usuario: deja la lápida pero no toca su fila', async () => {
  const s = montar({ actividades: [A1, A9, { ...filaStrava(602, 6), user_id: U2 }] });
  const r = await s.borrar(602);
  assert.deepEqual(r.detalle, { lapida_nueva: true, excluidas: 0 });
  assert.equal(s.strava(602)[0].excluida, false);
});

test('delete después de completar: el terminal queda CONGELADO (status, km, un solo evento)', async () => {
  const s = montar();
  await s.webhook(fila(701, 15));
  await s.procesar({ ids: s.disparados });
  await s.borrar(701);
  assert.equal(s.strava(701)[0].excluida, true);
  assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed, s.eventos().length], ['completed', 55, 1]);
  await s.converger();
  assert.deepEqual([s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1]);
});

test('Estándar / Extendida y cualquier deporte 1:1: el mismo create completa la Estándar y no la Extendida', async () => {
  const est = montar();
  await est.webhook(fila(801, 15, undefined, 'walk'));
  assert.deepEqual([est.fila('uc1').status, est.fila('uc1').km_completed], ['completed', 55]);
  const ext = montar({ ucs: [UC1({ version: 'extendida', modalidad: 'ride' }), UC2(), UC3(), UC4(), UC9()] });
  await ext.webhook(fila(801, 15, undefined, 'walk'));
  assert.deepEqual([ext.fila('uc1').status, ext.fila('uc1').km_completed, ext.eventos().length], ['active', 55, 0]);
});

test('pausas: el pausado nunca se completa; lo de una pausa cerrada no suma; lo anterior a pausado_at sí', async () => {
  const s = montar({ ucs: [UC1(), UC2({ km_base: 295, km_base_motivo: 'legado_historico', km_completed: 305 }), UC3(), UC4(), UC9()] });
  await s.webhook(fila(901, 50, '2026-09-09T08:00:00Z'));
  assert.deepEqual([s.fila('uc2').status, s.fila('uc2').km_completed], ['active', 355]);
  const cerrada = montar();
  await cerrada.webhook(fila(902, 6, '2026-09-06T08:00:00Z'));
  assert.deepEqual([cerrada.fila('uc2').km_completed, cerrada.fila('uc1').km_completed], [10, 46]);
});

test('fallas sin caída: Strava no responde / ignorada → no marca ni escribe; no se puede marcar → no escribe; falla la RPC → marcas quedan y se limpian', async () => {
  const s = montar();
  const r1 = await s.webhook(fila(1001, 5), { prepararFila: async () => { throw new Error('Strava no respondió en 30 s (token + actividad)'); } });
  assert.deepEqual([r1.ok, r1.resultado], [false, 'no_se_pudo_leer_strava']);
  const r2 = await s.webhook(fila(1001, 5), { prepararFila: async () => ({ ignorar: 'sin_distancia' }) });
  assert.deepEqual([r2.ok, r2.resultado, r2.motivo], [true, 'ignorada', 'sin_distancia']);
  assert.ok(s.m.registro.every((op) => op.tipo === 'select'));

  const sinMarcar = montar({ fallar: (op) => op.tabla === 'user_challenges' && op.tipo === 'update' && op.valores && op.valores.recalculo_pendiente_desde });
  assert.equal((await sinMarcar.webhook(fila(1101, 15))).resultado, 'no_se_pudo_marcar');
  assert.equal((await sinMarcar.borrar(1102)).resultado, 'no_se_pudo_marcar');
  assert.deepEqual([sinMarcar.strava(1101).length, sinMarcar.m.db.strava_actividades_borradas.length], [0, 0]);

  const rpcFalla = montar({ fallar: (op) => op.tabla === 'rpc' && ['guardar_actividad_strava', 'borrar_actividad_strava'].includes(op.nombre) });
  assert.equal((await rpcFalla.webhook(fila(1201, 15))).resultado, 'no_se_pudo_escribir');
  assert.deepEqual(rpcFalla.marcas(), ['uc1', 'uc2']);
  await rpcFalla.verificarInvariante('rpc fallida');
  await rpcFalla.converger();
  assert.deepEqual([rpcFalla.marcas(), rpcFalla.fila('uc1').km_completed, rpcFalla.eventos().length], [[], 40, 0]);
});

test('fallan todos los intentos de recálculo: actividad guardada, "pendiente"; la recuperación completa y procesa efectos UNA vez', async () => {
  let fallas = 0;
  const s = montar({ fallar: (op) => op.tabla === 'activities' && op.tipo === 'select' && fallas++ < 3 });
  const r = await s.webhook(fila(1301, 15));
  assert.deepEqual([r.ok, r.resultado, r.progreso.recalculo], [true, 'escrita', 'pendiente']);
  assert.deepEqual(s.marcas(), ['uc1', 'uc2']);
  await s.converger();
  assert.deepEqual([s.fila('uc1').status, s.eventos().length, s.eventos()[0].estado, s.marcas().length], ['completed', 1, 'hecho', 0]);
  assert.deepEqual([s.resend.entregadosDe('email_usuario').length, s.expo.entregados.length], [1, 1]);
});

// ---------------------------------------------------------------------------
// delete ANTES de create (lápida persistente) y concurrencia entre procesos (sin candado)
// ---------------------------------------------------------------------------

test('delete ANTES de create: la lápida queda en la base y el create / update / importación posteriores la guardan EXCLUIDA', async () => {
  const s = montar();
  const r = await s.borrar(1401);
  assert.deepEqual([r.resultado, r.detalle], ['escrita', { lapida_nueva: true, excluidas: 0 }]);
  assert.equal(s.strava(1401).length, 0);
  const c = await s.webhook(fila(1401, 15));
  assert.deepEqual([c.insertada, c.detalle.excluida, c.detalle.lapida], [true, true, true]);
  await s.webhook(fila(1401, 16));
  await s.importar([fila(1401, 16)]);
  assert.deepEqual([s.strava(1401).length, s.strava(1401)[0].excluida], [1, true]);
  assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed, s.eventos().length, s.marcas()], ['active', 40, 0, []]);
  // Una lápida que ya estaba en la base (de otro proceso / instancia) tiene el mismo efecto.
  const otra = montar({ lapidas: [{ external_id: '1402', owner_id: ATLETA, user_id: U, borrado_at: '2026-09-12T11:00:00Z' }] });
  await otra.importar([fila(1402, 15)]);
  assert.deepEqual([otra.strava(1402)[0].excluida, otra.fila('uc1').km_completed], [true, 40]);
});

test('create + delete de la MISMA actividad en procesos distintos (sin candado), 300 intercalados con caídas: nunca termina contando', async () => {
  let corridas = 0;
  let completadosAntes = 0;
  for (let semilla = 1; semilla <= 300; semilla++) {
    const s = montar();
    const pedidos = [
      { nombre: 'create', correr: (repo) => s.webhook(fila(1501, 15), { repo }) },
      { nombre: 'delete', correr: (repo) => s.borrar(1501, { repo }) },
      { nombre: 'import', correr: (_r, repoLapidas) => s.importar([fila(1501, 15)], { repo: repoLapidas }) },
    ];
    // La caída solo afecta al create o a la importación: el delete está en la bandeja y se reintenta abajo.
    const caida = semilla % 3 === 0 ? null : { pedido: semilla % 2 === 0 ? 0 : 2, paso: 1 + (semilla * 7) % 8 };
    const ctx = `semilla ${semilla}${caida ? `, muere ${pedidos[caida.pedido].nombre} en el paso ${caida.paso}` : ''}`;
    const estados = await intercalar({ s, pedidos, semilla, caida, alPaso: () => s.verificarInvariante(ctx) });
    for (const e of estados) if (e.error) throw new Error(`${ctx}: ${e.nombre}: ${e.error.stack}`);
    await s.converger();
    await s.verificarInvariante(`${ctx} (final)`);
    assert.deepEqual(s.marcas(), [], ctx);
    assert.deepEqual(await s.inconsistentes(), [], ctx);
    assert.ok(s.strava(1501).every((a) => a.excluida === true), `${ctx}: la actividad borrada cuenta`);
    assert.ok(s.strava(1501).length <= 1, ctx);
    // Si el create llegó a completar ANTES del delete, el terminal queda congelado (regla del motor);
    // si no, la actividad borrada nunca suma.
    const final = [s.fila('uc1').status, s.fila('uc1').km_completed, s.eventos().length];
    assert.ok(JSON.stringify(final) === JSON.stringify(['active', 40, 0]) || JSON.stringify(final) === JSON.stringify(['completed', 55, 1]), `${ctx}: ${final}`);
    if (final[0] === 'completed') completadosAntes += 1;
    corridas += 1;
  }
  assert.equal(corridas, 300);
  assert.ok(completadosAntes > 0 && completadosAntes < 300, `se cubren los dos órdenes (completados antes del delete: ${completadosAntes})`);
});

test('importación de la Home vs webhook (create, update, delete de otra) SIN candado + manual + eliminar, 200 intercalados con caídas', async () => {
  let corridas = 0;
  let pasos = 0;
  for (let semilla = 1; semilla <= 200; semilla++) {
    const s = montar({ actividades: [A1, A9, filaStrava(1602, 2, { recorded_at: '2026-09-11T08:00:00Z' })], ucs: [UC1({ km_completed: 42 }), UC2(), UC3(), UC4(), UC9()] });
    const f = fila(1601, 9);
    const manual = {
      user_id: U, challenge_id: 'c1', source: 'manual', external_id: `manual_intercalado_${semilla}`, sport_type: 'walk', distance_km: 4,
      duration_seconds: null, recorded_at: '2026-09-12T09:00:00.000Z', evidencia_url: null,
    };
    const pedidos = [
      { nombre: 'webhook_create', correr: (repo) => s.webhook(f, { repo }) },
      { nombre: 'webhook_update', correr: (repo) => s.webhook(fila(1601, 10), { repo }) },
      { nombre: 'import', correr: (_r, repoLapidas) => s.importar([f, fila(1602, 2, '2026-09-11T08:00:00Z')], { repo: repoLapidas }) },
      { nombre: 'manual', correr: (repo) => registrarActividadManualConMotor({ repo, userId: U, challengeId: 'c1', actividad: manual, recordedAt: manual.recorded_at, ...s.comunes }) },
      { nombre: 'delete_1602', correr: (repo) => s.borrar(1602, { repo }) },
      { nombre: 'eliminar_a1', correr: (repo) => eliminarActividadConMotor({ repo, userId: U, actividadId: A1.id, ...s.comunes }) },
    ];
    const caida = semilla % 4 === 0 ? null : { pedido: [0, 1, 2, 3, 5][semilla % 5], paso: 1 + (semilla * 7) % 12 };
    const ctx = `semilla ${semilla}${caida ? `, muere ${pedidos[caida.pedido].nombre} en el paso ${caida.paso}` : ''}`;
    const estados = await intercalar({ s, pedidos, semilla, caida, alPaso: () => { pasos += 1; return s.verificarInvariante(ctx); } });
    for (const e of estados) if (e.error) throw new Error(`${ctx}: ${e.nombre}: ${e.error.stack}`);
    await s.converger();
    assert.deepEqual(s.marcas(), [], ctx);
    assert.deepEqual(await s.inconsistentes(), [], ctx);
    await s.verificarInvariante(`${ctx} (final)`);
    assert.ok(s.eventos().every((e) => e.estado === 'hecho'), `${ctx}: evento sin procesar`);
    assert.ok(s.resend.entregadosDe('email_usuario').length <= s.eventos().length && s.expo.entregados.length <= s.eventos().length, `${ctx}: efecto duplicado`);
    assert.ok(s.strava(1601).length <= 1, `${ctx}: actividad Strava duplicada`);
    assert.equal(s.strava(1602)[0].excluida, true, `${ctx}: el delete se perdió`);
    assert.equal(s.fila('uc1').km_base, 30, ctx);
    assert.deepEqual([s.fila('uc3').status, s.fila('uc3').km_completed], ['completed', 120], ctx);
    corridas += 1;
  }
  assert.equal(corridas, 200);
  assert.ok(pasos >= 2000, `verificaciones de la invariante: ${pasos}`);
});

// ---------------------------------------------------------------------------
// Caídas en CADA punto del procesamiento (bandeja + motor) y recuperación
// ---------------------------------------------------------------------------

const caidaEnCadaPunto = async ({ nombre, preparar, evento, verificarFinal }) => {
  const medir = montar();
  preparar(medir);
  const { id: idMedir } = await medir.recibir(evento);
  const contador = { llamadas: 0, murio: false };
  const b0 = conGanchos(medir.bandeja, async () => {}, contador);
  const r0 = conGanchos(medir.repo, async () => {}, contador);
  await procesarEventoBandeja({ repo: b0.repo, id: idMedir, manejar: medir.manejarCon(r0.repo), reloj: () => medir.reloj.ahora, generarToken: medir.generarToken, log: () => {} });
  const total = contador.llamadas;
  assert.ok(total >= 8, `${nombre}: se esperaban al menos 8 operaciones, hubo ${total}`);
  for (let k = 1; k <= total; k++) {
    for (const momento of ['antes', 'despues']) {
      const s = montar();
      preparar(s);
      const { id } = await s.recibir(evento);
      const estado = { llamadas: 0, murio: false };
      const gancho = async (_n, fase, j) => (j === k && fase === momento ? 'morir' : undefined);
      const b = conGanchos(s.bandeja, gancho, estado);
      const r = conGanchos(s.repo, gancho, estado);
      procesarEventoBandeja({ repo: b.repo, id, manejar: s.manejarCon(r.repo), reloj: () => s.reloj.ahora, generarToken: s.generarToken, log: () => {} });
      await esperarHasta(() => estado.murio);
      const ctx = `${nombre}: caída ${momento} de la operación ${k}/${total}`;
      await s.verificarInvariante(ctx);
      // Proceso nuevo: recuperación de marcas y de la bandeja (pasa el arriendo).
      await s.converger();
      await s.drenarBandeja();
      await s.converger();
      // Strava además puede reenviar el evento: no cambia nada.
      await s.recibir(evento);
      await s.drenarBandeja();
      assert.deepEqual(s.marcas(), [], ctx);
      assert.deepEqual(await s.inconsistentes(), [], ctx);
      await s.verificarInvariante(`${ctx} (final)`);
      assert.deepEqual(s.bandejaFilas().map((f) => f.estado), ['hecho'], ctx);
      verificarFinal(s, ctx);
      assert.equal(s.fila('uc1').km_base, 30, ctx);
    }
  }
};

test('caída en CADA punto de un CREATE que completa (bandeja + motor): la recuperación lo termina; efectos una vez', async () => {
  await caidaEnCadaPunto({
    nombre: 'create',
    preparar: (s) => s.stravaApi.set('1701', 15),
    evento: ev('create', 1701),
    verificarFinal: (s, ctx) => {
      assert.deepEqual([s.fila('uc1').status, s.fila('uc1').km_completed, s.strava(1701).length, s.eventos().length], ['completed', 55, 1, 1], ctx);
      assert.equal(s.eventos()[0].estado, 'hecho', ctx);
      assert.ok(s.resend.entregadosDe('email_usuario').length === 1 && s.expo.entregados.length === 1, `${ctx}: efectos ${s.resend.entregadosDe('email_usuario').length}/${s.expo.entregados.length}`);
    },
  });
});

test('caída en CADA punto de un DELETE (bandeja + motor): la recuperación lo termina; la actividad nunca vuelve a contar', async () => {
  await caidaEnCadaPunto({
    nombre: 'delete',
    preparar: (s) => {
      s.m.db.activities.push(filaStrava(1801, 6));
      s.fila('uc1').km_completed = 46;
    },
    evento: ev('delete', 1801),
    verificarFinal: (s, ctx) => {
      assert.deepEqual([s.strava(1801)[0].excluida, s.m.db.strava_actividades_borradas.length, s.fila('uc1').km_completed], [true, 1, 40], ctx);
    },
  });
});

// ---------------------------------------------------------------------------
// Integración: index.js real, webhook por HTTP, API de Strava simulada
// ---------------------------------------------------------------------------

const STRAVA = (lista) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'korva-strava-'));
  const archivo = path.join(dir, 'strava.json');
  fs.writeFileSync(archivo, JSON.stringify(lista));
  return { archivo, borrar: () => fs.rmSync(dir, { recursive: true, force: true }) };
};
const actStrava = (id, km, start_date = '2026-09-12T08:00:00Z', type = 'Ride') => ({ id, name: `Salida ${id}`, type, distance: km * 1000, moving_time: 1800, start_date });
const tablasIntegracion = (extra = {}) => ({
  users: USUARIOS, user_challenges: [UC1(), UC2(), UC3(), UC4(), UC9()], challenges: CHS, activities: [A1, A9], progreso_eventos: [],
  strava_webhook_eventos: [], strava_actividades_borradas: [], ...extra,
});
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/** pasos: funciones (b) => pedido; un array de funciones va en paralelo. */
const correr = async ({ flag, lista, pasos, tablas = tablasIntegracion(), entorno = {}, caida = false, esperaFinalMs = 0 }) => {
  const strava = STRAVA(lista);
  const b = await levantarBackend({ flag, tablas, entorno: { PRUEBA_PDF_FALSO: '1', PRUEBA_STRAVA_JSON: strava.archivo, ...entorno } });
  const rs = [];
  try {
    for (const paso of pasos) {
      if (Array.isArray(paso)) rs.push(...(await Promise.all(paso.map((p) => p(b)))));
      else rs.push(await paso(b));
      if (!caida) await dormir(150);
    }
    if (esperaFinalMs) await dormir(esperaFinalMs);
  } finally {
    strava.borrar();
  }
  const salida = await b.cerrar({ caida });
  assert.equal(salida.exitCode, 0, salida.logs);
  return {
    rs, ...salida,
    fila: (id) => salida.db.user_challenges.find((x) => x.id === id),
    strava: (id) => salida.db.activities.filter((a) => a.external_id === String(id)),
    bandeja: () => salida.db.strava_webhook_eventos || [],
  };
};
const hook = (e) => (b) => b.pedir({ metodo: 'POST', ruta: '/strava/webhook', body: e });
const homeImporta = (b) => b.pedir({ metodo: 'GET', ruta: `/strava/actividades/${U}` });
const homeVieja = (b) => b.pedir({ metodo: 'GET', ruta: `/strava/progreso/${U}` });
const FLAGS_PROD = 'reanudar,eliminar_actividad,efectos,modalidad,actividad_manual,strava_import';
const FLAG_ON = `${FLAGS_PROD},strava_webhook`;
const RECUPERACION_RAPIDA = { STRAVA_WEBHOOK_RECUPERACION_MS: '200', STRAVA_WEBHOOK_RECUPERACION_INICIAL_MS: '100' };
const pushDe = (x, re) => x.efectos.push.filter((p) => re.test(p.title));

test('integración flag OFF (flags productivas actuales): camino viejo, sin bandeja, delete ignorado, 200 inmediato', async () => {
  const x = await correr({ flag: FLAGS_PROD, lista: [actStrava(9001, 15)], pasos: [hook(ev('create', 9001)), hook(ev('delete', 9001))] });
  assert.deepEqual(x.rs.map((r) => r.status), [200, 200]);
  // el viejo ignora km_base para completar: max(10 + 15, 40) = 40 < 50 → activo
  assert.deepEqual([x.fila('uc1').status, x.fila('uc1').km_completed], ['active', 40]);
  assert.deepEqual([x.strava(9001).length, x.strava(9001)[0].excluida], [1, false]);
  assert.deepEqual([x.bandeja().length, x.db.strava_actividades_borradas.length], [0, 0]);
  assert.ok(!x.registro.some((op) => op.tabla === 'rpc' && /strava/.test(op.nombre)), 'el camino viejo no usa las RPC nuevas');
  assert.doesNotMatch(x.logs, /"writer":"strava_webhook"/);
});

test('integración "strava_webhook" SIN "efectos": camino viejo, sin bandeja, y lo deja en el log', async () => {
  const x = await correr({ flag: 'reanudar,eliminar_actividad,strava_webhook', lista: [actStrava(9002, 3)], pasos: [hook(ev('create', 9002))] });
  assert.match(x.logs, /"writer":"strava_webhook","resultado":"ignorado_sin_efectos"/);
  assert.deepEqual([x.fila('uc1').km_completed, x.db.progreso_eventos.length, x.bandeja().length], [40, 0, 0]);
});

test('integración flag ON: create completa por la bandeja y el motor (km_base), UN evento, efectos una vez, sin escrituras viejas', async () => {
  const x = await correr({ flag: FLAG_ON, lista: [actStrava(9003, 15)], pasos: [hook(ev('create', 9003))] });
  assert.equal(x.rs[0].status, 200);
  assert.deepEqual(x.bandeja().map((f) => [f.aspect_type, f.object_id, f.estado, f.resultado, f.intentos]), [['create', 9003, 'hecho', 'insertada', 1]]);
  assert.deepEqual([x.fila('uc1').status, x.fila('uc1').km_completed, x.fila('uc1').km_base], ['completed', 55, 30]);
  assert.ok(x.db.user_challenges.every((f) => f.recalculo_pendiente_desde === null));
  const evs = x.db.progreso_eventos.filter((e) => e.user_challenge_id === 'uc1');
  assert.deepEqual(evs.map((e) => [e.tipo, e.datos.origen, e.datos.motivo, e.estado]), [['completado', 'motor', 'strava_webhook', 'hecho']]);
  assert.deepEqual(x.efectos.certificados.map((c) => c.km), [50]);
  assert.equal(x.efectos.emails.filter((e) => e.para === 'prueba@ejemplo.com').length, 1);
  assert.equal(x.efectos.push.length, 1);
  assert.ok(!x.registro.some((op) => op.tipo === 'update' && op.tabla === 'user_challenges' && op.valores && 'status' in op.valores));
  // Persistencia ANTES del ACK: el registro en la bandeja es anterior a cualquier otra escritura.
  const i = x.registro.findIndex((op) => op.tabla === 'strava_webhook_eventos' && op.tipo === 'upsert');
  const j = x.registro.findIndex((op) => op.tipo !== 'select' && op.tabla !== 'strava_webhook_eventos');
  assert.ok(i >= 0 && i < j, `registro ${i} antes de la primera escritura ${j}`);
});

test('integración: persistencia ANTES del ACK — si la bandeja no puede guardar, responde 500 (Strava reintenta) y no aplica nada', async () => {
  const x = await correr({
    flag: FLAG_ON, lista: [actStrava(9004, 15)], entorno: { PRUEBA_FALLAR_TABLA: 'strava_webhook_eventos' },
    pasos: [hook(ev('create', 9004)), hook(ev('delete', 9004))],
  });
  assert.deepEqual(x.rs.map((r) => r.status), [500, 500]);
  assert.deepEqual([x.bandeja().length, x.strava(9004).length, x.db.strava_actividades_borradas.length, x.fila('uc1').km_completed], [0, 0, 0, 40]);
  assert.match(x.logs, /"resultado":"no_se_pudo_registrar"/);
});

test('integración: CAÍDA después del ACK (Strava colgado) y REINICIO: el evento estaba guardado y el proceso nuevo lo aplica una vez', async () => {
  // Proceso 1: responde 200, empieza a procesar y muere a mitad de camino.
  const p1 = await correr({ flag: FLAG_ON, lista: [actStrava(9005, 15)], entorno: { PRUEBA_STRAVA_COLGADO: '1' }, pasos: [hook(ev('create', 9005))], caida: true, esperaFinalMs: 150 });
  assert.equal(p1.rs[0].status, 200);
  assert.deepEqual(p1.bandeja().map((f) => [f.estado, f.intentos]), [['procesando', 1]], 'el evento quedó guardado antes del 200');
  assert.deepEqual([p1.strava(9005).length, p1.fila('uc1').km_completed], [0, 40]);

  for (const variante of ['arriendo_vencido', 'nunca_tomado']) {
    // Pasa el tiempo (vence el arriendo) o el proceso murió antes de tomarlo.
    const bandeja = p1.bandeja().map((f) => (variante === 'arriendo_vencido'
      ? { ...f, siguiente_intento_at: '2026-01-01T00:00:00.000Z' }
      : { ...f, estado: 'pendiente', intentos: 0, token: null, tomado_at: null, siguiente_intento_at: '2026-01-01T00:00:00.000Z' }));
    // Proceso 2 (reinicio): misma base, Strava responde, recuperación de la bandeja rápida. Strava reenvía el evento.
    const p2 = await correr({
      flag: FLAG_ON, lista: [actStrava(9005, 15)], entorno: RECUPERACION_RAPIDA, esperaFinalMs: 1500,
      tablas: tablasIntegracion({ ...p1.db, strava_webhook_eventos: bandeja }),
      pasos: [hook(ev('create', 9005))],
    });
    assert.deepEqual(p2.bandeja().map((f) => f.estado), ['hecho'], variante);
    assert.deepEqual([p2.strava(9005).length, p2.fila('uc1').status, p2.fila('uc1').km_completed], [1, 'completed', 55], variante);
    assert.equal(p2.db.progreso_eventos.filter((e) => e.tipo === 'completado').length, 1, variante);
    assert.equal(p2.efectos.emails.filter((e) => e.para === 'prueba@ejemplo.com').length, 1, variante);
    assert.equal(p2.efectos.push.length, 1, variante);
  }
});

test('integración flag ON: el MISMO create 3 veces en paralelo + un update → 2 eventos en la bandeja, una actividad, un evento, efectos una vez', async () => {
  const x = await correr({
    flag: FLAG_ON, lista: [actStrava(9006, 15)],
    pasos: [[hook(ev('create', 9006)), hook(ev('create', 9006)), hook(ev('create', 9006))], hook(ev('update', 9006, { event_time: 1757665000, updates: { title: 'Nuevo' } }))],
  });
  assert.ok(x.rs.every((r) => r.status === 200));
  assert.deepEqual(x.bandeja().map((f) => [f.aspect_type, f.estado]).sort(), [['create', 'hecho'], ['update', 'hecho']]);
  assert.equal(x.strava(9006).length, 1);
  assert.equal(x.db.progreso_eventos.filter((e) => e.tipo === 'completado' && e.user_challenge_id === 'uc1').length, 1);
  assert.equal(x.efectos.emails.filter((e) => e.para === 'prueba@ejemplo.com').length, 1);
  assert.equal(x.efectos.push.length, 1);
});

test('integración flag ON: DELETE antes que CREATE (Strava todavía devolvía la actividad) → lápida; la actividad queda excluida y no suma', async () => {
  const x = await correr({ flag: FLAG_ON, lista: [actStrava(9007, 15)], pasos: [hook(ev('delete', 9007)), hook(ev('create', 9007)), homeImporta] });
  assert.deepEqual(x.db.strava_actividades_borradas.map((l) => [l.external_id, l.user_id]), [['9007', U]]);
  assert.deepEqual([x.strava(9007).length, x.strava(9007)[0].excluida], [1, true]);
  assert.deepEqual([x.fila('uc1').status, x.fila('uc1').km_completed], ['active', 40]);
  assert.equal(x.efectos.push.length, 0);
  assert.equal(x.db.progreso_eventos.length, 0);
});

test('integración flag ON + importación VIEJA (sin strava_import): la importación también respeta la lápida', async () => {
  const x = await correr({ flag: 'reanudar,eliminar_actividad,efectos,modalidad,actividad_manual,strava_webhook', lista: [actStrava(9008, 15)], pasos: [hook(ev('delete', 9008)), homeImporta] });
  assert.deepEqual([x.strava(9008).length, x.strava(9008)[0].excluida, x.fila('uc1').status], [1, true, 'active']);
});

test('integración flag ON: create que no completa manda el push de progreso como el viejo; delete baja los km; update posterior no la revive', async () => {
  const x = await correr({
    flag: FLAG_ON, lista: [actStrava(9009, 3)],
    pasos: [hook(ev('create', 9009)), hook(ev('delete', 9009)), hook(ev('update', 9009, { event_time: 1757665000 }))],
  });
  assert.equal(pushDe(x, /\+3\.0 km registrados/).length, 1);
  assert.deepEqual([x.strava(9009).length, x.strava(9009)[0].excluida], [1, true]);
  assert.deepEqual([x.fila('uc1').status, x.fila('uc1').km_completed], ['active', 40]);
  assert.equal(x.efectos.push.length, 1);
  assert.deepEqual(x.bandeja().map((f) => f.estado), ['hecho', 'hecho', 'hecho']);
});

test('integración flag ON: sin distancia, duplicada, 404, atleta desconocido → "ignorado"; desautorización y cuerpo inválido → 200 sin registrar', async () => {
  const manualHoy = { id: 'cccccccc-0000-4000-8000-000000000001', user_id: U, source: 'manual', external_id: 'manual_hoy', distance_km: 5.1, recorded_at: '2026-09-12T07:00:00Z', excluida: false };
  const x = await correr({
    flag: FLAG_ON, lista: [actStrava(9010, 0, undefined, 'WeightTraining'), actStrava(9011, 5)], tablas: tablasIntegracion({ activities: [A1, A9, manualHoy] }),
    pasos: [
      hook(ev('create', 9010)), hook(ev('create', 9011)), hook(ev('create', 9999)), hook(ev('create', 9011, { owner_id: 1 })),
      hook({ aspect_type: 'update', object_type: 'athlete', object_id: ATLETA, owner_id: ATLETA, updates: { authorized: 'false' } }),
      hook({ aspect_type: 'create', object_type: 'activity' }),
    ],
  });
  assert.ok(x.rs.every((r) => r.status === 200));
  assert.deepEqual(x.bandeja().map((f) => [f.object_id, f.estado, f.resultado]), [
    [9010, 'ignorado', 'sin_distancia'], [9011, 'ignorado', 'duplicada_mismo_dia'], [9999, 'ignorado', 'no_encontrada_en_strava'], [9011, 'ignorado', 'atleta_desconocido'],
  ]);
  assert.equal(x.db.activities.filter((a) => a.source === 'strava').length, 0);
  assert.ok(!x.registro.some((op) => op.tabla === 'user_challenges' && op.tipo === 'update'), 'no marca ni escribe');
  assert.equal(x.efectos.push.length, 0);
});

test('integración flag ON: webhook + importación de la Home a la vez (misma actividad) → una fila, un evento, efectos una vez', async () => {
  const x = await correr({ flag: FLAG_ON, lista: [actStrava(9012, 15)], pasos: [[hook(ev('create', 9012)), homeImporta, hook(ev('create', 9012))]] });
  assert.equal(x.strava(9012).length, 1);
  const evs = x.db.progreso_eventos.filter((e) => e.tipo === 'completado' && e.user_challenge_id === 'uc1');
  assert.equal(evs.length, 1);
  assert.ok(['strava_webhook', 'strava_import'].includes(evs[0].datos.motivo));
  assert.equal(x.efectos.emails.filter((e) => e.para === 'prueba@ejemplo.com').length, 1);
  assert.equal(x.efectos.push.length, 1);
});

test('compatibilidad app vieja: la Home vieja (/strava/progreso) después del webhook no completa dos veces ni duplica email/push', async () => {
  const completa = await correr({ flag: FLAG_ON, lista: [actStrava(9013, 15)], pasos: [hook(ev('create', 9013)), homeVieja, homeVieja] });
  assert.equal(completa.db.progreso_eventos.filter((e) => e.tipo === 'completado').length, 1);
  assert.equal(completa.efectos.emails.filter((e) => e.para === 'prueba@ejemplo.com').length, 1);
  assert.equal(completa.efectos.push.length, 1);
  const r = completa.rs[1].body.find((d) => d.challenge_id === 'c1');
  assert.deepEqual([r.estado, r.km_completados], ['COMPLETADO', '55.00']);

  const parcial = await correr({ flag: FLAG_ON, lista: [actStrava(9014, 3)], pasos: [hook(ev('create', 9014)), homeVieja] });
  assert.deepEqual([parcial.fila('uc1').status, parcial.fila('uc1').km_completed], ['active', 43]);
  assert.equal(parcial.db.progreso_eventos.filter((e) => e.tipo === 'completado').length, 0);
});
