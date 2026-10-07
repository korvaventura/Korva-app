// Los permisos del teléfono no autorizan aportes a desafíos. Cada aporte exige
// una ventana registrada por el servidor para ESTA participación y ESTE usuario.
const VERSION_CONSENTIMIENTO = 'movimiento-desafios-v1';

function diaAutorizadoHealth({ userId, tipo, participacionId, ventanas = [], residual }) {
  if (!userId || !participacionId || !['pago', 'libre'].includes(tipo)) return false;
  const inicio = Date.parse(residual?.ventana_utc?.inicio || '');
  const fin = Date.parse(residual?.ventana_utc?.fin || '');
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return false;
  return ventanas.some((v) => {
    if (v.user_id !== userId || v.tipo !== tipo || v.participacion_id !== participacionId
      || v.version !== VERSION_CONSENTIMIENTO || v.timezone !== residual.timezone) return false;
    const desde = Date.parse(v.desde || '');
    const hasta = v.hasta === null ? Infinity : Date.parse(v.hasta || '');
    // Un día parcial no puede prorratearse a partir de un total diario.
    return Number.isFinite(desde) && hasta > desde && inicio >= desde && fin <= hasta;
  });
}

function filtrarResidualesAutorizados({ residuales = [], ...consentimiento }) {
  return residuales.filter((residual) => diaAutorizadoHealth({ ...consentimiento, residual }));
}

module.exports = { VERSION_CONSENTIMIENTO, diaAutorizadoHealth, filtrarResidualesAutorizados };
