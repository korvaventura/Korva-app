// Núcleo puro del rastreador GPS de Korva.
// No accede a ubicación, red ni Supabase: recibe puntos y decide qué distancia aceptar.
// Esto permite probar la lógica antes de conectar expo-location.

const GPS_CONFIG = Object.freeze({
  maxAccuracyM: 35,
  minSegmentM: 3,
  maxSpeedMps: 15,
  maxGapMs: 120000,
});

const rad = (grados) => (grados * Math.PI) / 180;

const distanciaHaversineM = (a, b) => {
  if (!a || !b) return 0;
  const R = 6371000;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

const numeroFinito = (v) => typeof v === 'number' && Number.isFinite(v);

const normalizarPuntoGps = (punto) => {
  if (!punto) return null;
  const latitude = Number(punto.latitude);
  const longitude = Number(punto.longitude);
  const accuracy = punto.accuracy == null ? null : Number(punto.accuracy);
  const timestamp = Number(punto.timestamp);

  if (!numeroFinito(latitude) || latitude < -90 || latitude > 90) return null;
  if (!numeroFinito(longitude) || longitude < -180 || longitude > 180) return null;
  if (!numeroFinito(timestamp) || timestamp <= 0) return null;
  if (accuracy != null && (!numeroFinito(accuracy) || accuracy < 0)) return null;

  return { latitude, longitude, accuracy, timestamp };
};

const generarSessionId = (ahoraMs = Date.now()) =>
  `${Math.trunc(ahoraMs).toString(36)}_${Math.random().toString(36).slice(2, 12)}`;

const crearSesionGps = ({ deporte = 'run', ahoraMs = Date.now(), sessionId } = {}) => ({
  sessionId: sessionId || generarSessionId(ahoraMs),
  estado: 'grabando',
  deporte,
  iniciadaAt: ahoraMs,
  finalizadaAt: null,
  distanciaM: 0,
  duracionActivaMs: 0,
  ultimoTickMs: ahoraMs,
  tramoActivoDesdeMs: ahoraMs,
  ultimoPunto: null,
  puntos: [],
  descartados: { precision: 0, salto: 0, minimo: 0, invalido: 0 },
});

const tickSesionGps = (sesion, ahoraMs = Date.now()) => {
  if (!sesion || sesion.estado !== 'grabando') return sesion;
  const delta = Math.max(0, Math.min(ahoraMs - sesion.ultimoTickMs, GPS_CONFIG.maxGapMs));
  return { ...sesion, duracionActivaMs: sesion.duracionActivaMs + delta, ultimoTickMs: ahoraMs };
};

const pausarSesionGps = (sesion, ahoraMs = Date.now()) => {
  if (!sesion || sesion.estado !== 'grabando') return sesion;
  const desde = Number(sesion.tramoActivoDesdeMs || sesion.ultimoTickMs || ahoraMs);
  const delta = Math.max(0, ahoraMs - desde);
  return {
    ...sesion,
    estado: 'pausada',
    duracionActivaMs: sesion.duracionActivaMs + delta,
    ultimoTickMs: ahoraMs,
    tramoActivoDesdeMs: null,
    ultimoPunto: null,
  };
};

const reanudarSesionGps = (sesion, ahoraMs = Date.now()) => {
  if (!sesion || sesion.estado !== 'pausada') return sesion;
  return {
    ...sesion,
    estado: 'grabando',
    ultimoTickMs: ahoraMs,
    tramoActivoDesdeMs: ahoraMs,
    ultimoPunto: null,
  };
};

const finalizarSesionGps = (sesion, ahoraMs = Date.now()) => {
  if (!sesion || sesion.estado === 'finalizada') return sesion;
  const actualizada = sesion.estado === 'grabando'
    ? pausarSesionGps(sesion, ahoraMs)
    : sesion;
  return {
    ...actualizada,
    estado: 'finalizada',
    finalizadaAt: ahoraMs,
    tramoActivoDesdeMs: null,
    ultimoPunto: null,
  };
};

const agregarPuntoGps = (sesion, entrada, config = GPS_CONFIG) => {
  if (!sesion || sesion.estado !== 'grabando') return sesion;
  const punto = normalizarPuntoGps(entrada);
  if (!punto) {
    return { ...sesion, descartados: { ...sesion.descartados, invalido: sesion.descartados.invalido + 1 } };
  }
  if (punto.accuracy != null && punto.accuracy > config.maxAccuracyM) {
    return { ...sesion, descartados: { ...sesion.descartados, precision: sesion.descartados.precision + 1 } };
  }

  if (!sesion.ultimoPunto) {
    return { ...sesion, ultimoPunto: punto, puntos: [...sesion.puntos, punto] };
  }

  const dtMs = punto.timestamp - sesion.ultimoPunto.timestamp;
  if (dtMs <= 0 || dtMs > config.maxGapMs) {
    return {
      ...sesion,
      ultimoPunto: punto,
      puntos: [...sesion.puntos, punto],
      descartados: { ...sesion.descartados, salto: sesion.descartados.salto + 1 },
    };
  }

  const distanciaM = distanciaHaversineM(sesion.ultimoPunto, punto);
  if (distanciaM < config.minSegmentM) {
    return { ...sesion, descartados: { ...sesion.descartados, minimo: sesion.descartados.minimo + 1 } };
  }

  const velocidadMps = distanciaM / (dtMs / 1000);
  if (velocidadMps > config.maxSpeedMps) {
    return { ...sesion, descartados: { ...sesion.descartados, salto: sesion.descartados.salto + 1 } };
  }

  return {
    ...sesion,
    distanciaM: sesion.distanciaM + distanciaM,
    ultimoPunto: punto,
    puntos: [...sesion.puntos, punto],
  };
};

const resumenSesionGps = (sesion) => ({
  distancia_km: Number(((sesion?.distanciaM || 0) / 1000).toFixed(4)),
  duration_seconds: Math.round((sesion?.duracionActivaMs || 0) / 1000),
  sport_type: sesion?.deporte || 'run',
  puntos: sesion?.puntos?.length || 0,
});


module.exports = {
  GPS_CONFIG,
  generarSessionId,
  distanciaHaversineM,
  normalizarPuntoGps,
  crearSesionGps,
  tickSesionGps,
  pausarSesionGps,
  reanudarSesionGps,
  finalizarSesionGps,
  agregarPuntoGps,
  resumenSesionGps,
};
