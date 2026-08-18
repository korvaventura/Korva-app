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
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.6;">Tu inscripción al reto <strong style="color: #FFFFFF;">${challenge}</strong> fue confirmada.</p>

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
    const cantidadInvitados = tokens.length;

    await getResend().emails.send({
      from: 'Korva Aventuras <noreply@korva.run>',
      to: email,
      subject: `🎟️ Inscripción grupal confirmada — ${challenge}`,
      html: wrapper(`
        ${badge('🎟️ INSCRIPCIÓN GRUPAL')}
        <h2 style="color: #FFFFFF; font-size: 26px; margin: 20px 0 8px;">¡Hola, ${nombre}! 👋</h2>
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.7; margin-bottom: 8px;">Compraste <strong style="color: #FFFFFF;">${cantidadInvitados + 1} lugares</strong> en <strong style="color: #FC4C02;">${challenge}</strong>. Tu inscripción ya está activa 🎉</p>

        ${card(`
          <p style="color: #FC4C02; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 14px;">📋 PARA REGISTRAR A TUS COMPAÑEROS</p>
          <p style="color: #A8CFFF; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">
            Escribinos por WhatsApp con el <strong style="color: #FFFFFF;">nombre y email</strong> de cada participante y los activamos a la brevedad. También podés escribirnos ante cualquier duda.
          </p>
          <div style="margin: 8px 0;">
            <a href="https://wa.me/61474024238" style="display: inline-block; background: #25D366; color: #FFFFFF; font-size: 15px; font-weight: bold; padding: 14px 24px; border-radius: 12px; text-decoration: none;">
              💬 Escribirnos por WhatsApp →
            </a>
          </div>
          <p style="color: #4a6a8a; font-size: 12px; margin: 12px 0 0;">+61474024238</p>
        `, '#FC4C02')}

        ${card(`
          <p style="color: #1E6FD9; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 14px;">CÓMO ACCEDER AL DESAFÍO</p>

          <p style="color: #FFFFFF; font-size: 14px; font-weight: bold; margin: 0 0 6px;">📱 ¿Tenés Android?</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 0 0 10px; line-height: 1.6;">Descargá la app, iniciá sesión con el email con el que te registraste y el desafío aparece automáticamente.</p>
          <div style="margin: 8px 0 16px;">
            <a href="https://play.google.com/store/apps/details?id=com.korva.mobile" style="display: inline-block; background: #FC4C02; color: #FFFFFF; font-size: 14px; font-weight: bold; padding: 12px 24px; border-radius: 10px; text-decoration: none;">Descargar app Korva en Google Play →</a>
          </div>

          <p style="color: #FFFFFF; font-size: 14px; font-weight: bold; margin: 16px 0 6px;">🍎 ¿Tenés iPhone?</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 0 0 10px; line-height: 1.6;">Descargá la app desde el App Store, iniciá sesión con tu email y el desafío aparece automáticamente.</p>
          <div style="margin: 8px 0 16px;">
            <a href="https://apps.apple.com/app/korva-aventuras/id6795443954" style="display: inline-block; background: #1E3A5F; color: #FFFFFF; font-size: 14px; font-weight: bold; padding: 12px 24px; border-radius: 10px; text-decoration: none; border: 1px solid #1E6FD9;">Descargar app Korva en App Store →</a>
          </div>
        `, '#1E6FD9')}

        <p style="color: #FC4C02; font-weight: bold; font-size: 15px; margin-top: 24px;">¡A correr todos juntos! 🏅</p>
      `)
    });
    console.log('Email de invitacion grupal enviado a:', email, '- invitados:', cantidadInvitados);
  } catch (error) {
    console.error('Error enviando email de invitacion:', error);
  }
};

