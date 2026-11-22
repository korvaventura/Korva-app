const express = require('express');
const { ipGarmin, ipDePeticion } = require('../lib/garminPushCore');
function normalizarConsentimiento(body, type) {
  const key = type === 'deregistration' ? 'deregistrations' : 'userPermissionsChange';
  if (!body || Array.isArray(body) || !Array.isArray(body[key]) || body[key].length > 1000
    || Object.keys(body).some(k => k !== key)) throw Error('invalid_payload');
  return body[key].map(row => {
    if (!row || typeof row.userId !== 'string' || !row.userId || row.userId.length > 256) throw Error('invalid_payload');
    if (type === 'deregistration') return { garmin_user_id: row.userId };
    if (!Array.isArray(row.permissions) || row.permissions.length > 64
      || row.permissions.some(p => typeof p !== 'string' || !/^[A-Z_]{1,80}$/.test(p))
      || !Number.isSafeInteger(row.changeTimeInSeconds) || row.changeTimeInSeconds < 0
      || row.changeTimeInSeconds > Date.now() / 1000 + 86400) throw Error('invalid_payload');
    return { garmin_user_id: row.userId, permissions: [...new Set(row.permissions)], changed_at: new Date(row.changeTimeInSeconds * 1000).toISOString() };
  });
}
function crearGarminConsentRoutes({ supabase, env = process.env,
  obtenerIp = req => ipDePeticion(req, env), log = () => {} }) {
  const router = express.Router();
  // Consent removal must work even when OAuth, capture or public beta are disabled.
  for (const type of ['deregistration','permissions']) {
    router.post(`/${type}`, (req, res, next) => {
      if (!ipGarmin(obtenerIp(req))) return res.sendStatus(403);
      next();
    }, express.json({limit:'256kb',strict:true}), async (req, res) => {
      let rows;
      try { rows = normalizarConsentimiento(req.body, type); }
      catch { return res.sendStatus(400); }
      try {
        const { error } = await supabase.rpc('korva_garmin_consent', { p_type:type, p_rows:rows });
        if (error) throw error;
        log({result:'consent_applied',type,count:rows.length});
        res.set('Cache-Control','no-store').status(200).json({accepted:true});
      } catch { res.sendStatus(503); }
    });
  }
  router.use((err,req,res,next) => res.sendStatus(err.type === 'entity.too.large' ? 413 : 400));
  return router;
}
module.exports = { crearGarminConsentRoutes, normalizarConsentimiento };
