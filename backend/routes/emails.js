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
    <p style="color: #4a6a8a; font-size: 11px; margin: 16px 0 0;">© ${new Date().getFullYear()} Korva Adventures LLC. Todos los derechos reservados.</p>
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
      from: 'Korva Aventuras <noreply@korva.run>',
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
      <div style="background: #1E3A5F; border-radius: 14px; padding: 18px 20px; margin: 16px 0; border-left: 4px solid #FC4C02;">
        <p style="color: #A8CFFF; font-size: 12px; font-weight: bold; letter-spacing: 1px; margin: 0 0 12px;">PARTICIPANTE ${i + 2}</p>
        <a href="${BACKEND_URL}/invitaciones/${token}"
           style="display: block; background: #FC4C02; color: #FFFFFF; font-size: 15px; font-weight: bold; padding: 14px 20px; border-radius: 12px; text-decoration: none; text-align: center;">
          Registrarme en Korva →
        </a>
        <p style="color: #4a6a8a; font-size: 12px; margin: 12px 0 4px;">📋 O copiá este link y mandáselo por WhatsApp:</p>
        <p style="color: #A8CFFF; font-size: 12px; margin: 0; word-break: break-all;">${BACKEND_URL}/invitaciones/${token}</p>
      </div>
    `).join('');

    await getResend().emails.send({
      from: 'Korva Aventuras <noreply@korva.run>',
      to: email,
      subject: `🎟️ Tus invitaciones para ${challenge}`,
      html: wrapper(`
        ${badge('🎟️ INSCRIPCIÓN GRUPAL')}
        <h2 style="color: #FFFFFF; font-size: 26px; margin: 20px 0 8px;">¡Hola, ${nombre}! 👋</h2>
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.7; margin-bottom: 8px;">Compraste <strong style="color: #FFFFFF;">${tokens.length + 1} lugares</strong> en <strong style="color: #FC4C02;">${challenge}</strong>. Tu inscripción ya está activa 🎉</p>
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.7;">Abajo encontrás los links para que cada participante se registre:</p>

        ${linksHtml}

        <div style="background: #1E3A5F; border-radius: 14px; padding: 18px 20px; margin-top: 24px; border: 1px solid #2a4a6a;">
          <p style="color: #A8CFFF; font-size: 14px; margin: 0 0 8px; line-height: 1.7;">Una vez registrados, que descarguen la app Korva en Android.</p>
          <p style="color: #A8CFFF; font-size: 14px; margin: 0; line-height: 1.7;">¿Necesitan ayuda? Que nos escriban por WhatsApp al <strong style="color: #FFFFFF;">+61474024238</strong> y los guiamos.</p>
        </div>

        <p style="color: #FC4C02; font-weight: bold; font-size: 15px; margin-top: 24px;">¡A correr todos juntos! 🏅</p>
      `)
    });
    console.log('Email de invitacion grupal enviado a:', email, '- tokens:', tokens.length);
  } catch (error) {
    console.error('Error enviando email de invitacion:', error);
  }
};

const enviarEmailCompletado = async (email, nombre, challenge, certificadoPdfBase64 = null) => {
  try {
    const certificadoTexto = certificadoPdfBase64
      ? `Completaste el reto <strong style="color: #FFFFFF;">${challenge}</strong>. Eso requiere compromiso, constancia y mucho esfuerzo. Adjunto a este email encontrás tu certificado oficial de finalización.`
      : `Completaste el reto <strong style="color: #FFFFFF;">${challenge}</strong>. Eso requiere compromiso, constancia y mucho esfuerzo. Mereces cada gramo de tu medalla.`;

    await getResend().emails.send({
      from: 'Korva Aventuras <noreply@korva.run>',
      to: email,
      subject: `🎉 ¡Completaste ${challenge}! Tu medalla está siendo preparada`,
      html: wrapper(`
        ${badge('🎉 RETO COMPLETADO', '#1E6FD9')}
        <h2 style="color: #FFFFFF; font-size: 26px; margin: 20px 0 8px;">¡Lo lograste, ${nombre}!</h2>
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.6;">${certificadoTexto}</p>

        ${card(`
          <p style="color: #FC4C02; font-size: 36px; text-align: center; margin: 0 0 12px;">🏅</p>
          <p style="color: #FFFFFF; font-size: 18px; font-weight: bold; text-align: center; margin: 0 0 8px;">Tu medalla está siendo preparada</p>
          <p style="color: #A8CFFF; font-size: 14px; text-align: center; margin: 0;">En breve te avisamos cuando esté en camino con el número de seguimiento.</p>
        `, '#FC4C02')}

        <p style="color: #A8CFFF; font-size: 14px; line-height: 1.6;">Asegurate de tener tu dirección de envío actualizada en la app. Si necesitás cambiarla, hacelo antes de que te avisemos del envío.</p>
        <p style="color: #FC4C02; font-weight: bold; font-size: 15px; margin-top: 24px;">El equipo Korva 🏅</p>
      `),
      ...(certificadoPdfBase64 ? {
        attachments: [{
          filename: `Certificado_${challenge.replace(/\s/g, '_')}_${nombre.replace(/\s/g, '_')}.pdf`,
          content: certificadoPdfBase64,
          content_type: 'application/pdf',
        }],
      } : {}),
    });
    console.log('Email de completado enviado a:', email);
  } catch (error) {
    console.error('Error enviando email de completado:', error);
  }
};

const enviarEmailMedallaEnCamino = async (email, nombre, challenge, tracking) => {
  try {
    await getResend().emails.send({
      from: 'Korva Aventuras <noreply@korva.run>',
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
      from: 'Korva Aventuras <noreply@korva.run>',
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
      from: 'Korva Aventuras <noreply@korva.run>',
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
          <p style="color: #1E6FD9; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 14px;">CÓMO EMPEZAR</p>

          <p style="color: #FFFFFF; font-size: 14px; font-weight: bold; margin: 0 0 6px;">📱 ¿Tenés Android?</p>
          <div style="margin: 8px 0 16px;">
            <a href="https://play.google.com/store/apps/details?id=com.korva.mobile" style="display: inline-block; background: #FC4C02; color: #FFFFFF; font-size: 14px; font-weight: bold; padding: 12px 24px; border-radius: 10px; text-decoration: none;">Descargar app Korva en Google Play →</a>
          </div>

          <p style="color: #FFFFFF; font-size: 14px; font-weight: bold; margin: 16px 0 6px;">🍎 ¿Tenés iPhone?</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 0 0 6px; line-height: 1.6;">Por ahora la app está disponible solo para Android. Podés usar la versión web desde tu celular — funciona igual de bien.</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 0; line-height: 1.6;">📖 En nuestras historias destacadas de Instagram (<a href="https://instagram.com/korva.aventuras" style="color: #1E6FD9;">@korva.aventuras</a>) hay un tutorial rápido de cómo dejar la app web en la pantalla de inicio de tu iPhone.</p>

          <div style="background: #2a1a0a; border-radius: 10px; padding: 12px 14px; margin: 16px 0 8px; border-left: 3px solid #FC4C02;">
            <p style="color: #FC4C02; font-size: 12px; font-weight: bold; margin: 0 0 4px;">⚠️ Importante</p>
            <p style="color: #A8CFFF; font-size: 12px; margin: 0; line-height: 1.6;">Al registrarte en la app usá exactamente este email: <strong style="color: #FFFFFF;">${email}</strong> — así tu desafío aparece automáticamente.</p>
          </div>
        `, '#1E6FD9')}

        ${card(`
          <p style="color: #4a6a8a; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 10px;">CÓMO FUNCIONA</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 6px 0;">🏃 &nbsp;Con la primera carga de km empezás a acumular historial — cada vez que entres y registres se va sumando</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 6px 0;">📈 &nbsp;Seguí tu progreso en tiempo real hasta completar el reto</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 6px 0;">📦 &nbsp;Al completar el 100%, el sistema te va a pedir que cargues tu dirección de envío — asegurate de tenerla lista</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 6px 0;">🏅 &nbsp;Tu medalla sale en camino automáticamente</p>
        `, '#2a4a6a')}

        <p style="color: #A8CFFF; font-size: 14px; line-height: 1.6; margin-top: 24px;">¿Tenés dudas? Escribinos por Instagram <a href="https://instagram.com/korva.aventuras" style="color: #1E6FD9;">@korva.aventuras</a>, al email <a href="mailto:korvaventura@gmail.com" style="color: #1E6FD9;">korvaventura@gmail.com</a> o por WhatsApp al <strong style="color: #FFFFFF;">+61474024238</strong></p>
        <p style="color: #FC4C02; font-weight: bold; font-size: 15px; margin-top: 16px;">El equipo Korva 🏅</p>
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