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
        user_id,
        challenge_id,
        modalidad,
        status: 'pending',
        km_completed: 0,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    const { data: challenge } = await supabase
      .from('challenges')
      .select('title')
      .eq('id', challenge_id)
      .single();

    const { data: usuario } = await supabase
      .from('users')
      .select('email, name')
      .eq('id', user_id)
      .single();

    if (usuario?.email && challenge?.title) {
      enviarEmailInscripcion(
        usuario.email,
        usuario.name,
        challenge.title,
        modalidad === 'run' ? 'Running' : 'Ciclismo'
      );
    }

    res.json({ mensaje: 'Inscripcion exitosa! Ya podes empezar tu reto', id: data.id });
  } catch (error) {
    res.json({ error: 'Error al inscribirse', detalle: error.message });
  }
});

app.get('/perfil/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: usuario, error } = await supabase
      .from('users').select('*').eq('id', userId).single();
    if (error) throw error;

    const { data: actividades } = await supabase
      .from('activities').select('distance_km').eq('user_id', userId);

    const { data: challenges } = await supabase
      .from('user_challenges').select('status').eq('user_id', userId);

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

    const getInsignias = (completados, totalKm, actividades) => {
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
    const insignias = getInsignias(completados, totalKmNum, actividades);

    res.json({
      usuario,
      stats: {
        total_actividades: actividades?.length || 0,
        total_km: totalKm.toFixed(1),
        challenges_activos: activos,
        medallas: completados
      },
      nivel,
      insignias
    });
  } catch (error) {
    res.json({ error: 'Error cargando perfil', detalle: error.message });
  }
});

app.post('/actividades/manual', async (req, res) => {
  const { user_id, sport_type, distance_km, recorded_at } = req.body;
  try {
    const { data, error } = await supabase
      .from('activities')
      .insert({
        user_id,
        source: 'manual',
        external_id: `manual_${user_id}_${Date.now()}`,
        sport_type,
        distance_km: parseFloat(distance_km),
        duration_seconds: 0,
        recorded_at: recorded_at || new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ mensaje: 'Actividad registrada exitosamente', actividad: data });
  } catch (error) {
    res.json({ error: 'Error registrando actividad', detalle: error.message });
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

    await enviarEmailMedallaEnCamino(
      uc.users.email,
      uc.users.name,
      uc.challenges.title,
      tracking_number
    );

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
        title,
        description,
        historia,
        sport_type: sport_type || 'run',
        price_usd,
        medal_image_url,
        link_mercadopago,
        link_shopify,
        modalidades,
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
      .limit(10);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.json({ error: 'Error obteniendo actividades', detalle: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Korva corriendo en puerto ${PORT}`);
});