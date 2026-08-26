require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const stravaRoutes = require('./routes/strava');
const shopifyRoutes = require('./routes/shopify');
const mercadopagoRoutes = require('./routes/mercadopago');
const invitacionesRoutes = require('./routes/invitaciones');
const { enviarEmailInscripcion, enviarEmailMedallaEnCamino, enviarEmailCompletado, enviarEmailAdminMedallaLista } = require('./routes/emails');
const { enviarNotificacionProgreso } = require('./routes/notificaciones');
const { generarCertificado } = require('./generador_bib');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const CUPO_STRAVA = 999;
app.get('/strava-cupo', async (req, res) => {
  const { userId } = req.query;
  try {
    if (userId) {
      const { data: retoActivo } = await supabase
        .from('user_challenges')
        .select('id')
        .eq('user_id', userId)
        .in('status', ['active', 'completed', 'shipped', 'cargado'])
        .limit(1)
        .maybeSingle();

      if (!retoActivo) {
        return res.json({ disponible: false, motivo: 'sin_reto', conectados: 0, cupo: CUPO_STRAVA });
      }
    }

    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .not('strava_token', 'is', null);

    const conectados = count || 0;
    res.json({ disponible: conectados < CUPO_STRAVA, conectados, cupo: CUPO_STRAVA });
  } catch (error) {
    res.status(500).json({ error: 'Error chequeando cupo', detalle: error.message });
  }
});

app.use(cors());

app.use('/shopify', shopifyRoutes);

app.use(express.json({ limit: '10mb' }));

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

