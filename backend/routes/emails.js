const { Resend } = require('resend');

const getResend = () => new Resend(process.env.RESEND_API_KEY);

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const header = `
  <div style="background: #0D1B2A; padding: 32px 40px 24px; border-bottom: 3px solid #FC4C02;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <span style="font-size: 32px; font-weight: 900; color: #FFFFFF; letter-spacing: 4px;">🏅 KORVA</span>
        </td>
        <td align="right">
          <span style="font-size: 12px; color: #4a6a8a; letter-spacing: 2px;">AVENTURAS</span>
        </td>
      </tr>
    </table>
  </div>
`;

const footer = `
  <div style="background: #060d14; padding: 28px 40px; text-align: center;">
    <p style="color: #4a6a8a; font-size: 13px; margin: 0 0 8px;">Korva Aventuras · korva.run</p>
    <p style="color: #4a6a8a; font-size: 12px; margin: 0;">Desafíos virtuales. Medallas reales.</p>
    <div style="margin-top: 16px;">
      <a href="mailto:korvaventura@gmail.com" style="color: #1E6FD9; font-size: 12px; text-decoration: none;">korvaventura@gmail.com</a>
    </div>
  </div>
`;

const wrapper = (contenido) => `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="margin: 0; padding: 0; background: #060d14; font-family: Arial, sans-serif;">
    <div style="max-width: 600px; margin: 20px auto; background: #0D1B2A; border-radius: 16px; overflow: hidden;">
      ${header}
      <div style="padding: 40px;">
        ${contenido}
      </div>
      ${footer}
    </div>
  </body>
  </html>
`;

const badge = (texto, color = '#FC4C02') => `
  <span style="background: ${color}; color: #FFFFFF; font-size: 11px; font-weight: bold; padding: 4px 12px; border-radius: 20px; letter-spacing: 1px;">${texto}</span>
`;

const card = (contenido, borderColor = '#1E3A5F') => `
  <div style="background: #1E3A5F; border-radius: 14px; padding: 24px; margin: 24px 0; border-left: 4px solid ${borderColor};">
    ${contenido}
  </div>
`;

const enviarEmailInscripcion = async (email, nombre, challenge, modalidad) => {
  try {
    await getResend().emails.send({
      from: 'Korva <onboarding@resend.dev>',
      to: email,
      subject: `🏅 Inscripción confirmada — ${challenge}`,
      html: wrapper(`
        ${badge('INSCRIPCIÓN CONFIRMADA')}
        <h2 style="color: #FFFFFF; font-size: 26px; margin: 20px 0 8px;">¡Hola, ${nombre}! 👋</h2>
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.6;">Tu inscripción al reto <strong style="color: #FFFFFF;">${challenge}</strong> en modalidad <strong style="color: #FC4C02;">${modalidad}</strong> fue confirmada.</p>

        ${card(`
          <p style="color: #1E6FD9; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 12px;">TUS PRÓXIMOS PASOS</p>
          <p style="color: #A8CFFF; font-size: 14px; margin: 8px 0;">1️⃣ &nbsp; Descargá la app Korva</p>
          <p style="color: #A8CFFF; font-size: 14px; margin: 8px 0;">2️⃣ &nbsp; Registrá tus km desde la pestaña "Registrar"</p>
          <p style="color: #A8CFFF; font-size: 14px; margin: 8px 0;">3️⃣ &nbsp; Al llegar al 100%, tu medalla viaja a tu puerta 📦</p>
          <p style="color: #4a6a8a; font-size: 12px; margin: 12px 0 0;">La integración con Strava estará disponible próximamente.</p>
        `, '#1E6FD9')}

        <p style="color: #A8CFFF; font-size: 14px; line-height: 1.6;">Cada kilómetro cuenta. Cada salida te acerca a tu medalla. ¡A correr!</p>
        <p style="color: #FC4C02; font-weight: bold; font-size: 15px; margin-top: 24px;">El equipo Korva 🏅</p>
      `)
    });
    console.log('Email de inscripcion enviado a:', email);
  } catch (error) {
    console.error('Error enviando email:', error);
  }
};

