// Escena "Expedición Monte Fuji" — 68 km, Yamanashi/Shizuoka, Japón.
// Solo datos: el motor (terrenoCore + construirMundo) es el mismo que Fin del Mundo.
//
// Recorrido (decisión de diseño sobre los checkpoints existentes):
//   Pagoda Chureito → Fujiyoshida → orilla norte del Yamanakako → Oshino Hakkai
//   → Kawaguchiko → costa norte hasta el Saiko → Aokigahara → Subaru Line
//   → 5ª Estación (2.305 m) → sendero Yoshida → Kengamine (3.776 m)
//   → descenso de arena de Gotemba → 5ª Estación de Gotemba (meta, km 68).
// Cruza el volcán en lugar de volver por el mismo camino.

const monteFuji = {
  id: 'monte_fuji',
  distanciaKm: 68,
  presentacion: {
    eyebrow: 'JAPÓN · FUJI-HAKONE-IZU',
    titulo: 'Fujiyoshida → Cima → Gotemba',
  },
  semilla: 3776,
  centro: { lat: 35.43, lon: 138.75 },
  limitesKm: { minX: -18, maxX: 16, minZ: -26, maxZ: 14 },
  resolucionKm: 0.22,
  mundo: { extensionKm: 150, crecimiento: 1.18 },
  kmPorUnidad: 4,
  exageracion: 2.3,
  pasoRutaKm: 0.12,
  elevacionRutaUnidades: 0.021,

  ruta: [
    { lat: 35.5012, lon: 138.8013, km: 0 }, // Pagoda Chureito
    { lat: 35.4890, lon: 138.8065 }, // Fujiyoshida
    { lat: 35.4700, lon: 138.8250 },
    { lat: 35.4460, lon: 138.8480 },
    { lat: 35.4320, lon: 138.8650 }, // Yamanakako, orilla norte
    { lat: 35.4335, lon: 138.8850 },
    { lat: 35.4440, lon: 138.8740 },
    { lat: 35.4597, lon: 138.8327, km: 18 }, // Oshino Hakkai
    { lat: 35.4780, lon: 138.8050 },
    { lat: 35.4990, lon: 138.7720, km: 22 }, // Kawaguchiko (orilla sureste)
    { lat: 35.5100, lon: 138.7970 },
    { lat: 35.5250, lon: 138.7700 }, // costa norte del Kawaguchiko
    { lat: 35.5310, lon: 138.7400 },
    { lat: 35.5300, lon: 138.7100 },
    { lat: 35.5150, lon: 138.6980 },
    { lat: 35.5070, lon: 138.7080 },
    { lat: 35.4880, lon: 138.6900 },
    { lat: 35.4890, lon: 138.6780, km: 40 }, // Lago Saiko (orilla sur)
    { lat: 35.4720, lon: 138.6600, km: 45 }, // Aokigahara
    { lat: 35.4620, lon: 138.7050 },
    { lat: 35.4450, lon: 138.7250 }, // Subaru Line
    { lat: 35.4250, lon: 138.7350 },
    { lat: 35.4100, lon: 138.7280 },
    { lat: 35.4000, lon: 138.7380 },
    { lat: 35.3950, lon: 138.7330, km: 54 }, // 5ª Estación (2.305 m)
    { lat: 35.3880, lon: 138.7400 }, // zigzags del sendero Yoshida
    { lat: 35.3830, lon: 138.7330 },
    { lat: 35.3780, lon: 138.7410 },
    { lat: 35.3730, lon: 138.7330 },
    { lat: 35.3680, lon: 138.7380 },
    { lat: 35.3650, lon: 138.7335 }, // borde norte del cráter
    { lat: 35.3630, lon: 138.7268 },
    { lat: 35.3606, lon: 138.7274, km: 61 }, // Kengamine 3.776 m
    { lat: 35.3580, lon: 138.7350 }, // descenso Gotemba
    { lat: 35.3520, lon: 138.7480 },
    { lat: 35.3470, lon: 138.7620 },
    { lat: 35.3420, lon: 138.7780 },
    { lat: 35.3370, lon: 138.7970, km: 68 }, // 5ª Estación de Gotemba
  ],

  // El piso de la ruta sigue el relieve (sube el volcán de verdad).
  perfilRuta: 'terreno',
  corredor: { planoKm: 0.18, paredM: 900, potencia: 1.3, suavizadoM: 25, suavizadoPerfilKm: 0.4 },

  aguas: [
    {
      id: 'kawaguchiko', nombre: 'Lago Kawaguchiko', nivelM: 830, profundidadM: 60, taludKm: 0.4, orillaKm: 0.8, irregularidadKm: 0.22,
      eje: [[35.522, 138.705, 0.45], [35.518, 138.735, 0.7], [35.512, 138.760, 0.6], [35.505, 138.785, 0.45]],
    },
    {
      id: 'saiko', nombre: 'Lago Saiko', nivelM: 900, profundidadM: 60, taludKm: 0.4, orillaKm: 0.7, irregularidadKm: 0.18,
      eje: [[35.502, 138.662, 0.45], [35.498, 138.684, 0.6], [35.500, 138.700, 0.4]],
    },
    {
      id: 'shojiko', nombre: 'Lago Shojiko', nivelM: 901, profundidadM: 30, taludKm: 0.3, orillaKm: 0.6, irregularidadKm: 0.12,
      eje: [[35.489, 138.604, 0.32], [35.488, 138.616, 0.32]],
    },
    {
      id: 'motosu', nombre: 'Lago Motosu', nivelM: 902, profundidadM: 90, taludKm: 0.6, orillaKm: 0.9, irregularidadKm: 0.25,
      eje: [[35.463, 138.574, 1.0], [35.466, 138.592, 1.1]],
    },
    {
      id: 'yamanaka', nombre: 'Lago Yamanakako', nivelM: 980, profundidadM: 40, taludKm: 0.5, orillaKm: 0.8, irregularidadKm: 0.25,
      eje: [[35.408, 138.850, 0.6], [35.418, 138.870, 1.0], [35.423, 138.893, 0.75]],
    },
    {
      id: 'suruga', nombre: 'BAHÍA DE SURUGA', nivelM: 0, profundidadM: 300, taludKm: 3, orillaKm: 2.5, irregularidadKm: 1.2,
      eje: [[35.03, 138.20, 10], [35.06, 138.45, 9], [35.07, 138.62, 8], [35.06, 138.80, 8], [35.00, 138.95, 10]],
    },
  ],

  relieve: {
    colinas: { base: 230, amp: 380 },
    fajas: [
      // Meseta de los Cinco Lagos (~1.000 m) al norte del volcán.
      {
        centroZ: -6, semiAncho: 11, borde: 6, escalaX: 0.12, escalaZ: 0.18, base: 0.88, desfase: 4.2,
        amplitudPorX: [[-40, 1050], [0, 1070], [30, 1030]],
      },
      // Montes Misaka: el cordón que encierra los lagos por el norte.
      {
        centroZ: -15, semiAncho: 3, borde: 3, escalaX: 0.16, escalaZ: 0.3, base: 0.3, desfase: 9.7,
        amplitudPorX: [[-40, 1500], [-10, 1650], [20, 1550], [60, 1300]],
      },
      // Montes Tanzawa al este (horizonte).
      {
        centroZ: -2, semiAncho: 12, borde: 6, escalaX: 0.07, escalaZ: 0.12, base: 0.2, desfase: 17.1,
        amplitudPorX: [[25, 0], [40, 900], [70, 1500], [150, 1300]],
      },
    ],
    picos: [
      // El Fuji: cono cóncavo, barrancos radiales y cráter (~500 m de diámetro).
      {
        id: 'fuji', perfil: 'volcan', lat: 35.3628, lon: 138.7310, alturaM: 3800, radioKm: 24, agudeza: 2.7,
        surcos: 15, profundidadSurcosM: 190, suavizadoBaseM: 260,
        crater: { radioKm: 0.27, profundidadM: 220, bordeM: 25 },
      },
      // Hoei-zan: cráter parásito del flanco sureste (erupción de 1707).
      { id: 'hoei', perfil: 'volcan', lat: 35.348, lon: 138.763, alturaM: 2700, radioKm: 4.5, agudeza: 1.2, surcos: 7, profundidadSurcosM: 40, crater: { radioKm: 0.6, profundidadM: 280, bordeM: 40 } },
      // Montes Tenshi al oeste del Motosu: cordón norte-sur.
      { id: 'tenshi', lat: 35.43, lon: 138.52, alturaM: 1750, radioKm: 9, agudeza: 1.3, elongacion: 0.35 },
      // Hakone: caldera en el horizonte sureste.
      { id: 'hakone', perfil: 'volcan', lat: 35.233, lon: 139.02, alturaM: 1400, radioKm: 13, agudeza: 1.3, surcos: 9, profundidadSurcosM: 60, crater: { radioKm: 5, profundidadM: 650, bordeM: 120 } },
    ],
  },

  pisos: {
    inicioBosqueM: 0,
    bosqueAlSurZ: -999,
    lineaArbolesM: 2450,
    lineaNieveM: 3150,
    nieveBajaHaciaSurM: 0,
    intensidadOtono: 0.4,
  },

  // sRGB. Mañana clara de otoño: bosque profundo, momiji, escoria volcánica roja.
  paleta: {
    estepa: '#7B8455',
    turba: '#6F6A4A',
    bosque: '#1F3D2A',
    bosqueClaro: '#2F5634',
    lengaOtono: '#A2532C',
    pedrero: '#74503F',
    roca: '#3E3533',
    nieve: '#F5F8FB',
    costa: '#8C8676',
    vega: '#748A50',
    fondoSomero: '#2C7186',
    fondoProfundo: '#0D2D44',
    sombra: '#4A5590',
  },

  luz: {
    // Sol de mañana desde el este-sureste: el flanco este brilla, el oeste en sombra.
    solDir: [0.75, 0.38, 0.35],
    alcanceSombraKm: 25,
    radioOclusionKm: 1.2,
    sombraMin: 0.45,
  },

  // La vista icónica: desde el norte, por detrás de la Pagoda Chureito, con los
  // lagos a los pies y el cono recortado contra el cielo.
  camara: { objetivo: [0.05, 0.15, 0.2], elevacionGrados: 30, azimutGrados: 22, distancia: 10.3, fov: 40, aspectoReferencia: 0.82 },
  atmosfera: {
    horizonte: '#B4C3D3',
    resplandor: '#F3B79B',
    medio: '#6A8FBA',
    cenit: '#25466F',
    cerca: 1.15,
    lejos: 2.3,
  },
  agua: { color: '#2E6E8A' },

  etiquetas: [
    { id: 'yamanaka', texto: 'LAGO YAMANAKA', lat: 35.418, lon: 138.872, tipo: 'agua' },
    { id: 'motosu', texto: 'LAGO MOTOSU', lat: 35.465, lon: 138.583, tipo: 'agua' },
    { id: 'suruga', texto: 'BAHÍA DE SURUGA', lat: 35.07, lon: 138.62, tipo: 'agua' },
    { id: 'misaka', texto: 'MONTES MISAKA', lat: 35.57, lon: 138.74, tipo: 'region' },
    { id: 'hakone', texto: 'HAKONE', lat: 35.233, lon: 139.02, tipo: 'region' },
  ],
};

// Costas suaves para lagos de altura; las escenas anteriores conservan su relieve.
monteFuji.aguas = monteFuji.aguas.map((agua) => ({ ...agua, orillaSuave: true }));

module.exports = monteFuji;
