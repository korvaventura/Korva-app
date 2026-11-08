// Respaldo 2D de la misma traza Itiner-e y los mismos km virtuales que la escena 3D.
const historia = require('./viaAppia');
const trazado = require('../mapa3d/escenas/viaAppia.recorrido');

const CHALLENGE_ID = '54865c93-6b1b-4d2b-8324-71d705133998';
const anclas = historia.checkpoints.map(cp => ({
  indice: trazado.anclas[cp.id], kmReal: trazado.kmRealAnclas[cp.id], km: cp.kmFisico,
}));
const proyectar = (lat, lon) => ({
  x: 40 + (lon - 12.45) / 5.55 * 720,
  y: 230 - (lat - 40.4) / 1.55 * 180,
});
// Km real acumulado sobre la traza (misma aproximación local que la escena).
const kmLon = 111.2 * Math.cos(41.2 * Math.PI / 180);
const kmReal = [0];
for (let i = 1; i < trazado.puntos.length; i++) {
  const [a, b] = [trazado.puntos[i - 1], trazado.puntos[i]];
  kmReal.push(kmReal[i - 1] + Math.hypot((b[0] - a[0]) * 111.2, (b[1] - a[1]) * kmLon));
}
function kmVirtual(indice) {
  const exacta = anclas.find(a => a.indice === indice);
  if (exacta) return exacta.km;
  const siguiente = anclas.findIndex(a => a.indice >= indice);
  if (siguiente <= 0) return siguiente === 0 ? 0 : historia.distanciaKm;
  const a = anclas[siguiente - 1], b = anclas[siguiente];
  return a.km + (b.km - a.km) * (kmReal[indice] - kmReal[a.indice]) / (kmReal[b.indice] - kmReal[a.indice]);
}
const indices = new Set(anclas.map(a => a.indice));
for (let i = 0; i < trazado.puntos.length; i += 12) indices.add(i);
const config = {
  titulo: 'Vía Appia · Brindisi → Roma',
  distanciaFisica: historia.distanciaKm,
  clima: 'mixto',
  segmentos: [...indices].sort((a, b) => a - b).map(i => ({ km: kmVirtual(i), ...proyectar(...trazado.puntos[i]) })),
  checkpoints: historia.checkpoints.map(cp => ({ ...cp, ...proyectar(...trazado.puntos[trazado.anclas[cp.id]]) })),
  decoraciones: () => null,
};
const fichaPrueba = {
  id: CHALLENGE_ID, title: 'Vía Appia 611K', is_active: false, sport_type: 'multi',
  total_distance_km: 611, price_usd: 34.4, medal_code: '1001-ry-006',
  description: 'Un recorrido virtual de 611 km desde Brindisi hasta Roma, inspirado en la Appia Antica. Descubre 13 hitos entre Puglia, Basilicata, Campania y el Lazio mientras sumas actividades a tu propio ritmo.',
  historia: 'La vía Appia nació para conectar Roma con Capua y se prolongó después hacia el puerto de Brindisi. En este desafío la recorremos en sentido inverso, por Taranto, Venosa y Benevento hasta Roma. La traza alcanza Porta Capena; el Coliseo representa la llegada a la ciudad. Sus 611 km se acumulan actividad a actividad, sin fecha límite.',
  modalidades: [{ tipo: 'run', label: 'Estándar', version: 'estandar', distancia_km: 611 }],
  link_shopify: 'https://korva.run/products/desafio-virtual-611km-via-appia-roma',
  medal_image_url: null, imagen_portada: null, galeria: [], checkpoints: historia.checkpoints,
};
module.exports = { CHALLENGE_ID, config, fichaPrueba };
