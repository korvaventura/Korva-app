// Escena "Camino de Santiago — 775 km" — Camino Francés, Roncesvalles → Obradoiro.
// Solo datos: usa el mismo motor que Fin del Mundo (terrenoCore + construirMundo).
//
// Tres capas que no se mezclan:
//   1. Geografía real: el trazado (caminoSantiago.trazado.js) y las coordenadas de
//      localidades y pasos, verificados contra fuentes (ver docs/mapa-3d-camino-santiago.md).
//   2. Kilómetros virtuales: los 775 km del desafío se fijan con 13 anclas sobre ese
//      trazado; entre anclas el avance es proporcional a la distancia geográfica.
//   3. Representación artística: el relieve, los colores por región y la exageración
//      vertical son una interpretación (no un modelo digital de elevaciones).

const trazado = require('./caminoSantiago.trazado');

const DISTANCIA_KM = 775;

// Km virtuales provisorios (adaptados de una referencia de etapas). Cambiar acá
// mueve el progreso sobre el mapa sin tocar la geografía.
const HITOS_KM = {
  roncesvalles: 0,
  pamplona: 44,
  puente_la_reina: 69,
  irache: 94,
  santo_domingo: 194,
  burgos: 269,
  fromista: 337,
  leon: 456,
  astorga: 507,
  ponferrada: 562,
  o_cebreiro: 615,
  portomarin: 679,
  santiago: 775,
};

const KM_POR_GRADO = 111.2;
const LAT_REF = 42.7;
const distanciaGeo = (a, b) => Math.hypot(
  (a[0] - b[0]) * KM_POR_GRADO,
  (a[1] - b[1]) * KM_POR_GRADO * Math.cos((LAT_REF * Math.PI) / 180),
);

const kmPorIndice = new Map(Object.entries(trazado.anclas).map(([id, i]) => [i, HITOS_KM[id]]));
// Llegada: el monumento de la catedral se dibuja en escala simbólica (ver
// `monumentoLlegada`), así que en los últimos km el trazado rodea su flanco
// norte —como el Camino real por la Azabachería— y entra a la plaza desde el
// norte. Es la única desviación artística del trazado y se limita a ese radio.
const OBRADOIRO = trazado.puntos[trazado.puntos.length - 1];
const ANCHO_MONUMENTO_KM = 7;
const RADIO_LLEGADA_KM = ANCHO_MONUMENTO_KM * 1.6;
const desplazar = ([lat, lon], esteKm, norteKm) => [
  Number((lat + norteKm / KM_POR_GRADO).toFixed(5)),
  Number((lon + esteKm / (KM_POR_GRADO * Math.cos((lat * Math.PI) / 180))).toFixed(5)),
];
const W = ANCHO_MONUMENTO_KM;
const rodeoLlegada = [[1.25 * W, 0.8 * W], [0.55 * W, 0.85 * W], [-0.05 * W, 0.7 * W], [-0.3 * W, 0.35 * W]]
  .map(([e, n]) => desplazar(OBRADOIRO, e, n));
const ultimoReal = trazado.puntos.findIndex((p, i) => i > 0 && distanciaGeo(p, OBRADOIRO) < RADIO_LLEGADA_KM);
const puntosVisuales = [...trazado.puntos.slice(0, ultimoReal), ...rodeoLlegada, OBRADOIRO];
const indiceVisual = (i) => (i === trazado.puntos.length - 1 ? puntosVisuales.length - 1 : i);
const kmPorIndiceVisual = new Map([...kmPorIndice.entries()].map(([i, km]) => [indiceVisual(i), km]));
const ruta = puntosVisuales.map(([lat, lon], i) => (
  kmPorIndiceVisual.has(i) ? { lat, lon, km: kmPorIndiceVisual.get(i) } : { lat, lon }
));

