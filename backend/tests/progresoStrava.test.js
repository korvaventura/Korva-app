// Tests de GET /strava/progreso/:userId en SOLO LECTURA (Etapa 4A-9, flag "strava_progreso").
//
// Integración con index.js real (Supabase en memoria, ver helpers/precargaIndex.js): se compara la
// respuesta y las operaciones sobre la base con la flag apagada (camino viejo) y encendida.
const test = require('node:test');
const assert = require('node:assert/strict');
const { levantarBackend } = require('./helpers/backendHijo');
const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { recuperarRecalculosPendientes } = require('../lib/recuperacionRecalculo');
const { recalcularProgresoUsuario, MODOS } = require('../lib/progresoServicio');
const { stravaProgresoSoloLectura, writersActivos, algunWriterMotorActivo, WRITERS_CONOCIDOS } = require('../lib/flagsMotor');

const U = '11111111-1111-4111-8111-111111111111';
const ver = (est, ext) => [{ tipo: 'run', label: 'Estándar', version: 'estandar', distancia_km: est }, { tipo: 'ride', label: 'Extendida', version: 'extendida', distancia_km: ext }];
const cp = [{ km: 10, nombre: 'Base', emoji: '⛺' }, { km: 103, nombre: 'Meta', emoji: '🏁' }];
const CHS = [
  { id: 'c1', title: 'Desafío A', modalidades: ver(103, 300), total_distance_km: 103, checkpoints: cp },
  { id: 'c2', title: 'Desafío B', modalidades: ver(103, 300), total_distance_km: 103, checkpoints: null },
  { id: 'c3', title: 'Desafío C', modalidades: ver(103, 300), total_distance_km: 103, checkpoints: cp },
  { id: 'c4', title: 'Desafío D', modalidades: ver(50, 150), total_distance_km: 50, checkpoints: cp },
  { id: 'c5', title: 'Desafío E', modalidades: ver(57, 150), total_distance_km: 57, checkpoints: null, link_shopify: 'https://tienda.ejemplo/e' },
  { id: 'c6', title: 'Desafío F', modalidades: ver(40, 120), total_distance_km: 40, checkpoints: null },
];
const base = (extra) => ({
  user_id: U, status: 'active', version: 'estandar', modalidad: 'run', started_at: '2026-09-01T00:00:00', pausado: false, pausado_at: null,
  periodos_pausados: [], km_base: 0, km_base_motivo: null, completed_at: null, recalculo_pendiente_desde: null,
  certificado_serial: null, group_id: null, meta_fecha: null, ...extra,
});
// A: km_base + pausa cerrada. Guardado = motor = 11.9766 + 20 + 19.2202 = 51.1968 (la de la pausa no cuenta).
//    El cálculo viejo da la suma SIN km_base (39.2202), pero la ruta vieja escribe max(39.2202, guardado):
//    con el guardado más alto, el viejo NO lo baja.
const UCA = () => base({
  id: 'ucA', challenge_id: 'c1', km_base: 11.9766, km_base_motivo: 'legado_historico', km_completed: 51.1968, meta_fecha: '2026-12-31T00:00:00+00:00',
  periodos_pausados: [{ desde: '2026-09-05T00:00:00', hasta: '2026-09-07T00:00:00.000Z' }],
});
// B: km_base + pausa cerrada con el guardado DESALINEADO hacia abajo (9.41; el motor daría 14.41 + 39.2202).
//    El viejo escribe max(39.2202, 9.41) = 39.2202: pisa lo guardado con un valor SIN km_base.
const UCB = () => base({
  id: 'ucB', challenge_id: 'c2', km_base: 14.41, km_base_motivo: 'restitucion_bug_ago2026', km_completed: 9.41,
  periodos_pausados: [{ desde: '2026-09-05T00:00:00', hasta: '2026-09-07T00:00:00.000Z' }],
});
const UCC = () => base({ id: 'ucC', challenge_id: 'c3', version: 'extendida', modalidad: 'ride', pausado: true, pausado_at: '2026-09-08T00:00:00', km_completed: 17.2221 });
const UCD = () => base({ id: 'ucD', challenge_id: 'c4', status: 'completed', km_completed: 55, completed_at: '2026-09-09T00:00:00', certificado_serial: 'KORVA-2026-0001' });
const UCE = () => base({ id: 'ucE', challenge_id: 'c5', status: 'pending', km_completed: 0, started_at: null });
// F: sin km_base ni pausas; guardado 12.3456. El viejo suma 44.2202 >= 40 y lo COMPLETARÍA.
const UCF = () => base({ id: 'ucF', challenge_id: 'c6', km_completed: 12.3456 });
const act = (id, km, fecha) => ({ id, user_id: U, distance_km: km, recorded_at: fecha, excluida: false, source: 'strava', external_id: `ext_${id}` });
const ACTS = [act('a1', 20, '2026-09-02T07:00:00'), act('a2', 19.2202, '2026-09-10T07:00:00'), act('a3', 5, '2026-09-06T07:00:00')];
const USUARIOS = [{ id: U, name: 'Fabri Prueba', email: 'prueba@ejemplo.com', push_token: 'ExponentPushToken[x]', shipping_address: 'Calle 1', bib_number: '0042' }];
const tablas = (ucs = [UCA(), UCB(), UCC(), UCD(), UCE(), UCF()], actividades = ACTS) => ({
  users: USUARIOS, challenges: CHS, user_challenges: ucs, activities: actividades, progreso_eventos: [],
});