const enviarEmailInvitacion = async (email, nombre, challenge, tokens) => {
  try {
    const linksHtml = tokens.map((token, i) => `
      <div style="margin: 12px 0;">
        <p style="color: #A8CFFF; font-size: 13px; margin: 0 0 6px;">Persona ${i + 2}:</p>
        <a href="${BACKEND_URL}/invitaciones/${token}"
           style="display: inline-block; background: #FC4C02; color: #FFFFFF; font-size: 14px; font-weight: bold; padding: 12px 24px; border-radius: 10px; text-decoration: none; word-break: break-all;">
          Activar mi lugar en ${challenge}
        </a>
        <p style="color: #4a6a8a; font-size: 11px; margin: 6px 0 0;">Link válido por 30 días</p>
      </div>
    `).join('');

    await getResend().emails.send({
      from: 'Korva <onboarding@resend.dev>',
      to: email,
      subject: `🎟️ Compartí el acceso — ${challenge}`,
      html: wrapper(`
        ${badge('🎟️ ACCESOS PARA COMPARTIR')}
        <h2 style="color: #FFFFFF; font-size: 26px; margin: 20px 0 8px;">¡Hola, ${nombre}! 👋</h2>
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.6;">Compraste <strong style="color: #FFFFFF;">${tokens.length + 1} lugares</strong> para el reto <strong style="color: #FFFFFF;">${challenge}</strong>. Tu inscripción ya está activa.</p>
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.6;">Compartí estos links con las personas que van a correr con vos:</p>

        ${card(linksHtml, '#FC4C02')}

        ${card(`
          <p style="color: #1E6FD9; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 12px;">CÓMO FUNCIONA</p>
          <p style="color: #A8CFFF; font-size: 14px; margin: 8px 0;">1️⃣ &nbsp; Mandales el link a cada persona</p>
          <p style="color: #A8CFFF; font-size: 14px; margin: 8px 0;">2️⃣ &nbsp; Entran al link, eligen su modalidad y se registran</p>
          <p style="color: #A8CFFF; font-size: 14px; margin: 8px 0;">3️⃣ &nbsp; Descargan la app y arrancan a correr 🏃</p>
        `, '#1E6FD9')}

        <p style="color: #4a6a8a; font-size: 13px;">Cada link es de uso único y válido por 30 días.</p>
        <p style="color: #FC4C02; font-weight: bold; font-size: 15px; margin-top: 24px;">El equipo Korva 🏅</p>
      `)
    });
    console.log('Email de invitacion enviado a:', email);
  } catch (error) {
    console.error('Error enviando email de invitacion:', error);
  }
};

const enviarEmailCompletado = async (email, nombre, challenge) => {
  try {
    await getResend().emails.send({
      from: 'Korva <onboarding@resend.dev>',
      to: email,
      subject: `🎉 ¡Completaste ${challenge}! Tu medalla está siendo preparada`,
      html: wrapper(`
        ${badge('🎉 RETO COMPLETADO', '#1E6FD9')}
        <h2 style="color: #FFFFFF; font-size: 26px; margin: 20px 0 8px;">¡Lo lograste, ${nombre}!</h2>
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.6;">Completaste el reto <strong style="color: #FFFFFF;">${challenge}</strong>. Eso requiere compromiso, constancia y mucho esfuerzo. Mereces cada gramo de tu medalla.</p>

        ${card(`
          <p style="color: #FC4C02; font-size: 36px; text-align: center; margin: 0 0 12px;">🏅</p>
          <p style="color: #FFFFFF; font-size: 18px; font-weight: bold; text-align: center; margin: 0 0 8px;">Tu medalla está siendo preparada</p>
          <p style="color: #A8CFFF; font-size: 14px; text-align: center; margin: 0;">En breve te avisamos cuando esté en camino con el número de seguimiento.</p>
        `, '#FC4C02')}

        <p style="color: #A8CFFF; font-size: 14px; line-height: 1.6;">Asegurate de tener tu dirección de envío actualizada en la app. Si necesitás cambiarla, hacelo antes de que te avisemos del envío.</p>
        <p style="color: #FC4C02; font-weight: bold; font-size: 15px; margin-top: 24px;">El equipo Korva 🏅</p>
      `)
    });
    console.log('Email de completado enviado a:', email);
  } catch (error) {
    console.error('Error enviando email de completado:', error);
  }
};

