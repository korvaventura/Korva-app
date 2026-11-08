const { leerDorsal, formatearDorsal } = require('./lib/dorsalDesafio');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const stravaRoutes = require('./routes/strava');
const shopifyRoutes = require('./routes/shopify');
const mercadopagoRoutes = require('./routes/mercadopago');
const invitacionesRoutes = require('./routes/invitaciones');
const movimientoRoutes = require('./routes/movimiento');
const residualAdminRoutes = require('./routes/residualAdmin');
const progresoSombraAdminRoutes = require('./routes/progresoSombraAdmin');
const progresoHealthSombraAdminRoutes = require('./routes/progresoHealthSombraAdmin');
const progresoDesgloseRoutes = require('./routes/progresoDesglose');
const { crearActividadGpsRoutes } = require('./routes/actividadGps');
const { crearGruposRoutes } = require('./routes/grupos');
const { crearComunidadRoutes } = require('./routes/comunidad');
const { crearMovimientoPersonalRoutes } = require('./routes/movimientoPersonal');
const { crearRutasLibresRoutes } = require('./routes/rutasLibres');
const { crearHealthConsentRoutes } = require('./routes/healthConsent');
const { writerMotorActivo, algunWriterMotorActivo, efectosMotorActivos, modalidadMotorActiva, actividadManualMotorActiva, stravaWebhookMotorActiva } = require('./lib/flagsMotor');
const { pausarDesafio } = require('./lib/pausarDesafio');
const { crearRepositorioSupabase } = require('./lib/progresoRepositorioSupabase');
const { reanudarDesafioConMotor } = require('./lib/reanudarDesafio');
const { eliminarActividadConMotor } = require('./lib/eliminarActividad');
const { cambiarModalidadConMotor } = require('./lib/cambiarModalidad');
const { registrarActividadManualConMotor } = require('./lib/actividadManual');
const { VERSIONES, versionDesdePedido, versionDeInscripcion, etiquetaVersion, objetivoDeInscripcion, versionesDelDesafio } = require('./lib/versionDesafio');

// Distancia objetivo de la VERSIÓN elegida (Estándar/Extendida) con el mismo respaldo que tenía el
// código viejo (versión → primera → total_distance_km → 100). El deporte no interviene.
const distanciaDeLaVersion = (uc, challenge) =>
  objetivoDeInscripcion(uc, challenge).objetivo_km || challenge?.total_distance_km || 100;
const { crearEfectosCompletado } = require('./lib/efectosCompletado');
const { crearProcesadorEventos } = require('./lib/completionEventos');
const { logMotor } = require('./lib/recuperacionRecalculo');
const { iniciarRecuperacion } = require('./lib/recuperacionRecalculo');
const { reservarSerialCertificado, liberarSerialCAS } = require('./lib/certificadoSerial');
const { actualizarConCompletitudCondicional } = require('./lib/completitudLegada');
const { enviarEmailInscripcion, enviarEmailMedallaEnCamino, enviarEmailCompletado, enviarEmailAdminMedallaLista } = require('./routes/emails');
const { enviarNotificacionProgreso } = require('./routes/notificaciones');
const { generarCertificado } = require('./generador_bib');
const requireAdmin = require('./middleware/requireAdmin');
const emailsModulo = require('./routes/emails');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

// Etapa 4A-3e: efectos de progreso_eventos (certificado, emails, push) y su procesador.
// Solo se usan si MOTOR_PROGRESO_WRITERS incluye "efectos".
const efectosMotor = crearEfectosCompletado({
  supabase,
  generarCertificado,
  emails: emailsModulo,
  obtenerResend: () => emailsModulo.getResend(),
});
const procesadorEventos = crearProcesadorEventos({
  crearRepo: () => crearRepositorioSupabase(supabase),
  efectos: efectosMotor,
  log: (datos) => logMotor({ writer: 'efectos', ...datos }),
});

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
app.use('/progreso-desglose', progresoDesgloseRoutes);

app.use(express.json({ limit: '10mb' }));

