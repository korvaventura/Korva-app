// Aviso para no grabar la misma salida con Korva GPS y con Strava. Puro para probarlo.
const claveAvisoStrava = (userId) => `korva:aviso-strava-gps:${userId}`;

function debeAvisarStrava({ stravaConectado, silenciado }) {
  return !!stravaConectado && !silenciado;
}

const TEXTO_AVISO_STRAVA = 'Tus salidas de Strava llegan solas a Korva. Grabá cada salida con una sola app, la que te quede más cómoda: si la grabás con Strava, no hace falta grabarla también con Korva GPS.';

module.exports = { claveAvisoStrava, debeAvisarStrava, TEXTO_AVISO_STRAVA };
