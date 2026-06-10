require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const stravaRoutes = require('./routes/strava');
const shopifyRoutes = require('./routes/shopify');
const mercadopagoRoutes = require('./routes/mercadopago');
const invitacionesRoutes = require('./routes/invitaciones');
const { enviarEmailInscripcion, enviarEmailMedallaEnCamino } = require('./routes/emails');
const { enviarNotificacionProgreso } = require('./routes/notificaciones');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

app.use(cors());
app.use(express.json({ limit: '10mb' })); // aumentar límite para imágenes base64

// ─── UPLOAD DE IMÁGENES ──────────────────────────────────────────
app.post('/upload', async (req, res) => {
  const { base64, carpeta, nombre } = req.body;
  if (!base64 || !carpeta) {
    return res.status(400).json({ error: 'Faltan datos: base64 y carpeta son requeridos' });
  }
  try {
    const buffer = Buffer.from(base64, 'base64');
    const fileName = nombre || `${carpeta}_${Date.now()}.jpg`;
    const path = `${carpeta}/${fileName}`;
    const { error } = await supabase.storage
      .from('korva-images')
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage
      .from('korva-images')
      .getPublicUrl(path);
    res.json({ url: urlData.publicUrl });
  } catch (error) {
    res.status(500).json({ error: 'Error subiendo imagen', detalle: error.message });
  }
});
app.use('/strava', stravaRoutes);
app.use('/shopify', shopifyRoutes);
app.use('/mercadopago', mercadopagoRoutes);
app.use('/invitaciones', invitacionesRoutes);

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

const calcularRachaSemanal = (actividades) => {
  const actividadesPorSemana = {};
  actividades?.forEach(a => {
    const fecha = new Date(a.recorded_at);
    const dia = fecha.getDay();
    const lunes = new Date(fecha);
    lunes.setDate(fecha.getDate() - ((dia + 6) % 7));
    const semana = lunes.toISOString().split('T')[0];
    actividadesPorSemana[semana] = (actividadesPorSemana[semana] || 0) + 1;
  });

  let racha = 0;
  const hoy = new Date();
  const diaHoy = hoy.getDay();
  const lunesEstaSemana = new Date(hoy);
  lunesEstaSemana.setDate(hoy.getDate() - ((diaHoy + 6) % 7));

  for (let i = 0; i < 52; i++) {
    const lunes = new Date(lunesEstaSemana);
    lunes.setDate(lunesEstaSemana.getDate() - i * 7);
    const semanaKey = lunes.toISOString().split('T')[0];
    const count = actividadesPorSemana[semanaKey] || 0;
    if (i === 0) {
      if (count === 0) break;
    } else {
      if (count < 3) break;
    }
    racha++;
  }

  return racha;
};

const verificarYEnviarNotificacionRacha = async (userId) => {
  try {
    const { data: actividades } = await supabase
      .from('activities')
      .select('recorded_at')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false });

    const racha = calcularRachaSemanal(actividades);

    const mensajes = {
      2: { title: '🔥 ¡2 semanas en racha!', body: 'Dos semanas consecutivas entrenando. Seguí así 💪' },
      4: { title: '⚡ ¡Un mes de racha!', body: 'Cuatro semanas seguidas. Sos una máquina.' },
      8: { title: '👑 ¡2 meses en racha!', body: 'Ocho semanas sin parar. Leyenda.' },
      12: { title: '🏅 ¡3 meses en racha!', body: 'Ya es un hábito de hierro. Nada te para.' },
    };

    if (mensajes[racha]) {
      const { data: usuario } = await supabase
        .from('users')
        .select('push_token')
        .eq('id', userId)
        .single();

      if (usuario?.push_token) {
        await enviarPushNotification(usuario.push_token, mensajes[racha].title, mensajes[racha].body);
      }
    }
  } catch (error) {
    console.error('Error verificando racha:', error);
  }
};