const enviarEmailMedallaEnCamino = async (email, nombre, challenge, tracking) => {
  try {
    await getResend().emails.send({
      from: 'Korva <onboarding@resend.dev>',
      to: email,
      subject: `📦 Tu medalla está en camino — ${challenge}`,
      html: wrapper(`
        ${badge('📦 MEDALLA EN CAMINO', '#4CAF50')}
        <h2 style="color: #FFFFFF; font-size: 26px; margin: 20px 0 8px;">¡Tu medalla está en camino, ${nombre}!</h2>
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.6;">Tu medalla del reto <strong style="color: #FFFFFF;">${challenge}</strong> ya fue despachada y está en camino a tu puerta.</p>

        ${card(`
          <p style="color: #4CAF50; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 8px;">NÚMERO DE SEGUIMIENTO</p>
          <p style="color: #FFFFFF; font-size: 28px; font-weight: bold; margin: 0; letter-spacing: 2px;">${tracking || 'En preparación'}</p>
        `, '#4CAF50')}

        <p style="color: #A8CFFF; font-size: 14px; line-height: 1.6;">Los tiempos de entrega pueden variar según tu ubicación. Si tenés alguna consulta sobre el envío, escribinos a <a href="mailto:korvaventura@gmail.com" style="color: #1E6FD9;">korvaventura@gmail.com</a></p>
        <p style="color: #A8CFFF; font-size: 14px; line-height: 1.6;">¡Mereces cada gramo de esa medalla!</p>
        <p style="color: #FC4C02; font-weight: bold; font-size: 15px; margin-top: 24px;">El equipo Korva 🏅</p>
      `)
    });
    console.log('Email de medalla enviado a:', email);
  } catch (error) {
    console.error('Error enviando email:', error);
  }
};

const enviarEmailAdmin = async (asunto, mensaje) => {
  try {
    await getResend().emails.send({
      from: 'Korva <onboarding@resend.dev>',
      to: 'korvaventura@gmail.com',
      subject: `⚠️ Korva Admin — ${asunto}`,
      html: wrapper(`
        ${badge('⚠️ ALERTA ADMIN', '#FC4C02')}
        <h2 style="color: #FFFFFF; font-size: 22px; margin: 20px 0 8px;">${asunto}</h2>

        ${card(`
          <pre style="color: #A8CFFF; white-space: pre-wrap; font-family: monospace; font-size: 13px; margin: 0;">${mensaje}</pre>
        `, '#FC4C02')}

        <p style="color: #4a6a8a; font-size: 12px;">Este es un email automático del sistema Korva.</p>
      `)
    });
    console.log('Email admin enviado:', asunto);
  } catch (error) {
    console.error('Error enviando email admin:', error);
  }
};

