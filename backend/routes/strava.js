const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const REDIRECT_URI = 'https://korva-app-production.up.railway.app/strava/callback';
const WEBHOOK_VERIFY_TOKEN = 'korva_webhook_secret_2024';

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

// Renueva el token de Strava si está vencido o por vencer
const getValidStravaToken = async (supabase, userId) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('strava_token, strava_refresh_token, strava_token_expires_at')
    .eq('id', userId)
    .single();

  if (error) throw error;

  const ahoraEnSegundos = Math.floor(Date.now() / 1000);
  const venceEn = user.strava_token_expires_at || 0;
  const tokenVencido = venceEn - ahoraEnSegundos < 300; // renovar si vence en menos de 5 min

  if (!tokenVencido) return user.strava_token;

  // Renovar token
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: user.strava_refresh_token
    })
  });

  const data = await response.json();
  if (!data.access_token) throw new Error('No se pudo renovar el token de Strava');

  await supabase
    .from('users')
    .update({
      strava_token: data.access_token,
      strava_refresh_token: data.refresh_token,
      strava_token_expires_at: data.expires_at
    })
    .eq('id', userId);

  console.log(`Token de Strava renovado para usuario ${userId}`);
  return data.access_token;
};

// Procesar una actividad de Strava y actualizar progreso
const procesarActividad = async (supabase, userId, stravaActivityId) => {
  const accessToken = await getValidStravaToken(supabase, userId);

  // Traer detalle de la actividad
  const res = await fetch(`https://www.strava.com/api/v3/activities/${stravaActivityId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const actividad = await res.json();

  if (!actividad.id) throw new Error('Actividad no encontrada en Strava');

  // Guardar actividad
  await supabase.from('activities').upsert({
    user_id: userId,
    source: 'strava',
    external_id: String(actividad.id),
    sport_type: actividad.type.toLowerCase(),
    distance_km: actividad.distance / 1000,
    duration_seconds: actividad.moving_time,
    recorded_at: actividad.start_date
  }, { onConflict: 'external_id' });

  // Recalcular progreso de challenges activos
  const { data: userChallenges } = await supabase
    .from('user_challenges')
    .select('*, challenges(*)')
    .eq('user_id', userId)
    .eq('status', 'active');

  for (const uc of userChallenges || []) {
    const modalidades = uc.challenges.modalidades || [];
    const modalidadElegida = modalidades.find(m => m.tipo === uc.modalidad) ||
      { distancia_km: uc.challenges.total_distance_km };

    const { data: actividades } = await supabase
      .from('activities')
      .select('distance_km')
      .eq('user_id', userId)
      .eq('sport_type', uc.modalidad || uc.challenges.sport_type)
      .gte('recorded_at', uc.started_at);

    const totalKm = actividades?.reduce((sum, a) => sum + a.distance_km, 0) || 0;
    const porcentaje = Math.min((totalKm / modalidadElegida.distancia_km) * 100, 100);
    const yaCompletado = uc.status === 'completed';
    const nuevoStatus = porcentaje >= 100 ? 'completed' : uc.status;

    await supabase
      .from('user_challenges')
      .update({
        km_completed: totalKm,
        status: nuevoStatus,
        completed_at: porcentaje >= 100 ? new Date().toISOString() : uc.completed_at
      })
      .eq('id', uc.id);

    if (porcentaje >= 100 && !yaCompletado) {
      const { data: usuario } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', userId)
        .single();

      if (usuario?.email) {
        const { enviarEmailCompletado } = require('../routes/emails');
        enviarEmailCompletado(usuario.email, usuario.name, uc.challenges.title);
      }
    }
  }

  console.log(`Actividad ${stravaActivityId} procesada para usuario ${userId}`);
};

// OAuth — redirigir a Strava
router.get('/auth', (req, res) => {
  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=232688&response_type=code&redirect_uri=${REDIRECT_URI}&approval_prompt=force&scope=activity:read_all`;
  res.redirect(stravaAuthUrl);
});

// OAuth — callback de Strava, guardar tokens
router.get('/callback', async (req, res) => {
  const { code } = req.query;

  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      })
    });

  const data = await response.json();

