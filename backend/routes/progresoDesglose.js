// Etapa 5 — transparencia del progreso.
// Devuelve el desglose usando el MISMO motor unificado en modo SIMULAR.
// Es solo lectura: no escribe km_completed, status, eventos ni daily_movement.
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const requireUser = require('../middleware/requireUser');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { recalcularProgresoUsuario, MODOS } = require('../lib/progresoServicio');
const { healthMotorActivo } = require('../lib/flagsMotor');

const getSupabase = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET);

router.get('/', requireUser, async (req, res) => {
  try {
    const incluirHealth = healthMotorActivo();
    const informe = await recalcularProgresoUsuario({
      repo: crearRepositorioSupabase(getSupabase()),
      userId: req.userId,
      motivo: 'transparencia_ui',
      modo: MODOS.SIMULAR,
      incluirHealth,
    });

    return res.json({
      health_activo: incluirHealth,
      desafios: informe.desafios.map((d) => ({
        user_challenge_id: d.user_challenge_id,
        challenge_id: d.challenge_id,
        status: d.status_leido,
        km_total: d.km_nuevo,
        km_base: d.km_base || 0,
        km_actividades: d.km_actividades || 0,
        km_movimiento_diario: d.health?.elegible_km || 0,
        km_movimiento_estable: d.health?.estable_km || 0,
      })),
    });
  } catch (e) {
    console.error('[progreso-desglose]', e.message);
    return res.status(500).json({ error: 'No se pudo cargar el desglose del progreso.' });
  }
});

module.exports = router;
