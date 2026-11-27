// Pure, local playback math. No user progress, network or persistence dependencies.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const ease = t => { const n = clamp(t, 0, 1); return n * n * (3 - 2 * n); };
const mezclar = (a, b, t) => a + (b - a) * t;
const diferenciaAngular = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const SEGUNDOS_FINAL = 2;

function duracionDemo(segundos = 12) {
  const n = Number(segundos);
  return Number.isFinite(n) && n > 0 ? clamp(n, 1, 120) : 12;
}

function estadoDemo(segundos, duracion, distanciaKm) {
  const viaje = duracionDemo(duracion);
  const tiempo = Math.max(0, Number(segundos) || 0);
  const t = clamp(tiempo / viaje, 0, 1);
  return {
    t,
    km: Math.max(0, Number(distanciaKm) || 0) * ease(t),
    llegada: ease((tiempo - viaje) / SEGUNDOS_FINAL),
    enMeta: tiempo >= viaje,
    terminado: tiempo >= viaje + SEGUNDOS_FINAL,
  };
}

function controlDemo({ estado, punto, anterior, siguiente, camara, general, control, dt }) {
  const apertura = ease(estado.t / .18);
  const base = general || { objetivo: camara.objetivo, zoom: camara.zoomGeneral ?? 1 };
  const rumbo = Math.atan2(-(siguiente[0] - anterior[0]), siguiente[2] - anterior[2]);
  const azimutRuta = rumbo - camara.azimutGrados * Math.PI / 180;
  const azimutBase = base.azimut || 0;
  const azimut = azimutBase + diferenciaAngular(azimutBase, azimutRuta) * apertura + .32 * estado.llegada;
  const zoom = clamp(mezclar((base.zoom ?? 1) * 1.08, .72, apertura) - .14 * estado.llegada, camara.zoomMin ?? .5, camara.zoomMax ?? 1.7);
  const elevacion = mezclar(base.elevacion || .12, (28 - camara.elevacionGrados) * Math.PI / 180, apertura);
  const objetivo = punto.map((v, i) => mezclar(base.objetivo[i], v, apertura));
  const destino = { azimut, zoom, elevacion, objetivo };
  if (!control) return destino;
  // Frame-rate independent damping and shortest-angle interpolation through bends.
  const f = 1 - Math.exp(-Math.max(0, dt) / .22);
  return {
    azimut: control.azimut + diferenciaAngular(control.azimut, azimut) * f,
    zoom: mezclar(control.zoom, zoom, f),
    elevacion: mezclar(control.elevacion, elevacion, f),
    objetivo: objetivo.map((v, i) => mezclar(control.objetivo[i], v, f)),
  };
}

module.exports = { duracionDemo, estadoDemo, controlDemo, SEGUNDOS_FINAL };
