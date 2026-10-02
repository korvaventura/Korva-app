// Convivencia motor ↔ writers VIEJOS (Etapa 4A-3e), con el index.js REAL en un proceso hijo.
//
// La base en memoria imita la migración 4A-3e-a (RPC atómica, trigger 'legado', protección del
// serial). La carrera se inyecta en la precarga: justo antes de que el writer viejo ejecute su UPDATE
// de completitud, el motor completa el mismo desafío por la RPC.
// Se verifica: una sola completitud, un solo evento 'completado' y un solo set de efectos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { levantarBackend } = require('./helpers/backendHijo');

const U = '11111111-1111-4111-8111-111111111111';
const UC = 'a0000000-0000-4000-8000-000000000001';
const CH = { id: 'c1', title: 'Dubrovnik 19K', modalidades: [{ tipo: 'run', distancia_km: 19.4 }, { tipo: 'ride', distancia_km: 58.2 }], total_distance_km: 19.4 };
const USUARIO = { id: U, name: 'Prueba', email: 'prueba@ejemplo.com', bib_number: '0042', shipping_address: 'Calle 1', push_token: 'ExponentPushToken[x]' };
const uc = (extra = {}) => ({
  id: UC, user_id: U, challenge_id: 'c1', status: 'active', modalidad: 'run', started_at: '2026-09-01T00:00:00',
  completed_at: null, km_completed: 12, km_base: 0, km_base_motivo: null, pausado: false, pausado_at: null, periodos_pausados: [],
  group_id: null, certificado_serial: null, recalculo_pendiente_desde: null, ...extra,
});
const act = (id, km, fecha = '2026-09-02T07:00:00') => ({ id, user_id: U, distance_km: km, recorded_at: fecha, excluida: false, source: 'strava' });
const tablas = ({ ucs = [uc()], actividades = [act('a1', 12)] } = {}) => ({ users: [USUARIO], user_challenges: ucs, challenges: [CH], activities: actividades, progreso_eventos: [] });

const correr = async ({ tablasIniciales, carrera = false, pedido, flag = 'reanudar,eliminar_actividad,efectos,modalidad', pdfFalso = true }) => {
  const entorno = { PRUEBA_PDF_FALSO: pdfFalso ? '1' : '0' };
  if (carrera) entorno.PRUEBA_MOTOR_GANA_ANTES_DE = UC;
  const b = await levantarBackend({ flag, tablas: tablasIniciales, entorno });
  const r = await pedido(b);
  const salida = await b.cerrar();
  assert.equal(salida.exitCode, 0);
  const fila = salida.db.user_challenges.find((x) => x.id === UC);
  const eventos = salida.db.progreso_eventos.filter((e) => e.user_challenge_id === UC && e.tipo === 'completado');
  return { r, salida, fila, eventos, emails: salida.efectos.emails, push: salida.efectos.push };
};

const homeStrava = (b) => b.pedir({ metodo: 'GET', ruta: `/strava/progreso/${U}` });
const cargaManual = (b) => b.pedir({ metodo: 'POST', ruta: '/actividades/manual', body: { user_id: U, challenge_id: 'c1', sport_type: 'run', distance_km: 8, recorded_at: '2026-09-03T07:00:00' } });

// ---------------------------------------------------------------------------
// Home de Strava (/strava/progreso): writer viejo que completa con Math.max
// ---------------------------------------------------------------------------

test('Home Strava SIN carrera: completa el camino viejo → evento legado/hecho y sus efectos de siempre (una vez)', async () => {
  const x = await correr({ tablasIniciales: tablas({ actividades: [act('a1', 12), act('a2', 8)] }), pedido: homeStrava });
  assert.equal(x.r.status, 200);
  assert.equal(x.fila.status, 'completed');
  assert.equal(x.eventos.length, 1);
  assert.deepEqual([x.eventos[0].estado, x.eventos[0].datos.origen], ['hecho', 'legado']);
  assert.equal(x.emails.filter((e) => e.para === USUARIO.email).length, 1);
  assert.equal(x.push.length, 1);
});

test('Home Strava CON carrera: el motor completó primero → el viejo pierde el UPDATE condicional y NO manda efectos', async () => {
  const x = await correr({ tablasIniciales: tablas({ actividades: [act('a1', 12), act('a2', 8)] }), carrera: true, pedido: homeStrava });
  assert.equal(x.fila.status, 'completed');
  assert.equal(x.eventos.length, 1);
  assert.deepEqual([x.eventos[0].estado, x.eventos[0].datos.origen], ['pendiente', 'motor']); // los efectos son del motor
  assert.deepEqual([x.emails.length, x.push.length], [0, 0]);
  assert.match(x.salida.logs, /\[convivencia\] strava_progreso: .* ya lo completó otro camino/);
});

// ---------------------------------------------------------------------------
// Carga manual (/actividades/manual → recalcularKmUsuario + enviarCertificadoFinisher)
// ---------------------------------------------------------------------------

