// Cuándo invitar a empezar Islandia (ruta gratuita). Puro para probarlo.
const DIAS_OCULTA = 7;
const clave = (userId) => `korva:islandia-invitacion-oculta:${userId}`;

// participacion: la de useRutaLibre (o null). Se invita si nunca la empezó o la dejó.
function debeInvitar({ participacion, ocultaHasta = null, ahora = Date.now() }) {
  const enCurso = !!participacion && !participacion.abandonado;
  if (enCurso) return false;
  const hasta = Number(ocultaHasta);
  return !(Number.isFinite(hasta) && hasta > ahora);
}

function ocultarHasta(ahora = Date.now()) {
  return ahora + DIAS_OCULTA * 24 * 60 * 60 * 1000;
}

// Texto de la confirmación al empezar Islandia (mismo en todas las pantallas).
const TEXTO_ACEPTAR = 'Es una ruta libre, sin costo. Por ahora no tiene medalla: en el futuro va a existir una, y vas a poder comprarla con tu recorrido validado.\n\nSuman las actividades que registres desde ahora (GPS, Manual o Strava), junto a tus otros desafíos activos. Lo anterior no cuenta. Podés pausarla o dejarla cuando quieras.';

module.exports = { TEXTO_ACEPTAR, DIAS_OCULTA, clave, debeInvitar, ocultarHasta };
