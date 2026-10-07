const express = require('express');
const requireUser = require('../middleware/requireUser');
const { traerTodo } = require('../lib/progresoSombra');
const { ISLANDIA, progresoRutaLibre } = require('../lib/rutasLibres');
const { healthConsentActivo } = require('../lib/flagsMotor');
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
        .select('id,user_id,recorded_at,distance_km,duration_seconds,sport_type,excluida').eq('user_id', req.userId)) : [];
      let health = null;
      if (p && healthConsentActivo()) {
        const ventanas = await traerTodo(() => supabase.from('health_challenge_consents').select('*')
          .eq('user_id', req.userId).eq('tipo', 'libre').eq('participacion_id', p.id));
        const dias = ventanas.length ? await traerTodo(() => supabase.from('daily_movement').select('*').eq('user_id', req.userId)) : [];
        health = { ventanas, dias };
      }
      let participacion = progresoRutaLibre(p, actividades, req.userId, ahora(), health);
      if (p && !p.health_completed_at && participacion?.completed_at && participacion.km_movimiento_diario > 0) {
        // Cierre estable y condicionado: otra lectura no puede cambiar la fecha ganadora.
        const { error: errorCierre } = await supabase.from('free_route_participations').update({
          health_completed_at: participacion.completed_at, health_started_at: participacion.started_at,
        }).eq('id', p.id).eq('user_id', req.userId).is('health_completed_at', null).is('paused_at', null).is('left_at', null);
        if (errorCierre) throw errorCierre;
        const { data: cerrado, error: errorLectura } = await supabase.from('free_route_participations').select('*')
          .eq('id', p.id).eq('user_id', req.userId).single();
        if (errorLectura) throw errorLectura;
        participacion = progresoRutaLibre(cerrado, actividades, req.userId, ahora(), health);
      }
      return res.json({ ruta: ISLANDIA, participacion });
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
