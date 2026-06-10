require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const stravaRoutes = require('./routes/strava');
const shopifyRoutes = require('./routes/shopify');
const mercadopagoRoutes = require('./routes/mercadopago');
const { enviarEmailInscripcion, enviarEmailMedallaEnCamino } = require('./routes/emails');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

app.use(cors());
app.use(express.json());
app.use('/strava', stravaRoutes);
app.use('/shopify', shopifyRoutes);
app.use('/mercadopago', mercadopagoRoutes);

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

const verificarYEnviarNotificacionRacha = async (userId) => {
  try {
    const { data: actividades } = await supabase
      .from('activities')
      .select('recorded_at')
      .eq('user_id', userId)
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
    let query = supabase
      .from('user_challenges')
      .select('id, started_at, challenge_id')
      .eq('user_id', user_id)
      .eq('status', 'active');

    if (challenge_id) query = query.eq('challenge_id', challenge_id);

    const { data: retosActivos } = await query;

    for (const reto of retosActivos || []) {
      const { data: todasActividades } = await supabase
        .from('activities')
        .select('distance_km')
        .eq('user_id', user_id)
        .gte('recorded_at', reto.started_at);

      const totalKm = todasActividades?.reduce((sum, a) => sum + (parseFloat(a.distance_km) || 0), 0) || 0;

      await supabase
        .from('user_challenges')
        .update({ km_completed: totalKm })
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
      // --- INSIGNIAS DE PARTICIPACIÓN ---
      if (completados >= 1) insignias.push({ id: 'primera_medalla', nombre: 'Primera medalla', emoji: '🏅' });
      if (completados >= 2) insignias.push({ id: 'doble', nombre: 'Doble modalidad', emoji: '🚴' });
      if (completados >= 3) insignias.push({ id: 'triplete', nombre: 'Triplete', emoji: '🥉' });
      if (completados >= 5) insignias.push({ id: 'constancia', nombre: 'Constancia', emoji: '⭐' });
      if (completados >= 10) insignias.push({ id: 'coleccionista', nombre: 'Coleccionista', emoji: '🏆' });
      if (completados >= 15) insignias.push({ id: 'elite', nombre: 'Atleta Élite', emoji: '🎖️' });
      if (completados >= 25) insignias.push({ id: 'salon_fama', nombre: 'Salón de la Fama', emoji: '🏛️' });

      // Lógica específica para el Fin del Mundo
      const logroApie = (modalidad === 'correr' || modalidad === 'caminar') && totalKm >= 103;
      const logroBici = (modalidad === 'bici' || modalidad === 'ciclismo') && totalKm >= 309;

      if (logroApie || logroBici) {
        insignias.push({ id: 'fin_del_mundo', nombre: 'Fin del Mundo', emoji: '🏔️' });
      }
            // --- INSIGNIAS DE DISTANCIA ---
      if (totalKm >= 100) insignias.push({ id: 'km_100', nombre: '100 km', emoji: '💯' });
      if (totalKm >= 250) insignias.push({ id: 'km_250', nombre: '250 km', emoji: '⚡' });
      if (totalKm >= 500) insignias.push({ id: 'km_500', nombre: '500 km', emoji: '🌍' });
      if (totalKm >= 1000) insignias.push({ id: 'km_1000', nombre: '1000 km', emoji: '👑' });
      
      return insignias;
    };

    const nivel = getNivel(completados);
    const totalKmNum = parseFloat(totalKm);
    const insignias = getInsignias(completados, totalKmNum);

    const actividadesFechas = await supabase
      .from('activities').select('recorded_at').eq('user_id', userId).order('recorded_at', { ascending: false });

    const diasUnicos = [...new Set(
      actividadesFechas.data?.map(a => a.recorded_at?.split('T')[0]) || []
    )].sort().reverse();

    let racha = 0;
    for (let i = 0; i < diasUnicos.length; i++) {
      const esperado = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      if (diasUnicos[i] === esperado) racha++;
      else break;
    }

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
  const { user_id, challenge_id, sport_type, distance_km, recorded_at } = req.body;
  const distanciaFloat = parseFloat(distance_km);

  try {
    const { data: nuevaActividad, error: errorActividad } = await supabase
      .from('activities')
      .insert({
        user_id, challenge_id, source: 'manual',
        external_id: `manual_${user_id}_${Date.now()}`,
        sport_type, distance_km: distanciaFloat,
        duration_seconds: 0,
        recorded_at: recorded_at || new Date().toISOString()
      })
      .select()
      .single();

    if (errorActividad) throw errorActividad;

    await recalcularKmUsuario(user_id, challenge_id);
    await verificarYEnviarNotificacionRacha(user_id);

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

    const resultado = data.map(uc => ({
      id: uc.id,
      usuario: uc.users?.name,
      email: uc.users?.email,
      challenge: uc.challenges?.title,
      modalidad: uc.modalidad,
      km_completados: uc.km_completed,
      tracking_number: uc.tracking_number,
      direccion: uc.users?.shipping_address,
      completed_at: uc.completed_at,
      status: uc.status
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

app.listen(PORT, () => {
  console.log(`Servidor Korva corriendo en puerto ${PORT}`);
});