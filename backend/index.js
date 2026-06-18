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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(cors());
app.use(express.json({ limit: '10mb' })); // aumentar límite para imágenes base64

// ─── ENDPOINT DE PRUEBA DE BIB (sacar después) ──────────────────
app.get('/test/bib/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: user } = await supabase.from('users').select('id, name, email, bib_number').eq('id', userId).single();
    if (!user) return res.json({ error: 'Usuario no encontrado' });
    const { generarBibYPostal, asignarBibNumber } = require('./generador_bib');
    const { enviarEmailInscripcionConBib } = require('./routes/emails');
    let bibNumber = user.bib_number;
    if (!bibNumber) bibNumber = await asignarBibNumber(supabase, userId);
    const pdfs = await generarBibYPostal(supabase, user.name, bibNumber, 'ae54af78-dc6f-4cf5-af31-2c077ba58048');
    if (!pdfs) return res.json({ error: 'No se pudieron generar los PDFs' });
    await enviarEmailInscripcionConBib(user.email, user.name, 'Desafío Fin del Mundo', 'Running', pdfs.dorsalPdf, pdfs.postalPdf, bibNumber);
    res.json({ ok: true, mensaje: `Bib #${bibNumber} enviado a ${user.email}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

// Todos los challenges para ranking (incluyendo inactivos)
app.get('/challenges/todos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('challenges')
      .select('*')
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

    // Fecha de corte: primera inscripción activa/completada — todo lo anterior no cuenta para stats
    const { data: inscripcionesOrdenadas } = await supabase
      .from('user_challenges')
      .select('started_at')
      .eq('user_id', userId)
      .in('status', ['active', 'completed', 'shipped'])
      .order('started_at', { ascending: true })
      .limit(1);
    const fechaCorte = inscripcionesOrdenadas?.[0]?.started_at || null;

    let queryActividades = supabase.from('activities').select('distance_km').eq('user_id', userId);
    if (fechaCorte) queryActividades = queryActividades.gte('recorded_at', fechaCorte);
    const { data: actividades } = await queryActividades;

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

    const nivel = getNivel(completados);

    const getInsignias = (completados, totalKm, totalActividades, rachaActual, mejorRacha, semanasActivas, totalRun, totalRide, checkpointsDesbloqueados) => {
      const ganadas = [];
      const progreso = {};

      // ── 🏃 DISTANCIA TOTAL ─────────────────────────────────────
      const hitos_km = [
        { km: 10,    id: 'km_10',    nombre: 'Primeros 10km',   emoji: '👟' },
        { km: 25,    id: 'km_25',    nombre: '25 km',           emoji: '🌱' },
        { km: 50,    id: 'km_50',    nombre: '50 km',           emoji: '⚡' },
        { km: 100,   id: 'km_100',   nombre: '100 km',          emoji: '💯' },
        { km: 200,   id: 'km_200',   nombre: '200 km',          emoji: '🔥' },
        { km: 500,   id: 'km_500',   nombre: '500 km',          emoji: '🌍' },
        { km: 1000,  id: 'km_1000',  nombre: '1.000 km',        emoji: '👑' },
        { km: 2500,  id: 'km_2500',  nombre: '2.500 km',        emoji: '🚀' },
        { km: 5000,  id: 'km_5000',  nombre: '5.000 km',        emoji: '🌌' },
        { km: 10000, id: 'km_10000', nombre: '10.000 km',       emoji: '🔱' },
      ];
      let proximoKm = null;
      for (const h of hitos_km) {
        if (totalKm >= h.km) ganadas.push({ ...h, categoria: 'distancia' });
        else if (!proximoKm) proximoKm = { nombre: h.nombre, falta: (h.km - totalKm).toFixed(1), unidad: 'km' };
      }
      progreso.distancia = proximoKm;

      // ── 🔥 RACHAS (se ganan por mejor racha histórica) ──────────
      const hitos_racha = [
        { dias: 3,   id: 'racha_3',   nombre: '3 días seguidos',   emoji: '🔥' },
        { dias: 7,   id: 'racha_7',   nombre: 'Una semana',        emoji: '⚡' },
        { dias: 14,  id: 'racha_14',  nombre: 'Dos semanas',       emoji: '💪' },
        { dias: 21,  id: 'racha_21',  nombre: 'Tres semanas',      emoji: '🎯' },
        { dias: 30,  id: 'racha_30',  nombre: 'Un mes',            emoji: '🏆' },
        { dias: 60,  id: 'racha_60',  nombre: 'Dos meses',         emoji: '👑' },
        { dias: 90,  id: 'racha_90',  nombre: 'Tres meses',        emoji: '🌟' },
        { dias: 180, id: 'racha_180', nombre: 'Seis meses',        emoji: '🌍' },
        { dias: 365, id: 'racha_365', nombre: 'Un año entero',     emoji: '🔱' },
      ];
      let proximaRacha = null;
      for (const h of hitos_racha) {
        if (mejorRacha >= h.dias) ganadas.push({ ...h, categoria: 'racha' });
        else if (!proximaRacha) proximaRacha = { nombre: h.nombre, falta: h.dias - mejorRacha, unidad: 'días seguidos' };
      }
      progreso.racha = proximaRacha;

      // ── ⚡ ACTIVIDADES TOTALES ──────────────────────────────────
      const hitos_act = [
        { n: 1,   id: 'act_1',   nombre: 'Primera actividad',  emoji: '🌱' },
        { n: 5,   id: 'act_5',   nombre: '5 actividades',      emoji: '✊' },
        { n: 10,  id: 'act_10',  nombre: '10 actividades',     emoji: '💪' },
        { n: 25,  id: 'act_25',  nombre: '25 actividades',     emoji: '⚡' },
        { n: 50,  id: 'act_50',  nombre: '50 actividades',     emoji: '🔥' },
        { n: 100, id: 'act_100', nombre: '100 actividades',    emoji: '💯' },
        { n: 250, id: 'act_250', nombre: '250 actividades',    emoji: '👑' },
        { n: 500, id: 'act_500', nombre: '500 actividades',    emoji: '🌌' },
      ];
      let proximaAct = null;
      for (const h of hitos_act) {
        if (totalActividades >= h.n) ganadas.push({ ...h, categoria: 'actividades' });
        else if (!proximaAct) proximaAct = { nombre: h.nombre, falta: h.n - totalActividades, unidad: 'actividades' };
      }
      progreso.actividades = proximaAct;

      // ── 🏅 CHALLENGES ───────────────────────────────────────────
      const hitos_challenges = [
        { n: 1, id: 'ch_1', nombre: 'Primera medalla',      emoji: '🏅' },
        { n: 2, id: 'ch_2', nombre: 'Doble campeón',        emoji: '🥈' },
        { n: 3, id: 'ch_3', nombre: 'Triple corona',        emoji: '🥇' },
        { n: 5, id: 'ch_5', nombre: 'Leyenda Korva',        emoji: '🔱' },
      ];
      let proximoCh = null;
      for (const h of hitos_challenges) {
        if (completados >= h.n) ganadas.push({ ...h, categoria: 'challenges' });
        else if (!proximoCh) proximoCh = { nombre: h.nombre, falta: h.n - completados, unidad: 'challenges' };
      }
      progreso.challenges = proximoCh;

      // ── 📅 CONSISTENCIA (semanas activas en total) ──────────────
      const hitos_sem = [
        { n: 4,   id: 'sem_4',   nombre: '4 semanas activas',   emoji: '📅' },
        { n: 8,   id: 'sem_8',   nombre: '8 semanas activas',   emoji: '🗓️' },
        { n: 12,  id: 'sem_12',  nombre: '3 meses activo',      emoji: '💎' },
        { n: 26,  id: 'sem_26',  nombre: '6 meses activo',      emoji: '🌟' },
        { n: 52,  id: 'sem_52',  nombre: 'Un año activo',       emoji: '🏆' },
        { n: 104, id: 'sem_104', nombre: 'Dos años activo',     emoji: '🔱' },
      ];
      let proximaSem = null;
      for (const h of hitos_sem) {
        if (semanasActivas >= h.n) ganadas.push({ ...h, categoria: 'consistencia' });
        else if (!proximaSem) proximaSem = { nombre: h.nombre, falta: h.n - semanasActivas, unidad: 'semanas' };
      }
      progreso.consistencia = proximaSem;

      // ── 🌐 MULTIDEPORTE ─────────────────────────────────────────
      if (totalRun > 0 && totalRide > 0) ganadas.push({ id: 'multideporte', nombre: 'Multideporte', emoji: '🌐', categoria: 'especial' });
      if (totalRun >= 50) ganadas.push({ id: 'corredor_pro', nombre: 'Corredor Pro', emoji: '🏃', categoria: 'especial' });
      if (totalRide >= 50) ganadas.push({ id: 'ciclista_pro', nombre: 'Ciclista Pro', emoji: '🚴', categoria: 'especial' });
      if (totalRun >= 10 && totalKm >= 100) ganadas.push({ id: 'centenario', nombre: 'Centenario', emoji: '💯', categoria: 'especial' });

      return { ganadas, progreso };
    };

    let queryFechas = supabase
      .from('activities').select('recorded_at').eq('user_id', userId).order('recorded_at', { ascending: false });
    if (fechaCorte) queryFechas = queryFechas.gte('recorded_at', fechaCorte);
    const actividadesFechas = await queryFechas;

    const racha = calcularRachaSemanal(actividadesFechas.data || []);

    // Calcular mejor racha histórica (días consecutivos)
    const todasFechas = actividadesFechas.data?.map(a => a.recorded_at?.split('T')[0]) || [];
    const diasUnicos = [...new Set(todasFechas)].sort();
    let mejorRacha = 0, rachaTemp = 1;
    for (let i = 1; i < diasUnicos.length; i++) {
      const diff = (new Date(diasUnicos[i]) - new Date(diasUnicos[i-1])) / 86400000;
      if (diff === 1) { rachaTemp++; mejorRacha = Math.max(mejorRacha, rachaTemp); }
      else rachaTemp = 1;
    }
    if (diasUnicos.length > 0) mejorRacha = Math.max(mejorRacha, 1);

    let queryConKm = supabase
      .from('activities').select('recorded_at, distance_km, sport_type, duration_seconds').eq('user_id', userId);
    if (fechaCorte) queryConKm = queryConKm.gte('recorded_at', fechaCorte);
    const actividadesConKm = await queryConKm;

    const kmPorSemanaFull = {};
    const deporteCount = { run: 0, ride: 0 };
    let segundosRunConTiempo = 0, kmRunConTiempo = 0;
    let segundosRideConTiempo = 0, kmRideConTiempo = 0;
    actividadesConKm.data?.forEach(a => {
      const fecha = new Date(a.recorded_at);
      const inicio = new Date(fecha);
      inicio.setDate(fecha.getDate() - fecha.getDay());
      const semana = inicio.toISOString().split('T')[0];
      kmPorSemanaFull[semana] = (kmPorSemanaFull[semana] || 0) + a.distance_km;
      if (a.sport_type === 'run') {
        deporteCount.run++;
        if (a.duration_seconds > 0) { segundosRunConTiempo += a.duration_seconds; kmRunConTiempo += a.distance_km; }
      } else if (a.sport_type === 'ride') {
        deporteCount.ride++;
        if (a.duration_seconds > 0) { segundosRideConTiempo += a.duration_seconds; kmRideConTiempo += a.distance_km; }
      }
    });

    // Ritmo promedio running: min/km. Ritmo promedio ciclismo: km/h.
    const ritmoRun = kmRunConTiempo > 0 ? (segundosRunConTiempo / 60 / kmRunConTiempo) : null;
    const ritmoRunMin = ritmoRun ? Math.floor(ritmoRun) : null;
    const ritmoRunSeg = ritmoRun ? Math.round((ritmoRun - Math.floor(ritmoRun)) * 60) : null;
    const velocidadRide = kmRideConTiempo > 0 ? (kmRideConTiempo / (segundosRideConTiempo / 3600)) : null;

    const { ganadas: insigniasGanadas, progreso: insigniasProgreso } = getInsignias(
      completados, totalKm,
      actividades?.length || 0,
      racha, mejorRacha,
      Object.keys(kmPorSemanaFull).length,
      deporteCount.run, deporteCount.ride,
      []
    );

    const mejorSemanaKm = Math.max(...Object.values(kmPorSemanaFull), 0);
    const totalSemanas = Object.keys(kmPorSemanaFull).length || 1;
    const promedioSemanal = (totalKm / totalSemanas).toFixed(1);

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
        mejor_racha: mejorRacha,
        mejor_semana_km: mejorSemanaKm.toFixed(1),
        promedio_semanal_km: promedioSemanal,
        perfil_deporte: perfilDeporte,
        ritmo_run: ritmoRunMin !== null ? `${ritmoRunMin}:${String(ritmoRunSeg).padStart(2, '0')} /km` : null,
        velocidad_ride: velocidadRide !== null ? `${velocidadRide.toFixed(1)} km/h` : null,
      },
      nivel,
      insignias: insigniasGanadas,
      insigniasProgreso,
    });
  } catch (error) {
    res.json({ error: 'Error cargando perfil', detalle: error.message });
  }
});

app.post('/actividades/manual', async (req, res) => {
  const { user_id, challenge_id, sport_type, distance_km, recorded_at, evidencia_url, duration_seconds } = req.body;
  const distanciaFloat = parseFloat(distance_km);

  // Rate limiting — máximo 5 registros manuales por día por usuario
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .eq('source', 'manual')
      .gte('created_at', hoy.toISOString());

    if (count >= 5) {
      return res.status(429).json({ error: 'Límite diario alcanzado. Podés registrar hasta 5 actividades manuales por día.' });
    }
  } catch (e) {
    console.error('Error verificando rate limit:', e);
  }

  // Validar distancia máxima razonable (300km por actividad)
  if (isNaN(distanciaFloat) || distanciaFloat <= 0 || distanciaFloat > 300) {
    return res.status(400).json({ error: 'Distancia inválida. Debe ser entre 0.1 y 300 km.' });
  }

  try {
    const { data: nuevaActividad, error: errorActividad } = await supabase
      .from('activities')
      .insert({
        user_id, challenge_id, source: 'manual',
        external_id: `manual_${user_id}_${Date.now()}`,
        sport_type, distance_km: distanciaFloat,
        duration_seconds: duration_seconds || null,
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

// Marcar todo un grupo (pedido) como enviado de una vez
app.post('/admin/grupo-enviado', async (req, res) => {
  const { user_challenge_ids, tracking_number } = req.body;
  if (!Array.isArray(user_challenge_ids) || user_challenge_ids.length === 0) {
    return res.json({ error: 'Faltan user_challenge_ids' });
  }
  try {
    const { data: ucs, error } = await supabase
      .from('user_challenges')
      .update({ status: 'shipped', tracking_number })
      .in('id', user_challenge_ids)
      .eq('status', 'completed') // solo marcar los que ya completaron
      .select('*, challenges(*), users(*)');

    if (error) throw error;

    // Enviar email y push a cada miembro que sí completó
    for (const uc of ucs) {
      await enviarEmailMedallaEnCamino(uc.users.email, uc.users.name, uc.challenges.title, tracking_number);
      if (uc.users?.push_token) {
        await enviarPushNotification(
          uc.users.push_token,
          '📦 Tu medalla está en camino!',
          `Tu medalla de ${uc.challenges.title} fue enviada. Pronto la tenés en casa 🏅`
        );
      }
    }

    res.json({ mensaje: `${ucs.length} medalla(s) marcadas como enviadas`, enviados: ucs.length });
  } catch (error) {
    res.json({ error: 'Error', detalle: error.message });
  }
});

// Traduce términos comunes de direcciones español -> inglés usando Claude
const traducirDireccion = async (direccion, indicaciones) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Sin API key: devolver tal cual
    return { address: direccion || '', indications: indicaciones || '' };
  }
  try {
    const prompt = `Translate the following shipping address fields from Spanish to English for an international courier. Keep proper nouns, street names, and numbers EXACTLY as written — only translate generic terms (e.g. "Avenida"->"Avenue", "Calle"->"Street", "Piso"->"Floor", "Depto"/"Departamento"->"Apt", "Edificio"->"Building", "Casa"->"House", "Entre calles"->"Between streets"). Respond ONLY with JSON, no markdown, no preamble:
{"address": "...", "indications": "..."}

Address: ${direccion || ''}
Indications: ${indicaciones || ''}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return { address: parsed.address || direccion || '', indications: parsed.indications || indicaciones || '' };
  } catch (e) {
    console.error('Error traduciendo dirección:', e.message);
    return { address: direccion || '', indications: indicaciones || '' };
  }
};

const csvEscape = (val) => {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// Export CSV para el agente logístico — una fila por pedido (comprador + dirección), Units = total medallas
app.get('/admin/export-envios', async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pedidosRes = await fetch(`${baseUrl}/admin/pedidos-grupales`);
    const pedidos = await pedidosRes.json();

    const filas = [];
    for (const grupo of pedidos) {
      const d = grupo.direccion;
      const direccionTexto = d ? `${d.direccion || ''}, ${d.ciudad || ''}, ${d.codigo_postal || ''}, ${d.pais || ''}` : '';
      const { address } = await traducirDireccion(direccionTexto, '');

      const totalMedallas = grupo.miembros.filter(m => m.status === 'completed').length;

      filas.push({
        Name: grupo.comprador,
        Units: totalMedallas,
        Status: 'NEW ORDER',
        'Mail address': grupo.email,
        Address: address,
        Country: d?.pais || '',
        City: d?.ciudad || '',
        'Postal code': d?.codigo_postal || '',
        'Cel phone': d?.telefono || '',
        Indications: '',
        'Tracking Number': '',
      });
    }

    const headers = ['Name', 'Units', 'Status', 'Mail address', 'Address', 'Country', 'City', 'Postal code', 'Cel phone', 'Indications', 'Tracking Number'];
    const csvLines = [headers.join(',')];
    for (const fila of filas) {
      csvLines.push(headers.map(h => csvEscape(fila[h])).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="korva_envios.csv"');
    res.send('\uFEFF' + csvLines.join('\n'));
  } catch (error) {
    res.status(500).json({ error: 'Error exportando', detalle: error.message });
  }
});

app.get('/admin/todos-inscriptos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_challenges')
      .select('*, challenges(*), users(*)')
      .in('status', ['active', 'completed', 'shipped', 'pending'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    const resultado = data.map(uc => ({
      id: uc.id,
      usuario: uc.users?.name,
      email: uc.users?.email,
      challenge: uc.challenges?.title,
      challenge_id: uc.challenge_id,
      modalidad: uc.modalidad,
      km_completados: uc.km_completed?.toFixed(1) || '0.0',
      status: uc.status,
      started_at: uc.started_at,
      completed_at: uc.completed_at,
      tracking_number: uc.tracking_number,
    }));

    res.json(resultado);
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

// Pedidos grupales — agrupa inscripciones por group_id y determina si están listas para enviar
app.get('/admin/pedidos-grupales', async (req, res) => {
  try {
    // Traer todas las inscripciones activas y completadas (no enviadas) que tengan group_id
    const { data, error } = await supabase
      .from('user_challenges')
      .select('*, challenges(*), users(*)')
      .in('status', ['active', 'completed'])
      .not('group_id', 'is', null);

    if (error) throw error;

    // Agrupar por group_id
    const grupos = {};
    for (const uc of data) {
      const gid = uc.group_id;
      if (!grupos[gid]) grupos[gid] = [];
      grupos[gid].push(uc);
    }

    const DOS_SEMANAS_MS = 14 * 24 * 60 * 60 * 1000;
    const ahora = Date.now();

    const resultado = [];
    for (const [groupId, miembros] of Object.entries(grupos)) {
      const totalMiembros = miembros.length;
      const completados = miembros.filter(m => m.status === 'completed');
      const todosCompletados = completados.length === totalMiembros;

      // Si nadie completó todavía, no mostrar este grupo
      if (completados.length === 0) continue;

      // Fecha del primer completado
      const primerCompletado = completados
        .map(m => new Date(m.completed_at).getTime())
        .sort((a, b) => a - b)[0];

      const diasDesdeElPrimero = Math.floor((ahora - primerCompletado) / (1000 * 60 * 60 * 24));
      const esEnvioParcial = !todosCompletados && (ahora - primerCompletado) >= DOS_SEMANAS_MS;

      // Solo mostrar si todos completaron, o si ya pasó el tope de 2 semanas
      if (!todosCompletados && !esEnvioParcial) continue;

      // El "comprador" / destinatario del envío es el miembro cuyo user_id === group_id
      const comprador = miembros.find(m => m.user_id === groupId) || miembros[0];

      resultado.push({
        group_id: groupId,
        comprador: comprador.users?.name,
        email: comprador.users?.email,
        direccion: comprador.users?.shipping_address,
        total_miembros: totalMiembros,
        completados: completados.length,
        envio_parcial: esEnvioParcial,
        dias_desde_primero: diasDesdeElPrimero,
        miembros: miembros.map(m => ({
          id: m.id,
          usuario: m.users?.name,
          email: m.users?.email,
          challenge: m.challenges?.title,
          modalidad: m.modalidad,
          km_completados: m.km_completed,
          status: m.status,
          completed_at: m.completed_at,
          tracking_number: m.tracking_number,
        })),
      });
    }

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
    // Buscar la fecha de inscripción más antigua entre los challenges activos
    const { data: inscripciones } = await supabase
      .from('user_challenges')
      .select('started_at')
      .eq('user_id', userId)
      .in('status', ['active', 'completed', 'shipped'])
      .order('started_at', { ascending: true })
      .limit(1);

    const fechaCorte = inscripciones?.[0]?.started_at || null;

    let query = supabase
      .from('activities')
      .select('*')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(100);

    if (fechaCorte) {
      query = query.gte('recorded_at', fechaCorte);
    }

    const { data, error } = await query;

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
      .select('status, challenge_id, user_id, km_completed, started_at, challenges(title)');

    const activos = inscripciones?.filter(i => i.status === 'active').length || 0;
    const completados = inscripciones?.filter(i => i.status === 'completed').length || 0;
    const enviados = inscripciones?.filter(i => i.status === 'shipped').length || 0;

    // Fecha de corte por usuario: la primera inscripción activa/completada/enviada de cada uno.
    // Esto evita que actividades viejas de Strava (previas a usar Korva) infle los totales.
    const fechaCortePorUsuario = {};
    inscripciones?.forEach(i => {
      if (!['active', 'completed', 'shipped'].includes(i.status)) return;
      const actual = fechaCortePorUsuario[i.user_id];
      if (!actual || new Date(i.started_at) < new Date(actual)) {
        fechaCortePorUsuario[i.user_id] = i.started_at;
      }
    });

    // Km totales — solo actividades posteriores a la fecha de corte de cada usuario
    const { data: todasActividades } = await supabase
      .from('activities')
      .select('user_id, distance_km, sport_type, source, recorded_at');

    const actividades = todasActividades?.filter(a => {
      const corte = fechaCortePorUsuario[a.user_id];
      if (!corte) return false; // usuario sin inscripción activa/completada/enviada: no cuenta
      return new Date(a.recorded_at) >= new Date(corte);
    });

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