test('Carga manual SIN carrera: completa el camino viejo → serial reservado, certificado, "medalla lista" y push UNA vez, evento legado', async () => {
  const x = await correr({ tablasIniciales: tablas(), pedido: cargaManual });
  assert.equal(x.r.status, 200);
  assert.equal(x.fila.status, 'completed');
  assert.ok(x.fila.certificado_serial);
  assert.equal(x.eventos.length, 1);
  assert.equal(x.eventos[0].datos.origen, 'legado');
  const alUsuario = x.emails.filter((e) => e.para === USUARIO.email);
  assert.equal(alUsuario.length, 1);
  assert.equal(alUsuario[0].adjuntos, 1);
  assert.equal(x.emails.filter((e) => /Medalla lista/.test(e.asunto)).length, 1);
  assert.equal(x.push.length, 1); // antes salían 2 "¡Lo lograste!" (recalcularKmUsuario + notificación de progreso)
});

test('Carga manual CON carrera: el motor completó primero → el viejo no reserva serial ni manda nada', async () => {
  const x = await correr({ tablasIniciales: tablas(), carrera: true, pedido: cargaManual });
  assert.equal(x.fila.status, 'completed');
  assert.equal(x.fila.certificado_serial, null); // el certificado lo emite el procesador de efectos del motor
  assert.equal(x.eventos.length, 1);
  assert.equal(x.eventos[0].datos.origen, 'motor');
  assert.deepEqual([x.emails.length, x.push.length], [0, 0]);
  assert.match(x.salida.logs, /\[convivencia\] recalcularKmUsuario: .* ya lo completó otro camino/);
});

test('Carga manual con TODAS las flags apagadas: mismo comportamiento viejo (completa y manda una vez)', async () => {
  const x = await correr({ tablasIniciales: tablas(), pedido: cargaManual, flag: '' });
  assert.equal(x.fila.status, 'completed');
  assert.equal(x.eventos[0].datos.origen, 'legado');
  assert.equal(x.emails.filter((e) => e.para === USUARIO.email).length, 1);
  assert.equal(x.push.length, 1);
});

// ---------------------------------------------------------------------------
// /test/certificado y /test/reenviar-certificados: nunca pisan un serial
// ---------------------------------------------------------------------------

test('/test/certificado con serial existente: lo REUTILIZA (no escribe) y reenvía ese certificado', async () => {
  const x = await correr({
    tablasIniciales: tablas({ ucs: [uc({ status: 'completed', certificado_serial: 'KORVA-2026-0042', completed_at: '2026-09-10T00:00:00' })] }),
    pedido: (b) => b.pedir({ metodo: 'GET', ruta: `/test/certificado/${U}/c1` }),
  });
  assert.equal(x.r.body.ok, true);
  assert.match(x.r.body.mensaje, /KORVA-2026-0042/);
  assert.equal(x.fila.certificado_serial, 'KORVA-2026-0042');
  assert.ok(!x.salida.registro.some((op) => op.tipo === 'update' && op.valores && 'certificado_serial' in op.valores), 'no debe escribir el serial');
});

test('/test/certificado sin serial: lo reserva con CAS; si el PDF falla, libera la reserva (se puede reintentar)', async () => {
  const ok = await correr({
    tablasIniciales: tablas({ ucs: [uc({ status: 'completed', completed_at: '2026-09-10T00:00:00' })] }),
    pedido: (b) => b.pedir({ metodo: 'GET', ruta: `/test/certificado/${U}/c1` }),
  });
  assert.equal(ok.r.body.ok, true);
  assert.ok(ok.fila.certificado_serial);
  const reserva = ok.salida.registro.find((op) => op.tipo === 'update' && op.valores && op.valores.certificado_serial);
  assert.ok(reserva.filtros.some(([t, c, v]) => t === 'is' && c === 'certificado_serial' && v === null), 'la reserva es condicional (IS NULL)');

  const falla = await correr({
    tablasIniciales: tablas({ ucs: [uc({ status: 'completed', completed_at: '2026-09-10T00:00:00' })] }),
    pedido: (b) => b.pedir({ metodo: 'GET', ruta: `/test/certificado/${U}/c1` }),
    pdfFalso: false,
  });
  assert.equal(falla.r.body.error, 'No se pudo generar el certificado');
  assert.equal(falla.fila.certificado_serial, null);
  assert.equal(falla.emails.length, 0);
});

test('/test/reenviar-certificados: reserva con CAS y solo toca los que no tienen serial', async () => {
  const otro = uc({ id: 'a0000000-0000-4000-8000-000000000002', status: 'shipped', certificado_serial: 'KORVA-2026-0007' });
  const x = await correr({
    tablasIniciales: tablas({ ucs: [uc({ status: 'cargado', completed_at: '2026-09-10T00:00:00' }), otro] }),
    pedido: (b) => b.pedir({ metodo: 'GET', ruta: '/test/reenviar-certificados' }),
  });
  assert.equal(x.r.body.total, 1);
  assert.ok(x.fila.certificado_serial);
  assert.equal(x.salida.db.user_challenges.find((u) => u.id === otro.id).certificado_serial, 'KORVA-2026-0007');
  assert.equal(x.emails.length, 1);
  const escriturasSerial = x.salida.registro.filter((op) => op.tipo === 'update' && op.valores && 'certificado_serial' in op.valores);
  assert.ok(escriturasSerial.every((op) => op.filtros.some(([t, c]) => (t === 'is' || t === 'eq') && c === 'certificado_serial')), 'toda escritura del serial es condicional');
});