const recalcularKmUsuario = async (user_id, challenge_id = null) => {
  try {
    // Buscar retos active Y completed (no shipped — esos ya fueron enviados)
    let query = supabase
      .from('user_challenges')
      .select('id, started_at, challenge_id, status, challenges(modalidades, total_distance_km)')
      .eq('user_id', user_id)
      .in('status', ['active', 'completed']);

    if (challenge_id) query = query.eq('challenge_id', challenge_id);

    const { data: retos } = await query;

    for (const reto of retos || []) {
      const { data: todasActividades } = await supabase
        .from('activities')
        .select('distance_km')
        .eq('user_id', user_id)
        .gte('recorded_at', reto.started_at);

      const totalKm = todasActividades?.reduce((sum, a) => sum + (parseFloat(a.distance_km) || 0), 0) || 0;

      // Calcular distancia total de la modalidad del reto
      const modalidades = reto.challenges?.modalidades || [];
      const distanciaTotal = modalidades[0]?.distancia_km || reto.challenges?.total_distance_km || 100;
      const porcentaje = (totalKm / distanciaTotal) * 100;

      // Revertir a active si los km bajaron de 100%
      const nuevoStatus = porcentaje >= 100 ? 'completed' : 'active';

      await supabase
        .from('user_challenges')
        .update({
          km_completed: totalKm,
          status: nuevoStatus,
          // Si revierte a active, limpiar completed_at
          completed_at: nuevoStatus === 'active' ? null : undefined,
        })
        .eq('id', reto.id);
    }
  } catch (error) {
    console.error('Error recalculando km:', error);
  }
};

app.get('/', (req, res) => {
  res.json({ mensaje: 'Bienvenido al backend de Korva 🏅', estado: 'funcionando' });
});

app.get('/test-db', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('*').limit(1);
    if (error) throw error;
    res.json({ mensaje: 'Conexion a Supabase exitosa 🎉', data });
  } catch (error) {
    res.json({ mensaje: 'Supabase conectado', detalle: error.message });
  }
});

app.get('/challenges', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.json({ error: 'Error obteniendo challenges', detalle: error.message });
  }
});

app.post('/challenges/inscribir', async (req, res) => {
  const { user_id, challenge_id, modalidad } = req.body;
  try {
    const { data: existente } = await supabase
      .from('user_challenges')
      .select('id')
      .eq('user_id', user_id)
      .eq('challenge_id', challenge_id)
      .eq('modalidad', modalidad)
      .single();

    if (existente) {
      return res.json({ mensaje: 'Ya estas inscripto en este challenge con esta modalidad' });
    }

    const { data, error } = await supabase
      .from('user_challenges')
      .insert({
        user_id, challenge_id, modalidad,
        status: 'pending', km_completed: 0,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    const { data: challenge } = await supabase.from('challenges').select('title').eq('id', challenge_id).single();
    const { data: usuario } = await supabase.from('users').select('email, name').eq('id', user_id).single();

    if (usuario?.email && challenge?.title) {
      enviarEmailInscripcion(usuario.email, usuario.name, challenge.title, modalidad === 'run' ? 'Running' : 'Ciclismo');
    }

    res.json({ mensaje: 'Inscripcion exitosa! Ya podes empezar tu reto', id: data.id });
  } catch (error) {
    res.json({ error: 'Error al inscribirse', detalle: error.message });
  }
});

app.get('/perfil/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: usuario, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error) throw error;

    const { data: actividades } = await supabase.from('activities').select('distance_km').eq('user_id', userId);
    const { data: challenges } = await supabase.from('user_challenges').select('status').eq('user_id', userId);

    const totalKm = actividades?.reduce((sum, a) => sum + a.distance_km, 0) || 0;
    const activos = challenges?.filter(c => c.status === 'active').length || 0;
    const completados = challenges?.filter(c => c.status === 'completed' || c.status === 'shipped').length || 0;

    const getNivel = (retos) => {
      if (retos >= 7) return { nombre: 'Leyenda Korva', emoji: '🔥', siguiente: null };
      if (retos >= 4) return { nombre: 'Nomada', emoji: '🧭', siguiente: 7 };
      if (retos >= 2) return { nombre: 'Expedicionario', emoji: '🗺️', siguiente: 4 };
      if (retos >= 1) return { nombre: 'Aventurero', emoji: '🥾', siguiente: 2 };
      return { nombre: 'Explorador', emoji: '🌱', siguiente: 1 };
    };

    const getInsignias = (completados, totalKm) => {
      const insignias = [];
      if (completados >= 1) insignias.push({ id: 'primera_medalla', nombre: 'Primera medalla', emoji: '🏅' });
      if (totalKm >= 100) insignias.push({ id: 'km_100', nombre: '100 km', emoji: '💯' });
      if (totalKm >= 250) insignias.push({ id: 'km_250', nombre: '250 km', emoji: '⚡' });
      if (totalKm >= 500) insignias.push({ id: 'km_500', nombre: '500 km', emoji: '🌍' });
      if (totalKm >= 1000) insignias.push({ id: 'km_1000', nombre: '1000 km', emoji: '👑' });
      if (completados >= 2) insignias.push({ id: 'doble', nombre: 'Doble modalidad', emoji: '🚴' });
      return insignias;
    };

    const nivel = getNivel(completados);
    const totalKmNum = parseFloat(totalKm);
    const insignias = getInsignias(completados, totalKmNum);

    const actividadesFechas = await supabase
      .from('activities').select('recorded_at').eq('user_id', userId).order('recorded_at', { ascending: false });

    const racha = calcularRachaSemanal(actividadesFechas.data || []);

    const actividadesConKm = await supabase
      .from('activities').select('recorded_at, distance_km, sport_type').eq('user_id', userId);

    const kmPorSemanaFull = {};
    const deporteCount = { run: 0, ride: 0 };
    actividadesConKm.data?.forEach(a => {
      const fecha = new Date(a.recorded_at);
      const inicio = new Date(fecha);
      inicio.setDate(fecha.getDate() - fecha.getDay());
      const semana = inicio.toISOString().split('T')[0];
      kmPorSemanaFull[semana] = (kmPorSemanaFull[semana] || 0) + a.distance_km;
      if (a.sport_type === 'run') deporteCount.run++;
      else if (a.sport_type === 'ride') deporteCount.ride++;
    });

    const mejorSemanaKm = Math.max(...Object.values(kmPorSemanaFull), 0);
    const totalSemanas = Object.keys(kmPorSemanaFull).length || 1;
    const promedioSemanal = (totalKmNum / totalSemanas).toFixed(1);

    const perfilDeporte = deporteCount.run > 0 && deporteCount.ride > 0
      ? 'Atleta Multideporte 🌐'
      : deporteCount.run > deporteCount.ride
      ? 'Corredor 🏃'
      : deporteCount.ride > 0
      ? 'Ciclista 🚴'
      : 'Explorador 🌱';

    res.json({
      usuario,
      stats: {
        total_actividades: actividades?.length || 0,
        total_km: totalKm.toFixed(1),
        challenges_activos: activos,
        medallas: completados,
        racha_actual: racha,
        mejor_semana_km: mejorSemanaKm.toFixed(1),
        promedio_semanal_km: promedioSemanal,
        perfil_deporte: perfilDeporte,
      },
      nivel,
      insignias
    });
  } catch (error) {
    res.json({ error: 'Error cargando perfil', detalle: error.message });
  }
});

