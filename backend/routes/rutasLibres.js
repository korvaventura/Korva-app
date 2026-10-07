const express = require('express');
const requireUser = require('../middleware/requireUser');
const { traerTodo } = require('../lib/progresoSombra');
const { ISLANDIA, progresoRutaLibre } = require('../lib/rutasLibres');
function crearRutasLibresRoutes({ supabase, auth = requireUser, ahora = Date.now, log = console.error }) {
  const router = express.Router();
  router.use(auth);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.vary('Authorization'); next(); });
  const fallar = (res, e) => {
    log('[rutas-libres]', e.message || e.code);
    const pendiente = ['42P01','PGRST202','PGRST205'].includes(e.code);
    return res.status(pendiente ? 503 : 500).json({ error: pendiente ? 'Las rutas gratuitas todavía no están habilitadas.' : 'No pudimos consultar tu ruta. Intentá nuevamente.' });
  };
  router.get('/islandia', async (req, res) => {
    try {
      const { data: p, error } = await supabase.from('free_route_participations').select('*')
        .eq('user_id', req.userId).eq('route_id', ISLANDIA.id).maybeSingle();
      if (error) throw error;
      const actividades = p ? await traerTodo(() => supabase.from('activities')
        .select('id,user_id,recorded_at,distance_km,excluida').eq('user_id', req.userId).gte('recorded_at', p.accepted_at)) : [];
      return res.json({ ruta: ISLANDIA, participacion: progresoRutaLibre(p, actividades, req.userId, ahora()) });
    } catch (e) { return fallar(res, e); }
  });
  router.post('/islandia/:accion', async (req, res) => {
    const accion = req.params.accion;
    if (!['aceptar','pausar','reanudar','dejar'].includes(accion)) return res.status(400).json({ error: 'Acción inválida.' });
    if (accion === 'aceptar' && (req.body?.acepto !== true || req.body?.version !== ISLANDIA.aceptacion_version)) {
      return res.status(400).json({ error: 'Confirmá las condiciones para empezar esta ruta gratuita.' });
    }
    try {
      const { error } = await supabase.rpc('korva_free_route_action', {
        p_user_id: req.userId, p_route_id: ISLANDIA.id, p_action: accion,
        p_acceptance_version: accion === 'aceptar' ? ISLANDIA.aceptacion_version : null,
      });
      if (error) {
        if (error.code === 'P0001') return res.status(409).json({ error: error.message });
        throw error;
      }
      return res.json({ ok: true });
    } catch (e) { return fallar(res, e); }
  });
  return router;
}
module.exports = { crearRutasLibresRoutes };
