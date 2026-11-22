const test = require('node:test');
const assert = require('node:assert/strict');
const { enviarNotificacionProgreso } = require('../routes/notificaciones');

const supabaseFalso = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { push_token: 'ExponentPushToken[x]', name: 'Ana Pérez' } }) }) }) }),
};

const capturar = async (fn) => {
  const enviados = [];
  const original = global.fetch;
  global.fetch = async (url, opts) => { enviados.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({}) }; };
  try { await fn(); } finally { global.fetch = original; }
  return enviados;
};

test('salida de Strava: el aviso de km lleva los datos para abrir compartir', async () => {
  const [push] = await capturar(() => enviarNotificacionProgreso(supabaseFalso, 'u1', 'c1', 'Monte Fuji 68K', 10, 18.2, 68, { external_id: 123 }));
  assert.equal(push.title, '✅ +8.2 km registrados');
  assert.match(push.body, /Tocá para compartir tu salida/);
  assert.deepEqual(push.data, { tipo: 'compartir_actividad', external_id: '123', challenge_id: 'c1' });
});

test('sin salida de Strava el aviso queda como antes y sin datos', async () => {
  const [push] = await capturar(() => enviarNotificacionProgreso(supabaseFalso, 'u1', 'c1', 'Monte Fuji 68K', 10, 18.2, 68));
  assert.equal(push.data, undefined);
  assert.match(push.body, /Muy bien, Ana/);
});

test('el aviso de hito también abre compartir', async () => {
  const [push] = await capturar(() => enviarNotificacionProgreso(supabaseFalso, 'u1', 'c1', 'Monte Fuji 68K', 30, 36, 68, { external_id: 'abc' }));
  assert.equal(push.title, '⚡ ¡Mitad del camino!');
  assert.equal(push.data.external_id, 'abc');
});
