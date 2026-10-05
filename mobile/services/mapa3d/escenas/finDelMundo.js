// Escena "Fin del Mundo" — RN3 Tolhuin -> Ushuaia, Tierra del Fuego.
// Geografía estilizada pero anclada en coordenadas reales (lat/lon WGS84):
// Lago Fagnano al norte, cordillera fueguina en el medio, Canal Beagle al sur.
// Las alturas están exageradas para lectura en pantalla de teléfono.

const finDelMundo = {
  id: 'fin_del_mundo',
  distanciaKm: 103,
  presentacion: {
    eyebrow: 'TIERRA DEL FUEGO · RN3',
    titulo: 'Tolhuin → Ushuaia',
  },
  semilla: 2026,
  centro: { lat: -54.70, lon: -67.75 },
  limitesKm: { minX: -43, maxX: 40, minZ: -26, maxZ: 27 },
  resolucionKm: 0.36,
  kmPorUnidad: 10,
  exageracion: 4.6,
  pasoRutaKm: 0.25,
  terrenoVisual: {
    corredorKm: 22,
    bordeKm: 7,
    variacionKm: 4.5,
    frecuencia: 0.095,
  },

  // Trazado conceptual de la RN3. `km` = ancla del desafío (coincide con checkpoints).
  ruta: [
    { lat: -54.511, lon: -67.196, km: 0 }, // Tolhuin
    { lat: -54.533, lon: -67.214 },
    { lat: -54.552, lon: -67.248 },
    { lat: -54.566, lon: -67.300 },
    { lat: -54.582, lon: -67.370 },
    { lat: -54.592, lon: -67.440, km: 20 }, // Lago Fagnano (orilla sur)
    { lat: -54.603, lon: -67.530 },
    { lat: -54.613, lon: -67.620 },
    { lat: -54.625, lon: -67.700 },
    { lat: -54.640, lon: -67.738 },
    { lat: -54.649, lon: -67.772 }, // Lago Escondido
    { lat: -54.656, lon: -67.800 },
    { lat: -54.662, lon: -67.786 }, // curvas del Garibaldi
    { lat: -54.669, lon: -67.812 },
    { lat: -54.675, lon: -67.800 },
    { lat: -54.682, lon: -67.840, km: 45 }, // Paso Garibaldi (430 m)
    { lat: -54.693, lon: -67.870 },
    { lat: -54.705, lon: -67.910 },
    { lat: -54.716, lon: -67.960 },
    { lat: -54.724, lon: -68.020 }, // Valle de Tierra Mayor
    { lat: -54.733, lon: -68.075 },
    { lat: -54.752, lon: -68.120 },
    { lat: -54.778, lon: -68.155, km: 80 }, // al pie del Monte Olivia
    { lat: -54.793, lon: -68.200 },
    { lat: -54.803, lon: -68.250 },
    { lat: -54.807, lon: -68.305, km: 103 }, // Ushuaia
  ],

  // Altura del piso del valle por km (m). El paso es un collado real, no un pico.
  perfilRuta: [
    [0, 35], [8, 45], [20, 42], [30, 80], [37, 150], [40, 155],
    [45, 430], [50, 340], [58, 270], [68, 230], [80, 150], [92, 60], [103, 16],
  ],
  corredor: { planoKm: 0.7, paredM: 230, potencia: 1.7, suavizadoM: 90 },

  // Cuerpos de agua: eje [lat, lon, semiancho km].
  aguas: [
    {
      id: 'fagnano', nombre: 'LAGO FAGNANO', nivelM: 25, profundidadM: 140, taludKm: 2.2, orillaKm: 2.4, irregularidadKm: 0.7,
      eje: [
        [-54.522, -67.240, 0.5], [-54.533, -67.300, 1.45], [-54.548, -67.400, 2.4],
        [-54.556, -67.550, 3.0], [-54.565, -67.750, 3.3], [-54.575, -68.000, 3.5],
        [-54.585, -68.300, 3.4], [-54.590, -68.550, 3.2],
      ],
    },
    {
      id: 'escondido', nombre: 'Lago Escondido', nivelM: 130, profundidadM: 70, taludKm: 0.6, orillaKm: 1.0, irregularidadKm: 0.2,
      eje: [[-54.626, -67.800, 0.55], [-54.633, -67.778, 0.75], [-54.638, -67.760, 0.6]],
    },
    {
      id: 'beagle', nombre: 'CANAL BEAGLE', nivelM: 0, profundidadM: 220, taludKm: 2.5, orillaKm: 2.0, irregularidadKm: 0.9,
      eje: [
        [-54.858, -68.600, 3.2], [-54.852, -68.300, 3.0], [-54.858, -68.050, 3.2],
        [-54.870, -67.800, 3.6], [-54.880, -67.500, 3.8], [-54.890, -67.200, 4.0],
        [-54.898, -66.900, 4.2],
      ],
    },
    {
      id: 'bahia_ushuaia', nombre: null, nivelM: 0, profundidadM: 60, taludKm: 0.8, orillaKm: 1.0, irregularidadKm: 0.3,
      eje: [[-54.842, -68.285, 1.5], [-54.826, -68.295, 1.1], [-54.816, -68.305, 0.6]],
    },
  ],

  relieve: {
    colinas: { base: 55, amp: 170 },
    fajas: [
      // Cordillera fueguina (Sierras Alvear, Valdivieso, Martial): más alta al oeste.
      {
        centroZ: 1.5, semiAncho: 10, borde: 5.5, escalaX: 0.075, escalaZ: 0.17, base: 0.12, desfase: 3.7,
        amplitudPorX: [[-44, 1500], [-15, 1380], [0, 1150], [12, 820], [24, 520], [44, 330]],
      },
      // Sierra de Beauvoir, al norte del Fagnano: lomas boscosas.
      {
        centroZ: -23, semiAncho: 3.5, borde: 4, escalaX: 0.09, escalaZ: 0.2, base: 0.25, desfase: 11.2,
        amplitudPorX: [[-44, 520], [0, 420], [25, 260], [44, 160]],
      },
      // Isla Navarro (Chile), al sur del Beagle: cierra el canal.
      {
        centroZ: 28, semiAncho: 5.5, borde: 3.5, escalaX: 0.08, escalaZ: 0.18, base: 0.2, desfase: 21.4,
        amplitudPorX: [[-44, 950], [0, 800], [44, 600]],
      },
    ],
    // Masas reconocibles integradas al mismo campo de alturas (no son objetos).
    picos: [
      { id: 'monte_olivia', lat: -54.758, lon: -68.205, alturaM: 1326, radioKm: 4.6, agudeza: 1.35, elongacion: 1.1 },
      { id: 'cinco_hermanos', lat: -54.800, lon: -68.105, alturaM: 1250, radioKm: 5.0, agudeza: 1.2, elongacion: 0.6 },
      { id: 'martial', lat: -54.785, lon: -68.380, alturaM: 1180, radioKm: 5.5, agudeza: 1.15, elongacion: 0.7 },
      { id: 'alvear', lat: -54.662, lon: -67.930, alturaM: 1380, radioKm: 5.5, agudeza: 1.2, elongacion: 0.65 },
      { id: 'garibaldi_sur', lat: -54.708, lon: -67.800, alturaM: 1080, radioKm: 4.4, agudeza: 1.2, elongacion: 0.8 },
    ],
  },

  pisos: {
    inicioBosqueM: 170,
    bosqueAlSurZ: -10,
    lineaArbolesM: 600,
    lineaNieveM: 800,
    nieveBajaHaciaSurM: -2,
    intensidadOtono: 0.55,
  },

  // sRGB. Paleta de atardecer patagónico, coherente con el navy de Korva.
  paleta: {
    estepa: '#7C7A4E',
    turba: '#6A5638',
    bosque: '#22402C',
    bosqueClaro: '#34573A',
    lengaOtono: '#8E4A22',
    pedrero: '#80786C',
    roca: '#5C5650',
    nieve: '#F1F5F8',
    costa: '#8E8775',
    vega: '#7C7A4C',
    fondoSomero: '#2F7180',
    fondoProfundo: '#0B2638',
    sombra: '#41508A',
  },

  luz: {
    // Hacia el sol: noroeste y bajo (tarde austral). Rasante respecto de la cámara.
    solDir: [-0.62, 0.46, -0.64],
    alcanceSombraKm: 20,
    radioOclusionKm: 2.2,
    sombraMin: 0.42,
  },

  // Cámara desde el norte mirando al sur: Tolhuin cerca, Ushuaia y el Beagle al fondo.
  camara: { objetivo: [-0.35, 0.0, -0.5], elevacionGrados: 31, azimutGrados: 47, distancia: 12.0, fov: 30, aspectoReferencia: 0.9 },
  niebla: { color: '#456080', cerca: 0.95, lejos: 2.0 },
  cielo: { horizonte: '#6F86A0', resplandor: '#D9A57A', medio: '#1C3A5A', cenit: '#081523' },

  etiquetas: [
    { id: 'fagnano', texto: 'LAGO FAGNANO', lat: -54.565, lon: -67.80, tipo: 'agua' },
    { id: 'beagle', texto: 'CANAL BEAGLE', lat: -54.866, lon: -67.95, tipo: 'agua' },
    { id: 'chile', texto: 'ISLA NAVARRO · CHILE', lat: -54.935, lon: -68.15, tipo: 'region' },
  ],
};

module.exports = finDelMundo;
