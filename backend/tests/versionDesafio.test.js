// Versión del desafío ESTÁNDAR / EXTENDIDA (sobre la migración ya aplicada en producción).
//
// - version (estandar|extendida) define SOLO la distancia objetivo; modalidad (run|ride) es espejo
//   legacy que mantiene el trigger de la base (imitado en supabaseMemoria).
// - El deporte de cada actividad no interviene: todos los km cuentan 1:1 en las dos versiones.
// Datos con el formato real de producción (challenges.modalidades con tipo + version + label).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const V = require('../lib/versionDesafio');
const { calcularProgresoChallenge } = require('../lib/progresoDesafio');
const { decidirAccion } = require('../lib/progresoDecision');
const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
const { crearResendFalso, crearExpoFalso, crearPdfFalso, crearSecuenciaSerial } = require('./helpers/efectosFalsos');
const { levantarBackend } = require('./helpers/backendHijo');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { cambiarModalidadConMotor } = require('../lib/cambiarModalidad');
const { recalcularProgresoUsuario, MODOS } = require('../lib/progresoServicio');
const { crearEfectosCompletado } = require('../lib/efectosCompletado');
const { procesarEventosPendientes } = require('../lib/completionEventos');
const { sinCandado } = require('../lib/candadoUsuario');
const emails = require('../routes/emails');

const U = '11111111-1111-4111-8111-111111111111';
const FIN = 'ae54af78-dc6f-4cf5-af31-2c077ba58048';
const AHORA = Date.parse('2026-10-02T12:00:00Z');

// Exactamente como quedaron en producción después de la migración.
const CH_PROD = [
  { id: '64442b1d-12b8-4a58-a951-50ea10cb2131', title: 'Dubrovnik 19K', total_distance_km: 19.4, modalidades: [{ tipo: 'run', label: 'Estándar', version: 'estandar', distancia_km: 19.4 }, { tipo: 'ride', label: 'Extendida', version: 'extendida', distancia_km: 58.2 }] },
  { id: '85a362a5-eee7-456d-9027-358d44446004', title: 'San Andrés 57K', total_distance_km: 57, modalidades: [{ tipo: 'run', label: 'Estándar', version: 'estandar', distancia_km: 57 }, { tipo: 'ride', label: 'Extendida', version: 'extendida', distancia_km: 171 }] },
  { id: '881936a8-2282-4b7d-a94d-24a7c796d789', title: 'Monte Fuji 68K', total_distance_km: 68, modalidades: [{ tipo: 'run', label: 'Estándar', version: 'estandar', distancia_km: 68 }, { tipo: 'ride', label: 'Extendida', version: 'extendida', distancia_km: 204 }] },
  { id: FIN, title: 'Fin del Mundo', total_distance_km: 103, modalidades: [{ tipo: 'run', label: 'Estándar', version: 'estandar', distancia_km: 103 }, { tipo: 'ride', label: 'Extendida', version: 'extendida', distancia_km: 309 }] },
];
const CH_FIN = CH_PROD[3];
// Formato anterior a la migración (sin version): compatibilidad defensiva.
const CH_FIN_LEGACY = { ...CH_FIN, modalidades: [{ tipo: 'run', label: 'Running', distancia_km: 103 }, { tipo: 'ride', label: 'Ciclismo', distancia_km: 309 }] };

const USUARIO = { id: U, name: 'Fabri Prueba', email: 'prueba@ejemplo.com', bib_number: '0042', shipping_address: 'Calle 1', push_token: 'ExponentPushToken[x]', avatar_url: null };
const uc = (extra = {}) => ({
  id: 'uc1', user_id: U, challenge_id: FIN, status: 'active', version: 'estandar', modalidad: 'run', started_at: '2026-09-01T00:00:00',
  completed_at: null, km_completed: 0, km_base: 0, km_base_motivo: null, pausado: false, pausado_at: null, periodos_pausados: [],
  group_id: null, certificado_serial: null, recalculo_pendiente_desde: null, meta_fecha: null, ...extra,
});
let nAct = 0;
const act = (km, sport_type = 'run', fecha = '2026-09-02T07:00:00') => ({
  id: `aaaaaaaa-0000-4000-8000-${String(++nAct).padStart(12, '0')}`, user_id: U, distance_km: km, recorded_at: fecha, excluida: false, sport_type, source: 'manual',
});
// Deportes reales de producción (walk/run/bike y textos libres): todos suman 1:1.
const MEZCLA = () => [act(5, 'walk'), act(10, 'run'), act(30, 'ride'), act(7.5, 'Bici de montaña'), act(2.5, 'Caminata'), act(1, 'swim')]; // 56 km

