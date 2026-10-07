// Escena "El Archipiélago de San Andrés" — 57 km, Caribe colombiano.
// Datos de escena y calibración del modelo unificado de Meshy.
//
// La isla mide ~13 km de norte a sur, así que el recorrido combina tierra y
// travesías por mar (decisión de diseño sobre los checkpoints existentes):
//   North End y pueblo → travesía a Johnny Cay → navegación por la laguna del
//   arrecife hasta Haynes Cay / El Acuario → desembarco en San Luis → cruce de
//   la isla por La Loma → Cueva de Morgan → costa oeste → El Hoyo Soplador →
//   travesía por el arrecife sur → Punta Sur.
// `agua: true` en un waypoint = el tramo que sale de él es náutico.

const sanAndres = {
  id: 'san_andres',
  modeloMeshy: true,
  // Route anchors are calibrated to this artistic source; stored km stay unchanged.
  colorRuta: '#FF8540', grosorRuta: 1.05, mostrarRelacionRecorrido: false,
  seguimientoPeso: .18, rutaContinua: true,
  pinesSeparados: [['el_hoyo', 'punta_sur']],
  distanciaKm: 57,
  presentacion: {
    eyebrow: 'CARIBE · COLOMBIA',
    titulo: 'San Andrés: tierra y mar',
  },
  semilla: 1629,
  centro: { lat: 12.535, lon: -81.705 },
  limitesKm: { minX: -7, maxX: 9, minZ: -13, maxZ: 11 },
  resolucionKm: 0.12,
  mundo: { extensionKm: 120, crecimiento: 1.18 },
  kmPorUnidad: .3,
  exageracion: 1.2,
  pasoRutaKm: 0.08,
  elevacionRutaUnidades: .008,
  alturaPinUnidades: .075,

  ruta: [
    { lat: 12.5845, lon: -81.6975, km: 0 }, // San Andrés Town (Spratt Bight)
    { lat: 12.5870, lon: -81.7030 },
    { lat: 12.5830, lon: -81.7090 },
    { lat: 12.5760, lon: -81.7120 }, // lado oeste del aeropuerto
    { lat: 12.5700, lon: -81.7050 },
    { lat: 12.5760, lon: -81.6985 },
    { lat: 12.5870, lon: -81.6935, agua: true }, // muelle: travesía
    { lat: 12.5950, lon: -81.6895, agua: true },
    { lat: 12.6003, lon: -81.6878, km: 11, agua: true }, // Johnny Cay
    { lat: 12.5970, lon: -81.6760, agua: true }, // laguna, hacia el arrecife
    { lat: 12.5850, lon: -81.6700, agua: true },
    { lat: 12.5700, lon: -81.6670, agua: true },
    { lat: 12.5560, lon: -81.6690, km: 21, agua: true }, // Haynes Cay / El Acuario
    { lat: 12.5530, lon: -81.6800, agua: true },
    { lat: 12.5500, lon: -81.6965 }, // desembarco en San Luis
    { lat: 12.5400, lon: -81.6975 },
    { lat: 12.5340, lon: -81.7030 },
    { lat: 12.5320, lon: -81.7120 }, // La Loma
    { lat: 12.5330, lon: -81.7200 },
    { lat: 12.5345, lon: -81.7255, km: 34 }, // Cueva de Morgan
    { lat: 12.5250, lon: -81.7245 },
    { lat: 12.5120, lon: -81.7240 },
    { lat: 12.5000, lon: -81.7225 },
    { lat: 12.4905, lon: -81.7220, km: 44, agua: true }, // El Hoyo Soplador
    { lat: 12.4860, lon: -81.7290, agua: true }, // travesía por el arrecife sur
    { lat: 12.4760, lon: -81.7270, agua: true },
    { lat: 12.4690, lon: -81.7180, agua: true },
    { lat: 12.4700, lon: -81.7060, agua: true },
    { lat: 12.4770, lon: -81.7030, agua: true },
    { lat: 12.4825, lon: -81.7105, km: 57 }, // Punta Sur
  ],

  perfilRuta: 'terreno',
  corredor: { planoKm: 0.05, paredM: 400, potencia: 1.2, suavizadoM: 4, suavizadoPerfilKm: 0.25 },

  // El agua es el mar Caribe: todo lo que queda bajo el nivel 0.
  mar: { nivelM: 0 },
  aguas: [],

  relieve: {
    // Fondo oceánico profundo alrededor del banco.
    colinas: { base: -420, amp: 60 },
    fajas: [],
    masas: [
      // Banco y laguna arrecifal: plataforma somera, más ancha al este.
      {
        id: 'banco', costaM: -7, alturaM: -3.5, interiorKm: 1.5, taludMporKm: 90, irregularidadKm: 0.3, alcanceKm: 6,
        eje: [[12.607, -81.696, 2.6], [12.575, -81.689, 3.3], [12.540, -81.692, 3.1], [12.505, -81.700, 2.4], [12.474, -81.709, 1.7]],
      },
      // Cresta del arrecife de barrera (norte y este): casi aflora.
      {
        id: 'arrecife', costaM: -1.4, alturaM: -0.6, interiorKm: 0.1, taludMporKm: 40, irregularidadKm: 0.08, alcanceKm: 1,
        eje: [[12.622, -81.715, 0.12], [12.615, -81.690, 0.15], [12.600, -81.668, 0.15], [12.575, -81.660, 0.15], [12.545, -81.662, 0.15], [12.515, -81.672, 0.12], [12.490, -81.688, 0.1]],
      },
      // La isla: costa baja con playas, La Loma en el centro (~85 m).
      {
        id: 'isla', costaM: 1.5, alturaM: 85, interiorKm: 1.1, forma: 1.3, rugosidadM: 12, taludMporKm: 25, irregularidadKm: 0.22, alcanceKm: 2,
        eje: [[12.592, -81.700, 0.8], [12.578, -81.705, 1.45], [12.552, -81.709, 1.75], [12.528, -81.712, 1.75], [12.503, -81.716, 1.3], [12.486, -81.715, 0.6]],
      },
      { id: 'johnny_cay', costaM: 1, alturaM: 4, interiorKm: 0.08, taludMporKm: 12, irregularidadKm: 0.03, alcanceKm: 0.6, eje: [[12.6003, -81.6885, 0.12], [12.6008, -81.6870, 0.12]] },
      { id: 'haynes_cay', costaM: 0.8, alturaM: 3, interiorKm: 0.06, taludMporKm: 12, irregularidadKm: 0.02, alcanceKm: 0.5, eje: [[12.5565, -81.6695, 0.09], [12.5558, -81.6683, 0.09]] },
      { id: 'rose_cay', costaM: 0.6, alturaM: 2, interiorKm: 0.05, taludMporKm: 12, irregularidadKm: 0.02, alcanceKm: 0.5, eje: [[12.5532, -81.6718, 0.07], [12.5528, -81.6710, 0.07]] },
    ],
    picos: [],
  },

  pisos: {
    inicioBosqueM: 0,
    bosqueAlSurZ: -999,
    lineaArbolesM: 9999,
    lineaNieveM: 99999,
    nieveBajaHaciaSurM: 0,
    intensidadOtono: 0,
    profundidadColorM: 25,
  },

  // sRGB. Isla verde de cocoteros, playas blancas, fondo de arena.
  paleta: {
    estepa: '#7FA35A',
    turba: '#6E8A4A',
    bosque: '#2E6B36',
    bosqueClaro: '#4C8C44',
    lengaOtono: '#4C8C44',
    pedrero: '#8A8A70',
    roca: '#7D7768',
    nieve: '#FFFFFF',
    costa: '#F1E7C8',
    vega: '#86B060',
    fondoSomero: '#CFE6D6',
    fondoProfundo: '#123E6E',
    sombra: '#3E5C8A',
  },

  // El "mar de siete colores": la batimetría decide el color del agua.
  agua: { elevacionM: 0.05, somero: '#3FD3C8', medio: '#0FA3BE', profundo: '#0A3A74', profundidadColorM: 22, opacidad: 0.9, rugosidad: 0.18, espuma: '#F4FBFF', espumaHastaM: 1.3 },

  luz: {
    intensidadSol: 1.35, intensidadHemi: 1.3, intensidadRelleno: .4,
    colorSol: '#FFF1D7', colorCielo: '#D8F4FF', colorSuelo: '#729F98',
    solDir: [0.35, 0.8, 0.45], // sol alto del trópico
    alcanceSombraKm: 3,
    radioOclusionKm: 0.3,
    sombraMin: 0.55,
  },

  // Norte hacia el fondo; isla completa en el encuadre vertical inicial.
  camara: { objetivo: [0, .12, 0], elevacionGrados: 50, azimutGrados: -90, distancia: 8.6, fov: 42, aspectoReferencia: .82 },
  exposicion: 1.1,
  atmosfera: {
    horizonte: '#CDE2EE',
    resplandor: '#FFE6B8',
    medio: '#7DB8DE',
    cenit: '#2D7AB8',
    cerca: 1.4,
    lejos: 3.2,
  },

  etiquetas: [], // Source-local checkpoints provide labels; no old procedural positions.

};

module.exports = sanAndres;
