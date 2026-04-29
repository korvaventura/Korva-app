const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const REDIRECT_URI = 'http://localhost:3000/strava/callback';

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

// Paso 1 — Redirigir al usuario a Strava para autorizar
router.get('/auth', (req, res) => {
  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=232688&response_type=code&redirect_uri=${REDIRECT_URI}&approval_prompt=force&scope=activity:read_all`;
  res.redirect(stravaAuthUrl);
});

// Paso 2 — Strava nos manda de vuelta con un codigo
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  try {
    // Intercambiar codigo por token
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code'
      })
    });

    const data = await response.json();

    const stravaAthlete = data.athlete;
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token;

    // Guardar usuario en Supabase
    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from('users')
      .upsert({
        email: stravaAthlete?.email || `strava_${stravaAthlete?.id}@korva.app`,
        name: `${stravaAthlete?.firstname} ${stravaAthlete?.lastname}`,
        avatar_url: stravaAthlete?.profile,
        strava_token: accessToken,
      }, { onConflict: 'email' })
      .select()
      .single();

    if (error) throw error;

    res.json({
      mensaje: 'Strava conectado y usuario guardado en Korva 🎉',
      usuario: user.name,
      id: user.id
    });

  } catch (error) {
    res.json({ error: 'Error conectando con Strava', detalle: error.message });
  }
});
// Importar actividades de Strava del usuario
router.get('/actividades/:userId', async (req, res) => {
  const { userId } = req.params;
  const supabase = getSupabase();

  try {
    // Buscar el token del usuario en Supabase
    const { data: user, error } = await supabase
      .from('users')
      .select('strava_token, name')
      .eq('id', userId)
      .single();

    if (error) throw error;

    // Pedir actividades a Strava
    const response = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=10', {
      headers: { 'Authorization': `Bearer ${user.strava_token}` }
    });

    const actividades = await response.json();

    // Guardar cada actividad en Supabase
    for (const actividad of actividades) {
      await supabase.from('activities').upsert({
        user_id: userId,
        source: 'strava',
        external_id: String(actividad.id),
        sport_type: actividad.type.toLowerCase(),
        distance_km: actividad.distance / 1000,
        duration_seconds: actividad.moving_time,
        recorded_at: actividad.start_date
      }, { onConflict: 'external_id' });
    }

    res.json({
      mensaje: `${actividades.length} actividades importadas de Strava 🏃`,
      usuario: user.name,
      actividades: actividades.map(a => ({
        nombre: a.name,
        tipo: a.type,
        distancia_km: (a.distance / 1000).toFixed(2)
      }))
    });

  } catch (error) {
    res.json({ error: 'Error importando actividades', detalle: error.message });
  }
});
// Calcular progreso del usuario en su challenge activo
router.get('/progreso/:userId', async (req, res) => {
  const { userId } = req.params;
  const supabase = getSupabase();

  try {
    // Buscar el challenge activo del usuario
    const { data: userChallenge, error: challengeError } = await supabase
      .from('user_challenges')
      .select('*, challenges(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (challengeError) throw challengeError;

    // Sumar todos los km de actividades del usuario
    const { data: actividades, error: actError } = await supabase
      .from('activities')
      .select('distance_km')
      .eq('user_id', userId)
      .eq('sport_type', userChallenge.challenges.sport_type)
      .gte('recorded_at', userChallenge.started_at);

    if (actError) throw actError;

    const totalKm = actividades.reduce((sum, a) => sum + a.distance_km, 0);
    const porcentaje = Math.min((totalKm / userChallenge.challenges.total_distance_km) * 100, 100).toFixed(1);

    // Actualizar km_completed en la base de datos
    await supabase
      .from('user_challenges')
      .update({ km_completed: totalKm })
      .eq('id', userChallenge.id);

    res.json({
      challenge: userChallenge.challenges.title,
      distancia_total: userChallenge.challenges.total_distance_km,
      km_completados: totalKm.toFixed(2),
      porcentaje: `${porcentaje}%`,
      estado: porcentaje >= 100 ? '🏅 COMPLETADO' : '🏃 En progreso'
    });

  } catch (error) {
    res.json({ error: 'Error calculando progreso', detalle: error.message });
  }
});
module.exports = router;