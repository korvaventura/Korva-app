const { Resend } = require('resend');

const getResend = () => new Resend(process.env.RESEND_API_KEY);

const enviarEmailInscripcion = async (email, nombre, challenge, modalidad) => {
  try {
    await getResend().emails.send({
      from: 'Korva <onboarding@resend.dev>',
      to: email,
      subject: `Inscripcion confirmada — ${challenge}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0D1B2A; color: #FFFFFF; padding: 40px; border-radius: 16px;">
          <h1 style="color: #FFFFFF; font-size: 28px;">🏅 KORVA</h1>
          <h2 style="color: #1E6FD9;">Inscripcion confirmada!</h2>
          <p style="color: #A8CFFF;">Hola ${nombre},</p>
          <p style="color: #A8CFFF;">Tu inscripcion al reto <strong style="color: #FFFFFF;">${challenge}</strong> en modalidad <strong style="color: #FFFFFF;">${modalidad}</strong> fue confirmada.</p>
          <div style="background: #1E3A5F; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <p style="color: #FFFFFF; font-size: 18px; font-weight: bold; margin: 0;">Que empiece el desafio!</p>
            <p style="color: #A8CFFF; margin: 8px 0 0 0;">Conecta tu Strava o carga tus km manualmente y empeza a acumular distancia.</p>
          </div>
          <p style="color: #A8CFFF;">Cuando completes el reto, tu medalla viajara hasta tu puerta.</p>
          <p style="color: #FC4C02; font-weight: bold;">El equipo Korva</p>
        </div>
      `
    });
    console.log('Email de inscripcion enviado a:', email);
  } catch (error) {
    console.error('Error enviando email:', error);
  }
};

const enviarEmailMedallaEnCamino = async (email, nombre, challenge, tracking) => {
  try {
    await getResend().emails.send({
      from: 'Korva <onboarding@resend.dev>',
      to: email,
      subject: `Tu medalla esta en camino — ${challenge}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0D1B2A; color: #FFFFFF; padding: 40px; border-radius: 16px;">
          <h1 style="color: #FFFFFF; font-size: 28px;">🏅 KORVA</h1>
          <h2 style="color: #FC4C02;">Tu medalla esta en camino!</h2>
          <p style="color: #A8CFFF;">Hola ${nombre},</p>
          <p style="color: #A8CFFF;">Completaste el reto <strong style="color: #FFFFFF;">${challenge}</strong>. Tu medalla real esta en camino!</p>
          <div style="background: #1E3A5F; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <p style="color: #FFFFFF; font-size: 18px; font-weight: bold; margin: 0;">Numero de seguimiento</p>
            <p style="color: #FC4C02; font-size: 24px; font-weight: bold; margin: 8px 0 0 0;">${tracking || 'En preparacion'}</p>
          </div>
          <p style="color: #A8CFFF;">Felicitaciones por completar el desafio. Mereces cada gramo de esa medalla.</p>
          <p style="color: #FC4C02; font-weight: bold;">El equipo Korva</p>
        </div>
      `
    });
    console.log('Email de medalla enviado a:', email);
  } catch (error) {
    console.error('Error enviando email:', error);
  }
};

const enviarEmailCompletado = async (email, nombre, challenge) => {
  try {
    await getResend().emails.send({
      from: 'Korva <onboarding@resend.dev>',
      to: email,
      subject: `Completaste el reto ${challenge}! Tu medalla esta en camino`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0D1B2A; color: #FFFFFF; padding: 40px; border-radius: 16px;">
          <h1 style="color: #FFFFFF; font-size: 28px;">🏅 KORVA</h1>
          <h2 style="color: #FC4C02;">Felicitaciones ${nombre}!</h2>
          <p style="color: #A8CFFF;">Completaste el reto <strong style="color: #FFFFFF;">${challenge}</strong>.</p>
          <div style="background: #1E3A5F; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <p style="color: #FFFFFF; font-size: 18px; font-weight: bold; margin: 0;">Tu medalla esta siendo preparada!</p>
            <p style="color: #A8CFFF; margin: 8px 0 0 0;">En breve te avisamos cuando este en camino con el numero de seguimiento.</p>
          </div>
          <p style="color: #A8CFFF;">Mereces cada gramo de esa medalla.</p>
          <p style="color: #FC4C02; font-weight: bold;">El equipo Korva</p>
        </div>
      `
    });
    console.log('Email de completado enviado a:', email);
  } catch (error) {
    console.error('Error enviando email de completado:', error);
  }
};

const enviarEmailAdmin = async (asunto, mensaje) => {
  try {
    await getResend().emails.send({
      from: 'Korva <onboarding@resend.dev>',
      to: 'korvaventura@gmail.com',
      subject: `⚠️ Korva Admin — ${asunto}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0D1B2A; color: #FFFFFF; padding: 40px; border-radius: 16px;">
          <h1 style="color: #FFFFFF; font-size: 28px;">⚠️ KORVA ADMIN</h1>
          <h2 style="color: #FC4C02;">${asunto}</h2>
          <div style="background: #1E3A5F; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <pre style="color: #A8CFFF; white-space: pre-wrap; font-family: monospace;">${mensaje}</pre>
          </div>
          <p style="color: #A8CFFF; font-size: 12px;">Este es un email automatico del sistema Korva.</p>
        </div>
      `
    });
    console.log('Email admin enviado:', asunto);
  } catch (error) {
    console.error('Error enviando email admin:', error);
  }
};

module.exports = { enviarEmailInscripcion, enviarEmailMedallaEnCamino, enviarEmailCompletado, enviarEmailAdmin };