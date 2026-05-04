const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const REDIRECT_URI = 'https://korva-app-production.up.railway.app/strava/callback';

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

router.get('/auth', (req, res) => {
  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=232688&response_type=code&redirect_uri=${REDIRECT_URI}&approval_prompt=force&scope=activity:read_all`;
  res.redirect(stravaAuthUrl);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  try {
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
      mensaje: 'Strava conectado y usuario guardado en Korva',
      usuario: user.name,
      id: user.id
    });

  } catch (error) {
    res.json({ error: 'Error conectando con Strava', detalle: error.message });
  }
});

router.get('/actividades/:userId', async (req, res) => {
  const { userId } = req.params;
  const supabase = getSupabase();

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('strava_token, name')
      .eq('id', userId)
      .single();

    if (error) throw error;

    const response = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=10', {
      headers: { 'Authorization': `Bearer ${user.strava_token}` }
    });

    const actividades = await response.json();

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
      mensaje: `${actividades.length} actividades importadas de Strava`,
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

router.get('/progreso/:userId', async (req, res) => {
  const { userId } = req.params;
  const supabase = getSupabase();

  try {
    const { data: userChallenges, error: challengeError } = await supabase
      .from('user_challenges')
      .select('*, challenges(*)')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (challengeError) throw challengeError;

    const resultados = await Promise.all(userChallenges.map(async (uc) => {
      const modalidades = uc.challenges.modalidades || [];
      const modalidadElegida = modalidades.find(m => m.tipo === uc.modalidad) ||
        { distancia_km: uc.challenges.total_distance_km };

     const nuevoStatus = parseFloat(porcentaje) >= 100 ? 'completed' : uc.status;

await supabase
  .from('user_challenges')
  .update({ 
    km_completed: totalKm,
    status: nuevoStatus,
    completed_at: parseFloat(porcentaje) >= 100 ? new Date().toISOString() : uc.completed_at
  })
  .eq('id', uc.id);

      const totalKm = actividades?.reduce((sum, a) => sum + a.distance_km, 0) || 0;
      const porcentaje = Math.min((totalKm / modalidadElegida.distancia_km) * 100, 100).toFixed(1);

      await supabase
        .from('user_challenges')
        .update({ km_completed: totalKm })
        .eq('id', uc.id);

      return {
        challenge: uc.challenges.title,
        modalidad: uc.modalidad === 'run' ? 'Running' : uc.modalidad === 'ride' ? 'Ciclismo' : 'General',
        deporte: uc.modalidad || uc.challenges.sport_type,
        distancia_total: modalidadElegida.distancia_km,
        km_completados: totalKm.toFixed(2),
        porcentaje: `${porcentaje}%`,
        estado: porcentaje >= 100 ? 'COMPLETADO' : 'En progreso'
      };
    }));

    res.json(resultados);

  } catch (error) {
    res.json({ error: 'Error calculando progreso', detalle: error.message });
  }
});

module.exports = router;