const FLAGS_PROD = 'reanudar,eliminar_actividad,efectos,modalidad,actividad_manual,strava_import,strava_webhook';
const FLAG_ON = `${FLAGS_PROD},strava_progreso`;

const correr = async ({ flag, t = tablas(), veces = 1 }) => {
  const b = await levantarBackend({ flag, tablas: t, entorno: { PRUEBA_PDF_FALSO: '1' } });
  const rs = [];
  for (let i = 0; i < veces; i++) rs.push(await b.pedir({ metodo: 'GET', ruta: `/strava/progreso/${U}` }));
  await new Promise((r) => setTimeout(r, 200)); // emails/push del camino viejo salen sin esperar
  const salida = await b.cerrar();
  assert.equal(salida.exitCode, 0, salida.logs);
  const DESAFIO = { ucA: 'c1', ucB: 'c2', ucC: 'c3', ucD: 'c4', ucE: 'c5', ucF: 'c6' };
  const item = (r, id) => r.body.find((x) => x.challenge_id === (DESAFIO[id] || id));
  return { rs, r: rs[0], item: (id, n = 0) => item(rs[n], id), ...salida, fila: (id) => salida.db.user_challenges.find((x) => x.id === id) };
};
const escrituras = (registro) => registro.filter((op) => op.tipo !== 'select');
const CLAVES = ['challenge', 'challenge_id', 'version', 'version_label', 'modalidad', 'distancia_total', 'km_completados', 'porcentaje', 'checkpoints', 'estado', 'started_at', 'meta_fecha', 'pausado', 'pending'].sort();
const CLAVES_PENDING = ['challenge', 'challenge_id', 'version', 'version_label', 'modalidad', 'distancia_total', 'km_completados', 'porcentaje', 'checkpoints', 'estado', 'started_at', 'meta_fecha', 'link_shopify', 'pending'].sort();

test('flag: strava_progreso apagada por defecto, conocida y SIN depender de "efectos" (no completa nada)', () => {
  assert.ok(WRITERS_CONOCIDOS.includes('strava_progreso'));
  assert.equal(stravaProgresoSoloLectura({}), false);
  assert.equal(stravaProgresoSoloLectura({ MOTOR_PROGRESO_WRITERS: FLAGS_PROD }), false);
  assert.equal(stravaProgresoSoloLectura({ MOTOR_PROGRESO_WRITERS: 'strava_progreso' }), true);
  assert.equal(stravaProgresoSoloLectura({ MOTOR_PROGRESO_WRITERS: 'efectos, Strava_Progreso' }), true);
  assert.deepEqual(writersActivos({ MOTOR_PROGRESO_WRITERS: 'strava_progreso' }), ['strava_progreso']);
  assert.equal(algunWriterMotorActivo({ MOTOR_PROGRESO_WRITERS: 'strava_progreso' }), true);
});

test('flag ON: CERO escrituras (ningún UPDATE, insert ni RPC), sin leer actividades (no recalcula), sin completar, sin email ni push', async () => {
  const inicial = tablas();
  for (const flag of [FLAG_ON, 'strava_progreso']) {
    const x = await correr({ flag, t: inicial, veces: 3 });
    assert.ok(x.rs.every((r) => r.status === 200 && Array.isArray(r.body) && r.body.length === 6), flag);
    assert.deepEqual(escrituras(x.registro), [], `${flag}: escrituras`);
    assert.ok(!x.registro.some((op) => op.tabla === 'activities'), `${flag}: calcularKmDeChallenge no corre`);
    assert.deepEqual(x.db.user_challenges, inicial.user_challenges, flag);
    assert.deepEqual(x.db.progreso_eventos, [], flag);
    assert.deepEqual([x.efectos.emails, x.efectos.push], [[], []], flag);
    // F llegaría a la meta con el cálculo viejo: con la flag no se completa ni se informa completo.
    assert.deepEqual([x.fila('ucF').status, x.item('ucF').estado, x.item('ucF').km_completados], ['active', 'En progreso', '12.35'], flag);
    assert.doesNotMatch(x.logs, /\[convivencia\] strava_progreso/, flag);
  }
});