app.get('/test/reenviar-certificados', async (req, res) => {
  const { generarCertificado } = require('./generador_bib');
  const { enviarEmailCompletado } = require('./routes/emails');
  const resultados = [];
  try {
    const { data: ucs } = await supabase
      .from('user_challenges')
      .select('id, user_id, challenge_id, km_completed, completed_at, challenges(title, total_distance_km)')
      .in('status', ['completed', 'shipped', 'cargado'])
      .is('certificado_serial', null);

    for (const uc of (ucs || [])) {
      const { data: usuario } = await supabase.from('users').select('email, name, bib_number, shipping_address').eq('id', uc.user_id).single();
      if (!usuario) { resultados.push({ user_id: uc.user_id, error: 'usuario no encontrado' }); continue; }
      try {
        let numeroSerie = 'KORVA-' + new Date().getFullYear() + '-0000';
        const { data: serie } = await supabase.rpc('get_next_certificado_serial');
        if (serie) numeroSerie = serie;
        const fechaCompletado = uc.completed_at
          ? new Date(uc.completed_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
          : new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
        const tituloChallenge = uc.challenges?.title || 'Desafío Korva';
        const distanciaTotal = uc.challenges?.total_distance_km || uc.km_completed;
        const certificadoPdf = await generarCertificado(supabase, usuario.name, tituloChallenge, distanciaTotal, usuario.bib_number || '---', fechaCompletado, numeroSerie);
        if (!certificadoPdf) { resultados.push({ email: usuario.email, error: 'PDF falló' }); continue; }
        await supabase.from('user_challenges').update({ certificado_serial: numeroSerie }).eq('id', uc.id);
        await enviarEmailCompletado(usuario.email, usuario.name, tituloChallenge, certificadoPdf, {
          tieneDir: !!usuario.shipping_address, esGrupo: false, esComprador: true, miembros: []
        });
        resultados.push({ email: usuario.email, challenge: tituloChallenge, serie: numeroSerie, ok: true });
      } catch (e) {
        resultados.push({ email: usuario.email, error: e.message });
      }
    }
    res.json({ total: resultados.length, resultados });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/test/reenviar-todos-bibs-nuevos', async (req, res) => {
  const challengeIds = [
    '64442b1d-12b8-4a58-a951-50ea10cb2131', // Dubrovnik
    '85a362a5-eee7-456d-9027-358d44446004',  // San Andrés
  ];
  const { generarBibYPostal } = require('./generador_bib');
  const { enviarEmailInscripcionConBib } = require('./routes/emails');
  const resultados = [];

  try {
    for (const challengeId of challengeIds) {
      const { data: challenge } = await supabase.from('challenges').select('title').eq('id', challengeId).single();
      const { data: ucs } = await supabase
        .from('user_challenges')
        .select('user_id, numero_bib, modalidad')
        .eq('challenge_id', challengeId)
        .not('numero_bib', 'is', null)
        .in('status', ['active', 'completed', 'shipped', 'cargado']);

      for (const uc of (ucs || [])) {
        const { data: user } = await supabase.from('users').select('id, name, email, dorsal_url').eq('id', uc.user_id).single();
        if (!user || !uc.numero_bib) { resultados.push({ email: user?.email, error: 'sin numero_bib' }); continue; }
        // Saltar si ya tiene dorsal_url (ya recibió el bib)
        if (user.dorsal_url) { resultados.push({ email: user.email, challenge: challenge.title, skipped: 'ya tiene bib' }); continue; }
        try {
          const pdfs = await generarBibYPostal(supabase, user.name, uc.numero_bib, challengeId);
          if (!pdfs) { resultados.push({ email: user.email, challenge: challenge.title, error: 'PDFs fallaron' }); continue; }
          await enviarEmailInscripcionConBib(user.email, user.name, challenge.title, uc.modalidad === 'run' ? 'Running' : 'Ciclismo', pdfs.dorsalPdf, pdfs.postalPdf, uc.numero_bib);
          resultados.push({ email: user.email, challenge: challenge.title, bib: uc.numero_bib, ok: true });
        } catch (e) {
          resultados.push({ email: user.email, challenge: challenge.title, error: e.message });
        }
      }
    }
    res.json({ total: resultados.length, resultados });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/test/bib/:userId/:challengeId', async (req, res) => {
  const { userId, challengeId } = req.params;
  try {
    const { data: user } = await supabase.from('users').select('id, name, email').eq('id', userId).single();
    if (!user) return res.json({ error: 'Usuario no encontrado' });
    const { data: challenge } = await supabase.from('challenges').select('title').eq('id', challengeId).single();
    if (!challenge) return res.json({ error: 'Challenge no encontrado' });
    // Usar numero_bib del user_challenge específico
    const { data: uc } = await supabase.from('user_challenges').select('numero_bib').eq('user_id', userId).eq('challenge_id', challengeId).maybeSingle();
    const bibNumber = uc?.numero_bib;
    if (!bibNumber) return res.json({ error: 'No tiene numero_bib asignado para este desafío' });
    const { generarBibYPostal } = require('./generador_bib');
    const { enviarEmailInscripcionConBib } = require('./routes/emails');
    const pdfs = await generarBibYPostal(supabase, user.name, bibNumber, challengeId);
    if (!pdfs) return res.json({ error: 'No se pudieron generar los PDFs' });
    await enviarEmailInscripcionConBib(user.email, user.name, challenge.title, 'Running', pdfs.dorsalPdf, pdfs.postalPdf, bibNumber);
    res.json({ ok: true, mensaje: `Bib #${bibNumber} de ${challenge.title} enviado a ${user.email}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/usuarios/bib/:userId', async (req, res) => {
  const { userId } = req.params;
  const { challenge_id: challengeIdQuery } = req.query; // opcional: ?challenge_id=XXX
  try {
    const { data: user } = await supabase.from('users').select('id, name, email, bib_number').eq('id', userId).single();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { generarBibYPostal } = require('./generador_bib');

    // Buscar el challenge específico o el más reciente
    let ucQuery = supabase
      .from('user_challenges')
      .select('challenge_id, numero_bib, challenges(title)')
      .eq('user_id', userId)
      .in('status', ['active', 'completed', 'shipped', 'cargado']);

    if (challengeIdQuery) {
      ucQuery = ucQuery.eq('challenge_id', challengeIdQuery);
    }

    const { data: uc } = await ucQuery.order('started_at', { ascending: false }).limit(1).maybeSingle();

    const challengeId = uc?.challenge_id;
    const challengeTitle = uc?.challenges?.title || 'Desafío Korva';
    if (!challengeId) return res.status(404).json({ error: 'No se encontró desafío activo para este usuario' });

    // Usar numero_bib del challenge específico, fallback a bib_number global
    const bibNumber = uc?.numero_bib || user.bib_number;
    if (!bibNumber) return res.status(404).json({ error: 'No tiene número de bib asignado' });

    const pdfs = await generarBibYPostal(supabase, user.name, bibNumber, challengeId);
    if (!pdfs) return res.status(500).json({ error: 'No se pudieron generar los PDFs' });

    // Guardar en Supabase Storage
    const dorsalBuffer = Buffer.from(pdfs.dorsalPdf, 'base64');
    const postalBuffer = Buffer.from(pdfs.postalPdf, 'base64');

    const dorsalPath = `dorsales/dorsal_${bibNumber}.pdf`;
    const postalPath = `postales/postal_${bibNumber}.pdf`;

    await supabase.storage.from('korva-images').upload(dorsalPath, dorsalBuffer, { contentType: 'application/pdf', upsert: true });
    await supabase.storage.from('korva-images').upload(postalPath, postalBuffer, { contentType: 'application/pdf', upsert: true });

    const { data: dorsalUrl } = supabase.storage.from('korva-images').getPublicUrl(dorsalPath);
    const { data: postalUrl } = supabase.storage.from('korva-images').getPublicUrl(postalPath);

    // Guardar URLs en el usuario
    await supabase.from('users').update({
      dorsal_url: dorsalUrl.publicUrl,
      postal_url: postalUrl.publicUrl,
    }).eq('id', userId);

    res.json({
      bib_number: bibNumber,
      nombre: user.name,
      challenge: challengeTitle,
      dorsal_url: dorsalUrl.publicUrl,
      postal_url: postalUrl.publicUrl,
    });
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
    let query = supabase
      .from('user_challenges')
      .select('id, started_at, challenge_id, status, modalidad, challenges(title, modalidades, total_distance_km)')
      .eq('user_id', user_id)
      .in('status', ['active', 'completed']);

    if (challenge_id) query = query.eq('challenge_id', challenge_id);

    const { data: retos } = await query;

    for (const reto of retos || []) {
      const { data: todasActividades } = await supabase
        .from('activities')
        .select('distance_km')
        .eq('user_id', user_id)
        .eq('excluida', false)
        .gte('recorded_at', reto.started_at);

      const totalKm = todasActividades?.reduce((sum, a) => sum + (parseFloat(a.distance_km) || 0), 0) || 0;

      const modalidades = reto.challenges?.modalidades || [];
      const modalidadElegida = modalidades.find(m => m.tipo === reto.modalidad) || modalidades[0];
      const distanciaTotal = modalidadElegida?.distancia_km || reto.challenges?.total_distance_km || 100;
      const porcentaje = (totalKm / distanciaTotal) * 100;

      const yaEstabaCompletado = reto.status === 'completed';
      const nuevoStatus = porcentaje >= 100 ? 'completed' : 'active';
      const yaEraShipped = reto.status === 'shipped' || reto.status === 'cargado';
      const seCompletaAhora = nuevoStatus === 'completed' && !yaEstabaCompletado && !yaEraShipped;

      // No bajar status de shipped/completed aunque bajen los km
      const nuevoStatusFinal = (yaEraShipped || yaEstabaCompletado) ? reto.status : nuevoStatus;

      await supabase
        .from('user_challenges')
        .update({
          km_completed: totalKm,
          status: nuevoStatusFinal,
          completed_at: nuevoStatusFinal === 'active' ? null : (seCompletaAhora ? new Date().toISOString() : undefined),
        })
        .eq('id', reto.id);

      if (seCompletaAhora) {
        await enviarCertificadoFinisher(user_id, reto, distanciaTotal);
        // Push notification al completar
        const { data: usuarioPush } = await supabase
          .from('users')
          .select('push_token')
          .eq('id', user_id)
          .maybeSingle();
        if (usuarioPush?.push_token) {
          await enviarPushNotification(
            usuarioPush.push_token,
            '🏅 ¡Lo lograste!',
            `Completaste ${reto.challenges?.title}. Tu medalla está siendo preparada 📦`
          );
        }
      }

      if (porcentaje >= 75 && !yaEstabaCompletado) {
        const { data: usuario } = await supabase
          .from('users')
          .select('push_token, shipping_address')
          .eq('id', user_id)
          .maybeSingle();
        if (usuario?.push_token && !usuario?.shipping_address) {
          await enviarPushNotification(
            usuario.push_token,
            '📦 ¡Ya casi llegás!',
            'Acordate de cargar tu dirección de envío en el Perfil para que tu medalla salga sin demoras 🏅'
          );
        }
      }
    }
  } catch (error) {
    console.error('Error recalculando km:', error);
  }
};

const enviarCertificadoFinisher = async (user_id, reto, distanciaTotal) => {
  try {
    const { data: usuario } = await supabase
      .from('users')
      .select('email, name, bib_number, shipping_address')
      .eq('id', user_id)
      .single();
    if (!usuario) return;

    // Número de serie
    let numeroSerie = 'KORVA-' + new Date().getFullYear() + '-0000';
    try {
      const { data: serie, error: errorSerie } = await supabase.rpc('get_next_certificado_serial');
      if (!errorSerie && serie) numeroSerie = serie;
    } catch (e) {
      console.error('Error generando numero de serie:', e.message);
    }

    const fechaCompletado = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
    const tituloChallenge = reto.challenges?.title || 'Desafío Korva';

    const certificadoPdf = await generarCertificado(
      supabase,
      usuario.name,
      tituloChallenge,
      distanciaTotal,
      usuario.bib_number || '---',
      fechaCompletado,
      numeroSerie
    );

    await supabase.from('user_challenges').update({ certificado_serial: numeroSerie }).eq('id', reto.id);

    // Determinar contexto: individual, comprador grupal o invitado grupal
    const { data: ucCompleto } = await supabase
      .from('user_challenges')
      .select('group_id')
      .eq('id', reto.id)
      .maybeSingle();

    const groupId = ucCompleto?.group_id;
    const esGrupo = !!groupId;
    const esComprador = esGrupo && (groupId === user_id);
    const tieneDir = !!usuario.shipping_address;

    if (esGrupo && !esComprador) {
      // Invitado: email simple, sin aviso a Korva
      const { data: comprador } = await supabase
        .from('users').select('name').eq('id', groupId).maybeSingle();
      await enviarEmailCompletado(usuario.email, usuario.name, tituloChallenge, certificadoPdf, {
        tieneDir, esGrupo: true, esComprador: false, nombreComprador: comprador?.name || '',
      });
      return;
    }

    // Individual o comprador grupal — armar lista de miembros si es grupo
    let miembros = [];
    if (esGrupo) {
      const { data: miembrosUC } = await supabase
        .from('user_challenges')
        .select('user_id, status, km_completed')
        .eq('group_id', groupId)
        .eq('challenge_id', reto.challenge_id);

      const userIds = (miembrosUC || []).map(m => m.user_id);
      const { data: usuariosMiembros } = userIds.length > 0
        ? await supabase.from('users').select('id, name, email').in('id', userIds)
        : { data: [] };

      miembros = (miembrosUC || []).map(m => {
        const u = (usuariosMiembros || []).find(u => u.id === m.user_id);
        return {
          nombre: u?.name,
          email: u?.email,
          status: m.status,
          km: m.km_completed,
          esComprador: m.user_id === groupId,
        };
      });

      // Si ya hay otro miembro del grupo que completó antes, no mandar email a Korva
      const otrosCompletados = (miembrosUC || []).filter(m =>
        m.user_id !== user_id && (m.status === 'completed' || m.status === 'shipped')
      );
      if (otrosCompletados.length > 0) {
        await enviarEmailCompletado(usuario.email, usuario.name, tituloChallenge, certificadoPdf, {
          tieneDir, esGrupo: true, esComprador: true, miembros,
        });
        return;
      }
    }

    // Email al usuario (individual o primer completado del grupo)
    await enviarEmailCompletado(usuario.email, usuario.name, tituloChallenge, certificadoPdf, {
      tieneDir, esGrupo, esComprador: true, miembros,
    });

    // Email a Korva
    await enviarEmailAdminMedallaLista(
      usuario.name, usuario.email, tituloChallenge, tieneDir, esGrupo, miembros
    );

    // Verificar si tiene otros desafíos activos — avisar para consolidar envío
    const { data: otrosRetos } = await supabase
      .from('user_challenges')
      .select('id, challenges(title)')
      .eq('user_id', user_id)
      .in('status', ['active', 'completed', 'pending'])
      .neq('challenge_id', reto.challenge_id);

    if (otrosRetos && otrosRetos.length > 0) {
      const nombresOtros = otrosRetos.map(r => r.challenges?.title).filter(Boolean).join(', ');
      const { enviarEmailAdmin } = require('./routes/emails');
      await enviarEmailAdmin(
        `📦 Envío consolidado — ${usuario.name}`,
        `${usuario.name} (${usuario.email}) completó ${tituloChallenge} pero también tiene otros desafíos: ${nombresOtros}.\n\nConsiderar esperar antes de despachar para consolidar el envío en un solo paquete.`
      );
    }

  } catch (error) {
    console.error('Error enviando certificado finisher:', error.message);
  }
};

// Redirect intermedio para recovery de contraseña
// Gmail escanea links pero no sigue redirects 302 — así el token no se consume
app.get('/auth/reset', (req, res) => {
  const { token, type, token_hash } = req.query;
  // Construir el deep link con los parámetros
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (token_hash) params.set('token_hash', token_hash);
  if (type) params.set('type', type);
  const deepLink = `korva://reset-password?${params.toString()}`;
  // Redirect 302 — Gmail no lo sigue, pero el celu sí
  res.redirect(302, deepLink);
});

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
      .select('id, status')
      .eq('user_id', user_id)
      .eq('challenge_id', challenge_id)
      .eq('modalidad', modalidad)
      .single();

    if (existente) {
      if (existente.status === 'pending') {
        return res.json({ mensaje: 'Aguardando confirmación de pago. Te llevamos a completar tu compra.', id: existente.id, pendienteDePago: true });
      }
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
    res.json({ mensaje: 'Inscripcion exitosa! Ya podes empezar tu reto', id: data.id });
  } catch (error) {
    res.json({ error: 'Error al inscribirse', detalle: error.message });
  }
});

app.get('/perfil/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: usuario, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado', detalle: 'Tu sesión puede estar desactualizada. Cerrá sesión y volvé a entrar.' });
    }

    const { data: inscripcionesOrdenadas } = await supabase
      .from('user_challenges')
      .select('started_at')
      .eq('user_id', userId)
      .in('status', ['active', 'completed', 'shipped'])
      .order('started_at', { ascending: true })
      .limit(1);
    const fechaCorte = inscripcionesOrdenadas?.[0]?.started_at || null;

    let queryActividades = supabase.from('activities').select('distance_km').eq('user_id', userId).eq('excluida', false);
    if (fechaCorte) queryActividades = queryActividades.gte('recorded_at', fechaCorte);
    const { data: actividades } = await queryActividades;

    const { data: challenges } = await supabase.from('user_challenges').select('status').eq('user_id', userId);

    const totalKm = actividades?.reduce((sum, a) => sum + a.distance_km, 0) || 0;
    const activos = challenges?.filter(c => c.status === 'active').length || 0;
    const completados = challenges?.filter(c => c.status === 'completed' || c.status === 'shipped').length || 0;

    const getNivel = (retos) => {
      if (retos >= 20) return { nombre: 'Leyenda Viviente', emoji: '🐐', siguiente: null, faltanParaSiguiente: 0 };
      if (retos >= 15) return { nombre: 'Elite Korva', emoji: '👑', siguiente: 20, faltanParaSiguiente: 20 - retos };
      if (retos >= 10) return { nombre: 'Expedicionista', emoji: '🏔️', siguiente: 15, faltanParaSiguiente: 15 - retos };
      if (retos >= 7)  return { nombre: 'Explorador sin límites', emoji: '🗺️', siguiente: 10, faltanParaSiguiente: 10 - retos };
      if (retos >= 5)  return { nombre: 'Competidor nato', emoji: '🎯', siguiente: 7, faltanParaSiguiente: 7 - retos };
      if (retos >= 3)  return { nombre: 'Forjado en fuego', emoji: '🔥', siguiente: 5, faltanParaSiguiente: 5 - retos };
      if (retos >= 2)  return { nombre: 'Atleta', emoji: '💪', siguiente: 3, faltanParaSiguiente: 3 - retos };
      if (retos >= 1)  return { nombre: 'Activado', emoji: '⚡', siguiente: 2, faltanParaSiguiente: 2 - retos };
      return { nombre: 'Rookie', emoji: '🌱', siguiente: 1, faltanParaSiguiente: 1 };
    };

    const nivel = getNivel(completados);

    const getInsignias = (completados, totalKm, totalActividades, rachaActual, mejorRacha, semanasActivas, totalRun, totalRide) => {
      const ganadas = [];
      const progreso = {};

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

      if (totalRun > 0 && totalRide > 0) ganadas.push({ id: 'multideporte', nombre: 'Multideporte', emoji: '🌐', categoria: 'especial' });
      if (totalRun >= 50) ganadas.push({ id: 'corredor_pro', nombre: 'Corredor Pro', emoji: '🏃', categoria: 'especial' });
      if (totalRide >= 50) ganadas.push({ id: 'ciclista_pro', nombre: 'Ciclista Pro', emoji: '🚴', categoria: 'especial' });
      if (totalRun >= 10 && totalKm >= 100) ganadas.push({ id: 'centenario', nombre: 'Centenario', emoji: '💯', categoria: 'especial' });

      return { ganadas, progreso };
    };

    let queryFechas = supabase
      .from('activities').select('recorded_at').eq('user_id', userId).eq('excluida', false).order('recorded_at', { ascending: false });
    if (fechaCorte) queryFechas = queryFechas.gte('recorded_at', fechaCorte);
    const actividadesFechas = await queryFechas;

    const racha = calcularRachaSemanal(actividadesFechas.data || []);

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
      .from('activities').select('recorded_at, distance_km, sport_type, duration_seconds').eq('user_id', userId).eq('excluida', false);
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

    const ritmoRun = kmRunConTiempo > 0 ? (segundosRunConTiempo / 60 / kmRunConTiempo) : null;
    const ritmoRunMin = ritmoRun ? Math.floor(ritmoRun) : null;
    const ritmoRunSeg = ritmoRun ? Math.round((ritmoRun - Math.floor(ritmoRun)) * 60) : null;
    const velocidadRide = kmRideConTiempo > 0 ? (kmRideConTiempo / (segundosRideConTiempo / 3600)) : null;

    const { ganadas: insigniasGanadas, progreso: insigniasProgreso } = getInsignias(
      completados, totalKm,
      actividades?.length || 0,
      racha, mejorRacha,
      Object.keys(kmPorSemanaFull).length,
      deporteCount.run, deporteCount.ride
    );

    const mejorSemanaKm = Math.max(...Object.values(kmPorSemanaFull), 0);
    const totalSemanas = Object.keys(kmPorSemanaFull).length || 1;
    const promedioSemanal = (totalKm / totalSemanas).toFixed(1);

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

  if (isNaN(distanciaFloat) || distanciaFloat <= 0 || distanciaFloat > 300) {
    return res.status(400).json({ error: 'Distancia inválida. Debe ser entre 0.1 y 300 km.' });
  }

  // Si viene challenge_id, validar que sea del usuario
  if (challenge_id) {
    const { data: challengeValido } = await supabase
      .from('user_challenges')
      .select('id')
      .eq('user_id', user_id)
      .eq('challenge_id', challenge_id)
      .maybeSingle();

    if (!challengeValido) {
      return res.status(400).json({ error: 'No tenés este desafío activo. Cerrá sesión y volvé a entrar para actualizar tu cuenta.' });
    }
  }
  // Si no viene challenge_id → modo libre, se permite igual

  try {
    const { data: nuevaActividad, error: errorActividad } = await supabase
      .from('activities')
      .insert({
        user_id,
        challenge_id: challenge_id || null,
        source: 'manual',
        external_id: `manual_${user_id}_${Date.now()}`,
        sport_type, distance_km: distanciaFloat,
        duration_seconds: duration_seconds || null,
        recorded_at: recorded_at || new Date().toISOString(),
        evidencia_url: evidencia_url || null,
      })
      .select()
      .single();

    if (errorActividad) throw errorActividad;

    const { data: ucAntes } = await supabase
      .from('user_challenges')
      .select('km_completed, status, challenge_id, challenges(title, modalidades, total_distance_km)')
      .eq('user_id', user_id)
      .eq('challenge_id', challenge_id)
      .maybeSingle();

    const kmAntes = ucAntes?.km_completed || 0;

    if (recorded_at) {
      const { data: ucCorte } = await supabase
        .from('user_challenges')
        .select('id, started_at')
        .eq('user_id', user_id)
        .eq('challenge_id', challenge_id)
        .maybeSingle();

      if (ucCorte && recorded_at < ucCorte.started_at) {
        const limiteMinimo = new Date(ucCorte.started_at);
        limiteMinimo.setDate(limiteMinimo.getDate() - 30);
        const nuevoCorte = new Date(recorded_at) < limiteMinimo
          ? limiteMinimo.toISOString()
          : recorded_at;
        await supabase
          .from('user_challenges')
          .update({ started_at: nuevoCorte })
          .eq('id', ucCorte.id);
      }
    }

    if (challenge_id) {
      await recalcularKmUsuario(user_id, challenge_id);
    }
    await verificarYEnviarNotificacionRacha(user_id);

    if (ucAntes) {
      const { data: ucDespues } = await supabase
        .from('user_challenges')
        .select('km_completed, status')
        .eq('user_id', user_id)
        .eq('challenge_id', challenge_id)
        .maybeSingle();

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

const getUsersByIds = async (userIds) => {
  if (!userIds || userIds.length === 0) return {};
  const idsValidos = [...new Set(userIds)].filter(id => id && id !== 'null' && typeof id === 'string' && id.length > 10);
  if (idsValidos.length === 0) return {};
  const { data } = await supabase.from('users').select('id, name, email, avatar_url, shipping_address, push_token').in('id', idsValidos);
  const map = {};
  (data || []).forEach(u => { map[u.id] = u; });
  return map;
};

const getChallengesByIds = async (challengeIds) => {
  if (!challengeIds || challengeIds.length === 0) return {};
  const { data } = await supabase.from('challenges').select('id, title, modalidades, total_distance_km').in('id', [...new Set(challengeIds)]);
  const map = {};
  (data || []).forEach(c => { map[c.id] = c; });
  return map;
};

app.post('/admin/marcar-cargado', async (req, res) => {
  const { user_challenge_id } = req.body;
  try {
    const { error } = await supabase
      .from('user_challenges')
      .update({ status: 'cargado' })
      .eq('id', user_challenge_id)
      .in('status', ['completed']);

    if (error) throw error;
    res.json({ mensaje: 'Marcado como cargado' });
  } catch (error) {
    res.json({ error: 'Error', detalle: error.message });
  }
});

app.post('/admin/medalla-enviada', async (req, res) => {
  const { user_challenge_id, tracking_number, notificar = true, reenviar = false } = req.body;
  try {
    let uc;

    if (reenviar) {
      // Solo leer el user_challenge sin modificar nada
      const { data: ucExistente, error } = await supabase
        .from('user_challenges')
        .select('id, user_id, challenge_id, tracking_number')
        .eq('id', user_challenge_id)
        .single();
      if (error) throw error;
      uc = ucExistente;
    } else {
      // Comportamiento normal: actualizar status y tracking
      const { data: ucActualizado, error } = await supabase
        .from('user_challenges')
        .update({ status: 'shipped', tracking_number })
        .eq('id', user_challenge_id)
        .select('id, user_id, challenge_id, tracking_number')
        .single();
      if (error) throw error;
      uc = ucActualizado;
    }

    const trackingParaUsar = reenviar ? uc.tracking_number : tracking_number;

    if (notificar) {
      const usuarios = await getUsersByIds([uc.user_id]);
      const challenges = await getChallengesByIds([uc.challenge_id]);
      const usuario = usuarios[uc.user_id];
      const challenge = challenges[uc.challenge_id];

      await enviarEmailMedallaEnCamino(usuario?.email, usuario?.name, challenge?.title, trackingParaUsar);

      if (usuario?.push_token) {
        await enviarPushNotification(
          usuario.push_token,
          '📦 Tu medalla está en camino!',
          `Tu medalla de ${challenge?.title} fue enviada. Pronto la tenés en casa 🏅`
        );
      }
    }

    res.json({ mensaje: reenviar ? 'Notificación reenviada' : notificar ? 'Medalla marcada como enviada y email enviado' : 'Tracking guardado sin notificar' });
  } catch (error) {
    res.json({ error: 'Error', detalle: error.message });
  }
});

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
      .eq('status', 'completed')
      .select('id, user_id, challenge_id');

    if (error) throw error;

    const usuarios = await getUsersByIds(ucs.map(u => u.user_id));
    const challenges = await getChallengesByIds(ucs.map(u => u.challenge_id));

    for (const uc of ucs) {
      const usuario = usuarios[uc.user_id];
      const challenge = challenges[uc.challenge_id];
      await enviarEmailMedallaEnCamino(usuario?.email, usuario?.name, challenge?.title, tracking_number);
      if (usuario?.push_token) {
        await enviarPushNotification(
          usuario.push_token,
          '📦 Tu medalla está en camino!',
          `Tu medalla de ${challenge?.title} fue enviada. Pronto la tenés en casa 🏅`
        );
      }
    }

    res.json({ mensaje: `${ucs.length} medalla(s) marcadas como enviadas`, enviados: ucs.length });
  } catch (error) {
    res.json({ error: 'Error', detalle: error.message });
  }
});

const traducirDireccion = async (direccion, indicaciones) => {
  if (!process.env.ANTHROPIC_API_KEY) {
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
    const { data, error } = await supabase.rpc('get_todos_inscriptos');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.json({ error: 'Error', detalle: error.message });
  }
});