app.post('/actividades/manual', async (req, res) => {
  const { user_id, challenge_id, sport_type, distance_km, recorded_at, evidencia_url } = req.body;
  const distanciaFloat = parseFloat(distance_km);

  try {
    const { data: nuevaActividad, error: errorActividad } = await supabase
      .from('activities')
      .insert({
        user_id, challenge_id, source: 'manual',
        external_id: `manual_${user_id}_${Date.now()}`,
        sport_type, distance_km: distanciaFloat,
        duration_seconds: 0,
        recorded_at: recorded_at || new Date().toISOString(),
        evidencia_url: evidencia_url || null,
      })
      .select()
      .single();

    if (errorActividad) throw errorActividad;

    // Guardar km antes de recalcular
    const { data: ucAntes } = await supabase
      .from('user_challenges')
      .select('km_completed, challenge_id, challenges(title, modalidades, total_distance_km)')
      .eq('user_id', user_id)
      .eq('challenge_id', challenge_id)
      .single();

    const kmAntes = ucAntes?.km_completed || 0;

    await recalcularKmUsuario(user_id, challenge_id);
    await verificarYEnviarNotificacionRacha(user_id);

    // Notificación inteligente post-registro
    if (ucAntes) {
      const { data: ucDespues } = await supabase
        .from('user_challenges')
        .select('km_completed, status')
        .eq('user_id', user_id)
        .eq('challenge_id', challenge_id)
        .single();

      const modalidades = ucAntes.challenges?.modalidades || [];
      const distanciaTotal = modalidades[0]?.distancia_km || ucAntes.challenges?.total_distance_km || 100;

      if (ucAntes.status !== 'completed') {
        await enviarNotificacionProgreso(
          supabase, user_id,
          challenge_id, ucAntes.challenges?.title,
          kmAntes, ucDespues?.km_completed || 0,
          distanciaTotal
        );
      }
    }

    res.json({ mensaje: 'Actividad registrada y kilómetros sumados', actividad: nuevaActividad });
  } catch (error) {
    res.status(500).json({ error: 'Error registrando actividad', detalle: error.message });
  }
});

