const GPS_ARCHIVE_MAX = 100;

const construirArchivoGps = (archivoActual, sesion, confirmacion = {}, confirmadaAt = new Date().toISOString()) => {
  if (!sesion?.sessionId || sesion.estado !== 'finalizada' || !Array.isArray(sesion.puntos)) {
    throw new Error('sesion_gps_no_archivable');
  }
  const archivo = Array.isArray(archivoActual) ? archivoActual : [];
  const registro = {
    ...sesion,
    confirmadaAt,
    actividadId: confirmacion.actividadId || confirmacion.id || null,
    idempotente: !!confirmacion.idempotente,
    rutaGuardadaServidor: confirmacion.ruta_guardada === true,
  };
  return [registro, ...archivo.filter((item) => item?.sessionId !== sesion.sessionId)].slice(0, GPS_ARCHIVE_MAX);
};

module.exports = { GPS_ARCHIVE_MAX, construirArchivoGps };
