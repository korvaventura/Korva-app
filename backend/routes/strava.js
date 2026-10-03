const express = require('express');
const { objetivoDeInscripcion, versionDeInscripcion, etiquetaVersion } = require('../lib/versionDesafio');

// Distancia objetivo de la VERSIÓN elegida (Estándar/Extendida). El deporte no interviene.
// Misma cadena de respaldo que antes: versión elegida → primera → total_distance_km.
const distanciaObjetivo = (uc) => objetivoDeInscripcion(uc, uc.challenges).objetivo_km ?? uc.challenges?.total_distance_km;

// Campos de versión para la Home. `modalidad` ('Running'/'Ciclismo') se mantiene SOLO porque las apps
// ya publicadas lo usan para elegir ícono/etiqueta (sin él mostrarían otra cosa); NO es un deporte:
// 'Running' = Estándar, 'Ciclismo' = Extendida. Las apps nuevas deben usar `version`/`version_label`.
const camposVersion = (uc) => {
  const version = versionDeInscripcion(uc);
  return {
    version,
    version_label: etiquetaVersion(version),
    modalidad: version === 'extendida' ? 'Ciclismo' : 'Running', // legacy, ver arriba
  };
};
const { actualizarConCompletitudCondicional } = require('../lib/completitudLegada');
const { writerMotorActivo, efectosMotorActivos, stravaImportMotorActiva, stravaWebhookMotorActiva } = require('../lib/flagsMotor');
const { procesarWebhookStravaConMotor, operacionDeEvento, OPERACIONES: OPERACIONES_WEBHOOK } = require('../lib/webhookStrava');
const {
  ESTADOS: ESTADOS_BANDEJA, filaDeEvento, crearRepositorioBandeja, procesarEventoBandeja, iniciarRecuperacionBandeja,
} = require('../lib/bandejaWebhookStrava');
const { importarActividadesStravaConMotor, ERROR_VIEJO: ERROR_IMPORTACION } = require('../lib/importacionStrava');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { logMotor } = require('../lib/recuperacionRecalculo');

