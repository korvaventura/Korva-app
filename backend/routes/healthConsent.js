const express = require('express');
const requireUser = require('../middleware/requireUser');
const { aportesHealthDisponibles } = require('../lib/flagsMotor');
const { VERSION_CONSENTIMIENTO } = require('../lib/consentimientoHealth');
const { traerTodo } = require('../lib/progresoSombra');
const { ISLANDIA } = require('../lib/rutasLibres');
const { prepararRecalculoHealth, terminarRecalculoHealth } = require('../lib/healthRecalculo');
function crearHealthConsentRoutes({ supabase, auth = requireUser, disponible = aportesHealthDisponibles, dispararEfectos = () => {} }) {
  const router = express.Router();
  router.use(auth);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.vary('Authorization'); next(); });
  const fallar = (res, e) => {
    console.error('[health-consent]', e.code || e.message);
    return res.status(['42P01','PGRST202','PGRST205'].includes(e.code) ? 503 : 500)
      .json({ error: 'No pudimos configurar los aportes de Salud. Intentá nuevamente más tarde.' });
  };
  router.get('/', async (req, res) => {
    if (!disponible()) return res.json({ disponible: false, desafios: [] });
    try {
      const ventanas = await traerTodo(() => supabase.from('health_challenge_consents').select('*').eq('user_id', req.userId));
      const pagos = await traerTodo(() => supabase.from('user_challenges').select('id,challenge_id,pausado').eq('user_id', req.userId).eq('status', 'active'));
      const libres = await traerTodo(() => supabase.from('free_route_participations').select('id,route_id,paused_at')
        .eq('user_id', req.userId).is('left_at', null).is('health_completed_at', null));
      const titulos = new Map();
      for (let i = 0; i < pagos.length; i += 100) {
        const filas = await traerTodo(() => supabase.from('challenges').select('id,title').in('id', pagos.slice(i, i + 100).map((p) => p.challenge_id)));
        filas.forEach((c) => titulos.set(c.id, c.title));
      }
      const entrada = (p, tipo, titulo, pausado) => {
        const abierto = ventanas.find((v) => v.tipo === tipo && v.participacion_id === p.id && v.hasta === null);
        return { id: p.id, tipo, titulo, pausado: !!pausado, activo: !!abierto, desde: abierto?.desde || null, timezone: abierto?.timezone || null };
      };
      return res.json({ disponible: true, version: VERSION_CONSENTIMIENTO, desafios: [
        ...pagos.map((p) => entrada(p, 'pago', titulos.get(p.challenge_id) || 'Mi desafío', p.pausado)),
        ...libres.filter((p) => p.route_id === ISLANDIA.id).map((p) => entrada(p, 'libre', ISLANDIA.titulo, p.paused_at)),
      ] });
    } catch (e) { return fallar(res, e); }
  });
  router.post('/', async (req, res) => {
    if (!disponible()) return res.status(503).json({ error: 'Los aportes de Salud todavía no están habilitados.' });
    const { id, tipo, activo, timezone, version, confirmo } = req.body || {};
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')
      || !['pago','libre'].includes(tipo) || typeof activo !== 'boolean' || typeof timezone !== 'string'
      || version !== VERSION_CONSENTIMIENTO || confirmo !== true) return res.status(400).json({ error: 'Elegí el desafío y confirmá las condiciones.' });
    try {
      const { error } = await supabase.rpc('korva_health_consent', { p_user_id: req.userId,
        p_tipo: tipo, p_participacion_id: id, p_activo: activo, p_timezone: timezone, p_version: version });
      if (error) {
        if (error.code === 'P0001') return res.status(409).json({ error: error.message });
        throw error;
      }
      const preparado = await prepararRecalculoHealth(supabase, req.userId);
      const recalculo = await terminarRecalculoHealth(preparado, req.userId, dispararEfectos);
      return res.json({ ok: true, progreso: recalculo.ok ? 'actualizado' : 'pendiente' });
    } catch (e) { return fallar(res, e); }
  });
  return router;
}
module.exports = { crearHealthConsentRoutes };