app.use('/actividades/gps', crearActividadGpsRoutes({ supabase, procesadorEventos }));
app.use('/movimiento-personal', crearMovimientoPersonalRoutes({ supabase }));
app.use('/rutas-libres', crearRutasLibresRoutes({ supabase }));
app.use('/movimiento-diario/desafios', crearHealthConsentRoutes({ supabase, dispararEfectos: (ids) => procesadorEventos.disparar(ids) }));
app.use('/grupos', crearGruposRoutes({ supabase }));
app.use('/comunidad', crearComunidadRoutes({ supabase }));

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
    await enviarEmailInscripcionConBib(user.email, user.name, 'Desafío Fin del Mundo', etiquetaVersion(VERSIONES.ESTANDAR), pdfs.dorsalPdf, pdfs.postalPdf, bibNumber);
    res.json({ ok: true, mensaje: `Bib #${bibNumber} enviado a ${user.email}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/test/certificado/:userId/:challengeId', async (req, res) => {
  const { userId, challengeId } = req.params;
  try {
    const { generarCertificado } = require('./generador_bib');
    const { enviarEmailCompletado } = require('./routes/emails');

    const { data: usuario } = await supabase.from('users').select('email, name, bib_number, shipping_address').eq('id', userId).single();
    if (!usuario) return res.json({ error: 'Usuario no encontrado' });

    const { data: uc } = await supabase.from('user_challenges')
      .select('id, km_completed, completed_at, version, modalidad, challenges(title, modalidades, total_distance_km)')
      .eq('user_id', userId).eq('challenge_id', challengeId).maybeSingle();
    if (!uc) return res.json({ error: 'Challenge no encontrado' });

    // 4A-3e: nunca se pisa un serial. Si el desafío ya tiene uno, se reenvía ESE certificado (sin
    // escribir nada); si no tiene, se reserva con compare-and-set antes de generar el PDF.
    const reserva = await reservarSerialCertificado(supabase, uc.id);
    const numeroSerie = reserva.serial;
    if (!numeroSerie) return res.json({ error: 'No se pudo asignar el número de serie' });

    const fechaCompletado = uc.completed_at
      ? new Date(uc.completed_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });

    const tituloChallenge = uc.challenges?.title || 'Desafío Korva';
    // D-V1: el certificado lleva la distancia de la versión elegida (Estándar o Extendida).
    const distanciaTotal = objetivoDeInscripcion(uc, uc.challenges).objetivo_km || uc.km_completed;

    const certificadoPdf = await generarCertificado(supabase, usuario.name, tituloChallenge, distanciaTotal, formatearDorsal(await leerDorsal(supabase, uc.id)), fechaCompletado, numeroSerie);
    if (!certificadoPdf) {
      if (reserva.reservado) await liberarSerialCAS(supabase, uc.id, numeroSerie); // se puede reintentar
      return res.json({ error: 'No se pudo generar el certificado' });
    }

    await enviarEmailCompletado(usuario.email, usuario.name, tituloChallenge, certificadoPdf, {
      tieneDir: !!usuario.shipping_address, esGrupo: false, esComprador: true, miembros: []
    });

    res.json({ ok: true, mensaje: `Certificado ${numeroSerie} enviado a ${usuario.email}` });
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
      .select('id, user_id, challenge_id, km_completed, completed_at, version, modalidad, challenges(title, modalidades, total_distance_km)')
      .in('status', ['completed', 'shipped', 'cargado'])
      .is('certificado_serial', null);

    for (const uc of (ucs || [])) {
      const { data: usuario } = await supabase.from('users').select('email, name, bib_number, shipping_address').eq('id', uc.user_id).single();
      if (!usuario) { resultados.push({ user_id: uc.user_id, error: 'usuario no encontrado' }); continue; }
      try {
        // 4A-3e: reserva con compare-and-set ANTES de generar; si otro camino lo emitió en el medio,
        // se saltea (nunca se pisa un serial ni se manda un segundo certificado).
        const reserva = await reservarSerialCertificado(supabase, uc.id);
        if (!reserva.reservado) { resultados.push({ email: usuario.email, omitido: `ya tiene serial ${reserva.serial}` }); continue; }
        const numeroSerie = reserva.serial;
        const fechaCompletado = uc.completed_at
          ? new Date(uc.completed_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
          : new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
        const tituloChallenge = uc.challenges?.title || 'Desafío Korva';
        const distanciaTotal = objetivoDeInscripcion(uc, uc.challenges).objetivo_km || uc.km_completed; // D-V1
        const certificadoPdf = await generarCertificado(supabase, usuario.name, tituloChallenge, distanciaTotal, formatearDorsal(await leerDorsal(supabase, uc.id)), fechaCompletado, numeroSerie);
        if (!certificadoPdf) {
          await liberarSerialCAS(supabase, uc.id, numeroSerie); // queda para el próximo reintento, como antes
          resultados.push({ email: usuario.email, error: 'PDF falló' });
          continue;
        }
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
        .select('user_id, numero_bib, version, modalidad, dorsal_url')
        .eq('challenge_id', challengeId)
        .not('numero_bib', 'is', null)
        .in('status', ['active', 'completed', 'shipped', 'cargado']);

      for (const uc of (ucs || [])) {
        const { data: user } = await supabase.from('users').select('id, name, email').eq('id', uc.user_id).single();
        if (!user || !uc.numero_bib) { resultados.push({ email: user?.email, error: 'sin numero_bib' }); continue; }
        // Saltar si ya tiene dorsal_url en user_challenges (ya recibió el bib para este desafío)
        if (uc.dorsal_url) { resultados.push({ email: user.email, challenge: challenge.title, skipped: 'ya tiene bib' }); continue; }
        try {
          const pdfs = await generarBibYPostal(supabase, user.name, uc.numero_bib, challengeId);
          if (!pdfs) { resultados.push({ email: user.email, challenge: challenge.title, error: 'PDFs fallaron' }); continue; }
          await enviarEmailInscripcionConBib(user.email, user.name, challenge.title, etiquetaVersion(versionDeInscripcion(uc)), pdfs.dorsalPdf, pdfs.postalPdf, uc.numero_bib);
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
    const { data: uc } = await supabase.from('user_challenges').select('numero_bib, version, modalidad').eq('user_id', userId).eq('challenge_id', challengeId).maybeSingle();
    const bibNumber = uc?.numero_bib;
    if (!bibNumber) return res.json({ error: 'No tiene numero_bib asignado para este desafío' });
    const { generarBibYPostal } = require('./generador_bib');
    const { enviarEmailInscripcionConBib } = require('./routes/emails');
    const pdfs = await generarBibYPostal(supabase, user.name, bibNumber, challengeId);
    if (!pdfs) return res.json({ error: 'No se pudieron generar los PDFs' });
    await enviarEmailInscripcionConBib(user.email, user.name, challenge.title, etiquetaVersion(versionDeInscripcion(uc)), pdfs.dorsalPdf, pdfs.postalPdf, bibNumber);
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
      .select('id, challenge_id, numero_bib, challenges(title), dorsal_url, postal_url')
      .eq('user_id', userId)
      .in('status', ['active', 'completed', 'shipped', 'cargado']);

    if (challengeIdQuery) {
      ucQuery = ucQuery.eq('challenge_id', challengeIdQuery);
    }

    const { data: uc } = await ucQuery.order('started_at', { ascending: false }).limit(1).maybeSingle();

    const challengeId = uc?.challenge_id;
    const challengeTitle = uc?.challenges?.title || 'Desafío Korva';
    if (!challengeId) return res.status(404).json({ error: 'No se encontró desafío activo para este usuario' });

    // Nunca recuperar el número global de otro desafío.
    const bibNumber = uc?.numero_bib;
    if (!bibNumber) return res.status(404).json({ error: 'No tiene número de bib asignado' });

    // Si ya tiene URLs guardadas para este desafío, devolverlas sin regenerar
    if (uc?.dorsal_url && uc?.postal_url) {
      return res.json({
        bib_number: bibNumber,
        nombre: user.name,
        challenge: challengeTitle,
        dorsal_url: uc.dorsal_url,
        postal_url: uc.postal_url,
      });
    }

    const pdfs = await generarBibYPostal(supabase, user.name, bibNumber, challengeId);
    if (!pdfs) return res.status(500).json({ error: 'No se pudieron generar los PDFs' });

    // Guardar en Supabase Storage
    const dorsalBuffer = Buffer.from(pdfs.dorsalPdf, 'base64');
    const postalBuffer = Buffer.from(pdfs.postalPdf, 'base64');

    // El número de dorsal arranca en 1 en cada desafío, así que dos desafíos
    // distintos pueden generar el mismo número — hay que separar por challenge_id
    // para que no se pisen los archivos entre sí.
    const dorsalPath = `dorsales/${challengeId}/dorsal_${bibNumber}.pdf`;
    const postalPath = `postales/${challengeId}/postal_${bibNumber}.pdf`;

    await supabase.storage.from('korva-images').upload(dorsalPath, dorsalBuffer, { contentType: 'application/pdf', upsert: true });
    await supabase.storage.from('korva-images').upload(postalPath, postalBuffer, { contentType: 'application/pdf', upsert: true });

    const { data: dorsalUrl } = supabase.storage.from('korva-images').getPublicUrl(dorsalPath);
    const { data: postalUrl } = supabase.storage.from('korva-images').getPublicUrl(postalPath);

    // Guardar URLs en user_challenges (por desafío) y en users (fallback)
    await supabase.from('user_challenges').update({
      dorsal_url: dorsalUrl.publicUrl,
      postal_url: postalUrl.publicUrl,
    }).eq('user_id', userId).eq('challenge_id', challengeId);

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
// 4A-7: la importación Strava con el motor dispara el mismo procesador de efectos.
stravaRoutes.configurarMotor({ dispararEfectos: (ids) => procesadorEventos.disparar(ids) });
app.use('/mercadopago', mercadopagoRoutes);
app.use('/invitaciones', invitacionesRoutes);
app.use('/movimiento-diario', movimientoRoutes);
movimientoRoutes.configurarMotor({ dispararEfectos: (ids) => procesadorEventos.disparar(ids) });
app.use('/admin/residual', residualAdminRoutes); // Etapa 3: residual en modo sombra, solo admin, solo lectura
app.use('/admin/progreso-sombra', progresoSombraAdminRoutes); // Etapa 4A: progreso unificado en modo sombra, solo admin, solo lectura
app.use('/admin/progreso-health-sombra', progresoHealthSombraAdminRoutes); // Etapa 4B-1: Health + 4A en sombra, solo admin, solo lectura

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
      .select('id, started_at, challenge_id, status, version, modalidad, pausado, periodos_pausados, challenges(title, modalidades, total_distance_km)')
      .eq('user_id', user_id)
      .in('status', ['active'])
      .eq('pausado', false);

    if (challenge_id) query = query.eq('challenge_id', challenge_id);

    const { data: retos } = await query;

    for (const reto of retos || []) {
      const { data: todasActividades } = await supabase
        .from('activities')
        .select('distance_km, recorded_at')
        .eq('user_id', user_id)
        .eq('excluida', false)
        .gte('recorded_at', reto.started_at);

      // Filtrar actividades en períodos pausados
      const actividadesValidas = (todasActividades || []).filter(a => {
        const fecha = new Date(a.recorded_at);
        for (const p of (reto.periodos_pausados || [])) {
          if (fecha >= new Date(p.desde) && fecha <= new Date(p.hasta)) return false;
        }
        return true;
      });

      const totalKm = actividadesValidas.reduce((sum, a) => sum + (parseFloat(a.distance_km) || 0), 0);

      const distanciaTotal = distanciaDeLaVersion(reto, reto.challenges); // versión elegida (D-V1 en el certificado)
      const porcentaje = (totalKm / distanciaTotal) * 100;

      const yaEstabaCompletado = reto.status === 'completed';
      const nuevoStatus = porcentaje >= 100 ? 'completed' : 'active';
      const yaEraShipped = reto.status === 'shipped' || reto.status === 'cargado';
      const seCompletaAhora = nuevoStatus === 'completed' && !yaEstabaCompletado && !yaEraShipped;

      // No bajar km_completed si el nuevo valor es menor — protege contra actividades faltantes
      const { data: ucActual } = await supabase
        .from('user_challenges')
        .select('km_completed')
        .eq('id', reto.id)
        .single();
      const kmActual = parseFloat(ucActual?.km_completed || 0);
      const kmFinal = Math.max(totalKm, kmActual);

      // No bajar status de shipped/completed aunque bajen los km
      // Fix: si los km superan el 100% forzar completed aunque no haya disparado el evento
      const superaDistancia = kmFinal >= distanciaTotal;
      const nuevoStatusFinal = (yaEraShipped || yaEstabaCompletado) 
        ? reto.status 
        : (superaDistancia ? 'completed' : nuevoStatus);

      // 4A-3e (convivencia): si este UPDATE es la completitud, es condicional y solo se mandan los
      // efectos si ESTA llamada la ganó (otro camino pudo completarlo en el medio).
      const { gano: ganoCompletitud } = await actualizarConCompletitudCondicional(supabase, {
        id: reto.id,
        valores: {
          km_completed: kmFinal,
          status: nuevoStatusFinal,
          completed_at: nuevoStatusFinal === 'active' ? null : (seCompletaAhora ? new Date().toISOString() : undefined),
        },
        completa: seCompletaAhora,
        origen: 'recalcularKmUsuario',
      });

      if (ganoCompletitud) {
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
            `¡Lo lograste! 🎉 Completaste ${reto.challenges?.title}. Nuestro equipo procesará tu pedido en los próximos días hábiles.`
          );
        }
      }

      // Solo mandar notificación de dirección si RECIÉN cruzó el 75% (no si ya estaba arriba)
      const porcentajeAntes = Math.min((kmActual / distanciaTotal) * 100, 100);
      if (porcentaje >= 75 && porcentajeAntes < 75 && !yaEstabaCompletado) {
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

    // Número de serie: reserva atómica ANTES de generar o enviar nada (Etapa 4A-3e).
    // Si el desafío ya tenía certificado (otro camino lo emitió, o una llamada simultánea ganó),
    // no se emite un segundo certificado ni se repiten los emails.
    const reserva = await reservarSerialCertificado(supabase, reto.id);
    if (!reserva.reservado) {
      console.log(`Certificado ya emitido para ${reto.id} (${reserva.serial || 'sin serial'}): no se reenvía`);
      return;
    }
    const numeroSerie = reserva.serial;

    const fechaCompletado = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
    const tituloChallenge = reto.challenges?.title || 'Desafío Korva';

    const certificadoPdf = await generarCertificado(
      supabase,
      usuario.name,
      tituloChallenge,
      distanciaTotal,
      formatearDorsal(await leerDorsal(supabase, reto.id)),
      fechaCompletado,
      numeroSerie
    );


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
  const { user_id, challenge_id } = req.body;
  // Versión elegida: app nueva manda `version` (estandar/extendida); app vieja manda `modalidad`
  // (run/ride). Sin ninguna → Estándar. La versión NO es deporte.
  const sinVersion = (req.body.version === undefined || req.body.version === null || req.body.version === '')
    && (req.body.modalidad === undefined || req.body.modalidad === null || req.body.modalidad === '');
  const version = sinVersion ? VERSIONES.ESTANDAR : versionDesdePedido(req.body);
  if (!version) return res.status(400).json({ error: 'Versión inválida' });
  try {
    // D-V3: una inscripción por usuario + desafío (sin importar la versión). No se resuelven ni se
    // tocan duplicados viejos: si ya hay alguna, no se crea otra.
    const { data: existentes, error: errorExistente } = await supabase
      .from('user_challenges')
      .select('id, status')
      .eq('user_id', user_id)
      .eq('challenge_id', challenge_id)
      .limit(2);
    if (errorExistente) throw errorExistente;
    const existente = (existentes || []).find((e) => e.status === 'pending') || (existentes || [])[0] || null;

    if (existente) {
      if (existente.status === 'pending') {
        return res.json({ mensaje: 'Aguardando confirmación de pago. Te llevamos a completar tu compra.', id: existente.id, pendienteDePago: true });
      }
      return res.json({ mensaje: 'Ya estás inscripto en este desafío' });
    }

    const { data, error } = await supabase
      .from('user_challenges')
      .insert({
        user_id, challenge_id, version,
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

    const kmDeActividades = actividades?.reduce((sum, a) => sum + a.distance_km, 0) || 0;

    // Si no hay actividades, usar km_completed de user_challenges (usuarios migrados de Netlify)
    const { data: challengesConKm } = await supabase
      .from('user_challenges')
      .select('status, km_completed')
      .eq('user_id', userId)
      .in('status', ['active', 'completed', 'shipped', 'cargado']);

    const kmDeDesafios = challengesConKm?.reduce((sum, c) => sum + (parseFloat(c.km_completed) || 0), 0) || 0;
    const totalKm = Math.max(kmDeActividades, kmDeDesafios);

    const activos = challenges?.filter(c => c.status === 'active').length || 0;
    const completados = challenges?.filter(c => ['completed', 'shipped', 'cargado'].includes(c.status)).length || 0;

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
  …19265 tokens truncated…: seguroReintentarDeterminista,
      ejecutar: async (ctx) => {
        const c = contextoDe(ctx);
        if (!serialPropio(ctx)) return { estado: RESULTADO.OMITIDO, motivo: 'certificado ya emitido por otro camino' };
        if (!c.avisarConsolidado) return { estado: RESULTADO.OMITIDO, motivo: 'no tiene otros desafíos' };
        if (!dentroDeVentana(ctx.previo, ctx.ahoraMs) && ctx.previo.ambiguo) return { estado: RESULTADO.INCIERTO, error: 'fuera de la ventana de idempotencia' };
        const u = await leerUsuario(ctx.evento.user_id, 'name, email');
        if (!u) return { estado: RESULTADO.DEFINITIVO, error: 'el usuario ya no existe' };
        const payload = emails.construirEmailAdmin(
          `📦 Envío consolidado — ${u.name}`,
          `${u.name} (${u.email}) completó ${c.titulo} pero también tiene otros desafíos: ${c.otrosTitulos.join(', ')}.\n\nConsiderar esperar antes de despachar para consolidar el envío en un solo paquete.`,
        );
        return enviarEmail({ ctx, paso: 'email_consolidado', payload, determinista: true });
      },
    },

    // 6. Push de completado (a lo sumo una vez).
    push_completado: {
      alEncontrarEnCurso: () => 'incierto',
      ejecutar: async (ctx) => {
        const u = await leerUsuario(ctx.evento.user_id, 'push_token');
        if (!u || !u.push_token) return { estado: RESULTADO.OMITIDO, motivo: 'sin token de push' };
        const titulo = (ctx.evento.datos && ctx.evento.datos.challenge_titulo) || 'tu desafío';
        await ctx.guardarIntencion({});
        return enviarPushExpo({
          fetchImpl, token: u.push_token, title: '🏅 ¡Lo lograste!',
          body: `¡Lo lograste! 🎉 Completaste ${titulo}. Nuestro equipo procesará tu pedido en los próximos días hábiles.`,
        });
      },
    },

    // Evento cruce_75: aviso de cargar la dirección (solo si no la tiene).
    push_aviso_direccion: {
      alEncontrarEnCurso: () => 'incierto',
      ejecutar: async (ctx) => {
        const u = await leerUsuario(ctx.evento.user_id, 'push_token, shipping_address');
        if (!u || !u.push_token) return { estado: RESULTADO.OMITIDO, motivo: 'sin token de push' };
        if (u.shipping_address) return { estado: RESULTADO.OMITIDO, motivo: 'ya tiene dirección' };
        await ctx.guardarIntencion({});
        return enviarPushExpo({
          fetchImpl, token: u.push_token, title: '📦 ¡Ya casi llegás!',
          body: 'Acordate de cargar tu dirección de envío en el Perfil para que tu medalla salga sin demoras 🏅',
        });
      },
    },
  };
  return efectos;
};

module.exports = { crearEfectosCompletado, clasificarResend, enviarPushExpo, VENTANA_IDEMPOTENCIA_MS };
