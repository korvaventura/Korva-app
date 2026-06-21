const express = require('express');
const router = express.Router();
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

  if (error || !invitacion) return res.send(paginaError('Link inválido', 'Este link de invitación no existe.'));
  if (invitacion.used_by) return res.send(paginaError('Link ya usado', 'Este link de invitación ya fue utilizado.'));
  if (new Date(invitacion.expires_at) < new Date()) return res.send(paginaError('Link expirado', 'Este link de invitación expiró.'));

  const challenge = invitacion.challenges;
  const modalidades = challenge?.modalidades || [];
  res.send(paginaRegistro(token, challenge?.title, modalidades, modalidades.length > 0));
});

// POST /invitaciones/:token — procesa el registro
router.post('/:token', async (req, res) => {
  const { token } = req.params;
  const { nombre, email: emailRaw, modalidad } = req.body;
  const email = (emailRaw || '').trim().toLowerCase();
  const nombreLimpio = (nombre || '').trim();
  const supabase = getSupabase();

  if (!nombreLimpio || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.send(paginaError('Datos inválidos', 'Completá tu nombre y un email válido para continuar.'));
  }

  try {
    const { data: invitacion, error } = await supabase
      .from('invitations')
      .select('*, challenges(title)')
      .eq('token', token)
      .single();

    if (error || !invitacion) return res.send(paginaError('Link inválido', 'Este link no existe.'));
    if (invitacion.used_by) return res.send(paginaError('Link ya usado', 'Este link ya fue utilizado.'));
    if (new Date(invitacion.expires_at) < new Date()) return res.send(paginaError('Link expirado', 'Este link expiró.'));

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

    if (yaInscripto) return res.send(paginaError('Ya inscripto', 'Este email ya está registrado en este desafío.'));

    // Obtener el group_id del comprador original (created_by)
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

    res.send(paginaExito(nombreLimpio, invitacion.challenges.title));

  } catch (error) {
    console.error('Error procesando invitación:', error);
    res.send(paginaError('Error', 'Algo salió mal. Intentá de nuevo o escribinos a korvaventura@gmail.com'));
  }
});

// ── HTML helpers ──────────────────────────────────────────────────

const baseHtml = (contenido) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Korva Aventuras</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #060d14; font-family: Arial, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #0D1B2A; border-radius: 20px; padding: 40px 32px; max-width: 480px; width: 100%; border: 1px solid #1E3A5F; }
    .logo { font-size: 28px; font-weight: 900; color: #FFFFFF; letter-spacing: 4px; margin-bottom: 8px; }
    .logo span { color: #FC4C02; }
    .tagline { color: #4a6a8a; font-size: 12px; letter-spacing: 2px; margin-bottom: 32px; }
    h1 { color: #FFFFFF; font-size: 22px; margin-bottom: 8px; }
    p { color: #A8CFFF; font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
    label { display: block; color: #A8CFFF; font-size: 12px; font-weight: bold; margin-bottom: 6px; margin-top: 16px; letter-spacing: 1px; }
    input, select { width: 100%; background: #1E3A5F; border: 1px solid #2a4a6a; border-radius: 10px; color: #FFFFFF; padding: 12px 16px; font-size: 14px; outline: none; }
    input::placeholder { color: #4a6a8a; }
    select option { background: #1E3A5F; }
    button { width: 100%; background: #FC4C02; color: #FFFFFF; border: none; border-radius: 12px; padding: 14px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 24px; }
    .badge { display: inline-block; background: #FC4C02; color: #FFFFFF; font-size: 11px; font-weight: bold; padding: 4px 12px; border-radius: 20px; letter-spacing: 1px; margin-bottom: 20px; }
    .challenge-name { background: #1E3A5F; border-radius: 12px; padding: 16px; margin: 16px 0 24px; border-left: 4px solid #FC4C02; }
    .challenge-name p { color: #FFFFFF; font-size: 16px; font-weight: bold; margin: 0; }
    .error-icon { font-size: 48px; margin-bottom: 16px; }
    .success-icon { font-size: 64px; text-align: center; margin-bottom: 16px; }
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

const paginaRegistro = (token, challengeTitle, modalidades, tieneModalidades) => baseHtml(`
  <div class="badge">🎟️ INVITACIÓN</div>
  <h1>¡Te invitaron a correr! 🏃</h1>
  <p>Completá tus datos para activar tu lugar en el desafío:</p>
  <div class="challenge-name"><p>🏅 ${challengeTitle || 'Desafío Korva'}</p></div>
  <form method="POST" action="/invitaciones/${token}">
    <label>NOMBRE COMPLETO *</label>
    <input type="text" name="nombre" placeholder="Tu nombre" required />
    <label>EMAIL *</label>
    <input type="email" name="email" placeholder="tu@email.com" required />
    <label>MODALIDAD *</label>
    <select name="modalidad" required>
      <option value="run">🏃 Running</option>
      ${tieneModalidades && modalidades.some(m => m.tipo === 'ride') ? '<option value="ride">🚴 Ciclismo</option>' : ''}
    </select>
    <button type="submit">Activar mi lugar →</button>
  </form>
  <p style="font-size: 12px; color: #4a6a8a; margin-top: 16px; text-align: center;">Al registrarte aceptás los términos de Korva Aventuras</p>
`);

const paginaExito = (nombre, challengeTitle) => baseHtml(`
  <div style="text-align: center;">
    <div class="success-icon">🎉</div>
    <div class="badge" style="background: #4CAF50;">¡LISTO!</div>
    <h1 style="margin-top: 16px;">¡Bienvenido/a, ${nombre}!</h1>
    <p>Tu lugar en <strong style="color: #FFFFFF;">${challengeTitle}</strong> está activado. Te mandamos un email con tu dorsal y postal de bienvenida.</p>
    <div class="challenge-name" style="text-align: left;">
      <p style="font-size: 14px; color: #A8CFFF; font-weight: normal; margin-bottom: 8px;">Próximos pasos:</p>
      <p style="margin: 4px 0; font-size: 14px;">1️⃣ Revisá tu email — tiene tu dorsal adjunto</p>
      <p style="margin: 4px 0; font-size: 14px;">2️⃣ <a href="https://play.google.com/apps/testing/com.korva.mobile" style="color: #1E6FD9;">Descargá la app Korva</a></p>
      <p style="margin: 4px 0; font-size: 14px;">3️⃣ Registrá tus km y empezá a moverte 🏃</p>
    </div>
  </div>
`);

const paginaError = (titulo, mensaje) => baseHtml(`
  <div style="text-align: center;">
    <div class="error-icon">⚠️</div>
    <h1>${titulo}</h1>
    <p>${mensaje}</p>
    <p style="margin-top: 24px;">¿Necesitás ayuda? Escribinos a <a href="mailto:korvaventura@gmail.com" style="color: #1E6FD9;">korvaventura@gmail.com</a></p>
  </div>
`);

module.exports = router;