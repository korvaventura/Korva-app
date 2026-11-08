// Respaldo 2D del mismo trazado y los mismos km virtuales que el mapa aprobado.
const historia = require('./caminoSantiago');
const trazado = require('../mapa3d/escenas/caminoSantiago.trazado');

const CHALLENGE_ID = 'e6424df6-3949-4503-8af0-69408b4b34a2';
const anclas = historia.checkpoints.map(cp => ({
  indice: trazado.anclas[cp.id], kmReal: trazado.kmRealAnclas[cp.id], km: cp.kmFisico,
}));
const proyectar = (lat, lon) => ({
  x: 40 + (lon + 8.65) / 7.5 * 720,
  y: 220 - (lat - 42.2) / 0.9 * 180,
});
function kmVirtual(indice) {
  const exacta = anclas.find(a => a.indice === indice);
  if (exacta) return exacta.km;
  const siguiente = anclas.findIndex(a => a.indice >= indice);
  if (siguiente === 0) return 0;
  if (siguiente === -1) return historia.distanciaKm;
  const a = anclas[siguiente - 1], b = anclas[siguiente];
  return a.km + (b.km - a.km) * (trazado.kmReal[indice] - a.kmReal) / (b.kmReal - a.kmReal);
}
const indices = new Set(anclas.map(a => a.indice));
for (let i = 0; i < trazado.puntos.length; i += 20) indices.add(i);
const config = {
  titulo: 'Camino de Santiago · Camino Francés',
  distanciaFisica: historia.distanciaKm,
  clima: 'mixto',
  segmentos: [...indices].sort((a, b) => a - b).map(i => ({
    km: kmVirtual(i), ...proyectar(...trazado.puntos[i]),
  })),
  checkpoints: historia.checkpoints.map(cp => ({ ...cp, ...proyectar(cp.lat, cp.lon) })),
  decoraciones: () => null,
};
module.exports = { CHALLENGE_ID, config };