test('contrato: mismas claves y tipos que hoy; con datos alineados la respuesta ON es IDÉNTICA a la OFF', async () => {
  // Datos alineados: sin km_base ni pausas y km guardado = suma de actividades (lo que calcula el viejo).
  const alineadas = tablas([
    base({ id: 'ucA', challenge_id: 'c1', km_completed: 44.2202, meta_fecha: '2026-12-31T00:00:00+00:00' }),
    UCC(), UCD(), UCE(),
    base({ id: 'ucX', challenge_id: 'c2', version: 'extendida', modalidad: 'ride', km_completed: 44.2202 }),
  ]);
  const off = await correr({ flag: FLAGS_PROD, t: alineadas });
  const on = await correr({ flag: FLAG_ON, t: alineadas });
  assert.deepEqual(on.r.body, off.r.body);
  for (const x of on.r.body) {
    assert.deepEqual(Object.keys(x).sort(), x.pending ? CLAVES_PENDING : CLAVES, x.challenge_id);
    assert.equal(typeof x.km_completados, 'string');
    assert.equal(typeof x.porcentaje, 'string');
    assert.equal(typeof x.distancia_total, 'number');
    assert.ok(['estandar', 'extendida'].includes(x.version));
    assert.ok(['Running', 'Ciclismo'].includes(x.modalidad)); // campo legacy de las apps viejas
  }
  const a = on.r.body.find((x) => x.challenge_id === 'c1');
  assert.deepEqual([a.km_completados, a.porcentaje, a.estado, a.distancia_total, a.pausado, a.pending, a.meta_fecha, a.checkpoints], ['44.22', '42.9', 'En progreso', 103, false, false, '2026-12-31T00:00:00+00:00', cp]);
  const x2 = on.r.body.find((x) => x.challenge_id === 'c2');
  assert.deepEqual([x2.version, x2.version_label, x2.modalidad, x2.distancia_total, x2.porcentaje], ['extendida', 'Extendida', 'Ciclismo', 300, '14.7']);
});

test('km guardado se devuelve EXACTO y el cálculo viejo no lo pisa (incluye km_base + pausas): OFF pisa B y F, ON no toca nada', async () => {
  const off = await correr({ flag: FLAGS_PROD });
  // Viejo: B (km_base + pausas) queda en la suma SIN km_base; F se recalcula con sus reglas (y completa).
  assert.deepEqual([off.fila('ucB').km_completed, off.item('ucB').km_completados], [39.2202, '39.22'], 'el viejo pisa B sin km_base');
  assert.deepEqual([off.fila('ucF').km_completed, off.fila('ucF').status], [44.2202, 'completed'], 'el viejo pisa y completa F');
  assert.deepEqual([off.fila('ucA').km_completed, off.fila('ucB').km_base], [51.1968, 14.41], 'A no baja (max) y km_base nunca se toca');

  const on = await correr({ flag: FLAG_ON, veces: 3 });
  for (let n = 0; n < 3; n++) {
    const ctx = `llamada ${n + 1}`;
    assert.deepEqual([on.item('ucA', n).km_completados, on.item('ucA', n).porcentaje, on.item('ucA', n).estado, on.item('ucA', n).pausado], ['51.20', '49.7', 'En progreso', false], ctx);
    assert.deepEqual([on.item('ucB', n).km_completados, on.item('ucB', n).porcentaje, on.item('ucB', n).estado], ['9.41', '9.1', 'En progreso'], ctx);
    assert.deepEqual([on.item('ucF', n).km_completados, on.item('ucF', n).porcentaje, on.item('ucF', n).estado], ['12.35', '30.9', 'En progreso'], ctx);
  }
  assert.deepEqual(
    ['ucA', 'ucB', 'ucF'].map((id) => [on.fila(id).km_completed, on.fila(id).status, on.fila(id).km_base]),
    [[51.1968, 'active', 11.9766], [9.41, 'active', 14.41], [12.3456, 'active', 0]],
  );
});

test('terminales, pausados y pending: la respuesta ON es igual a la de hoy (OFF)', async () => {
  const off = await correr({ flag: FLAGS_PROD });
  const on = await correr({ flag: FLAG_ON });
  for (const id of ['ucC', 'ucD', 'ucE']) assert.deepEqual(on.item(id), off.item(id), id);
  assert.deepEqual([on.item('ucC').estado, on.item('ucC').pausado, on.item('ucC').km_completados, on.item('ucC').version], ['En progreso', true, '17.22', 'extendida']);
  assert.deepEqual([on.item('ucD').estado, on.item('ucD').km_completados, on.item('ucD').porcentaje], ['COMPLETADO', '55.00', '100.0']);
  assert.deepEqual([on.item('ucE').estado, on.item('ucE').pending, on.item('ucE').km_completados, on.item('ucE').link_shopify, on.item('ucE').distancia_total], ['PENDIENTE', true, '0.00', 'https://tienda.ejemplo/e', 57]);
});