app.get('/admin/challenges-activos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_challenges')
      .select('id, user_id, challenge_id, modalidad, km_completed, tracking_number, completed_at, status')
      .in('status', ['completed', 'shipped'])
      .order('completed_at', { ascending: false });

    if (error) throw error;

    const usuarios = await getUsersByIds(data.map(u => u.user_id));
    const challenges = await getChallengesByIds(data.map(u => u.challenge_id));

    const resultado = await Promise.all(data.map(async (uc) => {
      const { data: actividades } = await supabase
        .from('activities')
        .select('evidencia_url')
        .eq('user_id', uc.user_id)
        .eq('source', 'manual')
        .not('evidencia_url', 'is', null)
        .order('recorded_at', { ascending: false })
        .limit(5);

      const usuario = usuarios[uc.user_id];
      return {
        id: uc.id,
        usuario: usuario?.name,
        email: usuario?.email,
        challenge: challenges[uc.challenge_id]?.title,
        modalidad: uc.modalidad,
        km_completados: uc.km_completed,
        tracking_number: uc.tracking_number,
        direccion: usuario?.shipping_address,
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

app.get('/admin/registro-grupos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_challenges')
      .select('id, user_id, challenge_id, group_id, modalidad, km_completed, status, completed_at, started_at')
      .not('group_id', 'is', null)
      .order('started_at', { ascending: false });

    if (error) throw error;

    const usuarios = await getUsersByIds(data.map(u => u.user_id));
    const challenges = await getChallengesByIds(data.map(u => u.challenge_id));

    const grupos = {};
    for (const uc of data) {
      const gid = uc.group_id;
      if (!grupos[gid]) grupos[gid] = [];
      grupos[gid].push(uc);
    }

    const resultado = [];
    for (const [groupId, miembros] of Object.entries(grupos)) {
      const comprador = miembros.find(m => m.user_id === groupId) || miembros[0];
      const compradorUsuario = usuarios[comprador.user_id];
      const completados = miembros.filter(m => m.status === 'completed' || m.status === 'shipped').length;

      resultado.push({
        group_id: groupId,
        comprador: compradorUsuario?.name,
        email: compradorUsuario?.email,
        fecha_compra: comprador.started_at,
        total_miembros: miembros.length,
        completados,
        miembros: miembros.map(m => ({
          id: m.id,
          usuario: usuarios[m.user_id]?.name,
          email: usuarios[m.user_id]?.email,
          challenge: challenges[m.challenge_id]?.title,
          modalidad: m.modalidad,
          km_completados: m.km_completed,
          status: m.status,
          es_comprador: m.user_id === groupId,
        })),
      });
    }

    res.json(resultado);
  } catch (error) {
    res.json({ error: 'Error', detalle: error.message });
  }
});

app.get('/admin/pedidos-grupales', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_challenges')
      .select('id, user_id, challenge_id, group_id, modalidad, km_completed, status, completed_at, tracking_number')
      .in('status', ['active', 'completed'])
      .not('group_id', 'is', null);

    if (error) throw error;

    const usuarios = await getUsersByIds(data.map(u => u.user_id));
    const challenges = await getChallengesByIds(data.map(u => u.challenge_id));

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

      if (completados.length === 0) continue;

      const primerCompletado = completados
        .map(m => new Date(m.completed_at).getTime())
        .sort((a, b) => a - b)[0];

      const diasDesdeElPrimero = Math.floor((ahora - primerCompletado) / (1000 * 60 * 60 * 24));
      const esEnvioParcial = !todosCompletados && (ahora - primerCompletado) >= DOS_SEMANAS_MS;

      if (!todosCompletados && !esEnvioParcial) continue;

      const comprador = miembros.find(m => m.user_id === groupId) || miembros[0];
      const compradorUsuario = usuarios[comprador.user_id];

      resultado.push({
        group_id: groupId,
        comprador: compradorUsuario?.name,
        email: compradorUsuario?.email,
        direccion: compradorUsuario?.shipping_address,
        total_miembros: totalMiembros,
        completados: completados.length,
        envio_parcial: esEnvioParcial,
        dias_desde_primero: diasDesdeElPrimero,
        miembros: miembros.map(m => ({
          id: m.id,
          usuario: usuarios[m.user_id]?.name,
          email: usuarios[m.user_id]?.email,
          challenge: challenges[m.challenge_id]?.title,
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
  const emailNormalizado = (email || '').trim().toLowerCase();
  try {
    const { data: existentePorEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', emailNormalizado)
      .neq('id', user_id)
      .maybeSingle();

    if (existentePorEmail) {
      const idViejo = existentePorEmail.id;
      console.log('Fusionando usuario:', emailNormalizado, idViejo, '->', user_id);

      try {
        // Nullear invitations primero para evitar FK violation
        await supabase.from('invitations').update({ created_by: null }).eq('created_by', idViejo);
        await supabase.from('invitations').update({ used_by: null }).eq('used_by', idViejo);

        await supabase.from('user_challenges').update({ user_id }).eq('user_id', idViejo);
        await supabase.from('user_challenges').update({ group_id: user_id }).eq('group_id', idViejo);
        await supabase.from('activities').update({ user_id }).eq('user_id', idViejo);

        const { data: datosViejos } = await supabase
          .from('users')
          .select('bib_number, shipping_address, strava_token, strava_refresh_token, strava_token_expires_at, strava_athlete_id, strava_habilitado, avatar_url')
          .eq('id', idViejo)
          .single();

        await supabase.from('users').delete().eq('id', idViejo);

        const { data, error } = await supabase
          .from('users')
          .upsert({
            id: user_id,
            email: emailNormalizado,
            name: name || email.split('@')[0],
            ...datosViejos,
          }, { onConflict: 'id' })
          .select()
          .single();

        if (error) throw error;
        console.log('Usuario fusionado OK:', emailNormalizado, idViejo, '->', user_id);
        return res.json({ mensaje: 'Perfil fusionado con compra existente', usuario: data });
      } catch (fusionError) {
        console.error('Error en fusion automatica:', fusionError.message, emailNormalizado);

        // Reintento automático después de 2 segundos
        await new Promise(r => setTimeout(r, 2000));
        try {
          // Nullear invitations primero también en el reintento
          await supabase.from('invitations').update({ created_by: null }).eq('created_by', idViejo);
          await supabase.from('invitations').update({ used_by: null }).eq('used_by', idViejo);
          await supabase.from('user_challenges').update({ user_id }).eq('user_id', idViejo);
          await supabase.from('user_challenges').update({ group_id: user_id }).eq('group_id', idViejo);
          await supabase.from('activities').update({ user_id }).eq('user_id', idViejo);

          const { data: datosViejosRetry } = await supabase
            .from('users')
            .select('bib_number, shipping_address, strava_token, strava_refresh_token, strava_token_expires_at, strava_athlete_id, strava_habilitado, avatar_url')
            .eq('id', idViejo)
            .single();

          await supabase.from('users').delete().eq('id', idViejo);

          const { data: dataRetry, error: errorRetry } = await supabase
            .from('users')
            .upsert({ id: user_id, email: emailNormalizado, name: name || email.split('@')[0], ...datosViejosRetry }, { onConflict: 'id' })
            .select()
            .single();

          if (errorRetry) throw errorRetry;
          console.log('Usuario fusionado en reintento OK:', emailNormalizado);
          return res.json({ mensaje: 'Perfil fusionado con compra existente', usuario: dataRetry });
        } catch (retryError) {
          console.error('Reintento de fusion fallido:', retryError.message, emailNormalizado);

          // Mandar email a Korva
          let emailEnviado = false;
          try {
            const { enviarEmailAdmin } = require('./routes/emails');
            await enviarEmailAdmin(
              `⚠️ Fusión fallida — ${emailNormalizado}`,
              `Email: ${emailNormalizado}
User ID nuevo: ${user_id}
ID viejo: ${idViejo}
Error: ${retryError.message}

Al entrar al sistema fijate si este usuario tiene el reto activo.`
            );
            emailEnviado = true;
          } catch (emailError) {
            console.error('Error mandando email de fusión fallida:', emailError.message);
          }

          // Crear usuario básico para que pueda estar logueado
          const { data, error } = await supabase
            .from('users')
            .upsert({ id: user_id, email: emailNormalizado, name: name || email.split('@')[0] }, { onConflict: 'id' })
            .select()
            .single();
          if (error) throw error;

          return res.json({
            mensaje: emailEnviado ? 'fusion_fallida_notificada' : 'fusion_fallida_sin_notificar',
            usuario: data
          });
        }
      }
    }

    const { data, error } = await supabase
      .from('users')
      .upsert({ id: user_id, email: emailNormalizado, name: name || email.split('@')[0] }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    const { data: huerfanos } = await supabase
      .from('user_challenges')
      .select('id, user_id')
      .eq('email', emailNormalizado)
      .neq('user_id', user_id);

    if (huerfanos?.length > 0) {
      for (const h of huerfanos) {
        await supabase.from('user_challenges')
          .update({ user_id: user_id, email: null })
          .eq('id', h.id);
        await supabase.from('activities')
          .update({ user_id: user_id })
          .eq('user_id', h.user_id);
      }
      console.log('User challenges huerfanos fusionados para:', emailNormalizado, '->', user_id);
    }

    res.json({ mensaje: 'Perfil creado', usuario: data });
  } catch (error) {
    res.json({ error: 'Error creando perfil', detalle: error.message });
  }
});

app.post('/usuarios/direccion', async (req, res) => {
  const { user_id, shipping_address, nombre_completo } = req.body;
  try {
    const updateData = { shipping_address };
    // Si viene nombre_completo, actualizar también users.name
    if (nombre_completo && nombre_completo.trim().split(' ').filter(Boolean).length >= 2) {
      updateData.name = nombre_completo.trim();
    }
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', user_id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Usuario no encontrado', detalle: 'Tu sesión puede estar desactualizada. Cerrá sesión y volvé a entrar.' });
    }
    res.json({ mensaje: 'Direccion guardada exitosamente', usuario: data });
  } catch (error) {
    res.json({ error: 'Error guardando direccion', detalle: error.message });
  }
});

app.get('/direcciones/autocomplete', async (req, res) => {
  const { input } = req.query;
  if (!input || input.trim().length < 3) return res.json({ predicciones: [] });
  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${process.env.GOOGLE_PLACES_API_KEY}&language=es`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Error de Google Places Autocomplete:', data.status, data.error_message);
      return res.json({ predicciones: [] });
    }
    const predicciones = (data.predictions || []).map(p => ({
      place_id: p.place_id,
      descripcion: p.description,
    }));
    res.json({ predicciones });
  } catch (error) {
    console.error('Error en autocomplete:', error.message);
    res.json({ predicciones: [] });
  }
});

app.get('/direcciones/detalle/:placeId', async (req, res) => {
  const { placeId } = req.params;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${process.env.GOOGLE_PLACES_API_KEY}&language=es&fields=address_component,formatted_address,geometry`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== 'OK') {
      console.error('Error de Google Places Details:', data.status, data.error_message);
      return res.status(400).json({ error: 'No se pudo obtener el detalle de la dirección' });
    }

    const componentes = data.result?.address_components || [];
    const buscar = (tipo) => componentes.find(c => c.types.includes(tipo))?.long_name || '';
    const buscarCorto = (tipo) => componentes.find(c => c.types.includes(tipo))?.short_name || '';

    const numero = buscar('street_number');
    const calle = buscar('route');
    const direccionCalle = [calle, numero].filter(Boolean).join(' ');

    res.json({
      direccion: direccionCalle || data.result?.formatted_address || '',
      ciudad: buscar('locality') || buscar('administrative_area_level_2') || '',
      codigo_postal: buscar('postal_code') || '',
      pais: buscar('country') || '',
      pais_codigo: buscarCorto('country') || '',
      direccion_formateada: data.result?.formatted_address || '',
      lat: data.result?.geometry?.location?.lat || null,
      lng: data.result?.geometry?.location?.lng || null,
    });
  } catch (error) {
    console.error('Error en detalle de direccion:', error.message);
    res.status(500).json({ error: 'Error obteniendo detalle de la dirección' });
  }
});

app.get('/ranking/:challengeId', async (req, res) => {
  const { challengeId } = req.params;
  try {
    const { data: ucs, error } = await supabase
      .from('user_challenges')
      .select('user_id, km_completed, modalidad, status')
      .eq('challenge_id', challengeId)
      .in('status', ['active', 'completed', 'shipped', 'cargado'])
      .order('km_completed', { ascending: false });

    if (error) throw error;

    const { data: challenge } = await supabase
      .from('challenges')
      .select('modalidades, total_distance_km')
      .eq('id', challengeId)
      .single();

    const userIds = [...new Set((ucs || []).map(u => u.user_id))].filter(id => id && id !== 'null');
    const { data: usuarios } = userIds.length > 0
      ? await supabase.from('users').select('id, name, avatar_url').in('id', userIds)
      : { data: [] };

    const usuariosMap = {};
    (usuarios || []).forEach(u => { usuariosMap[u.id] = u; });
    console.log('Ranking debug — userIds:', userIds.length, '— usuarios encontrados:', (usuarios || []).length);

    const resultado = (ucs || []).map((uc, index) => {
      const modalidades = challenge?.modalidades || [];
      const modalidadData = modalidades.find(m => m.tipo === uc.modalidad);
      const distancia = modalidadData?.distancia_km || challenge?.total_distance_km || 100;
      const usuario = usuariosMap[uc.user_id];

      return {
        posicion: index + 1,
        nombre: (() => {
          const n = usuario?.name || 'Anonimo';
          const partes = n.trim().split(' ');
          if (partes.length === 1) return partes[0];
          return `${partes[0]} ${partes[1]?.charAt(0)}.`;
        })(),
        avatar: usuario?.avatar_url,
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
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'No tenés este desafío activo', detalle: 'Tu sesión puede estar desactualizada. Cerrá sesión y volvé a entrar.' });
    }

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
    // Verificar que no haya reto shipped o completed — no se puede borrar actividades de retos finalizados
    const { data: retosFinalizados } = await supabase
      .from('user_challenges')
      .select('id, status')
      .eq('user_id', user_id)
      .in('status', ['completed', 'shipped']);

    if (retosFinalizados?.length > 0) {
      return res.status(400).json({
        error: 'No podés eliminar actividades de un desafío completado o enviado. Tu medalla ya está en camino 🏅'
      });
    }

    const { error } = await supabase
      .from('activities')
      .update({ excluida: true })
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
    const { count: totalUsuarios } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    const { data: inscripciones } = await supabase
      .from('user_challenges')
      .select('status, challenge_id, user_id, km_completed, started_at, challenges(title)');

    const activos = inscripciones?.filter(i => i.status === 'active').length || 0;
    const completados = inscripciones?.filter(i => i.status === 'completed').length || 0;
    const enviados = inscripciones?.filter(i => i.status === 'shipped').length || 0;

    const fechaCortePorUsuario = {};
    inscripciones?.forEach(i => {
      if (!['active', 'completed', 'shipped', 'cargado'].includes(i.status)) return;
      const actual = fechaCortePorUsuario[i.user_id];
      if (!actual || new Date(i.started_at) < new Date(actual)) {
        fechaCortePorUsuario[i.user_id] = i.started_at;
      }
    });

    const { data: todasActividades } = await supabase
      .from('activities')
      .select('user_id, distance_km, sport_type, source, recorded_at');

    const actividades = todasActividades?.filter(a => {
      const corte = fechaCortePorUsuario[a.user_id];
      if (!corte) return false;
      return new Date(a.recorded_at) >= new Date(corte);
    });

    const kmTotales = actividades?.reduce((sum, a) => sum + (parseFloat(a.distance_km) || 0), 0) || 0;
    const kmStrava = actividades?.filter(a => a.source === 'strava').reduce((sum, a) => sum + (parseFloat(a.distance_km) || 0), 0) || 0;
    const kmManual = actividades?.filter(a => a.source === 'manual').reduce((sum, a) => sum + (parseFloat(a.distance_km) || 0), 0) || 0;
    const totalActividades = actividades?.length || 0;

    const kmReales = inscripciones?.reduce((sum, i) => sum + (parseFloat(i.km_completed) || 0), 0) || 0;

    const { count: conStrava } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .not('strava_token', 'is', null);

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
      kmTotales: kmReales.toFixed(1),
      kmTotalesActividades: kmTotales.toFixed(1),
      kmStrava: kmStrava.toFixed(1),
      kmManual: kmManual.toFixed(1),
      totalActividades,
      porChallenge,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error cargando métricas', detalle: error.message });
  }
});

// ── CRON: recordatorio de dirección cada 24hs ─────────────────
const recordarDireccion = async () => {
  try {
    console.log('Cron: verificando usuarios completados sin dirección...');
    const { data: sinDir } = await supabase
      .from('user_challenges')
      .select('user_id, challenges(title)')
      .in('status', ['completed'])
      .not('user_id', 'is', null);

    if (!sinDir?.length) return;

    const userIds = [...new Set(sinDir.map(u => u.user_id))];
    const { data: usuarios } = await supabase
      .from('users')
      .select('id, push_token, shipping_address')
      .in('id', userIds)
      .is('shipping_address', null);

    let enviados = 0;
    for (const usuario of (usuarios || [])) {
      if (usuario.push_token) {
        const reto = sinDir.find(r => r.user_id === usuario.id);
        await enviarPushNotification(
          usuario.push_token,
          '📦 Falta tu dirección de envío',
          `¡Completaste ${reto?.challenges?.title || 'tu desafío'}! Cargá tu dirección en el Perfil para que podamos enviarte tu medalla 🏅`
        );
        enviados++;
      }
    }
    console.log(`Cron dirección: ${enviados} recordatorios enviados`);
  } catch (error) {
    console.error('Error en cron de dirección:', error.message);
  }
};

// Correr cada 24 horas
setInterval(recordarDireccion, 24 * 60 * 60 * 1000);
// También correr al iniciar (después de 1 minuto para que el servidor esté listo)
setTimeout(recordarDireccion, 60 * 1000);

// ── ELIMINAR CUENTA ────────────────────────────────────────────
app.delete('/usuarios/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    // 1. Anonimizar datos personales en users (no borrar para conservar historial)
    await supabase.from('users').update({
      name: 'Usuario eliminado',
      email: `deleted_${userId}@korva.deleted`,
      shipping_address: null,
      avatar_url: null,
      strava_token: null,
      strava_refresh_token: null,
      strava_athlete_id: null,
      strava_habilitado: false,
      push_token: null,
      dorsal_url: null,
      postal_url: null,
    }).eq('id', userId);

    // 2. Anonimizar invitaciones (no borrar para no romper grupos)
    await supabase.from('invitations').update({ created_by: null }).eq('created_by', userId);
    await supabase.from('invitations').update({ used_by: null }).eq('used_by', userId);

    // 3. Borrar actividades (datos personales de movimiento)
    await supabase.from('activities').delete().eq('user_id', userId);

    // 4. Eliminar usuario de Auth de Supabase (requiere service role)
    const { createClient } = require('@supabase/supabase-js');
    const adminClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
    if (authError) {
      console.error('Error eliminando de Auth:', authError.message);
      // Continuar aunque falle Auth — los datos ya están anonimizados
    }

    console.log('Cuenta eliminada/anonimizada:', userId);
    res.json({ mensaje: 'Cuenta eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando cuenta:', error.message);
    res.status(500).json({ error: 'Error eliminando cuenta', detalle: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Korva corriendo en puerto ${PORT}`);
});