// Distancia geográfica acumulada y conversión a km virtuales (misma regla que el motor).
const acumulado = [0];
for (let i = 1; i < trazado.puntos.length; i += 1) {
  acumulado.push(acumulado[i - 1] + distanciaGeo(trazado.puntos[i - 1], trazado.puntos[i]));
}
const anclasOrdenadas = [...kmPorIndice.entries()].sort((a, b) => a[0] - b[0]);
function kmVirtualDeIndice(i) {
  for (let k = 1; k < anclasOrdenadas.length; k += 1) {
    const [i0, km0] = anclasOrdenadas[k - 1];
    const [i1, km1] = anclasOrdenadas[k];
    if (i <= i1) return km0 + ((km1 - km0) * (acumulado[i] - acumulado[i0])) / ((acumulado[i1] - acumulado[i0]) || 1);
  }
  return DISTANCIA_KM;
}
function kmVirtualDe(lat, lon) {
  let mejor = 0; let d = Infinity;
  trazado.puntos.forEach((p, i) => { const e = distanciaGeo(p, [lat, lon]); if (e < d) { d = e; mejor = i; } });
  return kmVirtualDeIndice(mejor);
}

const caminoSantiago = {
  id: 'camino_santiago',
  distanciaKm: DISTANCIA_KM,
  presentacion: {
    eyebrow: 'CAMINO FRANCÉS · 775 KM',
    titulo: 'Roncesvalles → Santiago',
  },
  // Cinco tramos de paisaje: la cabecera muestra en qué región va el peregrino.
  // Mismo mecanismo que Islandia (etiquetas sólo del seleccionado, próximo y último).
  capitulos: [
    { numero: 1, id: 'navarra', nombre: 'Bosques y montes de Navarra', hastaKm: 94 },
    { numero: 2, id: 'rioja', nombre: 'Viñedos de La Rioja', hastaKm: 230 },
    { numero: 3, id: 'meseta', nombre: 'La Meseta castellana', hastaKm: 507 },
    { numero: 4, id: 'montes_leon', nombre: 'Montes de León y El Bierzo', hastaKm: 615 },
    { numero: 5, id: 'galicia', nombre: 'Galicia verde', hastaKm: DISTANCIA_KM },
  ],
  semilla: 1211,
  centro: { lat: 42.7, lon: -4.9 },
  // Zona fina alrededor del camino (x este, z sur, km); el mundo sigue ~600 km más (el borde nunca se ve).
  limitesKm: { minX: -330, maxX: 318, minZ: -78, maxZ: 118 },
  resolucionKm: 1.6,
  mundo: { extensionKm: 600, crecimiento: 1.2 },
  kmPorUnidad: 55,
  exageracion: 9,
  pasoRutaKm: 0.8,
  elevacionRutaUnidades: 0.022,
  alturaPinUnidades: 0.34,
  grosorRuta: 1.7,
  seguimientoPeso: 0.2,

  ruta,
  // El piso de la ruta sigue el relieve real (suavizado), no una tabla a mano.
  perfilRuta: 'terreno',
  pasoPerfilKm: 0.5,
  corredor: { planoKm: 0.8, paredM: 60, potencia: 1.3, suavizadoM: 40, suavizadoPerfilKm: 1.5 },

  // Mar (nivel 0) y Encoro de Belesar vienen del relieve real (IGN + Natural
  // Earth), adjuntado al hornear por scripts/mapa3d/caminoSantiago.relieveReal.js.
  mar: { nivelM: 0 },
  aguas: [],

  // Relieve: al hornear se reemplaza por el MDT500 del IGN (relieve.real). Las
  // fajas y picos de abajo quedan sólo como respaldo si se horneara sin él.
  relieve: {
    colinas: { base: 230, amp: 260 },
    fajas: [
      // Gran faja interior: el escalón de la Meseta (~850 m) entre el Ebro y Galicia.
      {
        centroZ: 6, semiAncho: 70, borde: 22, escalaX: 0.035, escalaZ: 0.05, base: 0.86, desfase: 4.1,
        // Calibrada para quedar ~50 m sobre el perfil del camino: valles anchos, sin zanjas.
        amplitudPorX: [[-360, 160], [-298, 330], [-255, 530], [-222, 470], [-205, 540], [-175, 760], [-156, 590], [-139, 590], [-115, 760], [-95, 960], [-55, 940], [-11, 930], [40, 920], [100, 950], [140, 860], [159, 730], [177, 570], [200, 470], [234, 520], [252, 450], [266, 540], [300, 760], [420, 800]],
      },
      // Cordillera Cantábrica: muro norte, más alto hacia Picos de Europa.
      {
        centroZ: -66, semiAncho: 18, borde: 10, escalaX: 0.03, escalaZ: 0.08, base: 0.22, desfase: 13.7,
        amplitudPorX: [[-420, 900], [-200, 1700], [-100, 2000], [0, 2400], [60, 2300], [140, 1300], [230, 1100], [330, 1300]],
      },
      // Pirineos: al norte y este de Roncesvalles.
      {
        centroZ: -32, semiAncho: 16, borde: 10, escalaX: 0.045, escalaZ: 0.09, base: 0.2, desfase: 21.3,
        amplitudPorX: [[240, 0], [275, 900], [300, 1500], [360, 2100], [520, 2600]],
      },
      // Sistema Ibérico (Sierra de la Demanda) al sur de La Rioja y Burgos.
      {
        centroZ: 62, semiAncho: 11, borde: 9, escalaX: 0.05, escalaZ: 0.1, base: 0.3, desfase: 30.2,
        amplitudPorX: [[95, 0], [125, 1300], [155, 1900], [185, 1600], [225, 900], [260, 0]],
      },
    ],
    picos: [
      // Montes de León: cordón N-S con el Teleno y la Cruz de Ferro (1.500 m).
      { id: 'montes_leon', lat: 42.45, lon: -6.38, alturaM: 1650, radioKm: 34, agudeza: 1.25, elongacion: 0.42, suavizadoM: 220 },
      { id: 'teleno', lat: 42.35, lon: -6.39, alturaM: 2190, radioKm: 16, agudeza: 1.6, suavizadoM: 200 },
      // Sierras de Ancares y O Courel: la puerta de Galicia en O Cebreiro (1.300 m).
      { id: 'ancares', lat: 42.78, lon: -6.95, alturaM: 1650, radioKm: 34, agudeza: 1.3, elongacion: 0.45, suavizadoM: 220 },
      { id: 'courel', lat: 42.58, lon: -7.12, alturaM: 1500, radioKm: 22, agudeza: 1.4, elongacion: 0.6 },
      // Montes de Oca, entre Belorado y Burgos.
      { id: 'oca', lat: 42.36, lon: -3.38, alturaM: 1150, radioKm: 18, agudeza: 1.2, elongacion: 0.7 },
      // Montejurra, sobre Irache, y la Sierra del Perdón al sur de Pamplona.
      { id: 'montejurra', lat: 42.6311, lon: -2.0447, alturaM: 1040, radioKm: 7, agudeza: 1.5 },
      { id: 'perdon', lat: 42.735, lon: -1.74, alturaM: 1030, radioKm: 9, agudeza: 1.3, elongacion: 1.9 },
      // Urbasa-Andía, macizo al norte de Estella.
      { id: 'urbasa', lat: 42.83, lon: -2.12, alturaM: 1200, radioKm: 18, agudeza: 1.1, elongacion: 1.6 },
      // Picos de Europa en el horizonte norte.
      { id: 'picos_europa', lat: 43.19, lon: -4.85, alturaM: 2650, radioKm: 22, agudeza: 1.5 },
    ],
  },

  // Pisos base (se ajustan por región en `biomas`).
  pisos: {
    inicioBosqueM: 700,
    bosqueAlSurZ: 9999, // sin bosque "por latitud": sólo por altura y región
    lineaArbolesM: 1650,
    lineaNieveM: 2050,
    nieveBajaHaciaSurM: 0,
    intensidadOtono: 0.35,
  },

  // sRGB. Fin de tarde de verano, coherente con el navy de Korva.
  paleta: {
    estepa: '#8C8450',
    turba: '#76694A',
    bosque: '#244330',
    bosqueClaro: '#365C3A',
    lengaOtono: '#8B5A2B',
    pedrero: '#7E7468',
    roca: '#5E5852',
    nieve: '#EEF2F5',
    costa: '#9A9078',
    vega: '#7F8A4E',
    fondoSomero: '#2E7186',
    fondoProfundo: '#0C2A40',
    sombra: '#45508A',
  },

  // Regiones de paisaje a lo largo del eje este-oeste (x en km). El motor mezcla
  // paleta y pisos entre regiones vecinas; `parcelas` dibuja el mosaico agrícola.
  biomas: [
    { x: 300, transicionKm: 40, pisos: { inicioBosqueM: 380, lineaArbolesM: 1750 },
      paleta: { estepa: '#6E7C45', vega: '#6F8A48', bosque: '#1F3F2B', bosqueClaro: '#2F5A35' } },
    { x: 190, transicionKm: 45, pisos: { inicioBosqueM: 900 },
      paleta: { estepa: '#7C6A44', turba: '#6A4E3A', vega: '#7D7A3E' },
      parcelas: { colores: ['#6F5B3A', '#5E6A33', '#7A4E3B', '#857246', '#4F5E30'], tamanoKm: 2.6, mezcla: 0.75, orientacion: 0.35 } },
    { x: 20, transicionKm: 70, pisos: { inicioBosqueM: 1250 },
      paleta: { estepa: '#B79A5A', turba: '#9C7F4A', vega: '#8F8A4E' },
      parcelas: { colores: ['#C9A85E', '#A98B4E', '#8C7A45', '#B58F55', '#7D7A48'], tamanoKm: 4.2, mezcla: 0.85, orientacion: -0.2 } },
    { x: -125, transicionKm: 30, pisos: { inicioBosqueM: 650, lineaArbolesM: 1450 },
      paleta: { estepa: '#7A7048', pedrero: '#7B6A5E', bosque: '#2B4430', lengaOtono: '#6E4A6A' } },
    { x: -230, transicionKm: 35, pisos: { inicioBosqueM: 120, lineaArbolesM: 1500 },
      paleta: { estepa: '#4F7A3E', turba: '#4A6A38', vega: '#5E8C45', bosque: '#1C3E28', bosqueClaro: '#2C5A33' },
      parcelas: { colores: ['#5B8A43', '#4C7A3A', '#6A9550', '#3F6B35'], tamanoKm: 2.2, mezcla: 0.5, orientacion: 0.6 } },
  ],

  luz: {
    // Sol bajo del oeste-suroeste: los peregrinos caminan hacia el atardecer.
    solDir: [-0.78, 0.42, 0.46],
    alcanceSombraKm: 70,
    radioOclusionKm: 6,
    sombraMin: 0.5,
  },

  // Vista general desde el sureste: el camino cruza la pantalla en diagonal,
  // Roncesvalles abajo a la derecha y Santiago arriba a la izquierda, con el
  // Atlántico en el horizonte. Aprovecha el alto del teléfono sin acortar tanto.
  camara: { objetivo: [0.8, 0.0, -0.85], elevacionGrados: 46, azimutGrados: 122, distancia: 11.2, fov: 40, aspectoReferencia: 0.82 },
  atmosfera: {
    horizonte: '#B8B6C2',
    resplandor: '#F2B37E',
    medio: '#6286AE',
    cenit: '#1A3557',
    cerca: 1.5,
    lejos: 3.4,
  },
  agua: { color: '#2F6C88' },

  // Monumento de llegada: la fachada del Obradoiro en escala simbólica
  // (ver documento: no es la escala real de la catedral).
  // lat/lon = Praza do Obradoiro (km 0); la fachada mira al oeste, hacia la plaza.
  monumentoLlegada: { lat: 42.8806, lon: -8.5458, orientacionGrados: 270, anchoKm: ANCHO_MONUMENTO_KM },

  etiquetas: [
    { id: 'oceano', texto: 'OCÉANO ATLÁNTICO', lat: 42.75, lon: -9.75, tipo: 'agua' },
    { id: 'cantabrico', texto: 'MAR CANTÁBRICO', lat: 43.9, lon: -5.2, tipo: 'region' },
    { id: 'pirineos', texto: 'PIRINEOS', lat: 43.0, lon: -0.9, tipo: 'region' },
    { id: 'meseta', texto: 'MESETA', lat: 42.2, lon: -4.7, tipo: 'region' },
    { id: 'galicia', texto: 'GALICIA', lat: 42.6, lon: -7.9, tipo: 'region' },
  ],
};

// Utilidad para pruebas y herramientas; no enumerable para no viajar con la escena.
Object.defineProperty(caminoSantiago, 'kmVirtualDe', { value: kmVirtualDe, enumerable: false });
module.exports = caminoSantiago;