app.post('/admin/medalla-enviada', async (req, res) => {
  const { user_challenge_id, tracking_number } = req.body;
  try {
    const { data: uc, error } = await supabase
      .from('user_challenges')
      .update({ status: 'shipped', tracking_number })
      .eq('id', user_challenge_id)
      .select('*, challenges(*), users(*)')
      .single();

    if (error) throw error;

    await enviarEmailMedallaEnCamino(uc.users.email, uc.users.name, uc.challenges.title, tracking_number);

    if (uc.users?.push_token) {
      await enviarPushNotification(
        uc.users.push_token,
        '📦 Tu medalla está en camino!',
        `Tu medalla de ${uc.challenges.title} fue enviada. Pronto la tenés en casa 🏅`
      );
    }

    res.json({ mensaje: 'Medalla marcada como enviada y email enviado' });
  } catch (error) {
    res.json({ error: 'Error', detalle: error.message });
  }
});

app.get('/admin/challenges-activos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_challenges')
      .select('*, challenges(*), users(*)')
      .in('status', ['completed', 'shipped'])
      .order('completed_at', { ascending: false });

    if (error) throw error;

    // Para cada user_challenge, buscar evidencias de actividades manuales
    const resultado = await Promise.all(data.map(async (uc) => {
      const { data: actividades } = await supabase
        .from('activities')
        .select('evidencia_url')
        .eq('user_id', uc.user_id)
        .eq('source', 'manual')
        .not('evidencia_url', 'is', null)
        .order('recorded_at', { ascending: false })
        .limit(5);

      return {
        id: uc.id,
        usuario: uc.users?.name,
        email: uc.users?.email,
        challenge: uc.challenges?.title,
        modalidad: uc.modalidad,
        km_completados: uc.km_completed,
        tracking_number: uc.tracking_number,
        direccion: uc.users?.shipping_address,
        completed_at: uc.completed_at,
        status: uc.status,
        evidencias: actividades?.map(a => a.evidencia_url) || [],
      };
    }));

    res.json(resultado);
  } catch (error) {
    res.json({ error: 'Error', detalle: error.message });
  }
});

app.post('/usuarios/perfil', async (req, res) => {
  const { user_id, email, name } = req.body;
  try {
    const { data, error } = await supabase
      .from('users')
      .upsert({ id: user_id, email, name: name || email.split('@')[0] }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ mensaje: 'Perfil creado', usuario: data });
  } catch (error) {
    res.json({ error: 'Error creando perfil', detalle: error.message });
  }
});

app.post('/usuarios/direccion', async (req, res) => {
  const { user_id, shipping_address } = req.body;
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ shipping_address })
      .eq('id', user_id)
      .select()
      .single();

    if (error) throw error;
    res.json({ mensaje: 'Direccion guardada exitosamente', usuario: data });
  } catch (error) {
    res.json({ error: 'Error guardando direccion', detalle: error.message });
  }
});

app.get('/ranking/:challengeId', async (req, res) => {
  const { challengeId } = req.params;
  try {
    const { data, error } = await supabase
      .from('user_challenges')
      .select('*, users(name, avatar_url), challenges(modalidades, total_distance_km)')
      .eq('challenge_id', challengeId)
      .in('status', ['active', 'completed', 'shipped'])
      .order('km_completed', { ascending: false });

    if (error) throw error;

    const resultado = data.map((uc, index) => {
      const modalidades = uc.challenges?.modalidades || [];
      const modalidadData = modalidades.find(m => m.tipo === uc.modalidad);
      const distancia = modalidadData?.distancia_km || uc.challenges?.total_distance_km || 100;

      return {
        posicion: index + 1,
        nombre: (() => {
          const n = uc.users?.name || 'Anonimo';
          const partes = n.trim().split(' ');
          if (partes.length === 1) return partes[0];
          return `${partes[0]} ${partes[1]?.charAt(0)}.`;
        })(),
        avatar: uc.users?.avatar_url,
        km_completados: uc.km_completed,
        modalidad: uc.modalidad,
        porcentaje: Math.min((uc.km_completed / distancia) * 100, 100).toFixed(1)
      };
    });

    res.json(resultado);
  } catch (error) {
    res.json({ error: 'Error obteniendo ranking', detalle: error.message });
  }
});

app.post('/usuarios/push-token', async (req, res) => {
  const { user_id, push_token } = req.body;
  try {
    await supabase.from('users').update({ push_token }).eq('id', user_id);
    res.json({ mensaje: 'Token guardado' });
  } catch (error) {
    res.json({ error: 'Error guardando token', detalle: error.message });
  }
});

