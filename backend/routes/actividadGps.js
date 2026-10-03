const express = require('express');
const requireUser = require('../middleware/requireUser');
const { registrarActividadGpsConMotor } = require('../lib/actividadGps');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');

const DEPORTES = new Set(['run', 'walk', 'ride']);
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

const crearActividadGpsRoutes = ({ supabase, procesadorEventos }) => {
  const router = express.Router();

  router.post('/', requireUser, async (req, res) => {
    const { session_id, sport_type, distance_km, duration_seconds, recorded_at } = req.body || {};
    const distancia = Number(distance_km);
    const duracion = Number(duration_seconds);
    const fecha = new Date(recorded_at);

    if (!SESSION_ID_RE.test(String(session_id || ''))) {
      return res.status(400).json({ error: 'session_id inválido.' });
    }
    if (!DEPORTES.has(sport_type)) {
      return res.status(400).json({ error: 'Deporte inválido.' });
    }
    if (!Number.isFinite(distancia) || distancia < 0.01 || distancia > 500) {
      return res.status(400).json({ error: 'Distancia inválida.' });
    }
    if (!Number.isFinite(duracion) || duracion < 1 || duracion > 7 * 24 * 3600) {
      return res.status(400).json({ error: 'Duración inválida.' });
    }
    if (!recorded_at || Number.isNaN(fecha.getTime())) {
      return res.status(400).json({ error: 'Fecha inválida.' });
    }
    const ahora = Date.now();
    if (fecha.getTime() > ahora + 5 * 60 * 1000 || fecha.getTime() < ahora - 30 * 24 * 3600 * 1000) {
      return res.status(400).json({ error: 'Fecha fuera de rango.' });
    }

    try {
      const resultado = await registrarActividadGpsConMotor({
        repo: crearRepositorioSupabase(supabase),
        userId: req.userId,
        sessionId: session_id,
        sportType: sport_type,
        distanceKm: distancia,
        durationSeconds: Math.round(duracion),
        recordedAt: fecha.toISOString(),
        dispararEfectos: (ids) => procesadorEventos.disparar(ids),
      });
      return res.status(resultado.status).json(resultado.body);
    } catch (error) {
      console.error('[korva_gps] error:', error.message);
      return res.status(500).json({ error: 'No se pudo registrar la actividad.' });
    }
  });

  return router;
};

module.exports = { crearActividadGpsRoutes };
