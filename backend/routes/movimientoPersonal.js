const express = require('express');
const requireUser = require('../middleware/requireUser');
const { esTimezoneValida } = require('../lib/residualMovimiento');
const { leerMovimientoPersonal } = require('../lib/movimientoPersonalLectura');

// GET /movimiento-personal?timezone=<zona IANA del teléfono>
// Solo lectura y autenticado. Nunca acepta un user_id elegido por el cliente.
function crearMovimientoPersonalRoutes({ supabase, ahora = Date.now, log = console.error }) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.vary('Authorization');
    next();
  });
  router.get('/', requireUser, async (req, res) => {
    const timezone = req.query.timezone;
    if (!esTimezoneValida(timezone)) {
      return res.status(400).json({ error: 'Se requiere una zona horaria IANA válida.' });
    }
    try {
      const resumen = await leerMovimientoPersonal({
        supabase, userId: req.userId, timezone, ahoraMs: ahora(),
      });
      return res.json(resumen);
    } catch (error) {
      log('[movimiento-personal] lectura:', error.message);
      return res.status(500).json({ error: 'No se pudo cargar tu movimiento. Intentá nuevamente.' });
    }
  });
  return router;
}

module.exports = { crearMovimientoPersonalRoutes };