// ---------------------------------------------------------------------------
// Helper versionDesafio
// ---------------------------------------------------------------------------

test('pedido: version nueva o modalidad legacy; valores inválidos → null', () => {
  assert.equal(V.versionDesdePedido({ version: 'extendida' }), 'extendida');
  assert.equal(V.versionDesdePedido({ version: 'estandar', modalidad: 'ride' }), 'estandar'); // version manda
  assert.equal(V.versionDesdePedido({ modalidad: 'ride' }), 'extendida');
  assert.equal(V.versionDesdePedido({ modalidad: 'run' }), 'estandar');
  assert.equal(V.versionDesdePedido({ version: 'ride' }), null);
  assert.equal(V.versionDesdePedido({ modalidad: 'swim' }), null);
  assert.equal(V.versionDesdePedido({}), null);
});

test('inscripción: version válida manda; sin version (fila/cliente viejo) se deduce de modalidad igual que el trigger', () => {
  assert.equal(V.versionDeInscripcion({ version: 'extendida', modalidad: 'run' }), 'extendida');
  assert.equal(V.versionDeInscripcion({ modalidad: 'ride' }), 'extendida');
  assert.equal(V.versionDeInscripcion({ modalidad: 'run' }), 'estandar');
  assert.equal(V.versionDeInscripcion({ modalidad: null }), 'estandar');
  assert.equal(V.versionDeInscripcion({}), 'estandar');
  assert.deepEqual([V.etiquetaVersion('estandar'), V.etiquetaVersion('extendida')], ['Estándar', 'Extendida']);
  assert.deepEqual([V.modalidadLegacy('estandar'), V.modalidadLegacy('extendida')], ['run', 'ride']);
});

test('versiones del desafío: formato nuevo y formato legacy dan lo mismo', () => {
  const esperado = [{ version: 'estandar', distancia_km: 103, label: 'Estándar' }, { version: 'extendida', distancia_km: 309, label: 'Extendida' }];
  assert.deepEqual(V.versionesDelDesafio(CH_FIN), esperado);
  assert.deepEqual(V.versionesDelDesafio(CH_FIN_LEGACY), esperado);
});

test('objetivo Estándar / Extendida correcto en los 4 desafíos reales (y con filas legacy)', () => {
  const esperados = { 'Dubrovnik 19K': [19.4, 58.2], 'San Andrés 57K': [57, 171], 'Monte Fuji 68K': [68, 204], 'Fin del Mundo': [103, 309] };
  for (const ch of CH_PROD) {
    const [est, ext] = esperados[ch.title];
    assert.equal(V.objetivoDeInscripcion({ version: 'estandar' }, ch).objetivo_km, est, ch.title);
    assert.equal(V.objetivoDeInscripcion({ version: 'extendida' }, ch).objetivo_km, ext, ch.title);
    assert.equal(V.objetivoDeInscripcion({ modalidad: 'run' }, ch).objetivo_km, est, `${ch.title} legacy`);
    assert.equal(V.objetivoDeInscripcion({ modalidad: 'ride' }, ch).objetivo_km, ext, `${ch.title} legacy`);
    assert.equal(V.objetivoDeInscripcion({ modalidad: null }, ch).objetivo_km, est, `${ch.title} NULL`);
  }
  // respaldo: versión no ofrecida → primera; sin versiones → total; nada → sin objetivo
  assert.deepEqual(V.objetivoDeInscripcion({ version: 'extendida' }, { modalidades: [{ version: 'estandar', distancia_km: 50 }] }), { objetivo_km: 50, origen: 'primera_version', version: 'extendida' });
  assert.equal(V.objetivoDeInscripcion({ version: 'extendida' }, { modalidades: [], total_distance_km: 42 }).objetivo_km, 42);
  assert.equal(V.objetivoDeInscripcion({ version: 'extendida' }, { modalidades: null, total_distance_km: null }).objetivo_km, null);
});