test('flag OFF: comportamiento legacy intacto (recalcula, escribe, completa con el trigger de legado, email y push propios)', async () => {
  for (const flag of [FLAGS_PROD, '']) {
    const x = await correr({ flag });
    const updates = escrituras(x.registro).filter((op) => op.tabla === 'user_challenges' && op.tipo === 'update');
    assert.deepEqual(updates.map((op) => op.filtros.find(([, c]) => c === 'id')[2]).sort(), ['ucA', 'ucB', 'ucF'], flag);
    assert.ok(x.registro.some((op) => op.tabla === 'activities' && op.tipo === 'select'), `${flag}: recalcula`);
    assert.deepEqual([x.fila('ucF').status, x.fila('ucF').km_completed, x.item('ucF').estado, x.item('ucF').km_completados], ['completed', 44.2202, 'COMPLETADO', '44.22'], flag);
    assert.deepEqual(x.db.progreso_eventos.map((e) => [e.user_challenge_id, e.tipo, e.datos.origen, e.estado]), [['ucF', 'completado', 'legado', 'hecho']], flag);
    assert.equal(x.efectos.emails.filter((e) => e.para === 'prueba@ejemplo.com').length, 1, flag);
    assert.deepEqual(x.efectos.push.map((p) => p.title), ['🏅 ¡Completaste el reto!'], flag);
    assert.deepEqual([x.fila('ucA').km_completed, x.fila('ucB').km_completed, x.fila('ucC').km_completed, x.fila('ucD').km_completed], [51.1968, 39.2202, 17.2221, 55], flag);
  }
});

test('alineación previa (procedimiento SQL 4A-9): marcar recalculo_pendiente_desde en los activos desalineados → la recuperación del motor los alinea', async () => {
  const m = crearSupabaseMemoria(tablas());
  const repo = crearRepositorioSupabase(m.cliente);
  const ahora = Date.parse('2026-10-03T12:00:00Z');
  const simular = () => recalcularProgresoUsuario({ repo, userId: U, motivo: 'verificacion', modo: MODOS.SIMULAR, ahoraMs: ahora });
  // Previo (lo que lista 4a9-alinear-previo.sql): activos cuyo guardado difiere del motor.
  const previo = (await simular()).desafios.filter((d) => d.accion !== 'nada');
  const desalineados = previo.map((d) => d.user_challenge_id).sort();
  assert.deepEqual(desalineados, ['ucB', 'ucC', 'ucF']);
  // Marcar (4a9-alinear-marcar.sql): SOLO la marca, 5 min en el pasado; nunca km_completed ni km_base.
  const marca = new Date(ahora - 5 * 60 * 1000).toISOString();
  m.db.user_challenges.filter((f) => desalineados.includes(f.id)).forEach((f) => { f.recalculo_pendiente_desde = marca; });
  const antes = JSON.parse(JSON.stringify(m.db.user_challenges));
  // La recuperación periódica del backend (cada 10 min) hace el resto con el motor.
  const r = await recuperarRecalculosPendientes({ repo, ahoraMs: ahora, log: () => {}, esperar: async () => {} });
  assert.deepEqual([r.revisados, r.recuperados], [3, 3]);
  assert.deepEqual((await simular()).desafios.filter((d) => d.accion !== 'nada'), [], 'todo alineado');
  assert.ok(m.db.user_challenges.every((f) => f.recalculo_pendiente_desde === null), 'sin marcas');
  const fila = (id) => m.db.user_challenges.find((f) => f.id === id);
  assert.equal(fila('ucB').km_completed, 53.6302); // 14.41 + 20 + 19.2202 (la de la pausa no cuenta)
  assert.deepEqual([fila('ucC').status, fila('ucC').pausado], ['active', true], 'pausado: nunca se completa');
  // F alcanza la meta con el motor: se completa por la RPC con UN evento 'completado' (efectos por la cola).
  assert.deepEqual([fila('ucF').status, m.db.progreso_eventos.map((e) => [e.user_challenge_id, e.datos.origen, e.datos.motivo])], ['completed', [['ucF', 'motor', 'recuperacion']]]);
  // Intactos: los no marcados, el terminal y todos los km_base.
  for (const id of ['ucA', 'ucD', 'ucE']) assert.deepEqual(fila(id), antes.find((f) => f.id === id), id);
  assert.deepEqual(m.db.user_challenges.map((f) => f.km_base), antes.map((f) => f.km_base));
});