const enviarEmailInscripcionConBib = async (email, nombre, challenge, modalidad, dorsalPdfBase64, postalPdfBase64, bibNumber) => {
  try {
    await getResend().emails.send({
      from: 'Korva <onboarding@resend.dev>',
      to: email,
      subject: `🏅 Inscripción confirmada — ${challenge}`,
      html: wrapper(`
        ${badge('INSCRIPCIÓN CONFIRMADA')}
        <h2 style="color: #FFFFFF; font-size: 26px; margin: 20px 0 8px;">¡Hola, ${nombre}! 👋</h2>
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.6;">Tu inscripción al desafío <strong style="color: #FFFFFF;">${challenge}</strong> en modalidad <strong style="color: #FC4C02;">${modalidad}</strong> fue confirmada. Adjunto a este email encontrás tu dorsal y tu postal de bienvenida.</p>

        ${card(`
          <p style="color: #FC4C02; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 12px;">TU DORSAL OFICIAL</p>
          <p style="color: #FFFFFF; font-size: 32px; font-weight: bold; margin: 0 0 4px;">#${bibNumber}</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 0;">Guardalo, imprimilo o compartilo — es tuyo.</p>
        `, '#FC4C02')}

        ${card(`
          <p style="color: #1E6FD9; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 16px;">TUS PRÓXIMOS PASOS</p>
          <p style="color: #A8CFFF; font-size: 14px; margin: 8px 0;">1️⃣ &nbsp; <strong style="color: #FFFFFF;">Descargá la app Korva</strong> para registrar tus km y ver tu progreso</p>
          <div style="margin: 12px 0 16px; display: flex; gap: 10px;">
            <a href="https://play.google.com/store/apps/details?id=com.korva.mobile" style="display: inline-block; background: #1E6FD9; color: #FFFFFF; font-size: 13px; font-weight: bold; padding: 10px 18px; border-radius: 10px; text-decoration: none; margin-right: 8px;">📱 Google Play</a>
            <a href="https://apps.apple.com/app/korva/id0000000000" style="display: inline-block; background: #1E3A5F; color: #FFFFFF; font-size: 13px; font-weight: bold; padding: 10px 18px; border-radius: 10px; text-decoration: none; border: 1px solid #2a4a6a;">🍎 App Store</a>
          </div>
          <p style="color: #A8CFFF; font-size: 14px; margin: 8px 0;">2️⃣ &nbsp; Iniciá sesión con <strong style="color: #FFFFFF;">este mismo email (${email})</strong> — así tu desafío aparece activo automáticamente</p>
          <div style="background: #2a1a0a; border-radius: 10px; padding: 12px 14px; margin: 8px 0; border-left: 3px solid #FC4C02;">
            <p style="color: #FC4C02; font-size: 12px; font-weight: bold; margin: 0 0 4px;">⚠️ Importante</p>
            <p style="color: #A8CFFF; font-size: 12px; margin: 0; line-height: 1.6;">Usá exactamente <strong style="color: #FFFFFF;">${email}</strong> al registrarte. Si usás otro email, tu desafío no va a aparecer. ¿Te equivocaste? Escribinos a <a href="mailto:korvaventura@gmail.com" style="color: #1E6FD9;">korvaventura@gmail.com</a> y lo resolvemos.</p>
          </div>
          <p style="color: #A8CFFF; font-size: 14px; margin: 8px 0;">3️⃣ &nbsp; Registrá tus km desde la pestaña "Registrar" — cada salida suma</p>
          <p style="color: #A8CFFF; font-size: 14px; margin: 8px 0;">4️⃣ &nbsp; Cargá tu dirección de envío en el Perfil para recibir tu medalla</p>
          <p style="color: #A8CFFF; font-size: 14px; margin: 8px 0;">5️⃣ &nbsp; Cuando completás el 100% iniciamos la orden de envío de tu medalla 🏅</p>
        `, '#1E6FD9')}

        ${card(`
          <p style="color: #4a6a8a; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 10px;">SOBRE EL DESAFÍO</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 6px 0;">✅ &nbsp;Podés completarlo a tu ritmo — no hay límite de tiempo</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 6px 0;">✅ &nbsp;Podés sumar km corriendo, caminando o en bicicleta — todo cuenta</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 6px 0;">✅ &nbsp;Consultá los tiempos de envío por país en <a href="https://korva.run" style="color: #1E6FD9;">korva.run</a></p>
        `, '#2a4a6a')}

        <p style="color: #A8CFFF; font-size: 14px; line-height: 1.6;">¿Tenés dudas? Respondé este email o escribinos a <a href="mailto:korvaventura@gmail.com" style="color: #1E6FD9;">korvaventura@gmail.com</a></p>
        <p style="color: #FC4C02; font-weight: bold; font-size: 15px; margin-top: 24px;">El equipo Korva 🏅</p>
      `),
      attachments: [
        {
          filename: `Dorsal_${bibNumber}_${nombre.replace(/\s/g, '_')}.pdf`,
          content: dorsalPdfBase64,
          content_type: 'application/pdf',
        },
        {
          filename: `Postal_${challenge.replace(/\s/g, '_')}_${nombre.replace(/\s/g, '_')}.pdf`,
          content: postalPdfBase64,
          content_type: 'application/pdf',
        },
      ],
    });
    console.log('Email con bib enviado a:', email);
  } catch (error) {
    console.error('Error enviando email con bib:', error);
  }
};

module.exports = { enviarEmailInscripcion, enviarEmailInscripcionConBib, enviarEmailInvitacion, enviarEmailMedallaEnCamino, enviarEmailCompletado, enviarEmailAdmin };