// Aviso para no grabar la misma salida con Korva GPS y con Strava. Puro para probarlo.
const claveAvisoStrava = (userId) => `korva:aviso-strava-gps:${userId}`;

function debeAvisarStrava({ stravaConectado, silenciado }) {
  return !!stravaConectado && !silenciado;
}

const TEXTO_AVISO_STRAVA = 'Tus salidas de Strava llegan solas a Korva. Grabá cada salida con una sola app, la que te quede más cómoda: si la grabás con Strava, no hace falta grabarla también con Korva GPS.';

// Abrir Strava: la app si está instalada; si no, su ficha en la tienda.
const STRAVA_APP = 'strava://';
function tiendaStrava(plataforma) {
  return plataforma === 'android'
    ? 'https://play.google.com/store/apps/details?id=com.strava'
    : 'https://apps.apple.com/app/strava-run-ride-hike/id426826309';
}

module.exports = { STRAVA_APP, tiendaStrava, claveAvisoStrava, debeAvisarStrava, TEXTO_AVISO_STRAVA };
