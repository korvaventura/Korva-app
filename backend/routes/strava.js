const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { enviarNotificacionProgreso } = require('../routes/notificaciones');

const REDIRECT_URI = 'https://korva-app-production.up.railway.app/strava/callback';
const WEBHOOK_VERIFY_TOKEN = 'korva_webhook_secret_2024';

// Tolerancia para considerar que dos actividades del mismo dia son la misma
const TOLERANCIA_KM = 0.3;

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const normalizarSportType = (tipo) => {
  const t = tipo?.toLowerCase() || '';
  if (['run', 'virtualrun', 'trailrun', 'treadmill'].includes(t)) return 'run';
  if (['ride', 'virtualride', 'mountainbikeride', 'gravelride', 'ebikeride'].includes(t)) return 'ride';
  return t;
};

// FIX ANTI-DUPLICADOS
// Si el usuario ya cargo a mano (o migramos de la web vieja) una actividad
// del mismo dia con distancia parecida, no la volvemos a insertar desde Strava.
// El neq sobre external_id evita que una actividad se encuentre a si misma
// cuando Strava reenvia un evento de update.
const yaExisteActividad = async (supabase, userId, startDate, km, externalId) => {
  try {
    const fecha = String(startDate).split('T')[0];
    let query = supabase
      .from('activities')
      .select('id, source, distance_km')
      .eq('user_id', userId)
      .gte('recorded_at', `${fecha}T00:00:00`)
      .lte('recorded_at', `${fecha}T23:59:59.999`)
      .gte('distance_km', km - TOLERANCIA_KM)
      .lte('distance_km', km + TOLERANCIA_KM)
      .limit(1);

    if (externalId) query = query.neq('external_id', String(externalId));

    const { data, error } = await query;
    if (error) {
      console.error('Error verificando duplicado:', error.message);
      return false; // ante la duda, dejamos pasar
    }
    return (data && data.length > 0) ? data[0] : null;
  } catch (error) {
    console.error('Error verificando duplicado:', error.message);
    return false;
  }
};

// Suma los km que le corresponden a un challenge.
// A PROPOSITO no filtra por challenge_id: una misma salida suma a TODOS los
// retos activos de la persona. El recorte correcto es started_at, para que
// cada reto cuente solo desde su fecha de inscripcion.
const calcularKmDeChallenge = async (supabase, userId, uc) => {
  const { data: actividades } = await supabase
    .from('activities')
    .select('distance_km')
    .eq('user_id', userId)
    .eq('excluida', false)
    .gte('recorded_at', uc.started_at);

  const suma = actividades?.reduce((acc, a) => acc + (a.distance_km || 0), 0) || 0;

  // FIX PROTECTIVO: nunca bajar los km ya acreditados.
  // Hay usuarios migrados en junio con km_completed cargado como numero suelto,
  // sin filas en activities. Sin este guard, el primer recalculo se los borra.
  return Math.max(suma, uc.km_completed || 0);
};

const enviarPushNotification = async (pushToken, title, body) => {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: pushToken, title, body, sound: 'default' }),
    });
  } catch (error) {
    console.error('Error enviando push notification:', error);
  }
};

const verificarYEnviarNotificacionRacha = async (supabase, userId) => {
  try {
    const { data: actividades } = await supabase
      .from('activities')
      .select('recorded_at')
      .eq('user_id', userId)
      .eq('excluida', false)
      .order('recorded_at', { ascending: false });

    const diasUnicos = [...new Set(
      actividades?.map(a => a.recorded_at?.split('T')[0]) || []
    )].sort().reverse();

    let racha = 0;
    for (let i = 0; i < diasUnicos.length; i++) {
      const esperado = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      if (diasUnicos[i] === esperado) racha++;
      else break;
    }

    const mensajes = {
      3: { title: '🔥 ¡3 días en racha!', body: 'Estás en llamas. Seguí así 💪' },
      7: { title: '⚡ ¡Una semana completa!', body: 'Siete días seguidos entrenando. Sos una máquina.' },
      14: { title: '👑 ¡14 días en racha!', body: 'Dos semanas sin parar. Leyenda.' },
      21: { title: '🏅 ¡21 días seguidos!', body: 'Ya es un hábito. Nada te para.' },
      30: { title: '🌍 ¡Un mes de racha!', body: '30 días consecutivos. Estás en otro nivel.' },
    };

    if (mensajes[racha]) {
      const { data: usuario } = await supabase
        .from('users')
        .select('push_token')
        .eq('id', userId)
        .maybeSingle();

      if (usuario?.push_token) {
        await enviarPushNotification(usuario.push_token, mensajes[racha].title, mensajes[racha].body);
      }
    }
  } catch (error) {
    console.error('Error verificando racha:', error);
  }
};

