const express = require('express');
const router = express.Router();

// Parsear body de forms HTML (application/x-www-form-urlencoded)
router.use(express.urlencoded({ extended: true }));
const { createClient } = require('@supabase/supabase-js');
const { enviarEmailInscripcionConBib, enviarEmailInscripcion } = require('../routes/emails');
const { generarBibYPostal, asignarBibNumber } = require('../generador_bib');

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

// GET /invitaciones/:token — muestra la página web de registro
router.get('/:token', async (req, res) => {
  const { token } = req.params;
  const supabase = getSupabase();

  const { data: invitacion, error } = await supabase
    .from('invitations')
    .select('*, challenges(title, modalidades)')
    .eq('token', token)
    .single();

  if (error || !invitacion) return res.send(paginaError('Link inválido', 'Este link de invitación no existe o ya expiró.'));
  if (invitacion.used_by) return res.send(paginaError('Este lugar ya está activado', 'Este link ya fue usado. Si creés que es un error, escribinos a korvaventura@gmail.com'));
  if (new Date(invitacion.expires_at) < new Date()) return res.send(paginaError('Link expirado', 'Este link de invitación venció. Pedile al comprador que se contacte con nosotros.'));

  const challenge = invitacion.challenges;
  const modalidades = challenge?.modalidades || [];
  res.send(paginaRegistro(token, challenge?.title, modalidades));
});

// POST /invitaciones/:token — procesa el registro
router.post('/:token', async (req, res) => {
  const { token } = req.params;
  const { nombre, email: emailRaw, modalidad } = req.body;
  const email = (emailRaw || '').trim().toLowerCase();
  const nombreLimpio = (nombre || '').trim();
  const supabase = getSupabase();

  if (!nombreLimpio || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.send(paginaError('Datos incompletos', 'Completá tu nombre y un email válido para continuar.'));
  }

  try {
    const { data: invitacion, error } = await supabase
      .from('invitations')
      .select('*, challenges(title)')
      .eq('token', token)
      .single();

    if (error || !invitacion) return res.send(paginaError('Link inválido', 'Este link no existe.'));
    if (invitacion.used_by) return res.send(paginaError('Este lugar ya está activado', 'Este link ya fue usado.'));
    if (new Date(invitacion.expires_at) < new Date()) return res.send(paginaError('Link expirado', 'Este link venció.'));

    // Crear o encontrar usuario
    const { data: usuarioExistente } = await supabase
      .from('users')
      .select('id, bib_number')
      .eq('email', email)
      .maybeSingle();

    let userId;
    let bibNumber;

    if (usuarioExistente) {
      userId = usuarioExistente.id;
      bibNumber = usuarioExistente.bib_number;
    } else {
      const { data: nuevoUsuario, error: errorUsuario } = await supabase
        .from('users')
        .insert({ email, name: nombreLimpio })
        .select()
        .single();
      if (errorUsuario) throw errorUsuario;
      userId = nuevoUsuario.id;
    }

    // Verificar que no esté ya inscripto
    const { data: yaInscripto } = await supabase
      .from('user_challenges')
      .select('id')
      .eq('user_id', userId)
      .eq('challenge_id', invitacion.challenge_id)
      .maybeSingle();

    if (yaInscripto) return res.send(paginaError('Ya estás anotado', 'Este email ya está registrado en este desafío. ¡Ya podés descargarte la app y empezar!'));

    // Obtener el group_id del comprador original
    let groupId = invitacion.created_by;
    const { data: compradorUC } = await supabase
      .from('user_challenges')
      .select('group_id')
      .eq('user_id', invitacion.created_by)
      .eq('challenge_id', invitacion.challenge_id)
      .maybeSingle();
    if (compradorUC?.group_id) groupId = compradorUC.group_id;

    // Inscribir en el challenge
    await supabase.from('user_challenges').insert({
      user_id: userId,
      challenge_id: invitacion.challenge_id,
      modalidad: modalidad || 'run',
      status: 'active',
      km_completed: 0,
      started_at: new Date().toISOString(),
      group_id: groupId,
      email: email,
    });

    // Marcar invitación como usada
    await supabase
      .from('invitations')
      .update({ used_by: userId, used_at: new Date().toISOString() })
      .eq('token', token);

    // Asignar bib number si no tiene
    if (!bibNumber) {
      bibNumber = await asignarBibNumber(supabase, userId);
    }

    // Generar dorsal y postal PDF
    const pdfs = await generarBibYPostal(supabase, nombreLimpio, bibNumber, invitacion.challenge_id);
    const modalidadTexto = modalidad === 'ride' ? 'Ciclismo' : 'Running';

    if (pdfs) {
      await enviarEmailInscripcionConBib(
        email, nombreLimpio,
        invitacion.challenges.title,
        modalidadTexto,
        pdfs.dorsalPdf,
        pdfs.postalPdf,
        bibNumber
      );
    } else {
      await enviarEmailInscripcion(email, nombreLimpio, invitacion.challenges.title, modalidadTexto);
    }

    res.send(paginaExito(nombreLimpio, invitacion.challenges.title, modalidadTexto));

  } catch (error) {
    console.error('Error procesando invitación:', error);
    res.send(paginaError('Algo salió mal', 'Ocurrió un error inesperado. Intentá de nuevo o escribinos a korvaventura@gmail.com'));
  }
});

