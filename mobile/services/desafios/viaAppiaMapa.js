const historia = require('./viaAppia');
const CHALLENGE_ID = '54865c93-6b1b-4d2b-8324-71d705133998';
// Esquema de hitos: no representa la geometría de la vía antigua entre ciudades.
// Mantener explícito este estado hasta incorporar una traza y relieve propios.
const config = {
  titulo: 'Vía Appia · recorrido esquemático', distanciaFisica: 611, clima: 'mixto',
  segmentos: historia.checkpoints.map(cp => ({ km: cp.kmFisico, x: 40 + cp.kmFisico / 611 * 720, y: 130 })),
  checkpoints: historia.checkpoints.map(cp => ({ ...cp, x: 40 + cp.kmFisico / 611 * 720, y: 130 })),
  decoraciones: () => null,
};
const fichaPrueba = {
  id: CHALLENGE_ID, title: 'Vía Appia 611K', is_active: false, sport_type: 'multi',
  total_distance_km: 611, price_usd: 34.4, medal_code: '1001-ry-006',
  description: 'Un recorrido virtual de 611 km desde Roma hasta Brindisi, inspirado en la Appia Antica. Descubre 13 hitos entre el Lazio, Campania, Basilicata y Puglia mientras sumas actividades a tu propio ritmo.',
  historia: 'La vía Appia nació para conectar Roma con Capua y se prolongó después hacia el puerto de Brindisi. El recorrido de referencia de este desafío sigue la Appia Antica por Benevento, Venosa y Taranto.',
  modalidades: [{ tipo: 'run', label: 'Estándar', version: 'estandar', distancia_km: 611 }, { tipo: 'ride', label: 'Extendida', version: 'extendida', distancia_km: 1833 }],
  link_shopify: 'https://korva.run/products/desafio-virtual-611km-via-appia-roma',
  medal_image_url: null, imagen_portada: null, galeria: [], checkpoints: historia.checkpoints,
};
module.exports = { CHALLENGE_ID, config, fichaPrueba };
