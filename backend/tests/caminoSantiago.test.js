// Backend real y efectos simulados: nunca usa clientes, órdenes ni correos reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { levantarBackend } = require('./helpers/backendHijo');
const { calcularProgresoChallenge } = require('../lib/progresoDesafio');
const { decidirAccion } = require('../lib/progresoDecision');
const { generarBibYPostal } = require('../generador_bib');
const camino = require('./fixtures/caminoSantiago.json');
const FIN = 'ae54af78-dc6f-4cf5-af31-2c077ba58048';
const USER = { id: '11111111-1111-4111-8111-111111111111', name: 'Prueba local', email: 'camino@example.test', bib_number: '0042' };
const inscripcion = extra => ({ id: 'uc-camino', user_id: USER.id, challenge_id: camino.id, version: 'estandar', modalidad: 'run', status: 'active', km_completed: 0, km_base: 0, started_at: '2026-11-01T00:00:00Z', periodos_pausados: [], pausado: false, ...extra });
async function correr(tablas, ejecutar) {
  const b = await levantarBackend({ flag: 'efectos,actividad_manual', tablas, entorno: { SHOPIFY_WEBHOOK_SECRET: 'camino-secreto-test', PRUEBA_PDF_FALSO: '1' } });
  let respuestas;
  let salida;
  try { respuestas = await ejecutar(b); } finally { salida = await b.cerrar(); }
  assert.equal(salida.exitCode, 0, salida.logs);
  return { respuestas, ...salida };
}
const tablas = (extra = {}) => ({ users: [USER], challenges: [camino, { id: FIN, title: 'Fin del Mundo', total_distance_km: 103, is_active: true }], user_challenges: [], activities: [], progreso_eventos: [], shopify_orders_procesadas: [], ...extra });
const orden = (b, cantidad = 1) => {
  const crudo = JSON.stringify({ id: 9990001, email: USER.email, customer: { first_name: 'Prueba' }, line_items: [{ product_id: 15473077878962, quantity: cantidad }] });
  return b.pedir({ metodo: 'POST', ruta: '/shopify/webhook/order', crudo, headers: { 'x-shopify-hmac-sha256': crypto.createHmac('sha256', 'camino-secreto-test').update(crudo).digest('base64') } });
};

test('Camino inactivo: no aparece en catálogo y conserva sus 13 hitos en la consulta general', async () => {
  const r = await correr(tablas(), async b => [await b.pedir({ metodo: 'GET', ruta: '/challenges' }), await b.pedir({ metodo: 'GET', ruta: '/challenges/todos' })]);
  assert.equal(r.respuestas[0].status, 200);
  assert.ok(!r.respuestas[0].body.some(c => c.id === camino.id));
  const ficha = r.respuestas[1].body.find(c => c.id === camino.id);
  assert.equal(ficha.is_active, false);
  assert.equal(ficha.checkpoints.length, 13);
  assert.deepEqual([ficha.medal_image_url, ficha.imagen_portada, ficha.galeria], [null, null, []]);
});

test('Shopify Camino: activa sólo el nuevo desafío y un reintento no duplica inscripción ni correo', async () => {
  const anterior = inscripcion({ id: 'uc-fin', challenge_id: FIN, km_completed: 23 });
  const r = await correr(tablas({ user_challenges: [anterior] }), async b => [await orden(b), await orden(b)]);
  assert.deepEqual(r.respuestas.map(x => x.status), [200, 200]);
  const ins = r.db.user_challenges.filter(c => c.challenge_id === camino.id);
  assert.equal(ins.length, 1);
  assert.deepEqual([ins[0].status, ins[0].version, ins[0].km_completed], ['active', 'estandar', 0]);
  assert.deepEqual(r.db.user_challenges.find(c => c.id === 'uc-fin'), anterior);
  assert.equal(r.efectos.emails.filter(e => e.para === USER.email).length, 1);
});

test('Shopify Camino: reutiliza una inscripción pendiente en la única distancia ofrecida', async () => {
  const pendiente = inscripcion({ status: 'pending', version: 'estandar', modalidad: 'run' });
  const r = await correr(tablas({ user_challenges: [pendiente] }), async b => [await orden(b)]);
  assert.equal(r.db.user_challenges.length, 1);
  assert.deepEqual([r.db.user_challenges[0].id, r.db.user_challenges[0].status, r.db.user_challenges[0].version], ['uc-camino', 'active', 'estandar']);
});

test('Shopify Camino: dos unidades conservan el aviso de activación grupal del flujo existente', async () => {
  const r = await correr(tablas(), async b => [await orden(b, 2)]);
  assert.equal(r.db.user_challenges.filter(c => c.challenge_id === camino.id).length, 1);
  assert.ok(r.efectos.emails.some(e => /Compra grupal/.test(e.asunto)));
});

