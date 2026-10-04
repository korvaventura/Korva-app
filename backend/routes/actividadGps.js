const express = require('express');
const requireUser = require('../middleware/requireUser');
const { registrarActividadGpsConMotor } = require('../lib/actividadGps');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { calcularDistanciaGpsServidor } = require('../lib/gpsValidacion');
const { gpsMotorActivo } = require('../lib/flagsMotor');
const { guardarRutaGps } = require('../lib/gpsRuta');

const DEPORTES = new Set(['run', 'walk', 'ride']);
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

const crearActividadGpsRoutes = ({ supabase, procesadorEventos }) => {
  const router = express.Router();

  const requireGpsActivo = (req, res, next) => {
    if (!gpsMotorActivo()) {
      return res.status(503).json({ error: 'GPS Korva todavía no está habilitado.' });
    }
    return next();
  };

  router.post('/', requireGpsActivo, requireUser, async (req, res) => {
    const { session_id, sport_type, duration_seconds, recorded_at, puntos } = req.body || {};
    const duracion = Number(duration_seconds);
    const recorrido = calcularDistanciaGpsServidor(puntos);
    const fecha = new Date(recorded_at);

    if (!SESSION_ID_RE.test(String(session_id || ''))) {
      return res.status(400).json({ error: 'session_id inválido.' });
    }
    if (!DEPORTES.has(sport_type)) {
      return res.status(400).json({ error: 'Deporte inválido.' });
    }
    if (!recorrido.ok || recorrido.distanciaKm > 500) {
      return res.status(400).json({ error: 'Recorrido GPS inválido o insuficiente.' });
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
        distanceKm: recorrido.distanciaKm,
        durationSeconds: Math.round(duracion),
        recordedAt: fecha.toISOString(),
        dispararEfectos: (ids) => procesadorEventos.disparar(ids),
      });

      // La actividad/progreso es la operación principal. La ruta se persiste después y es
      // idempotente por (user_id, session_id); si falla, no se duplica ni revierte progreso.
      const activityId = resultado.body?.actividad?.id;
      if (activityId) {
        try {
          await guardarRutaGps({
            supabase,
            userId: req.userId,
            activityId,
            sessionId: session_id,
            puntos: recorrido.puntosValidos,
          });
          resultado.body.ruta_guardada = true;
        } catch (e) {
          console.error('[korva_gps] ruta pendiente:', e.message);
          resultado.body.ruta_guardada = false;
        }
      }
      return res.status(resultado.status).json(resultado.body);
    } catch (error) {
      console.error('[korva_gps] error:', error.message);
      return res.status(500).json({ error: 'No se pudo registrar la actividad.' });
    }
  });

  return router;
};

module.exports = { crearActividadGpsRoutes };