const getValidStravaToken = async (supabase, userId) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('strava_token, strava_refresh_token, strava_token_expires_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!user) throw new Error('Usuario no encontrado. Tu sesión puede estar desactualizada.');
  if (!user.strava_token) throw new Error('Este usuario no tiene Strava conectado.');

  const ahoraEnSegundos = Math.floor(Date.now() / 1000);
  const venceEn = user.strava_token_expires_at || 0;
  const tokenVencido = venceEn - ahoraEnSegundos < 300;

  if (!tokenVencido) return user.strava_token;

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

const procesarActividad = async (supabase, userId, stravaActivityId) => {
  const accessToken = await getValidStravaToken(supabase, userId);

  const res = await fetch(`https://www.strava.com/api/v3/activities/${stravaActivityId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const actividad = await res.json();

  if (!actividad.id) throw new Error('Actividad no encontrada en Strava');

  // Ignorar actividades sin distancia (gym, fuerza, etc.)
  const distanciaKm = (actividad.distance || 0) / 1000;
  if (distanciaKm <= 0) {
    console.log(`Actividad ${stravaActivityId} ignorada — sin distancia (tipo: ${actividad.type})`);
    return;
  }

  // FIX ANTI-DUPLICADOS
  const duplicada = await yaExisteActividad(
    supabase, userId, actividad.start_date, distanciaKm, actividad.id
  );
  if (duplicada) {
    console.log(
      `Actividad ${stravaActivityId} salteada — ya existe una de ${duplicada.distance_km} km ` +
      `(origen: ${duplicada.source}) el ${String(actividad.start_date).split('T')[0]}`
    );
    return;
  }

  // Buscamos el challenge activo para etiquetar la actividad
  const { data: userChallenges } = await supabase
    .from('user_challenges')
    .select('*, challenges(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('pausado', false);

  const challengePrincipal = userChallenges?.[0] || null;

  await supabase.from('activities').upsert({
    user_id: userId,
    source: 'strava',
    external_id: String(actividad.id),
    sport_type: normalizarSportType(actividad.type),
    distance_km: distanciaKm,
    duration_seconds: actividad.moving_time,
    recorded_at: actividad.start_date,
    challenge_id: challengePrincipal?.challenge_id || null
  }, { onConflict: 'external_id' });

  for (const uc of userChallenges || []) {
    const modalidades = uc.challenges.modalidades || [];
    const modalidadElegida = modalidades.find(m => m.tipo === uc.modalidad) ||
      { distancia_km: uc.challenges.total_distance_km };

    const kmAntes = uc.km_completed || 0;
    const totalKm = await calcularKmDeChallenge(supabase, userId, uc);
    // Strava solo sube km, nunca baja — protege contra sincronizaciones parciales
    const kmFinal = Math.max(totalKm, kmAntes);
    const porcentaje = Math.min((kmFinal / modalidadElegida.distancia_km) * 100, 100);
    const yaCompletado = ['completed', 'cargado', 'shipped'].includes(uc.status);
    const nuevoStatus = porcentaje >= 100 ? 'completed' : uc.status;

    await supabase
      .from('user_challenges')
      .update({
        km_completed: kmFinal,
        status: nuevoStatus,
        completed_at: porcentaje >= 100 ? new Date().toISOString() : uc.completed_at
      })
      .eq('id', uc.id);

    if (porcentaje >= 100 && !yaCompletado) {
      const { data: usuario } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', userId)
        .maybeSingle();
      if (usuario?.email) {
        const { enviarEmailCompletado } = require('../routes/emails');
        enviarEmailCompletado(usuario.email, usuario.name, uc.challenges.title);
      }
    }

    if (!yaCompletado) {
      await enviarNotificacionProgreso(
        supabase, userId,
        uc.challenge_id, uc.challenges.title,
        kmAntes, totalKm,
        modalidadElegida.distancia_km
      );
    }
  }

  await verificarYEnviarNotificacionRacha(supabase, userId);
  console.log(`Actividad ${stravaActivityId} procesada para usuario ${userId}`);
};

router.get('/auth', (req, res) => {
  const { userId } = req.query;
  const state = userId || '';
  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=232688&response_type=code&redirect_uri=${REDIRECT_URI}&approval_prompt=force&scope=activity:read_all&state=${state}`;
  res.redirect(stravaAuthUrl);
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const userId = state || null;
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

    const athleteRes = await fetch('https://www.strava.com/api/v3/athlete', {
      headers: { 'Authorization': `Bearer ${data.access_token}` }
    });
    const stravaAthlete = await athleteRes.json();

    const supabase = getSupabase();
    let user;

    if (userId) {
      const { data: updatedUser, error } = await supabase
        .from('users')
        .update({
          strava_token: data.access_token,
          strava_refresh_token: data.refresh_token,
          strava_token_expires_at: data.expires_at,
          strava_athlete_id: stravaAthlete?.id,
          avatar_url: stravaAthlete?.profile || null,
        })
        .eq('id', userId)
        .select()
        .maybeSingle();
      if (error) throw error;
      user = updatedUser;
    } else {
      const { data: upsertedUser, error } = await supabase
        .from('users')
        .upsert({
          email: stravaAthlete?.email || `strava_${stravaAthlete?.id}@korva.app`,
          name: [stravaAthlete?.firstname, stravaAthlete?.lastname].filter(Boolean).join(' ') || `Atleta ${stravaAthlete?.id}`,
          avatar_url: stravaAthlete?.profile,
          strava_token: data.access_token,
          strava_refresh_token: data.refresh_token,
          strava_token_expires_at: data.expires_at,
          strava_athlete_id: stravaAthlete?.id
        }, { onConflict: 'email' })
        .select()
        .maybeSingle();
      if (error) throw error;
      user = upsertedUser;
    }

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Conectando con Strava...</title>
          <style>
            body { background: #0D1B2A; color: white; font-family: sans-serif;
                   display: flex; flex-direction: column; align-items: center;
                   justify-content: center; height: 100vh; margin: 0; }
            p { color: #A8CFFF; font-size: 16px; }
          </style>
        </head>
        <body>
          <p>✅ Strava conectado. Volviendo a Korva...</p>
          <script>
            window.location.href = 'korva://strava-connected?userId=${user.id}';
            setTimeout(() => {
              window.location.href = 'korva://strava-connected?userId=${user.id}';
            }, 500);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    res.json({ error: 'Error conectando con Strava', detalle: error.message });
  }
});

router.get('/actividades/:userId', async (req, res) => {
  const { userId } = req.params;
  const supabase = getSupabase();

  try {
    const accessToken = await getValidStravaToken(supabase, userId);

    const response = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=10', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const actividades = await response.json();

    if (!Array.isArray(actividades)) {
      throw new Error('Strava no devolvió actividades. Reconectá tu cuenta.');
    }

    // Filtrar actividades sin distancia antes de guardar
    const actividadesConDistancia = actividades.filter(a => (a.distance || 0) > 0);

    // No importar actividades anteriores al started_at del challenge mas reciente
    const { data: inscripciones } = await supabase
      .from('user_challenges')
      .select('started_at, challenge_id')
      .eq('user_id', userId)
      .in('status', ['active', 'completed'])
      .order('started_at', { ascending: false })
      .limit(1);

    const fechaCorteImport = inscripciones?.[0]?.started_at || null;
    const challengeIdActual = inscripciones?.[0]?.challenge_id || null;

    const actividadesFiltradas = fechaCorteImport
      ? actividadesConDistancia.filter(a => new Date(a.start_date) >= new Date(fechaCorteImport))
      : actividadesConDistancia;

    let importadas = 0;
    let salteadas = 0;

    for (const actividad of actividadesFiltradas) {
      const km = actividad.distance / 1000;

      // FIX ANTI-DUPLICADOS
      const duplicada = await yaExisteActividad(
        supabase, userId, actividad.start_date, km, actividad.id
      );
      if (duplicada) {
        console.log(
          `Actividad ${actividad.id} salteada — ya existe una de ${duplicada.distance_km} km ` +
          `(origen: ${duplicada.source}) el ${String(actividad.start_date).split('T')[0]}`
        );
        salteadas++;
        continue;
      }

      await supabase.from('activities').upsert({
        user_id: userId,
        source: 'strava',
        external_id: String(actividad.id),
        sport_type: normalizarSportType(actividad.type),
        distance_km: km,
        duration_seconds: actividad.moving_time,
        recorded_at: actividad.start_date,
        challenge_id: challengeIdActual
      }, { onConflict: 'external_id' });

      importadas++;
    }

    // Recalcular km y status para cada reto activo después del sync
    if (importadas > 0) {
      const { data: ucActivos } = await supabase
        .from('user_challenges')
        .select('*, challenges(*)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .eq('pausado', false);

      for (const uc of ucActivos || []) {
        const modalidades = uc.challenges.modalidades || [];
        const modalidadElegida = modalidades.find(m => m.tipo === uc.modalidad) ||
          { distancia_km: uc.challenges.total_distance_km };

        const kmAntes = uc.km_completed || 0;
        const totalKm = await calcularKmDeChallenge(supabase, userId, uc);
        const kmFinal = Math.max(totalKm, kmAntes);
        const porcentaje = Math.min((kmFinal / modalidadElegida.distancia_km) * 100, 100);
        const nuevoStatus = porcentaje >= 100 ? 'completed' : 'active';

        await supabase.from('user_challenges').update({
          km_completed: kmFinal,
          status: nuevoStatus,
          completed_at: nuevoStatus === 'completed' ? new Date().toISOString() : uc.completed_at
        }).eq('id', uc.id);

        if (nuevoStatus === 'completed') {
          const { data: usuario } = await supabase.from('users').select('email, name, push_token').eq('id', userId).maybeSingle();
          if (usuario?.email) {
            const { enviarEmailCompletado } = require('../routes/emails');
            enviarEmailCompletado(usuario.email, usuario.name, uc.challenges.title);
          }
          if (usuario?.push_token) {
            await enviarPushNotification(usuario.push_token, '🏅 ¡Completaste el reto!', `Llegaste a la meta. Tu medalla de ${uc.challenges.title} está en camino 🎉`);
          }
          console.log(`Reto completado via sync Strava: ${usuario?.email} — ${uc.challenges.title}`);
        }
      }
    }

    res.json({
      mensaje: `${importadas} actividades importadas de Strava` +
               (salteadas > 0 ? ` (${salteadas} ya estaban cargadas)` : ''),
      importadas,
      salteadas,
      actividades: actividadesFiltradas.map(a => ({
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
      .in('status', ['active', 'pending', 'completed', 'cargado', 'shipped']);

    if (challengeError) throw challengeError;

    const resultados = await Promise.all(userChallenges.map(async (uc) => {

      if (uc.status === 'pending') {
        return {
          challenge: uc.challenges.title,
          challenge_id: uc.challenge_id,
          modalidad: uc.modalidad === 'run' ? 'Running' : uc.modalidad === 'ride' ? 'Ciclismo' : 'General',
          distancia_total: uc.challenges.total_distance_km,
          km_completados: '0.00',
          porcentaje: '0.0',
          checkpoints: uc.challenges.checkpoints || null,
          estado: 'PENDIENTE',
          started_at: uc.started_at,
          meta_fecha: uc.meta_fecha,
          link_shopify: uc.challenges.link_shopify || null,
          pending: true
        };
      }

      const modalidades = uc.challenges.modalidades || [];
      const modalidadElegida = modalidades.find(m => m.tipo === uc.modalidad) ||
        { distancia_km: uc.challenges.total_distance_km };

      const totalKm = await calcularKmDeChallenge(supabase, userId, uc);
      // Strava solo sube km, nunca baja — protege contra sincronizaciones parciales
      const kmFinal = Math.max(totalKm, uc.km_completed || 0);
      const porcentaje = Math.min((kmFinal / modalidadElegida.distancia_km) * 100, 100).toFixed(1);
      const yaCompletado = ['completed', 'cargado', 'shipped'].includes(uc.status);
      // Los estados finales no se tocan: un 'shipped' no puede volver a 'completed'.
      const estadosFinales = ['completed', 'cargado', 'shipped'];
      const nuevoStatus = estadosFinales.includes(uc.status)
        ? uc.status
        : (parseFloat(porcentaje) >= 100 ? 'completed' : uc.status);

      await supabase
        .from('user_challenges')
        .update({
          km_completed: kmFinal,
          status: nuevoStatus,
          completed_at: parseFloat(porcentaje) >= 100 ? new Date().toISOString() : uc.completed_at
        })
        .eq('id', uc.id);

      if (parseFloat(porcentaje) >= 100 && !yaCompletado) {
        const { data: usuario } = await supabase
          .from('users')
          .select('email, name, push_token')
          .eq('id', userId)
          .maybeSingle();

        if (usuario?.email) {
          const { enviarEmailCompletado } = require('../routes/emails');
          enviarEmailCompletado(usuario.email, usuario.name, uc.challenges.title);
        }

        if (usuario?.push_token) {
          await enviarPushNotification(
            usuario.push_token,
            '🏅 ¡Completaste el reto!',
            `Llegaste al fin del mundo. Tu medalla de ${uc.challenges.title} está en camino 🎉`
          );
        }
      }

      return {
        challenge: uc.challenges.title,
        challenge_id: uc.challenge_id,
        modalidad: uc.modalidad === 'run' ? 'Running' : uc.modalidad === 'ride' ? 'Ciclismo' : 'General',
        distancia_total: modalidadElegida.distancia_km,
        km_completados: kmFinal.toFixed(2),
        porcentaje: porcentaje,
        checkpoints: uc.challenges.checkpoints || null,
        estado: parseFloat(porcentaje) >= 100 ? 'COMPLETADO' : 'En progreso',
        started_at: uc.started_at,
        meta_fecha: uc.meta_fecha,
        pausado: uc.pausado || false,
        pending: false
      };
    }));

    res.json(resultados);
  } catch (error) {
    res.json({ error: 'Error calculando progreso', detalle: error.message });
  }
});

router.post('/desconectar/:userId', async (req, res) => {
  const { userId } = req.params;
  const supabase = getSupabase();
  try {
    await supabase
      .from('users')
      .update({
        strava_token: null,
        strava_refresh_token: null,
        strava_token_expires_at: null,
        strava_athlete_id: null,
      })
      .eq('id', userId);

    res.json({ mensaje: 'Strava desconectado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error desconectando Strava', detalle: error.message });
  }
});

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

router.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const event = req.body;
  console.log('Webhook Strava recibido:', JSON.stringify(event));

  if (event.object_type !== 'activity' || !['create', 'update'].includes(event.aspect_type)) return;

  const stravaAthleteId = event.owner_id;
  const stravaActivityId = event.object_id;

  try {
    const supabase = getSupabase();

    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('strava_athlete_id', stravaAthleteId)
      .maybeSingle();

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