test('Camino: única distancia 775; caminar, correr y bici suman 1:1, incluso ante una versión legacy no ofrecida', () => {
  for (const [version, objetivo] of [['estandar', 775], ['extendida', 775]]) {
    const calcular = total => calcularProgresoChallenge({ uc: inscripcion({ version }), challenge: camino, actividades: ['walk', 'run', 'ride'].map((sport_type, i) => ({ id: String(i), user_id: USER.id, distance_km: total / 3, sport_type, recorded_at: '2026-11-02T10:00:00Z', excluida: false })) });
    const antes = calcular(objetivo - 1), completo = calcular(objetivo);
    assert.notEqual(decidirAccion(inscripcion({ version }), antes).accion, 'completar');
    assert.equal(decidirAccion(inscripcion({ version }), completo).accion, 'completar');
    assert.equal(completo.objetivo_km, objetivo);
    assert.equal(completo.km_progreso_sombra, objetivo);
  }
});

test('Camino: completar por carga manual emite un certificado de 775 km una sola vez', async () => {
  const previo = { id: 'act-previa', user_id: USER.id, distance_km: 774, sport_type: 'walk', source: 'manual', recorded_at: '2026-11-02T10:00:00Z', excluida: false };
  const r = await correr(tablas({ user_challenges: [inscripcion({ km_completed: 774 })], activities: [previo] }), async b => {
    const cargar = () => b.pedir({ metodo: 'POST', ruta: '/actividades/manual', body: { user_id: USER.id, challenge_id: camino.id, distance_km: 1, sport_type: 'run', recorded_at: '2026-11-03T10:00:00Z' } });
    return [await cargar(), await cargar()];
  });
  assert.deepEqual(r.respuestas.map(x => x.status), [200, 200]);
  assert.equal(r.db.user_challenges[0].status, 'completed');
  assert.deepEqual(r.efectos.certificados.map(c => c.km), [775]);
});

test('Camino sin plantilla cargada: pide su propio dorsal y no recurre al de Fin del Mundo', async () => {
  const pedidos = [];
  const supabase = { storage: { from: bucket => ({ download: async ruta => { pedidos.push([bucket, ruta]); return { data: null, error: { message: 'Archivo aún no cargado' } }; } }) } };
  assert.equal(await generarBibYPostal(supabase, 'Prueba local', 1, camino.id), null);
  assert.deepEqual(pedidos, [['korva-images', 'Plantillas/Dorsales_CaminoSantiago.pptx']]);
});

test('Camino integrado: inscripción, compra, progreso, certificado y aviso; sigue oculto al catálogo', async () => {
  const otraPersona = { ...USER, id: '22222222-2222-4222-8222-222222222222', email: 'otra@example.test' };
  const ajena = inscripcion({ id: 'uc-ajena', user_id: otraPersona.id, challenge_id: FIN, km_completed: 50 });
  const r = await correr(tablas({ users: [USER, otraPersona], user_challenges: [ajena] }), async b => {
    const pedir = async pedido => {
      const respuesta = await b.pedir(pedido);
      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
      assert.ok(!respuesta.body?.error, JSON.stringify(respuesta.body));
      return respuesta;
    };
    await pedir({ metodo: 'POST', ruta: '/challenges/inscribir', body: { user_id: USER.id, challenge_id: camino.id } });
    const pendiente = await pedir({ metodo: 'GET', ruta: `/strava/progreso/${USER.id}` });
    assert.equal(Number(pendiente.body.find(c => c.challenge_id === camino.id).km_completados), 0);
    assert.equal((await orden(b)).status, 200);
    let acumulado = 0;
    for (const [km, sport_type] of [[250, 'walk'], [250, 'run'], [275, 'ride']]) {
      await pedir({ metodo: 'POST', ruta: '/actividades/manual', body: { user_id: USER.id, challenge_id: camino.id, distance_km: km, sport_type, recorded_at: new Date().toISOString() } });
      acumulado += km;
      const home = await pedir({ metodo: 'GET', ruta: `/strava/progreso/${USER.id}` });
      const ficha = home.body.find(c => c.challenge_id === camino.id);
      assert.equal(Number(ficha.km_completados), acumulado);
      assert.equal(ficha.distancia_total, 775);
    }
    // Un reintento de la compra y una lectura posterior no vuelven a emitir efectos.
    await orden(b);
    const catalogo = await pedir({ metodo: 'GET', ruta: '/challenges' });
    assert.ok(!catalogo.body.some(c => c.id === camino.id));
    return [];
  });
  const propia = r.db.user_challenges.find(c => c.challenge_id === camino.id);
  assert.deepEqual([propia.user_id, propia.status, propia.km_completed], [USER.id, 'completed', 775]);
  assert.deepEqual(r.db.user_challenges.find(c => c.id === ajena.id), ajena);
  assert.deepEqual(r.efectos.certificados.map(c => c.km), [775]);
  assert.equal(r.efectos.emails.filter(e => /Medalla lista para despachar/.test(e.asunto)).length, 1);
});