// Lo configura index.js con el procesador de efectos (progreso_eventos). Sin configurar, los eventos
// quedan pendientes y los procesa la recuperación periódica.
let dispararEfectosMotor = () => {};
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
    .select('distance_km, recorded_at')
    .eq('user_id', userId)
    .eq('excluida', false)
    .gte('recorded_at', uc.started_at);

  // Filtrar actividades en períodos pausados
  const periodos = uc.periodos_pausados || [];
  const actividadesValidas = (actividades || []).filter(a => {
    const fecha = new Date(a.recorded_at);
    for (const p of periodos) {
      if (fecha >= new Date(p.desde) && fecha <= new Date(p.hasta)) return false;
    }
    return true;
  });

  const suma = actividadesValidas.reduce((acc, a) => acc + (a.distance_km || 0), 0);

  // Si está pausado O tiene períodos pausados — usar suma filtrada sin Math.max
  // Si no tiene pausas — comportamiento original con Math.max (protege migrados)
  const tienePausas = periodos.length > 0 || uc.pausado;
  if (tienePausas) {
    return suma;
  }
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
    const modalidadElegida = { distancia_km: distanciaObjetivo(uc) };

    const kmAntes = uc.km_completed || 0;
    const totalKm = await calcularKmDeChallenge(supabase, userId, uc);
    // Strava solo sube km, nunca baja — protege contra sincronizaciones parciales
    const kmFinal = Math.max(totalKm, kmAntes);
    const porcentaje = Math.min((kmFinal / modalidadElegida.distancia_km) * 100, 100);
    const yaCompletado = ['completed', 'cargado', 'shipped'].includes(uc.status);
    const nuevoStatus = porcentaje >= 100 ? 'completed' : uc.status;

    // 4A-3e (convivencia): la completitud es condicional; efectos solo si ESTE update la ganó.
    const { gano: ganoCompletitud } = await actualizarConCompletitudCondicional(supabase, {
      id: uc.id,
      valores: {
        km_completed: kmFinal,
        status: nuevoStatus,
        completed_at: porcentaje >= 100 ? new Date().toISOString() : uc.completed_at
      },
      completa: porcentaje >= 100 && !yaCompletado,
      origen: 'strava_webhook',
    });

    if (ganoCompletitud) {
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

    // 4A-3e (convivencia): si este update intentaba completar y perdió (otro camino completó), no se
    // manda la notificación (su rama de 100% es el push de completitud).
    const intentabaCompletar = porcentaje >= 100 && !yaCompletado;
    if (!yaCompletado && (!intentabaCompletar || ganoCompletitud)) {
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

    // Etapa 4A-7: motor unificado, solo si MOTOR_PROGRESO_WRITERS incluye "strava_import" Y "efectos".
    // Con la flag apagada (o sin "efectos") se ejecuta el código viejo de abajo, sin cambios.
    if (writerMotorActivo('strava_import') && !efectosMotorActivos()) {
      logMotor({ writer: 'strava_import', resultado: 'ignorado_sin_efectos', aviso: 'strava_import requiere efectos: se usa el camino viejo' });
    }
    if (stravaImportMotorActiva()) {
      // Mismas lecturas y mismo anti-duplicados que el viejo; recién después se escribe (con marcas).
      const filas = [];
      for (const actividad of actividadesFiltradas) {
        const km = actividad.distance / 1000;
        const duplicada = await yaExisteActividad(supabase, userId, actividad.start_date, km, actividad.id);
        if (duplicada) {
          console.log(
            `Actividad ${actividad.id} salteada — ya existe una de ${duplicada.distance_km} km ` +
            `(origen: ${duplicada.source}) el ${String(actividad.start_date).split('T')[0]}`
          );
          salteadas++;
          continue;
        }
        filas.push({
          user_id: userId,
          source: 'strava',
          external_id: String(actividad.id),
          sport_type: normalizarSportType(actividad.type),
          distance_km: km,
          duration_seconds: actividad.moving_time,
          recorded_at: actividad.start_date,
          challenge_id: challengeIdActual
        });
      }
      const r = await importarActividadesStravaConMotor({
        // 4A-8: con el webhook en el motor, el guardado respeta las lápidas de borrado (RPC atómica).
        repo: crearRepositorioSupabase(supabase, { lapidasStrava: stravaWebhookMotorActiva() }),
        userId,
        filas,
        dispararEfectos: (ids) => dispararEfectosMotor(ids),
      });
      if (!r.ok) return res.json({ error: ERROR_IMPORTACION, detalle: r.error });
      const respuesta = {
        mensaje: `${r.importadas} actividades importadas de Strava` +
                 (salteadas > 0 ? ` (${salteadas} ya estaban cargadas)` : ''),
        importadas: r.importadas,
        salteadas,
        actividades: actividadesFiltradas.map(a => ({
          nombre: a.name,
          tipo: a.type,
          distancia_km: (a.distance / 1000).toFixed(2)
        }))
      };
      if (r.progreso) respuesta.progreso = r.progreso;
      return res.json(respuesta);
    }

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

      const filaImportada = {
        user_id: userId,
        source: 'strava',
        external_id: String(actividad.id),
        sport_type: normalizarSportType(actividad.type),
        distance_km: km,
        duration_seconds: actividad.moving_time,
        recorded_at: actividad.start_date,
        challenge_id: challengeIdActual
      };
      if (stravaWebhookMotorActiva()) {
        // 4A-8: con el webhook en el motor puede haber lápidas de borrado: el guardado las respeta
        // (RPC atómica). Igual que el upsert de abajo, no se revisa el error.
        await supabase.rpc('guardar_actividad_strava', { p_fila: filaImportada });
      } else {
        await supabase.from('activities').upsert(filaImportada, { onConflict: 'external_id' });
      }

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
        const modalidadElegida = { distancia_km: distanciaObjetivo(uc) };

        const kmAntes = uc.km_completed || 0;
        const totalKm = await calcularKmDeChallenge(supabase, userId, uc);
        const kmFinal = Math.max(totalKm, kmAntes);
        const porcentaje = Math.min((kmFinal / modalidadElegida.distancia_km) * 100, 100);
        const nuevoStatus = porcentaje >= 100 ? 'completed' : 'active';

        // 4A-3e (convivencia): la completitud es condicional; efectos solo si ESTE update la ganó.
        const { gano: ganoCompletitud } = await actualizarConCompletitudCondicional(supabase, {
          id: uc.id,
          valores: {
            km_completed: kmFinal,
            status: nuevoStatus,
            completed_at: nuevoStatus === 'completed' ? new Date().toISOString() : uc.completed_at
          },
          completa: nuevoStatus === 'completed',
          origen: 'strava_importacion',
        });

        if (ganoCompletitud) {
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
          ...camposVersion(uc),
          distancia_total: distanciaObjetivo(uc),
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

      const modalidadElegida = { distancia_km: distanciaObjetivo(uc) };

      const yaCompletado = ['completed', 'cargado', 'shipped'].includes(uc.status);

      // Si el reto ya está completado/enviado — no recalcular km, usar los que tiene
      // Los km se congelan en el momento de completar
      if (yaCompletado || uc.pausado) {
        const kmFinal = uc.km_completed || 0;
        const porcentaje = Math.min((kmFinal / modalidadElegida.distancia_km) * 100, 100).toFixed(1);
        return {
          challenge: uc.challenges.title,
          challenge_id: uc.challenge_id,
          ...camposVersion(uc),
          distancia_total: modalidadElegida.distancia_km,
          km_completados: kmFinal.toFixed ? kmFinal.toFixed(2) : kmFinal,
          porcentaje,
          checkpoints: uc.challenges.checkpoints || null,
          estado: yaCompletado ? 'COMPLETADO' : 'En progreso',
          started_at: uc.started_at,
          meta_fecha: uc.meta_fecha,
          pausado: uc.pausado || false,
          pending: false
        };
      }

      const totalKm = await calcularKmDeChallenge(supabase, userId, uc);
      const kmFinal = Math.max(totalKm, uc.km_completed || 0);
      const porcentaje = Math.min((kmFinal / modalidadElegida.distancia_km) * 100, 100).toFixed(1);
      const estadosFinales = ['completed', 'cargado', 'shipped'];
      const nuevoStatus = parseFloat(porcentaje) >= 100 ? 'completed' : uc.status;

      // No actualizar retos pausados
      // 4A-3e (convivencia): la completitud es condicional; efectos solo si ESTE update la ganó.
      let ganoCompletitud = false;
      if (!uc.pausado) {
        ({ gano: ganoCompletitud } = await actualizarConCompletitudCondicional(supabase, {
          id: uc.id,
          valores: {
            km_completed: kmFinal,
            status: nuevoStatus,
            completed_at: parseFloat(porcentaje) >= 100 ? new Date().toISOString() : uc.completed_at
          },
          completa: parseFloat(porcentaje) >= 100 && !yaCompletado,
          origen: 'strava_progreso',
        }));
      }

      if (ganoCompletitud) {
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
        ...camposVersion(uc),
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

// ---------------------------------------------------------------------------------------------
// Etapa 4A-8: webhook con el motor + bandeja persistente (flag "strava_webhook" + "efectos").
// ---------------------------------------------------------------------------------------------

// Plazos de Strava en el camino nuevo. El token se obtiene/renueva con getValidStravaToken (sin
// timeout propio: es el mismo código que usan los otros caminos); por eso TODA la preparación
// (token + renovación + lectura de la actividad + anti-duplicados) tiene un plazo total. Si se vence,
// el evento queda en la bandeja y se reintenta. Nada de esto ocurre dentro del candado del usuario.
const ESPERA_STRAVA_WEBHOOK_MS = 20000;
const PLAZO_PREPARACION_WEBHOOK_MS = 30000;
const conPlazo = (promesa, ms, mensaje) => {
  let t;
  const vencido = new Promise((_, rechazar) => { t = setTimeout(() => rechazar(new Error(mensaje)), ms); });
  return Promise.race([promesa, vencido]).finally(() => clearTimeout(t));
};

// Lee la actividad de Strava y arma la fila con las MISMAS reglas que procesarActividad (sin
// distancia → se ignora; anti-duplicados del mismo día; challenge_id del primer activo no pausado).
// No escribe nada en activities: la escritura la hace el motor, después de marcar.
const prepararFilaWebhook = async (supabase, userId, stravaActivityId) => {
  const accessToken = await getValidStravaToken(supabase, userId);
  const res = await fetch(`https://www.strava.com/api/v3/activities/${stravaActivityId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(ESPERA_STRAVA_WEBHOOK_MS),
  });
  // 404: la actividad ya no existe en Strava (se borró; su 'delete' deja la lápida). No se reintenta.
  if (res.status === 404) return { ignorar: 'no_encontrada_en_strava' };
  if (res.ok === false) throw new Error(`Strava respondió ${res.status}`); // 401/429/5xx: se reintenta
  const actividad = await res.json();
  if (!actividad || !actividad.id) throw new Error('Actividad no encontrada en Strava');

  const distanciaKm = (actividad.distance || 0) / 1000;
  if (distanciaKm <= 0) {
    console.log(`Actividad ${stravaActivityId} ignorada — sin distancia (tipo: ${actividad.type})`);
    return { ignorar: 'sin_distancia' };
  }
  const duplicada = await yaExisteActividad(supabase, userId, actividad.start_date, distanciaKm, actividad.id);
  if (duplicada) {
    console.log(
      `Actividad ${stravaActivityId} salteada — ya existe una de ${duplicada.distance_km} km ` +
      `(origen: ${duplicada.source}) el ${String(actividad.start_date).split('T')[0]}`
    );
    return { ignorar: 'duplicada_mismo_dia' };
  }
  const { data: userChallenges } = await supabase
    .from('user_challenges')
    .select('challenge_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('pausado', false);
  const challengePrincipal = userChallenges?.[0] || null;
  return {
    fila: {
      user_id: userId,
      source: 'strava',
      external_id: String(actividad.id),
      sport_type: normalizarSportType(actividad.type),
      distance_km: distanciaKm,
      duration_seconds: actividad.moving_time,
      recorded_at: actividad.start_date,
      challenge_id: challengePrincipal?.challenge_id || null,
    },
  };
};

// Push de progreso (checkpoint, 50/75/90 %, "+X km") como el viejo, pero SOLO para los desafíos
// activos y no pausados cuyo km subió sin completarse. La completitud NO pasa por acá: su
// email/push/certificado salen una sola vez por el evento 'completado' (efectos del motor).
const notificarProgresoMotor = async (supabase, userId, desafios) => {
  const subieron = desafios.filter((d) =>
    d.status_leido === 'active' && d.accion === 'actualizar_km' && d.escrito &&
    Number(d.km_despues) > Number(d.km_antes || 0));
  if (subieron.length === 0) return;
  const { data: ucs } = await supabase
    .from('user_challenges')
    .select('*, challenges(*)')
    .in('id', subieron.map((d) => d.user_challenge_id));
  for (const d of subieron) {
    const uc = (ucs || []).find((x) => x.id === d.user_challenge_id);
    if (!uc || uc.pausado || uc.status !== 'active' || !uc.challenges) continue;
    const objetivo = distanciaObjetivo(uc);
    if (!(objetivo > 0) || Number(d.km_despues) >= objetivo) continue;
    await enviarNotificacionProgreso(supabase, userId, uc.challenge_id, uc.challenges.title, Number(d.km_antes || 0), Number(d.km_despues), objetivo);
  }
};

/**
 * Aplica UN evento de la bandeja (lo llama la bandeja; puede repetirse: es idempotente).
 * Devuelve { estado: 'hecho'|'ignorado', resultado } o { reintentar: true, error }.
 */
const manejarEventoBandeja = async (ev) => {
  const operacion = operacionDeEvento(ev);
  if (!operacion) return { estado: ESTADOS_BANDEJA.IGNORADO, resultado: 'evento_no_soportado' };
  const supabase = getSupabase();
  const { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('strava_athlete_id', ev.owner_id)
    .maybeSingle();
  if (error) return { reintentar: true, error: error.message };
  if (!user) {
    console.log(`Usuario no encontrado para atleta Strava ${ev.owner_id}`);
    return { estado: ESTADOS_BANDEJA.IGNORADO, resultado: 'atleta_desconocido' };
  }

  const r = await procesarWebhookStravaConMotor({
    repo: crearRepositorioSupabase(supabase),
    userId: user.id,
    operacion,
    externalId: String(ev.object_id),
    ownerId: ev.owner_id,
    eventoId: ev.id,
    prepararFila: () => conPlazo(
      prepararFilaWebhook(supabase, user.id, ev.object_id),
      PLAZO_PREPARACION_WEBHOOK_MS,
      `Strava no respondió en ${PLAZO_PREPARACION_WEBHOOK_MS / 1000} s (token + actividad)`,
    ),
    dispararEfectos: (ids) => dispararEfectosMotor(ids),
  });
  console.log(`Webhook Strava ${ev.aspect_type} ${ev.object_id} (motor): ${r.resultado}${r.motivo ? ` (${r.motivo})` : ''}`);
  if (!r.ok) return { reintentar: true, error: r.error || r.resultado };
  if (r.resultado === 'ignorada') return { estado: ESTADOS_BANDEJA.IGNORADO, resultado: r.motivo || 'ignorada' };

  // Pushes del camino viejo (a lo sumo una vez: si el evento se reprocesa, los km ya no suben y la
  // actividad ya no es nueva).
  if (operacion === OPERACIONES_WEBHOOK.UPSERT) {
    try {
      await notificarProgresoMotor(supabase, user.id, r.desafios);
      if (r.insertada && !(r.detalle && r.detalle.excluida)) await verificarYEnviarNotificacionRacha(supabase, user.id);
    } catch (e) {
      console.error('Error enviando notificaciones del webhook:', e.message);
    }
  }
  return { estado: ESTADOS_BANDEJA.HECHO, resultado: operacion === OPERACIONES_WEBHOOK.DELETE ? 'excluida' : (r.insertada ? 'insertada' : 'actualizada') };
};

/** Toma y aplica un evento de la bandeja ya registrado. */
const procesarDeBandeja = (id) => procesarEventoBandeja({
  repo: crearRepositorioBandeja(getSupabase()), id, manejar: manejarEventoBandeja,
});

// Camino VIEJO (flag apagada): sin cambios de comportamiento.
const procesarWebhookLegado = async (event) => {
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
};

// Trabajo que sigue después de responder (solo para esperar en tests y en un apagado ordenado).
const webhooksEnCurso = new Set();
let webhooksRecibidos = 0;
const seguir = (promesa) => {
  const tarea = promesa.catch((error) => console.error('Error procesando webhook de Strava:', error && error.message));
  webhooksEnCurso.add(tarea);
  tarea.finally(() => webhooksEnCurso.delete(tarea));
};

router.post('/webhook', async (req, res) => {
  const event = req.body;
  webhooksRecibidos += 1;

  if (writerMotorActivo('strava_webhook') && !efectosMotorActivos()) {
    logMotor({ writer: 'strava_webhook', resultado: 'ignorado_sin_efectos', aviso: 'strava_webhook requiere efectos: se usa el camino viejo' });
  }

  if (!stravaWebhookMotorActiva()) {
    // Camino viejo: 200 inmediato y procesamiento después (como siempre).
    res.sendStatus(200);
    console.log('Webhook Strava recibido:', JSON.stringify(event));
    seguir(procesarWebhookLegado(event));
    return;
  }

  // Camino nuevo: el evento queda GUARDADO antes del 200.
  console.log('Webhook Strava recibido:', JSON.stringify(event));
  const fila = operacionDeEvento(event) ? filaDeEvento(event) : null;
  if (!fila) {
    // Eventos de atleta (p. ej. desautorización), aspectos desconocidos o cuerpo inválido: se
    // ignoran como hoy. Se responde 200 para que Strava no reintente algo que nunca se procesará.
    res.sendStatus(200);
    return;
  }
  let registrado;
  try {
    registrado = await crearRepositorioBandeja(getSupabase()).registrar({ fila });
  } catch (error) {
    logMotor({ writer: 'strava_webhook', bandeja: true, resultado: 'no_se_pudo_registrar', aspect_type: fila.aspect_type, object_id: fila.object_id, error: error && error.message });
    res.sendStatus(500); // Strava reintenta
    return;
  }
  res.sendStatus(200);
  if (registrado.estado === 'pendiente') seguir(procesarDeBandeja(registrado.id));
});

/** Espera a que terminen los webhooks que se están procesando (tests / apagado). */
router.esperarWebhooksEnCurso = async () => {
  while (webhooksEnCurso.size > 0) await Promise.allSettled([...webhooksEnCurso]);
  return webhooksRecibidos;
};

/** index.js arranca la recuperación de la bandeja (solo con la flag encendida). */
router.iniciarRecuperacionWebhook = (opciones = {}) => iniciarRecuperacionBandeja({
  crearRepo: () => crearRepositorioBandeja(getSupabase()),
  manejar: manejarEventoBandeja,
  ...opciones,
});

/** index.js conecta el procesador de efectos del motor (4A-7). */
router.configurarMotor = ({ dispararEfectos } = {}) => {
  if (typeof dispararEfectos === 'function') dispararEfectosMotor = dispararEfectos;
};

module.exports = router;