// ---------------------------------------------------------------------------
// Motor (núcleo puro)
// ---------------------------------------------------------------------------

const calc = (ucExtra, actividades, challenge = CH_FIN) => calcularProgresoChallenge({ uc: uc(ucExtra), challenge, actividades });

test('motor: objetivo por version (103 / 309), también con desafío en formato legacy', () => {
  assert.deepEqual([calc({ version: 'estandar' }, []).objetivo_km, calc({ version: 'estandar' }, []).version], [103, 'estandar']);
  assert.deepEqual([calc({ version: 'extendida', modalidad: 'ride' }, []).objetivo_km, calc({ version: 'extendida', modalidad: 'ride' }, []).version], [309, 'extendida']);
  assert.equal(calc({ version: 'extendida', modalidad: 'ride' }, [], CH_FIN_LEGACY).objetivo_km, 309);
  assert.equal(calc({ version: undefined, modalidad: 'ride' }, []).objetivo_km, 309); // fila vieja sin version
});

test('motor: cualquier deporte suma 1:1 en las dos versiones (sin multiplicar ni dividir la bici)', () => {
  const est = calc({ version: 'estandar' }, MEZCLA());
  const ext = calc({ version: 'extendida', modalidad: 'ride' }, MEZCLA());
  assert.equal(est.km_actividades, 56);
  assert.equal(ext.km_actividades, 56);
  assert.equal(est.actividades.cuentan.cantidad, 6);
  assert.equal(ext.actividades.cuentan.cantidad, 6);
  // solo cambia el porcentaje, por la distancia de la versión
  assert.equal(est.porcentaje_progreso, Math.round((56 / 103) * 1000) / 10);
  assert.equal(ext.porcentaje_progreso, Math.round((56 / 309) * 1000) / 10);
});

test('motor: km_base suma igual en las dos versiones y no se modifica', () => {
  for (const version of ['estandar', 'extendida']) {
    const entrada = uc({ version, km_base: 40, km_base_motivo: 'legado_historico' });
    const r = calcularProgresoChallenge({ uc: entrada, challenge: CH_FIN, actividades: MEZCLA() });
    assert.equal(r.km_progreso_sombra, 96);
    assert.equal(entrada.km_base, 40);
  }
});