// Traer perfil del atleta por separado
const athleteRes = await fetch('https://www.strava.com/api/v3/athlete', {
  headers: { 'Authorization': `Bearer ${data.access_token}` }
});
const stravaAthlete = await athleteRes.json();

    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from('users')
      .upsert({
        email: stravaAthlete?.email || `strava_${stravaAthlete?.id}@korva.app`,
        name: `${stravaAthlete?.firstname} ${stravaAthlete?.lastname}`,
        avatar_url: stravaAthlete?.profile,
        strava_token: data.access_token,
        strava_refresh_token: data.refresh_token,
        strava_token_expires_at: data.expires_at,
        strava_athlete_id: stravaAthlete?.id
      }, { onConflict: 'email' })
      .select()
      .single();

    if (error) throw error;

    res.json({
      mensaje: 'Strava conectado exitosamente',
      usuario: user.name,
      id: user.id
    });

  } catch (error) {
    res.json({ error: 'Error conectando con Strava', detalle: error.message });
  }
});

// Importar actividades manualmente (pull)
router.get('/actividades/:userId', async (req, res) => {
  const { userId } = req.params;
  const supabase = getSupabase();

  try {
    const accessToken = await getValidStravaToken(supabase, userId);

    const response = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=10', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
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

// Calcular progreso
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

      const { data: actividades } = await supabase
        .from('activities')
        .select('distance_km')
        .eq('user_id', userId)
        .eq('sport_type', uc.modalidad || uc.challenges.sport_type)
        .gte('recorded_at', uc.started_at);

      const totalKm = actividades?.reduce((sum, a) => sum + a.distance_km, 0) || 0;
      const porcentaje = Math.min((totalKm / modalidadElegida.distancia_km) * 100, 100).toFixed(1);
      const yaCompletado = uc.status === 'completed';
      const nuevoStatus = parseFloat(porcentaje) >= 100 ? 'completed' : uc.status;

      await supabase
        .from('user_challenges')
        .update({
          km_completed: totalKm,
          status: nuevoStatus,
          completed_at: parseFloat(porcentaje) >= 100 ? new Date().toISOString() : uc.completed_at
        })
        .eq('id', uc.id);

      if (parseFloat(porcentaje) >= 100 && !yaCompletado) {
        const { data: usuario } = await supabase
          .from('users')
          .select('email, name')
          .eq('id', userId)
          .single();

        if (usuario?.email) {
          const { enviarEmailCompletado } = require('../routes/emails');
          enviarEmailCompletado(usuario.email, usuario.name, uc.challenges.title);
        }
      }

      return {
        challenge: uc.challenges.title,
        modalidad: uc.modalidad === 'run' ? 'Running' : uc.modalidad === 'ride' ? 'Ciclismo' : 'General',
        distancia_total: modalidadElegida.distancia_km,
        km_completados: totalKm.toFixed(2),
        porcentaje: `${porcentaje}%`,
        estado: parseFloat(porcentaje) >= 100 ? 'COMPLETADO' : 'En progreso'
      };
    }));

    res.json(resultados);

  } catch (error) {
    res.json({ error: 'Error calculando progreso', detalle: error.message });
  }
});

// Webhook — verificación de Strava (GET)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook de Strava verificado');
    res.json({ 'hub.challenge': challenge });
  } else {
    res.sendStatus(403);
  }
});

// Webhook — recibir actividades en tiempo real (POST)
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Strava necesita respuesta inmediata

  const event = req.body;
  console.log('Webhook Strava recibido:', JSON.stringify(event));

  // Solo nos interesan actividades nuevas o actualizadas
  if (event.object_type !== 'activity' || !['create', 'update'].includes(event.aspect_type)) return;

  const stravaAthleteId = event.owner_id;
  const stravaActivityId = event.object_id;

  try {
    const supabase = getSupabase();

    // Buscar el usuario por su strava_athlete_id
    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('strava_athlete_id', stravaAthleteId)
      .single();

    if (error || !user) {
      console.log(`Usuario no encontrado para atleta Strava ${stravaAthleteId}`);
      return;
    }

    await procesarActividad(supabase, user.id, stravaActivityId);

  } catch (error) {
    console.error('Error procesando webhook de Strava:', error.message);
  }
});

module.exports = router;