app.post('/admin/challenges', async (req, res) => {
  const { title, description, historia, sport_type, price_usd, medal_image_url, link_mercadopago, link_shopify, modalidades } = req.body;
  try {
    const { data, error } = await supabase
      .from('challenges')
      .insert({
        title, description, historia,
        sport_type: sport_type || 'run',
        price_usd, medal_image_url, link_mercadopago, link_shopify, modalidades,
        is_active: true,
        total_distance_km: modalidades?.[0]?.distancia_km || 0
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ mensaje: 'Reto creado exitosamente', challenge: data });
  } catch (error) {
    res.json({ error: 'Error creando reto', detalle: error.message });
  }
});

app.get('/actividades/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.json({ error: 'Error obteniendo actividades', detalle: error.message });
  }
});

app.put('/admin/challenges/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, historia, price_usd, price_ars, medal_image_url, imagen_portada, galeria, link_mercadopago, link_shopify, oferta_texto, checkpoints } = req.body;
  try {
    const { data, error } = await supabase
      .from('challenges')
      .update({ title, description, historia, price_usd, price_ars, medal_image_url, imagen_portada, galeria, link_mercadopago, link_shopify, oferta_texto, checkpoints })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json({ mensaje: 'Reto actualizado', challenge: data });
  } catch (error) {
    res.json({ error: 'Error actualizando reto', detalle: error.message });
  }
});

app.put('/usuarios/modalidad', async (req, res) => {
  const { user_id, challenge_id, modalidad } = req.body;

  if (!['run', 'ride'].includes(modalidad)) {
    return res.status(400).json({ error: 'Modalidad inválida' });
  }

  try {
    const { data, error } = await supabase
      .from('user_challenges')
      .update({ modalidad })
      .eq('user_id', user_id)
      .eq('challenge_id', challenge_id)
      .in('status', ['active', 'pending'])
      .select()
      .single();

    if (error) throw error;

    await recalcularKmUsuario(user_id, challenge_id);

    res.json({ mensaje: 'Modalidad actualizada y kilómetros recalculados', data });
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando modalidad', detalle: error.message });
  }
});

app.delete('/actividades/:actividadId', async (req, res) => {
  const { actividadId } = req.params;
  const { user_id } = req.body;
  try {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', actividadId)
      .eq('user_id', user_id);

    if (error) throw error;

    await recalcularKmUsuario(user_id);

    res.json({ mensaje: 'Actividad eliminada y km recalculados' });
  } catch (error) {
    res.json({ error: 'Error eliminando actividad', detalle: error.message });
  }
});

app.get('/admin/metricas', async (req, res) => {
  try {
    // Total usuarios
    const { count: totalUsuarios } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Inscripciones por status
    const { data: inscripciones } = await supabase
      .from('user_challenges')
      .select('status, challenge_id, km_completed, challenges(title)');

    const activos = inscripciones?.filter(i => i.status === 'active').length || 0;
    const completados = inscripciones?.filter(i => i.status === 'completed').length || 0;
    const enviados = inscripciones?.filter(i => i.status === 'shipped').length || 0;

    // Km totales
    const { data: actividades } = await supabase
      .from('activities')
      .select('distance_km, sport_type, source');

    const kmTotales = actividades?.reduce((sum, a) => sum + (parseFloat(a.distance_km) || 0), 0) || 0;
    const kmStrava = actividades?.filter(a => a.source === 'strava').reduce((sum, a) => sum + (parseFloat(a.distance_km) || 0), 0) || 0;
    const kmManual = actividades?.filter(a => a.source === 'manual').reduce((sum, a) => sum + (parseFloat(a.distance_km) || 0), 0) || 0;
    const totalActividades = actividades?.length || 0;

    // Usuarios con Strava conectado
    const { count: conStrava } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .not('strava_token', 'is', null);

    // Métricas por challenge
    const porChallenge = {};
    inscripciones?.forEach(i => {
      const titulo = i.challenges?.title || 'Sin título';
      if (!porChallenge[titulo]) {
        porChallenge[titulo] = { activos: 0, completados: 0, enviados: 0, kmTotales: 0 };
      }
      if (i.status === 'active') porChallenge[titulo].activos++;
      if (i.status === 'completed') porChallenge[titulo].completados++;
      if (i.status === 'shipped') porChallenge[titulo].enviados++;
      porChallenge[titulo].kmTotales += parseFloat(i.km_completed) || 0;
    });

    res.json({
      totalUsuarios,
      conStrava,
      activos,
      completados,
      enviados,
      kmTotales: kmTotales.toFixed(1),
      kmStrava: kmStrava.toFixed(1),
      kmManual: kmManual.toFixed(1),
      totalActividades,
      porChallenge,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error cargando métricas', detalle: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Korva corriendo en puerto ${PORT}`);
});