// Compatibilidad para escritores legacy que recalculan progresos fuera del motor 4A.
// Las actividades con manual_target_uc_ids NULL mantienen la regla histórica.
const fechaUtc = (valor) => {
  if (!valor) return NaN;
  const str = String(valor).replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(str) ? str : str + 'Z');
};

const cuentaParaParticipacion = (actividad, uc) => {
  const fecha = fechaUtc(actividad?.recorded_at);
  if (!Number.isFinite(fecha)) return false;
  const destinos = actividad.source === 'manual' && Array.isArray(actividad.manual_target_uc_ids)
    ? actividad.manual_target_uc_ids : null;
  if (destinos !== null) {
    if (!destinos.includes(uc.id)) return false;
    const inicio = fechaUtc(uc.started_at);
    const protegido = fechaUtc(uc.inicio_protegido_at);
    if ((Number.isFinite(inicio) && fecha < inicio) ||
        (Number.isFinite(protegido) && fecha < protegido)) return false;
    return actividad.excluida !== true;
  }
  for (const periodo of (uc.periodos_pausados || [])) {
    const desde = fechaUtc(periodo.desde);
    const hasta = fechaUtc(periodo.hasta);
    if (Number.isFinite(desde) && Number.isFinite(hasta) && fecha >= desde && fecha <= hasta) return false;
  }
  if (uc.pausado === true && Number.isFinite(fechaUtc(uc.pausado_at)) && fecha >= fechaUtc(uc.pausado_at)) return false;
  return actividad.excluida !== true;
};
module.exports = { cuentaParaParticipacion };
