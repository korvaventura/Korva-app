const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../services/health/aportesDesafios'), 'utf8').replace(/^import .*;\n/gm, '').replace(/export /g, '');
const cargar = (id, respuesta, onFetch) => vm.runInNewContext(source + '\nconsultarAportesHealth;', {
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token', user: { id } } } }) } },
  fetch: async (...args) => { onFetch?.(...args); return { ok: true, json: async () => respuesta }; }, Date, Error,
});
test('aportes: cambio de cuenta impide consultar o escribir', async () => {
  let llamadas = 0;
  const consultar = cargar('otra', {}, () => { llamadas++; });
  await assert.rejects(consultar('u'), /sesión/);
  await assert.rejects(consultar('u', { activo: true }), /sesión/);
  assert.equal(llamadas, 0);
});
test('aportes: respuesta inválida no se presenta como selección disponible', async () => {
  for (const r of [{}, { disponible: true, desafios: [] }, { disponible: true, version: 'movimiento-desafios-v1', desafios: [{ id: 'p', tipo: 'pago', titulo: 'Fuji', activo: true, desde: 'mal' }] }]) {
    await assert.rejects(cargar('u', r)('u'), /validar/);
  }
  assert.equal((await cargar('u', { disponible: false, desafios: [] })('u')).disponible, false);
});
test('aportes: no envía consentimiento al consultar; POST necesita éxito explícito', async () => {
  let enviado;
  const consultar = cargar('u', { disponible: true, version: 'movimiento-desafios-v1', desafios: [] }, (_url, opts) => { enviado = opts; });
  await consultar('u'); assert.equal(enviado.method, 'GET'); assert.equal(enviado.body, undefined);
  const cambio = { id: 'p', tipo: 'pago', activo: true, confirmo: true };
  await cargar('u', { ok: true }, (_url, opts) => { enviado = opts; })('u', cambio);
  assert.equal(enviado.method, 'POST'); assert.equal(enviado.headers.Authorization, 'Bearer token');
  assert.deepEqual(JSON.parse(enviado.body), cambio);
  await assert.rejects(cargar('u', {})('u', cambio), /confirmado/);
});