// ── HTML helpers ──────────────────────────────────────────────────

const baseHtml = (titulo, contenido) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo} — Korva Aventuras</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #060d14;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #0D1B2A;
      border-radius: 24px;
      padding: 40px 32px;
      max-width: 500px;
      width: 100%;
      border: 1px solid #1E3A5F;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .logo {
      font-size: 22px;
      font-weight: 900;
      color: #FFFFFF;
      letter-spacing: 4px;
      margin-bottom: 4px;
    }
    .logo span { color: #FC4C02; }
    .tagline { color: #4a6a8a; font-size: 11px; letter-spacing: 2px; margin-bottom: 32px; }
    .badge {
      display: inline-block;
      background: #FC4C02;
      color: #FFFFFF;
      font-size: 11px;
      font-weight: bold;
      padding: 5px 14px;
      border-radius: 20px;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }
    h1 { color: #FFFFFF; font-size: 24px; margin-bottom: 10px; line-height: 1.3; }
    .subtitle { color: #A8CFFF; font-size: 14px; line-height: 1.7; margin-bottom: 20px; }
    .challenge-box {
      background: #1E3A5F;
      border-radius: 14px;
      padding: 16px 20px;
      margin: 20px 0 28px;
      border-left: 4px solid #FC4C02;
    }
    .challenge-box p { color: #FFFFFF; font-size: 17px; font-weight: bold; margin: 0; }
    .challenge-box small { color: #A8CFFF; font-size: 12px; display: block; margin-top: 4px; }
    .divider { height: 1px; background: #1E3A5F; margin: 24px 0; }
    label {
      display: block;
      color: #A8CFFF;
      font-size: 11px;
      font-weight: bold;
      margin-bottom: 6px;
      margin-top: 18px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    input, select {
      width: 100%;
      background: #1E3A5F;
      border: 1px solid #2a4a6a;
      border-radius: 12px;
      color: #FFFFFF;
      padding: 14px 16px;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, select:focus { border-color: #1E6FD9; }
    input::placeholder { color: #4a6a8a; }
    select option { background: #1E3A5F; }
    .info-box {
      background: #1E3A5F;
      border-radius: 12px;
      padding: 14px 16px;
      margin-top: 20px;
      border: 1px solid #2a4a6a;
    }
    .info-box p { color: #A8CFFF; font-size: 13px; margin: 4px 0; line-height: 1.6; }
    button {
      width: 100%;
      background: #FC4C02;
      color: #FFFFFF;
      border: none;
      border-radius: 14px;
      padding: 16px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      margin-top: 24px;
      letter-spacing: 0.5px;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    .legal { font-size: 11px; color: #4a6a8a; margin-top: 14px; text-align: center; line-height: 1.6; }
    .legal a { color: #4a6a8a; }
    /* Éxito */
    .success-emoji { font-size: 64px; text-align: center; display: block; margin-bottom: 16px; }
    .steps { margin: 20px 0; }
    .step { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
    .step-num { background: #FC4C02; color: #FFFFFF; font-size: 12px; font-weight: bold; width: 24px; height: 24px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
    .step p { color: #A8CFFF; font-size: 14px; margin: 0; line-height: 1.5; }
    .step p strong { color: #FFFFFF; }
    .app-btn {
      display: block;
      background: #1E3A5F;
      color: #FFFFFF;
      text-decoration: none;
      border-radius: 14px;
      padding: 16px;
      text-align: center;
      font-size: 15px;
      font-weight: bold;
      margin-top: 20px;
      border: 1px solid #1E6FD9;
    }
    /* Error */
    .error-emoji { font-size: 48px; text-align: center; display: block; margin-bottom: 16px; }
    .contact-box { background: #1E3A5F; border-radius: 12px; padding: 14px 16px; margin-top: 20px; text-align: center; }
    .contact-box p { color: #A8CFFF; font-size: 13px; margin: 0; }
    .contact-box a { color: #1E6FD9; font-weight: bold; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🏅 <span>KORVA</span></div>
    <div class="tagline">DESAFÍOS VIRTUALES · MEDALLAS REALES</div>
    ${contenido}
  </div>
</body>
</html>
`;

const paginaRegistro = (token, challengeTitle, modalidades) => {
  const tieneRide = modalidades.some(m => m.tipo === 'ride');
  return baseHtml('Activá tu lugar', `
    <div class="badge">🎟️ INVITACIÓN PERSONAL</div>
    <h1>¡Alguien te invitó a un desafío Korva! 🏅</h1>
    <p class="subtitle">Completá tus datos para activar tu lugar. Vas a recibir un email con tu número de dorsal y todo lo que necesitás para empezar.</p>

    <div class="challenge-box">
      <p>🏔️ ${challengeTitle || 'Desafío Korva'}</p>
      <small>Tu desafío — completalo a tu ritmo, desde donde estés</small>
    </div>

    <form method="POST" action="/invitaciones/${token}">
      <label>Tu nombre completo *</label>
      <input type="text" name="nombre" placeholder="Ej: María García" required autocomplete="name" />

      <label>Tu email *</label>
      <input type="email" name="email" placeholder="Ej: maria@gmail.com" required autocomplete="email" />
      <p style="color: #4a6a8a; font-size: 11px; margin-top: 6px;">⚠️ Usá el mismo email para registrarte en la app — así tu desafío aparece automáticamente</p>

      <label>Modalidad *</label>
      <select name="modalidad" required>
        <option value="run">🏃 Running — ${modalidades.find(m => m.tipo === 'run')?.distancia_km || '103'} km</option>
        ${tieneRide ? `<option value="ride">🚴 Ciclismo — ${modalidades.find(m => m.tipo === 'ride')?.distancia_km || '309'} km</option>` : ''}
      </select>

      <div class="info-box">
        <p>💡 <strong style="color:#FFFFFF">¿No sabés cuál elegir?</strong> Elegí Running si vas a ir a pie (corriendo o caminando). Ciclismo si vas en bici. Podés cambiarlo después desde la app.</p>
      </div>

      <button type="submit">Activar mi lugar →</button>
    </form>

    <p class="legal">Al registrarte aceptás los <a href="https://korva.run">términos de Korva Aventuras</a>. Link válido por 30 días.</p>
  `);
};

const paginaExito = (nombre, challengeTitle, modalidad) => baseHtml('¡Listo!', `
  <span class="success-emoji">🎉</span>
  <div class="badge" style="background: #22c55e; display: block; text-align: center;">¡LUGAR ACTIVADO!</div>
  <h1 style="text-align: center; margin-top: 16px;">¡Bienvenido/a, ${nombre}!</h1>
  <p class="subtitle" style="text-align: center;">Tu lugar en <strong style="color: #FFFFFF">${challengeTitle}</strong> (${modalidad}) está activo. En breve te llega un email con tu número de dorsal.</p>

  <div class="divider"></div>

  <p style="color: #A8CFFF; font-size: 13px; font-weight: bold; letter-spacing: 1px; margin-bottom: 16px;">QUÉ HACER AHORA:</p>
  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <p>📧 <strong>Revisá tu email</strong> — te mandamos tu número de dorsal y tu postal de bienvenida</p>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <p>📱 <strong>Descargá la app Korva</strong> (Android) e iniciá sesión con el mismo email que usaste acá</p>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <p>🏃 <strong>Empezá a moverte</strong> — registrá tus km desde la app y seguí tu progreso en tiempo real</p>
    </div>
    <div class="step">
      <div class="step-num">4</div>
      <p>🏅 <strong>Al completar la distancia</strong>, tu medalla sale en camino automáticamente</p>
    </div>
  </div>

  <a href="https://play.google.com/store/apps/details?id=com.korva.mobile" class="app-btn">
    📱 Descargar la app Korva para Android →
  </a>
`);

const paginaError = (titulo, mensaje) => baseHtml(titulo, `
  <span class="error-emoji">⚠️</span>
  <h1 style="text-align: center;">${titulo}</h1>
  <p class="subtitle" style="text-align: center;">${mensaje}</p>
  <div class="contact-box">
    <p>¿Necesitás ayuda? Escribinos a<br><a href="mailto:korvaventura@gmail.com">korvaventura@gmail.com</a><br>o por Instagram <a href="https://instagram.com/korva.aventuras">@korva.aventuras</a></p>
  </div>
`);

module.exports = router;