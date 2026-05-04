const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const enviarEmailInscripcion = async (email, nombre, challenge, modalidad) => {
  try {
    await resend.emails.send({
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
    await resend.emails.send({
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

module.exports = { enviarEmailInscripcion, enviarEmailMedallaEnCamino };
