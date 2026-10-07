const test = require('node:test'); const assert = require('node:assert/strict');
process.env.SUPABASE_URL ||= 'https://example.supabase.co'; process.env.SUPABASE_SECRET ||= 'test';
const express = require('express');
const { crearHealthConsentRoutes } = require('../routes/healthConsent');
const { aportesHealthDisponibles, WRITERS_CONOCIDOS } = require('../lib/flagsMotor');
const body = { id: '11111111-1111-4111-8111-111111111111', tipo: 'pago', activo: true,
  timezone: 'UTC', version: 'movimiento-desafios-v1', confirmo: true };
async function servidor(repo, fn, disponible = () => true) {
  const app = express(); app.use(express.json()); app.use('/health', crearHealthConsentRoutes({ supabase: repo,
    disponible, auth: (req,res,next) => { if (req.headers.authorization !== 'Bearer test') return res.sendStatus(401); req.userId = 'real'; next(); } }));
  const s = app.listen(0, '127.0.0.1'); await new Promise((r) => s.once('listening', r));
  const pedir = async (datos, auth = true) => {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/health`, { method: datos ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer test' } : {}) },
      ...(datos ? { body: JSON.stringify(datos) } : {}) });
    return { status: r.status, cache: r.headers.get('cache-control'), datos: r.headers.get('content-type')?.includes('json') ? await r.json() : null };
  };
  try { await fn(pedir); } finally { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
}
test('aportes solo disponibles con todos los writers que preservan Salud', () => {
  const env = { MOTOR_PROGRESO_HEALTH_CONSENT: '1', MOTOR_PROGRESO_GPS: '1', MOTOR_PROGRESO_WRITERS: WRITERS_CONOCIDOS.join(',') };
  assert.equal(aportesHealthDisponibles(env), true);
  for (const w of WRITERS_CONOCIDOS) assert.equal(aportesHealthDisponibles({ ...env, MOTOR_PROGRESO_WRITERS: WRITERS_CONOCIDOS.filter((v) => v !== w).join(',') }), false);
  assert.equal(aportesHealthDisponibles({ ...env, MOTOR_PROGRESO_HEALTH_CONSENT: '0' }), false);
});
test('JWT obligatorio y confirmación versionada antes de escribir', async () => {
  let llamadas = 0;
  await servidor({ rpc: async () => { llamadas++; return { error: null }; } }, async (pedir) => {
    assert.equal((await pedir(body, false)).status, 401);
    for (const cambio of [{ confirmo: false }, { confirmo: 'true' }, { version: 'vieja' }, { activo: 1 }, { id: 'mal' }, { tipo: 'otro' }]) {
      assert.equal((await pedir({ ...body, ...cambio })).status, 400);
    }
    assert.equal(llamadas, 0);
  });
});
test('consentimiento usa propietario del JWT, ignora user_id enviado', async () => {
  let args;
  await servidor({ rpc: async (nombre,p) => { args = { nombre,p }; return { error: null }; } }, async (pedir) => {
    const r = await pedir({ ...body, user_id: 'intruso' });
    assert.equal(r.status, 200); assert.equal(r.cache, 'private, no-store');
    assert.equal(args.nombre, 'korva_health_consent'); assert.equal(args.p.p_user_id, 'real');
  });
});
test('flag apagada no consulta tabla ni registra un consentimiento', async () => {
  await servidor({ rpc: () => { throw Error('no escribir'); }, from: () => { throw Error('no leer'); } }, async (pedir) => {
    assert.equal((await pedir()).datos.disponible, false); assert.equal((await pedir(body)).status, 503);
  }, () => false);
});
test('participación ajena rechazada por RPC y migración ausente no se presentan como éxito', async () => {
  for (const [code, status] of [['P0001',409],['PGRST202',503]]) {
    await servidor({ rpc: async () => ({ error: { code, message: 'No disponible' } }) }, async (pedir) => assert.equal((await pedir(body)).status, status));
  }
});
