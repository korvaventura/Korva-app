// Regla única para decidir si dos registros de la misma salida son "la misma"
// (Korva GPS vs Strava vs manual). Cada app mide un poco distinto, así que el
// margen crece con la distancia: 5 % con un mínimo de 0,3 km.
// 10 km → ±0,5 km · 21 km → ±1,05 km · 3 km → ±0,3 km.
const TOLERANCIA_MIN_KM = 0.3;
const TOLERANCIA_PROPORCION = 0.05;

function toleranciaDuplicadoKm(km) {
  const d = Math.max(0, Number(km) || 0);
  return Math.round(Math.max(TOLERANCIA_MIN_KM, d * TOLERANCIA_PROPORCION) * 1000) / 1000;
}

function rangoDuplicadoKm(km) {
  const d = Math.max(0, Number(km) || 0);
  const t = toleranciaDuplicadoKm(d);
  const r = (v) => Math.round(v * 1000) / 1000;
  return { min: r(Math.max(0, d - t)), max: r(d + t) };
}

module.exports = { TOLERANCIA_MIN_KM, TOLERANCIA_PROPORCION, toleranciaDuplicadoKm, rangoDuplicadoKm };
