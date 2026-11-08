const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { levantarBackend } = require('./helpers/backendHijo');
const { calcularProgresoChallenge } = require('../lib/progresoDesafio');
const { decidirAccion } = require('../lib/progresoDecision');
const { generarBibYPostal } = require('../generador_bib');
const appia = require('./fixtures/viaAppia.json');
const camino = require('./fixtures/caminoSantiago.json');
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'appia@example.test', name: 'Prueba local', bib_number: '0042' };
const uc = extra => ({ id: 'uc-appia', user_id: USER.id, challenge_id: appia.id, status: 'active', version: 'estandar', modalidad: 'run', km_completed: 0, km_base: 0, started_at: '2026-11-01T00:00:00Z', pausado: false, periodos_pausados: [], ...extra });
async function conBackend(tablas, ejecutar) {
  const b = await levantarBackend({ flag: 'efectos,actividad_manual', tablas: { users: [USER], challenges: [appia, camino], activities: [], user_challenges: [], progreso_eventos: [], shopify_orders_procesadas: [], ...tablas }, entorno: { PRUEBA_PDF_FALSO: '1', SHOPIFY_WEBHOOK_SECRET: 'appia-test' } });
  let salida;
  try { await ejecutar(b); } finally { salida = await b.cerrar(); }
  assert.equal(salida.exitCode, 0, salida.logs);
  return salida;
}
const comprar = b => {
  const crudo = JSON.stringify({ id: 9990006, email: USER.email, line_items: [{ product_id: 15473077780658, quantity: 1 }] });
  return b.pedir({ metodo: 'POST', ruta: '/shopify/webhook/order', crudo, headers: { 'x-shopify-hmac-sha256': crypto.createHmac('sha256', 'appia-test').update(crudo).digest('base64') } });
};

test('Vía Appia: ficha y Santiago quedan fuera del catálogo; los dos siguen disponibles para administración', async () => {
  await conBackend({}, async b => {
    const publico = await b.pedir({ metodo: 'GET', ruta: '/challenges' });
    assert.equal(publico.status, 200);
    assert.deepEqual(publico.body, []);
    const todas = await b.pedir({ metodo: 'GET', ruta: '/challenges/todos' });
    const ficha = todas.body.find(c => c.id === appia.id);
    assert.equal(ficha.checkpoints.length, 13);
    assert.equal(ficha.medal_code, '1001-ry-006');
    assert.equal(ficha.link_shopify, 'https://korva.run/products/desafio-virtual-611km-via-appia-roma');
  });
});

test('Vía Appia: compra firmada activa el desafío correcto y un reintento no lo duplica', async () => {
  const r = await conBackend({}, async b => {
    assert.equal((await comprar(b)).status, 200);
    assert.equal((await comprar(b)).status, 200);
  });
  assert.deepEqual(r.db.user_challenges.map(c => [c.challenge_id, c.status, c.version]), [[appia.id, 'active', 'estandar']]);
  assert.equal(r.efectos.emails.filter(e => e.para === USER.email).length, 1);
});

test('Vía Appia: compra pendiente, 611 km, certificado y aviso una sola vez; Santiago no cambia', async () => {
  const otra = uc({ id: 'uc-camino', challenge_id: camino.id, status: 'pending', km_completed: 0 });
  const r = await conBackend({ user_challenges: [uc({ status: 'pending' }), otra] }, async b => {
    await comprar(b);
    for (const [distance_km, sport_type] of [[250, 'walk'], [250, 'run'], [111, 'ride']]) {
      const respuesta = await b.pedir({ metodo: 'POST', ruta: '/actividades/manual', body: { user_id: USER.id, challenge_id: appia.id, distance_km, sport_type, recorded_at: '2026-11-02T10:00:00Z' } });
      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
    }
    await comprar(b);
  });
  assert.deepEqual(r.db.user_challenges.filter(c => c.challenge_id === appia.id).map(c => [c.status, c.km_completed]), [['completed', 611]]);
  assert.deepEqual(r.db.user_challenges.find(c => c.id === otra.id), otra);
  assert.deepEqual(r.efectos.certificados.map(c => c.km), [611]);
  assert.equal(r.efectos.emails.filter(e => /Medalla lista para despachar/.test(e.asunto)).length, 1);
});

test('Vía Appia: única distancia 611; una versión legacy no ofrecida vuelve a la única opción del desafío', () => {
  for (const [version, total] of [['estandar', 611], ['extendida', 611]]) {
    for (const [km, esperado] of [[total - 1, false], [total, true]]) {
      const fila = uc({ version });
      const resultado = calcularProgresoChallenge({ uc: fila, challenge: appia, actividades: [{ id: 'prueba', user_id: USER.id, recorded_at: '2026-11-02T10:00:00Z', distance_km: km, sport_type: 'ride', excluida: false }] });
      assert.equal(decidirAccion(fila, resultado).accion === 'completar', esperado);
    }
  }
});

test('Vía Appia: si faltan las plantillas no usa las de otro desafío', async () => {
  const rutas = [];
  const supabase = { storage: { from: () => ({ download: async ruta => { rutas.push(ruta); return { data: null, error: { message: 'Pendiente de carga' } }; } }) } };
  assert.equal(await generarBibYPostal(supabase, 'Prueba', 1, appia.id), null);
  assert.deepEqual(rutas, ['Plantillas/Dorsales_ViaAppia.pptx']);
});
