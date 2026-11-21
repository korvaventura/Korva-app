const express = require('express');
const { normalizarLote, ipGarmin, ipDePeticion } = require('../lib/garminPushCore');
const { crearGarminPushRepositorio } = require('../lib/garminPushRepositorio');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function crearGarminPushRoutes({ supabase, repo = crearGarminPushRepositorio(supabase), env = process.env,
  log = (entry) => console.info('korva_garmin_push', JSON.stringify(entry)), obtenerIp = (req) => ipDePeticion(req, env) }) {
  const router = express.Router();
  const trace = (entry) => { try { log(entry); } catch {} };
  trace({ result: 'configured', capture_enabled: env.GARMIN_PUSH_CAPTURE_ENABLED === '1',
    origin_mode: env.RAILWAY_ENVIRONMENT_ID ? 'railway_edge' : 'socket', activities_enabled: false });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/webhook', (req, res, next) => {
    const ids = (env.GARMIN_OAUTH_TEST_USER_IDS || '').split(',').map((s) => s.trim()).filter((s) => UUID.test(s));
    if (env.GARMIN_PUSH_CAPTURE_ENABLED !== '1' || env.GARMIN_OAUTH_ENABLED !== '1' || !ids.length) return res.sendStatus(404);
    if (!ipGarmin(obtenerIp(req))) { trace({ result: 'origin_rejected' }); return res.sendStatus(403); }
    req.garminAllowedIds = ids;
    next();
  }, express.json({ limit: '2mb', strict: true }), async (req, res) => {
    let rows;
    try { rows = normalizarLote(req.body); }
    catch { trace({ result: 'invalid_payload' }); return res.sendStatus(400); }
    try {
      // Only durable capture happens before ACK. No activity/progress processing on this request.
      const result = await repo.registrar(rows, req.garminAllowedIds);
      trace({ result: 'captured', received: result.received, eligible: result.eligible, inserted: result.inserted,
        duplicates: result.eligible - result.inserted, activities_enabled: false });
      return res.status(200).json({ accepted: true });
    } catch {
      trace({ result: 'capture_failed' });
      return res.sendStatus(503); // No ACK without durable storage; Garmin retries.
    }
  });
  router.use((error, _req, res, _next) => {
    trace({ result: error.type === 'entity.too.large' ? 'payload_too_large' : 'invalid_json' });
    res.sendStatus(error.type === 'entity.too.large' ? 413 : 400);
  });
  return router;
}
module.exports = { crearGarminPushRoutes };
