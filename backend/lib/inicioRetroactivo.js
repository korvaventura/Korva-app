// Resolución pura de fechas retroactivas. No lee ni escribe Supabase.
// Mantiene el límite histórico de 30 días sin comparar timestamps como texto.
const { instanteUTC } = require('./progresoDesafio');
const MAX_DIAS = 30;
const resolverInicioRetroactivo = ({ inicioActual, fechaActividad, inicioProtegido = null }) => {
  const inicioMs = instanteUTC(inicioActual);
  const actividadMs = instanteUTC(fechaActividad);
  if (inicioMs === null || actividadMs === null || actividadMs >= inicioMs) return null;
  const pisoProtegidoMs = inicioProtegido === null ? null : instanteUTC(inicioProtegido);
  // Reservado para una migración posterior: reinicios explícitos impiden retroceder la fecha.
  // Si un piso configurado es inválido, fallamos cerrados.
  if (inicioProtegido !== null && (pisoProtegidoMs === null || actividadMs < pisoProtegidoMs)) return null;
  const limiteMs = inicioMs - MAX_DIAS * 24 * 60 * 60 * 1000;
  if (actividadMs < limiteMs) return new Date(limiteMs).toISOString();
  return fechaActividad;
};
module.exports = { resolverInicioRetroactivo, MAX_DIAS };