test('motor: terminales congelados en las dos versiones (nunca se escribe ni se reabre)', () => {
  for (const version of ['estandar', 'extendida']) {
    for (const status of ['completed', 'cargado', 'shipped']) {
      const fila = uc({ version, status, km_completed: 400 });
      const r = calcularProgresoChallenge({ uc: fila, challenge: CH_FIN, actividades: [act(1)] });
      assert.equal(decidirAccion(fila, r).accion, 'nada', `${version}/${status}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Writer de cambio de versión con el motor (memoria con el trigger espejo)
// ---------------------------------------------------------------------------

const montar = ({ ucs, actividades, challenges = CH_PROD }) => {
  const m = crearSupabaseMemoria({ users: [USUARIO], user_challenges: ucs, challenges, activities: actividades, progreso_eventos: [] }, { reloj: () => AHORA });
  const repo = crearRepositorioSupabase(m.cliente);
  const pdf = crearPdfFalso();
  const kmImpresos = [];
  const generarCertificado = async (...args) => { kmImpresos.push(args[3]); return pdf.generarCertificado(...args); };
  const efectos = crearEfectosCompletado({
    supabase: m.cliente, generarCertificado, emails, obtenerResend: () => crearResendFalso().cliente,
    fetchImpl: crearExpoFalso().fetchImpl, obtenerSerial: crearSecuenciaSerial().siguiente,
  });
  let n = 0;
  const generarMarca = (ms) => `${new Date(ms).toISOString().slice(0, -1)}${String(++n % 1000).padStart(3, '0')}Z`;
  const disparados = [];
  const cambiar = (pedido) => cambiarModalidadConMotor({
    repo, userId: U, challengeId: FIN, ahoraMs: AHORA, log: () => {}, esperar: async () => {}, generarMarca,
    candado: sinCandado, dispararEfectos: (ids) => disparados.push(...ids), ...pedido,
  });
  const procesar = (ids) => procesarEventosPendientes({ repo, efectos, ahoraMs: AHORA, generarToken: generarMarca, ids });
  const fila = () => m.db.user_challenges.find((x) => x.id === 'uc1');
  return { m, repo, cambiar, procesar, fila, kmImpresos };
};

test('cambio Estándar → Extendida: no inventa ni pierde km, queda activo, espejo modalidad=ride, km_base intacto', async () => {
  const s = montar({ ucs: [uc({ km_completed: 96, km_base: 40, km_base_motivo: 'legado_historico' })], actividades: MEZCLA() });
  const r = await s.cambiar({ version: 'extendida' });
  assert.equal(r.status, 200);
  assert.equal(r.body.progreso.completado, false);
  assert.deepEqual([s.fila().version, s.fila().modalidad, s.fila().status], ['extendida', 'ride', 'active']);
  assert.equal(s.fila().km_completed, 96); // 40 + 56: mismo valor, solo cambió el objetivo
  assert.equal(s.fila().km_base, 40);
  assert.ok(!s.m.registro.some((op) => op.tipo !== 'select' && op.valores && 'km_base' in op.valores));
});

test('cambio Extendida → Estándar que alcanza el objetivo: completa una vez con los MISMOS km', async () => {
  const s = montar({ ucs: [uc({ version: 'extendida', modalidad: 'ride', km_completed: 120 })], actividades: [act(60, 'ride'), act(60, 'walk')] });
  const r = await s.cambiar({ version: 'estandar' });
  assert.equal(r.body.progreso.completado, true);
  assert.deepEqual([s.fila().version, s.fila().modalidad, s.fila().status, s.fila().km_completed], ['estandar', 'run', 'completed', 120]);
  assert.equal(s.m.db.progreso_eventos.filter((e) => e.tipo === 'completado').length, 1);
});

test('compatibilidad: app vieja manda modalidad run/ride; fila sin version se trata por modalidad', async () => {
  const s = montar({ ucs: [{ ...uc({ km_completed: 56 }), version: undefined, modalidad: 'ride' }], actividades: MEZCLA() });
  // fila vieja sin version con modalidad ride = Extendida (309): 56 km no completa
  const antes = await recalcularProgresoUsuario({ repo: s.repo, userId: U, motivo: 'verificacion', modo: MODOS.SIMULAR, ahoraMs: AHORA });
  assert.equal(antes.desafios[0].accion, 'nada');
  const r = await s.cambiar({ modalidad: 'run' });
  assert.equal(r.status, 200);
  assert.deepEqual([s.fila().version, s.fila().modalidad, s.fila().km_completed, s.fila().status], ['estandar', 'run', 56, 'active']);
  assert.equal((await s.cambiar({ modalidad: 'swim' })).status, 400);
  assert.equal((await s.cambiar({ version: 'ride' })).status, 400);
});

test('terminal: no se cambia la versión ni se recalcula (404 como el viejo)', async () => {
  const s = montar({ ucs: [uc({ version: 'extendida', modalidad: 'ride', status: 'shipped', km_completed: 310 })], actividades: [act(5)] });
  assert.equal((await s.cambiar({ version: 'estandar' })).status, 404);
  const inf = await recalcularProgresoUsuario({ repo: s.repo, userId: U, motivo: 'verificacion', modo: MODOS.ESCRIBIR, ahoraMs: AHORA });
  assert.equal(inf.escrituras, 0);
  assert.deepEqual([s.fila().version, s.fila().status, s.fila().km_completed], ['extendida', 'shipped', 310]);
});

test('D-V1 (motor): el certificado imprime la distancia de la versión elegida', async () => {
  for (const [version, km, esperado] of [['extendida', 310, 309], ['estandar', 104, 103]]) {
    const s = montar({ ucs: [uc({ version, modalidad: V.modalidadLegacy(version), km_completed: 0 })], actividades: [act(km, 'ride')] });
    const inf = await recalcularProgresoUsuario({ repo: s.repo, userId: U, motivo: 'prueba', modo: MODOS.ESCRIBIR, ahoraMs: AHORA });
    assert.deepEqual(inf.completados, ['uc1']);
    await s.procesar(inf.eventos_para_procesar);
    assert.deepEqual(s.kmImpresos, [esperado], version);
  }
});

// ---------------------------------------------------------------------------
// Integración: index.js real (base en memoria con el trigger espejo)
// ---------------------------------------------------------------------------

const tablas = ({ ucs = [uc()], actividades = [], extra = {} } = {}) => ({
  users: [USUARIO], user_challenges: ucs, challenges: CH_PROD, activities: actividades, progreso_eventos: [], ...extra,
});
const correr = async ({ ini, pedidos, flag = 'reanudar,eliminar_actividad', entorno = {} }) => {
  const b = await levantarBackend({ flag, tablas: ini, entorno: { PRUEBA_PDF_FALSO: '1', ...entorno } });
  const respuestas = [];
  for (const p of pedidos) respuestas.push(await p(b));
  const salida = await b.cerrar();
  assert.equal(salida.exitCode, 0, salida.logs);
  return { r: respuestas, db: salida.db, efectos: salida.efectos, registro: salida.registro, logs: salida.logs };
};
const putVersion = (body) => (b) => b.pedir({ metodo: 'PUT', ruta: '/usuarios/modalidad', body: { user_id: U, challenge_id: FIN, ...body } });

test('PUT /usuarios/modalidad (flags productivas): acepta version y modalidad legacy, 400 si inválido, km y km_base intactos', async () => {
  const x = await correr({
    ini: tablas({ ucs: [uc({ km_completed: 96, km_base: 40, km_base_motivo: 'legado_historico' })], actividades: MEZCLA() }),
    pedidos: [putVersion({ version: 'extendida' }), putVersion({ modalidad: 'run' }), putVersion({ version: 'ride' }), putVersion({ modalidad: 'swim' }), putVersion({ modalidad: 'ride' })],
  });
  assert.deepEqual(x.r.map((r) => r.status), [200, 200, 400, 400, 200]);
  assert.equal(x.r[0].body.data.version, 'extendida');
  assert.equal(x.r[0].body.data.modalidad, 'ride'); // espejo del trigger
  assert.equal(x.r[1].body.data.version, 'estandar');
  assert.equal(x.r[2].body.error, 'Versión inválida');
  const f = x.db.user_challenges[0];
  assert.deepEqual([f.version, f.modalidad, f.status, f.km_completed, f.km_base], ['extendida', 'ride', 'active', 96, 40]);
});

test('PUT /usuarios/modalidad con el motor ("efectos,modalidad"): cambiar de versión no cambia km', async () => {
  const x = await correr({
    flag: 'reanudar,eliminar_actividad,efectos,modalidad',
    ini: tablas({ ucs: [uc({ km_completed: 56 })], actividades: MEZCLA() }),
    pedidos: [putVersion({ version: 'extendida' })],
  });
  assert.deepEqual([x.r[0].body.progreso.motor, x.r[0].body.progreso.accion], [true, 'nada']);
  assert.deepEqual([x.db.user_challenges[0].version, x.db.user_challenges[0].km_completed], ['extendida', 56]);
});

test('POST /challenges/inscribir: version, legacy y default Estándar; una sola inscripción por usuario+desafío', async () => {
  const inscribir = (body, challenge_id) => (b) => b.pedir({ metodo: 'POST', ruta: '/challenges/inscribir', body: { user_id: U, challenge_id, ...body } });
  const x = await correr({
    ini: tablas({ ucs: [uc({ challenge_id: CH_PROD[0].id, status: 'active' })] }),
    pedidos: [
      inscribir({ version: 'extendida' }, CH_PROD[1].id),
      inscribir({ modalidad: 'ride' }, CH_PROD[2].id),
      inscribir({}, FIN),
      inscribir({ version: 'extendida' }, CH_PROD[0].id), // ya tiene Dubrovnik (estándar, activo)
      inscribir({ version: 'nada' }, FIN),
    ],
  });
  const de = (cid) => x.db.user_challenges.filter((f) => f.challenge_id === cid);
  assert.deepEqual(de(CH_PROD[1].id).map((f) => [f.version, f.modalidad, f.status]), [['extendida', 'ride', 'pending']]);
  assert.deepEqual(de(CH_PROD[2].id).map((f) => f.version), ['extendida']);
  assert.deepEqual(de(FIN).map((f) => [f.version, f.modalidad]), [['estandar', 'run']]);
  assert.equal(de(CH_PROD[0].id).length, 1);
  assert.equal(x.r[3].body.mensaje, 'Ya estás inscripto en este desafío');
  assert.equal(x.r[4].status, 400);
});

test('Shopify (D-V4): la compra crea la inscripción en Estándar', async () => {
  const secreto = 'secreto-de-prueba';
  const orden = JSON.stringify({ id: 990001, email: 'compra@ejemplo.com', customer: { first_name: 'Ana', last_name: 'Compra' }, line_items: [{ product_id: 8780043288754, quantity: 1 }] });
  const firma = crypto.createHmac('sha256', secreto).update(orden).digest('base64');
  const x = await correr({
    entorno: { SHOPIFY_WEBHOOK_SECRET: secreto },
    ini: tablas({ ucs: [], extra: { shopify_orders_procesadas: [] } }),
    pedidos: [(b) => b.pedir({ metodo: 'POST', ruta: '/shopify/webhook/order', crudo: orden, headers: { 'x-shopify-hmac-sha256': firma } })],
  });
  assert.equal(x.r[0].status, 200);
  const nuevo = x.db.users.find((u) => u.email === 'compra@ejemplo.com');
  const ins = x.db.user_challenges.filter((f) => f.user_id === nuevo.id);
  assert.deepEqual(ins.map((f) => [f.challenge_id, f.version, f.modalidad, f.status]), [[FIN, 'estandar', 'run', 'active']]);
});

test('D-V1 (caminos viejos): certificado con la distancia de la versión — carga manual, marcar-cargado y /test/certificado', async () => {
  const manual = (b) => b.pedir({ metodo: 'POST', ruta: '/actividades/manual', body: { user_id: U, challenge_id: FIN, sport_type: 'ride', distance_km: 10, recorded_at: '2026-09-03T07:00:00' } });
  const ext = await correr({ ini: tablas({ ucs: [uc({ version: 'extendida', modalidad: 'ride', km_completed: 300 })], actividades: [act(300, 'ride')] }), pedidos: [manual] });
  assert.equal(ext.db.user_challenges[0].status, 'completed');
  assert.deepEqual(ext.efectos.certificados.map((c) => c.km), [309]);

  const est = await correr({ ini: tablas({ ucs: [uc({ km_completed: 100 })], actividades: [act(100, 'walk')] }), pedidos: [manual] });
  assert.deepEqual(est.efectos.certificados.map((c) => c.km), [103]);

  const cargado = await correr({
    ini: tablas({ ucs: [uc({ version: 'extendida', modalidad: 'ride', status: 'completed', km_completed: 310, completed_at: '2026-09-20T00:00:00' })] }),
    pedidos: [(b) => b.pedir({ metodo: 'POST', ruta: '/admin/marcar-cargado', body: { user_challenge_id: 'uc1' } })],
  });
  assert.deepEqual(cargado.efectos.certificados.map((c) => c.km), [309]);

  const reenvio = await correr({
    ini: tablas({ ucs: [uc({ version: 'extendida', modalidad: 'ride', status: 'shipped', km_completed: 312, completed_at: '2026-09-20T00:00:00' })] }),
    pedidos: [(b) => b.pedir({ metodo: 'GET', ruta: `/test/certificado/${U}/${FIN}` }), (b) => b.pedir({ metodo: 'GET', ruta: '/test/reenviar-certificados' })],
  });
  assert.deepEqual(reenvio.efectos.certificados.map((c) => c.km), [309]); // el segundo ya tiene serial: no reemite
});

test('Home Strava: version + label, distancia de la versión (también pending) y campo legacy para apps publicadas', async () => {
  const otro = uc({ id: 'uc2', challenge_id: CH_PROD[0].id, version: 'extendida', modalidad: 'ride', status: 'pending' });
  const x = await correr({
    ini: tablas({ ucs: [uc({ version: 'extendida', modalidad: 'ride', km_completed: 56 }), otro], actividades: MEZCLA() }),
    pedidos: [(b) => b.pedir({ metodo: 'GET', ruta: `/strava/progreso/${U}` })],
  });
  const lista = Array.isArray(x.r[0].body) ? x.r[0].body : x.r[0].body.challenges || x.r[0].body.resultados || x.r[0].body.retos;
  assert.ok(Array.isArray(lista), JSON.stringify(x.r[0].body).slice(0, 300));
  const fin = lista.find((c) => c.challenge_id === FIN);
  assert.deepEqual([fin.version, fin.version_label, fin.distancia_total, fin.km_completados, fin.modalidad], ['extendida', 'Extendida', 309, '56.00', 'Ciclismo']);
  const dub = lista.find((c) => c.challenge_id === CH_PROD[0].id);
  assert.deepEqual([dub.version, dub.distancia_total], ['extendida', 58.2]);
  assert.equal(x.db.user_challenges[0].km_completed, 56); // ni sube ni baja por la versión
});

test('Ranking: porcentaje sobre la distancia de la versión de cada uno', async () => {
  const x = await correr({
    ini: tablas({ ucs: [uc({ km_completed: 51.5 }), uc({ id: 'uc2', user_id: '22222222-2222-4222-8222-222222222222', version: 'extendida', modalidad: 'ride', km_completed: 154.5 })] }),
    pedidos: [(b) => b.pedir({ metodo: 'GET', ruta: `/ranking/${FIN}` })],
  });
  const porVersion = Object.fromEntries(x.r[0].body.map((p) => [p.version, p.porcentaje]));
  assert.deepEqual(porVersion, { estandar: '50.0', extendida: '50.0' });
});

test('Invitaciones: formulario con Estándar/Extendida (sin Running/Ciclismo) e inscripción en la versión elegida', async () => {
  const inv = (token) => ({ id: `i-${token}`, token, challenge_id: FIN, created_by: U, used_by: null, expires_at: '2099-01-01T00:00:00Z', challenges: undefined });
  const x = await correr({
    ini: tablas({ ucs: [], extra: { invitations: [inv('t1'), inv('t2')] } }),
    pedidos: [
      (b) => b.pedir({ metodo: 'GET', ruta: '/invitaciones/t1' }),
      (b) => b.pedir({ metodo: 'POST', ruta: '/invitaciones/t1', body: { nombre: 'Invitada Uno', email: 'uno@ejemplo.com', version: 'extendida' } }),
      (b) => b.pedir({ metodo: 'POST', ruta: '/invitaciones/t2', body: { nombre: 'Invitado Dos', email: 'dos@ejemplo.com', modalidad: 'run' } }),
    ],
  });
  const html = x.r[0].body;
  assert.match(html, /<option value="estandar">Estándar — 103 km<\/option>/);
  assert.match(html, /<option value="extendida">Extendida — 309 km<\/option>/);
  assert.doesNotMatch(html, /Running|Ciclismo/);
  const de = (email) => x.db.user_challenges.find((f) => f.user_id === x.db.users.find((u) => u.email === email).id);
  assert.deepEqual([de('uno@ejemplo.com').version, de('uno@ejemplo.com').modalidad], ['extendida', 'ride']);
  assert.equal(de('dos@ejemplo.com').version, 'estandar');
  assert.match(x.r[1].body, /versión Extendida/);
});