const enviarEmailCompletado = async (email, nombre, challenge, certificadoPdfBase64 = null, opciones = {}) => {
  try {
    const { tieneDir = true, esGrupo = false, esComprador = true, miembros = [], nombreComprador = '' } = opciones;

    const certificadoTexto = certificadoPdfBase64
      ? `Completaste el reto <strong style="color: #FFFFFF;">${challenge}</strong>. Eso requiere compromiso, constancia y mucho esfuerzo. Adjunto encontrás tu certificado oficial de finalización.`
      : `Completaste el reto <strong style="color: #FFFFFF;">${challenge}</strong>. Eso requiere compromiso, constancia y mucho esfuerzo. Mereces cada gramo de tu medalla.`;

    let bloqueEnvio = '';

    if (!esGrupo) {
      // Individual
      if (tieneDir) {
        bloqueEnvio = card(`
          <p style="color: #FC4C02; font-size: 36px; text-align: center; margin: 0 0 12px;">🏅</p>
          <p style="color: #FFFFFF; font-size: 18px; font-weight: bold; text-align: center; margin: 0 0 8px;">Tus datos están listos</p>
          <p style="color: #A8CFFF; font-size: 14px; text-align: center; margin: 0; line-height: 1.6;">Cuando tu medalla sea despachada, te enviamos el número de seguimiento por email.</p>
        `, '#FC4C02');
      } else {
        bloqueEnvio = card(`
          <p style="color: #FC4C02; font-size: 36px; text-align: center; margin: 0 0 12px;">📍</p>
          <p style="color: #FFFFFF; font-size: 18px; font-weight: bold; text-align: center; margin: 0 0 8px;">Cargá tu dirección de envío</p>
          <p style="color: #A8CFFF; font-size: 14px; text-align: center; margin: 0; line-height: 1.6;">Para que podamos enviarte tu medalla, ingresá a la app y completá tu dirección en la sección Perfil.</p>
        `, '#FC4C02');
      }
    } else if (esComprador) {
      // Comprador grupal
      const totalMedallas = miembros.length;
      const listaMiembros = miembros.map(m =>
        `<p style="color: #A8CFFF; font-size: 13px; margin: 4px 0;">
          ${m.status === 'completed' || m.status === 'shipped' ? '✅' : '⏳'} ${m.nombre || 'Participante'}${m.esComprador ? ' <span style="color: #FC4C02;">(vos)</span>' : ''}
        </p>`
      ).join('');

      if (tieneDir) {
        bloqueEnvio = card(`
          <p style="color: #1E6FD9; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 12px;">📦 PEDIDO GRUPAL — ${totalMedallas} MEDALLA${totalMedallas > 1 ? 'S' : ''}</p>
          <p style="color: #A8CFFF; font-size: 14px; margin: 0 0 14px; line-height: 1.6;">Las medallas del grupo se envían juntas a tu dirección cuando todos completen, o a las 2 semanas del primero en completar. Cuando el pedido sea despachado, te enviamos el número de seguimiento.</p>
          <p style="color: #FFFFFF; font-size: 13px; font-weight: bold; margin: 0 0 8px;">Participantes:</p>
          ${listaMiembros}
        `, '#1E6FD9');
      } else {
        bloqueEnvio = card(`
          <p style="color: #FC4C02; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 12px;">📍 CARGÁ TU DIRECCIÓN</p>
          <p style="color: #A8CFFF; font-size: 14px; margin: 0 0 14px; line-height: 1.6;">Tu pedido incluye ${totalMedallas} medalla${totalMedallas > 1 ? 's' : ''} que se envían juntas. Para despacharlas necesitamos tu dirección — ingresá a la app (Perfil → Dirección de envío).</p>
          <p style="color: #FFFFFF; font-size: 13px; font-weight: bold; margin: 0 0 8px;">Participantes:</p>
          ${listaMiembros}
        `, '#FC4C02');
      }
    } else {
      // Invitado grupal
      bloqueEnvio = card(`
        <p style="color: #FC4C02; font-size: 36px; text-align: center; margin: 0 0 12px;">🏅</p>
        <p style="color: #FFFFFF; font-size: 18px; font-weight: bold; text-align: center; margin: 0 0 8px;">Tu medalla va con el grupo</p>
        <p style="color: #A8CFFF; font-size: 14px; text-align: center; margin: 0; line-height: 1.6;">Las medallas del grupo se envían juntas a quien organizó la compra${nombreComprador ? ` (${nombreComprador})` : ''}. Cualquier consulta sobre el envío, coordiná con esa persona.</p>
      `, '#FC4C02');
    }

    await getResend().emails.send({
      from: 'Korva Aventuras <noreply@korva.run>',
      to: email,
      subject: `🎉 ¡Completaste ${challenge}! Tu medalla está siendo preparada`,
      html: wrapper(`
        ${badge('🎉 RETO COMPLETADO', '#1E6FD9')}
        <h2 style="color: #FFFFFF; font-size: 26px; margin: 20px 0 8px;">¡Lo lograste, ${nombre}!</h2>
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.6;">${certificadoTexto}</p>
        ${bloqueEnvio}
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

const enviarEmailAdminMedallaLista = async (nombre, email, challenge, tieneDir, esGrupo, miembros = []) => {
  try {
    const listaMiembrosHtml = esGrupo ? miembros.map(m =>
      `<p style="color: #A8CFFF; font-size: 13px; margin: 4px 0;">
        ${m.status === 'completed' || m.status === 'shipped' ? '✅' : '⏳'}
        ${m.nombre || '?'} — ${m.email || ''}${m.esComprador ? ' 👑' : ''}
      </p>`
    ).join('') : '';

    await getResend().emails.send({
      from: 'Korva Aventuras <noreply@korva.run>',
      to: 'korvaventura@gmail.com',
      subject: `🏅 Medalla lista para despachar — ${nombre}`,
      html: wrapper(`
        ${badge('🏅 MEDALLA LISTA PARA DESPACHAR', '#4CAF50')}
        <h2 style="color: #FFFFFF; font-size: 22px; margin: 20px 0 8px;">Nueva medalla para enviar</h2>

        ${card(`
          <p style="color: #4CAF50; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 12px;">DATOS DEL PEDIDO</p>
          <p style="color: #FFFFFF; font-size: 15px; font-weight: bold; margin: 0 0 4px;">${nombre}</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 0 0 4px;">${email}</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 0 0 12px;">🏔️ ${challenge}</p>
          <p style="color: ${tieneDir ? '#4CAF50' : '#FC4C02'}; font-size: 13px; font-weight: bold; margin: 0;">
            ${tieneDir ? '✅ Tiene dirección cargada' : '⚠️ SIN dirección — no despachar todavía'}
          </p>
        `, '#4CAF50')}

        ${esGrupo ? card(`
          <p style="color: #1E6FD9; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 12px;">PEDIDO GRUPAL — ${miembros.length} MEDALLAS</p>
          ${listaMiembrosHtml}
        `, '#1E6FD9') : ''}

        <p style="color: #4a6a8a; font-size: 12px; margin-top: 16px;">Email automático del sistema Korva.</p>
      `)
    });
    console.log('Email admin medalla lista enviado para:', nombre);
  } catch (error) {
    console.error('Error enviando email admin medalla lista:', error.message);
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
        <p style="color: #A8CFFF; font-size: 15px; line-height: 1.6;">Tu inscripción al desafío <strong style="color: #FFFFFF;">${challenge}</strong> fue confirmada. Adjunto encontrás tu dorsal y tu postal de bienvenida.</p>

        ${card(`
          <p style="color: #FC4C02; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 12px;">TU DORSAL OFICIAL</p>
          <p style="color: #FFFFFF; font-size: 32px; font-weight: bold; margin: 0 0 4px;">#${bibNumber}</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 0;">Guardalo, imprimilo o compartilo — es tuyo.</p>
        `, '#FC4C02')}

        ${card(`
          <p style="color: #1E6FD9; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 14px;">CÓMO EMPEZAR</p>

          <p style="color: #FFFFFF; font-size: 14px; font-weight: bold; margin: 0 0 6px;">📱 ¿Tenés Android?</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 0 0 10px; line-height: 1.6;">Descargá la app, iniciá sesión con este email y tu desafío aparece automáticamente. ¿Algún problema? Escribinos por WhatsApp al <strong style="color: #FFFFFF;">+61474024238</strong></p>
          <div style="margin: 8px 0 24px;">
            <a href="https://play.google.com/store/apps/details?id=com.korva.mobile" style="display: inline-block; background: #FC4C02; color: #FFFFFF; font-size: 14px; font-weight: bold; padding: 12px 24px; border-radius: 10px; text-decoration: none;">Descargar app Korva en Google Play →</a>
          </div>

          <p style="color: #FFFFFF; font-size: 14px; font-weight: bold; margin: 0 0 10px;">🍎 ¿Tenés iPhone?</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 0 0 10px; line-height: 1.6;">Descargá la app desde el App Store, iniciá sesión con tu email y el desafío aparece automáticamente.</p>
          <div style="margin: 0 0 16px;">
            <a href="https://apps.apple.com/app/korva-aventuras/id6795443954" style="display: inline-block; background: #1E3A5F; color: #FFFFFF; font-size: 14px; font-weight: bold; padding: 12px 24px; border-radius: 10px; text-decoration: none; border: 1px solid #1E6FD9;">Descargar app Korva en App Store →</a>
          </div>

          <div style="background: #1E3A5F; border-radius: 10px; padding: 14px 16px; margin: 0 0 8px; border-left: 3px solid #1E6FD9;">
            <p style="color: #FFFFFF; font-size: 13px; font-weight: bold; margin: 0 0 8px;">📋 ¿Cómo funciona en iPhone?</p>
            <p style="color: #A8CFFF; font-size: 13px; margin: 4px 0; line-height: 1.6;"><strong style="color: #FFFFFF;">1.</strong> Entrá al link de arriba desde Safari</p>
            <p style="color: #A8CFFF; font-size: 13px; margin: 4px 0; line-height: 1.6;"><strong style="color: #FFFFFF;">2.</strong> Cargá tus km con tu nombre y este email: <strong style="color: #FC4C02;">${email}</strong></p>
            <p style="color: #A8CFFF; font-size: 13px; margin: 4px 0; line-height: 1.6;"><strong style="color: #FFFFFF;">3.</strong> Usá siempre el mismo email — es lo que vincula tus km con tu desafío</p>
          </div>
          <p style="color: #4a6a8a; font-size: 12px; margin: 8px 0 0; line-height: 1.6;">¿Problemas? Escribinos por WhatsApp al +61474024238.</p>
        `, '#1E6FD9')}

        ${card(`
          <p style="color: #4a6a8a; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 10px;">CÓMO FUNCIONA</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 6px 0;">🏃 &nbsp;Registrá tus km — cada vez que entres y registres se va sumando</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 6px 0;">📈 &nbsp;Seguí tu progreso en tiempo real</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 6px 0;">📦 &nbsp;Al completar el 100%, cargá tu dirección de envío en el Perfil</p>
          <p style="color: #A8CFFF; font-size: 13px; margin: 6px 0;">🏅 &nbsp;Tu medalla sale en camino</p>
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

module.exports = { enviarEmailInscripcion, enviarEmailInscripcionConBib, enviarEmailInvitacion, enviarEmailMedallaEnCamino, enviarEmailCompletado, enviarEmailAdmin, enviarEmailAdminMedallaLista };