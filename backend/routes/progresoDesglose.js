// Etapa 5 — transparencia del progreso.
// Devuelve el desglose usando el MISMO motor unificado en modo SIMULAR.
// Es solo lectura: no escribe km_completed, status, eventos ni daily_movement.
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const requireUser = require('../middleware/requireUser');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { recalcularProgresoUsuario, MODOS } = require('../lib/progresoServicio');
const { calcularProgresoChallenge, MOTIVOS } = require('../lib/progresoDesafio');

const getSupabase = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET);

router.get('/', requireUser, async (req, res) => {
  try {
    // El movimiento pasivo pertenece a Tu movimiento, no al desafío sin opt-in explícito.
    const incluirHealth = false;
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


// Historia de un desafío: devuelve solo actividades que el mismo núcleo 4A considera
// contribuciones válidas (inicio, pausas y exclusiones). Read-only y autenticado.
router.get('/:challengeId/actividades', requireUser, async (req, res) => {
  try {
    const repo = crearRepositorioSupabase(getSupabase());
    const estado = await repo.leerEstadoUsuario(req.userId);
    const uc = estado.userChallenges.find((x) => x.challenge_id === req.params.challengeId);
    if (!uc) return res.status(404).json({ error: 'Desafío no encontrado.' });

    const challenge = estado.challenges.get(uc.challenge_id) || null;
    const calculado = calcularProgresoChallenge({
      uc,
      challenge,
      actividades: estado.actividades,
      incluirDetalle: true,
    });
    const idsQueCuentan = new Set(
      (calculado.detalle_actividades || [])
        .filter((a) => a.motivo === MOTIVOS.CUENTA)
        .map((a) => a.id)
    );
    const completadoMs = uc.completed_at ? Date.parse(uc.completed_at) : null;
    const actividades = estado.actividades
      .filter((a) => idsQueCuentan.has(a.id))
      .filter((a) => !Number.isFinite(completadoMs) || Date.parse(a.recorded_at) <= completadoMs)
      .sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)));

    return res.json({
      user_challenge_id: uc.id,
      challenge_id: uc.challenge_id,
      started_at: calculado.started_at_utc,
      actividades,
    });
  } catch (e) {
    console.error('[progreso-desglose/actividades]', e.message);
    return res.status(500).json({ error: 'No se pudo cargar la historia del desafío.' });
  }
});

module.exports = router;
