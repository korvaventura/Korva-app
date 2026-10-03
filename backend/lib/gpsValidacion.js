const CONFIG = Object.freeze({
  maxAccuracyM: 35,
  minSegmentM: 3,
  maxSpeedMps: 15,
  maxGapMs: 120000,
  maxPoints: 50000,
});

const rad = (g) => (g * Math.PI) / 180;
const haversineM = (a, b) => {
  const R = 6371000;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

const normalizar = (p) => {
  const latitude = Number(p?.latitude);
  const longitude = Number(p?.longitude);
  const timestamp = Number(p?.timestamp);
  const accuracy = p?.accuracy == null ? null : Number(p.accuracy);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0)) return null;
  return { latitude, longitude, timestamp, accuracy };
};

const calcularDistanciaGpsServidor = (puntos) => {
  if (!Array.isArray(puntos) || puntos.length < 2 || puntos.length > CONFIG.maxPoints) {
    return { ok: false, error: 'puntos_invalidos', distanciaKm: 0, aceptados: 0 };
  }

  let ultimo = null;
  let distanciaM = 0;
  let aceptados = 0;
  for (const entrada of puntos) {
    const p = normalizar(entrada);
    if (!p || (p.accuracy != null && p.accuracy > CONFIG.maxAccuracyM)) continue;
    if (!ultimo) {
      ultimo = p;
      aceptados++;
      continue;
    }
    const dt = p.timestamp - ultimo.timestamp;
    if (dt <= 0 || dt > CONFIG.maxGapMs) {
      ultimo = p;
      aceptados++;
      continue;
    }
    const d = haversineM(ultimo, p);
    if (d < CONFIG.minSegmentM) continue;
    if (d / (dt / 1000) > CONFIG.maxSpeedMps) continue;
    distanciaM += d;
    ultimo = p;
    aceptados++;
  }

  return {
    ok: aceptados >= 2 && distanciaM >= 10,
    error: aceptados >= 2 && distanciaM >= 10 ? null : 'recorrido_insuficiente',
    distanciaKm: Number((distanciaM / 1000).toFixed(4)),
    aceptados,
  };
};

module.exports = { CONFIG, calcularDistanciaGpsServidor };
