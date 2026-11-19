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

module.exports = { DIAS_OCULTA, clave, debeInvitar, ocultarHasta };
