// Interpreta la respuesta real del backend; registrar no implica necesariamente sumar km.
// Sin dependencias nativas para poder probarse con node:test.
const resultadoCargaManual = ({ data, challengeId, distancia, actividadLabel = '' }) => {
  const mensajeServidor = typeof data?.mensaje === 'string' ? data.mensaje.trim() : '';
  const progreso = data?.progreso;
  const recalculo = progreso?.recalculo;
  const sinAvance = /no se sumaron kil[oó]metros/i.test(mensajeServidor);
  const pendiente = recalculo === 'pendiente' || /se actualizar[aá]n cuando/i.test(mensajeServidor);
  const fallback = challengeId
    ? `${distancia} km${actividadLabel ? ` de ${actividadLabel}` : ''} registrados`
    : `${distancia} km guardados en modo libre`;
  return {
    mensaje: mensajeServidor || fallback,
    // false informa de ausencia de avance o de recálculo pendiente,
    // aunque la actividad haya quedado correctamente registrada.
    avanceConfirmado: Boolean(challengeId) && !sinAvance && !pendiente,
    sinAvance,
    pendiente,
  };
};

module.exports = { resultadoCargaManual };
