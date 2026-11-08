// Escena "Vía Appia — 611 km": Brindisi → Roma (Porta Capena) por la Appia Antica.
// Solo datos: usa el mismo motor que el Camino de Santiago (terrenoCore + construirMundo).
//
// Tres capas que no se mezclan:
//   1. Geografía real (WGS84): la traza Itiner-e de la Appia Antica
//      (viaAppia.trazado.js), costa y lagos de Natural Earth y el DEM de NOAA.
//      Ver docs/mapas-3d/via-appia-fuentes.md.
//   2. Kilómetros virtuales: los 611 km del desafío se fijan con los 13 hitos de
//      services/desafios/viaAppia.js sobre esa traza (573,6 km geográficos); entre
//      hitos el avance es proporcional a la distancia real. La geografía no se estira.
//   3. Representación: exageración vertical ×3, colores mediterráneos por región y
//      anclas para futuras miniaturas. Nada de eso cambia la traza ni el progreso.

const trazado = require('./viaAppia.recorrido');
const historia = require('../../desafios/viaAppia');

const DISTANCIA_KM = historia.distanciaKm; // 611, única distancia del desafío
const HITOS_KM = Object.fromEntries(historia.checkpoints.map((cp) => [cp.id, cp.kmFisico]));
const kmPorIndice = new Map(Object.entries(trazado.anclas).map(([id, i]) => [i, HITOS_KM[id]]));
const ruta = trazado.puntos.map(([lat, lon], i) => (
  kmPorIndice.has(i) ? { lat, lon, km: kmPorIndice.get(i) } : { lat, lon }
));

// Puntos de inserción de futuros modelos Meshy, uno por hito. Funcionan sin
// modelo: la cámara de inspección y la de llegada apuntan al ancla.
//   frenteGrados: rumbo (0 = norte, 90 = este) hacia el que mira el frente del
//     modelo; la cámara se ubica en ese rumbo para verlo de frente.
//   ejeFrenteModelo: eje local del archivo que es su frente (a confirmar con Meshy).
//   desplazamientoLateralKm: + a la derecha de la marcha (Brindisi → Roma).
// Las orientaciones marcadas `verificar` son hipótesis de trabajo, no un dato.
const ancla = (hito, extra = {}) => ({
  hito, km: HITOS_KM[hito], escala: 1, rotacionGrados: 0, desplazamientoLateralKm: 0,
  ejeFrenteModelo: '+X', frenteGrados: null, modelo: null,
  // Sin miniatura: encuadre del territorio del hito. Con un modelo se ajusta
  // zoom/altura a su tamaño (el Camino usa 0,025 y 0,065 para la catedral).
  camara: { zoom: 0.06, elevacionGrados: 34, alturaObjetivoUnidades: 0.012 },
  ...extra,
});
const anclasMonumentos = [
  // Coliseo: símbolo de llegada a Roma. La traza histórica termina en Porta Capena.
  // El modelo se añadirá con Meshy; no se inventa un tramo urbano de la Appia.
  ancla('roma', { candidato: 'Coliseo de Roma', titulo: 'Roma · llegada', frenteGrados: 225, verificar: true }),
  ancla('cecilia_metella', { titulo: 'Mausoleo de Cecilia Metella' }),
  ancla('albano'), ancla('terracina'), ancla('formia'), ancla('capua'),
  // Arco de Trajano: sus fachadas miran al noreste (Via Traiana) y al suroeste.
  // Hito cercano a la Appia; no desvía el recorrido a la variante Traiana.
  ancla('benevento', { candidato: 'Arco de Trajano', titulo: 'Arco de Trajano · Benevento', frenteGrados: 45, verificar: true }),
  ancla('aeclanum'), ancla('venosa'), ancla('gravina'), ancla('taranto'), ancla('oria'),
  // Columnas romanas sobre la Scalinata Virgiliana, frente al puerto (norte).
  ancla('brindisi', { candidato: 'Columnas romanas de Brindisi', titulo: 'Columnas romanas · Brindisi', frenteGrados: 350, verificar: true }),
];

const viaAppia = {
  id: 'via_appia',
  distanciaKm: DISTANCIA_KM,
  presentacion: {
    eyebrow: 'VÍA APPIA · 611 KM',
    titulo: 'Brindisi → Roma',
  },
  capitulos: historia.capitulos,

  semilla: 312, // 312 a. C., Appio Claudio
  // Debe coincidir con tools/mapa3d/preparar_appia.py (CENTRO).
  centro: { lat: 41.2, lon: 15.2 },
  // Zona fina alrededor de la vía (x este, z sur, km); el mundo sigue ~800 km más.
  limitesKm: { minX: -280, maxX: 282, minZ: -122, maxZ: 128 },
  resolucionKm: 1.5,
  mundo: { extensionKm: 800, crecimiento: 1.08, pasoContextoKm: 4.5, radioContextoKm: 360, crecimientoLejano: 1.14 },
  // Misma escala visual que el Camino: terreno, ruta y futuras miniaturas comparten unidades.
  kmPorUnidad: 55,
  exageracion: 3,
  pasoRutaKm: 0.8,
  elevacionRutaUnidades: 0.022,
  alturaPinUnidades: 0.34,
  grosorRuta: 0.75,
  etiquetaFinal: true,
  etiquetasSeparadas: true,
  seguimientoPeso: 0.2,

  ruta,
  perfilRuta: 'terreno',
  pasoPerfilKm: 0.5,
  // respetarAgua: en Formia, Taranto y Brindisi la vía bordea el mar; el
  // corredor no rellena celdas de agua (sin terraplenes en el puerto).
  corredor: { planoKm: 0.8, paredM: 60, potencia: 1.3, suavizadoM: 40, suavizadoPerfilKm: 1.5, respetarAgua: true },

  // Mar y lagos vienen del relieve real (NOAA + Natural Earth), adjuntado al
  // hornear por scripts/mapa3d/viaAppia.relieveReal.js.
  mar: { nivelM: 0 },
  aguas: [],
  // Sin relieve.real el horneado falla: no hay relieve inventado de respaldo.
  relieve: { requiereReal: true, colinas: { base: 0, amp: 0 }, fajas: [], picos: [] },

  pisos: {
    inicioBosqueM: 650,
    bosqueAlSurZ: 9999,
    lineaArbolesM: 1800,
    lineaNieveM: 2350,
    nieveBajaHaciaSurM: 0,
    intensidadOtono: 0.25,
  },

  // sRGB. Mediterráneo de fin de tarde: piedra clara, campos secos, olivar y
  // bosque de los Apeninos, dentro del navy de Korva.
  paleta: {
    estepa: '#958653',
    turba: '#7B7147',
    bosque: '#3A5535',
    bosqueClaro: '#4D683E',
    lengaOtono: '#7A5A34',
    pedrero: '#8C8273',
    roca: '#8F887D',
    nieve: '#EEF2F5',
    costa: '#B9A981',
    vega: '#6E8547',
    fondoSomero: '#2F8094',
    fondoProfundo: '#0C2A40',
    sombra: '#45508A',
  },

  // Regiones de paisaje a lo largo del eje oeste-este (x en km).
  biomas: [
    // Campagna Romana y Colli Albani: pastos y viñedos.
    { x: -235, transicionKm: 45, pisos: { inicioBosqueM: 520 },
      paleta: { estepa: '#7F8450', vega: '#6C8A49', bosque: '#3C5A37' },
      parcelas: { colores: ['#7A8A4C', '#8E8452', '#6B7C43', '#9A8C5A', '#5F7440'], tamanoKm: 2.2, mezcla: 0.1, orientacion: 0.55 } },
    // Agro Pontino y llanura campana: campos verdes, cultivos intensivos.
    { x: -135, transicionKm: 45, pisos: { inicioBosqueM: 480 },
      paleta: { estepa: '#71844A', vega: '#5F8A45', turba: '#6C7444' },
      parcelas: { colores: ['#5E8443', '#6F8B4A', '#87864E', '#4E763D', '#7C7A48'], tamanoKm: 1.8, mezcla: 0.11, orientacion: -0.6 } },
    // Irpinia y Apeninos campanos: más bosque y laderas.
    { x: -20, transicionKm: 45, pisos: { inicioBosqueM: 420, lineaArbolesM: 1750 },
      paleta: { estepa: '#7A7A4A', bosque: '#34513A', bosqueClaro: '#46663F' } },
    // Basilicata (Vulture, Bradano, Murgia): trigales dorados.
    { x: 85, transicionKm: 50, pisos: { inicioBosqueM: 900 },
      paleta: { estepa: '#B39A5C', turba: '#9C824C', vega: '#8E8A50' },
      parcelas: { colores: ['#C2A35F', '#A88D52', '#8F7F49', '#B7955A', '#7E7A48'], tamanoKm: 3.4, mezcla: 0.12, orientacion: 0.25 } },
    // Puglia y Salento: olivares grises y tierra rojiza.
    { x: 195, transicionKm: 45, pisos: { inicioBosqueM: 1200 },
      paleta: { estepa: '#8C8458', turba: '#8A5E3E', vega: '#6F7D4C', costa: '#C4B38A' },
      parcelas: { colores: ['#6F7A50', '#7E8458', '#8A6446', '#5E6B47', '#97845C'], tamanoKm: 1.6, mezcla: 0.12, orientacion: -0.15 } },
  ],
  // Suavizado leve de color (igual que el Camino): conserva el mosaico.
  suavizadoColor: 0.12,

  luz: {
    // Sol bajo del oeste-suroeste, como en el Camino: misma luz para las miniaturas.
    solDir: [-0.78, 0.42, 0.46],
    alcanceSombraKm: 70,
    radioOclusionKm: 6,
    sombraMin: 0.86,
    intensidadSol: 1.9,
    intensidadHemi: 1.3,
    colorSuelo: '#4A4636',
  },

  // Vista desde el sureste (rumbo 133°): Roma arriba a la izquierda, Brindisi a
  // la derecha, el Tirreno a la izquierda y el Adriático a la derecha. Elegida
  // midiendo largo del recorrido en pantalla y rótulos de inicio/llegada en 14
  // visores (tests/mapa3dViaAppia.test.js). General se recalcula del recorrido.
  camara: {
    zoomMin: 0.015, zoomMax: 1.45, zoomExploracionMax: 1.15, zoomGeneral: 0.96,
    objetivoGeneral: [0, 0, 0], objetivo: [0.3, 0, -0.4],
    elevacionGrados: 46, azimutGrados: 133, distancia: 13.5, fov: 40, aspectoReferencia: 0.82,
  },
  atmosfera: {
    horizonte: '#173D50',
    resplandor: '#7E928A',
    medio: '#254D68',
    cenit: '#102C46',
    cerca: 3.2,
    lejos: 7.5,
    // La niebla se calcula con la profundidad real del borde visible (como el Camino).
    bordePorProfundidad: true,
  },
  // Agua más mate que el Camino: al girar contra el sol el reflejo no lava la vista.
  agua: { color: '#2B6C8A', oceanoContinuo: true, rugosidad: 0.62 },

  // Modo desafío: encuadre automático, límites de gestos, pines y cámaras.
  territorio: {
    rutaEstatica: true,
    replayPorHitos: true,
    dpr: 2,
    separarCabezasPin: true,
    // Límites del objetivo de cámara (unidades de escena) derivados del recorrido.
    limitesGestos: { caja: { minX: -8.5, maxX: 8.5, minZ: -6.5, maxZ: 6.5 }, radio: { x: [2.2, 9], z: [2, 6] } },
    anclas: [...anclasMonumentos].sort((a, b) => a.km - b.km),
    inspeccionPorDefecto: 'brindisi',
    llegada: 'roma',
    textoCierre: 'DESAFÍO COMPLETADO',
  },

  // Nombres discretos para orientarse (ubicaciones verificadas en las pruebas
  // contra Natural Earth: regiones dentro de su polígono, mares sobre agua).
  etiquetas: [
    { id: 'pais_italia', texto: 'ITALIA', lat: 42.15, lon: 14.1, tipo: 'pais' },
    { id: 'pais_albania', texto: 'ALBANIA', lat: 40.95, lon: 20.05, tipo: 'pais' },
    { id: 'region_lazio', texto: 'LAZIO', lat: 41.6, lon: 13.3, tipo: 'region' },
    { id: 'region_campania', texto: 'CAMPANIA', lat: 40.45, lon: 15.2, tipo: 'region' },
    { id: 'region_basilicata', texto: 'BASILICATA', lat: 40.35, lon: 16.15, tipo: 'region' },
    { id: 'region_puglia', texto: 'PUGLIA', lat: 41.8, lon: 15.95, tipo: 'region' },
    { id: 'mar_tirreno', texto: 'MAR TIRRENO', lat: 40.0, lon: 12.6, tipo: 'agua' },
    { id: 'mar_adriatico', texto: 'MAR ADRIÁTICO', lat: 42.2, lon: 15.95, tipo: 'agua' },
    { id: 'mar_jonico', texto: 'MAR JÓNICO', lat: 39.3, lon: 17.9, tipo: 'agua' },
  ],
};

// Km virtual de una coordenada (herramientas y pruebas); no viaja con la escena.
const KM_POR_GRADO = 111.2;
const distanciaGeo = (a, b) => Math.hypot((a[0] - b[0]) * KM_POR_GRADO, (a[1] - b[1]) * KM_POR_GRADO * Math.cos((viaAppia.centro.lat * Math.PI) / 180));
const acumulado = [0];
for (let i = 1; i < trazado.puntos.length; i += 1) acumulado.push(acumulado[i - 1] + distanciaGeo(trazado.puntos[i - 1], trazado.puntos[i]));
const anclasOrdenadas = [...kmPorIndice.entries()].sort((a, b) => a[0] - b[0]);
function kmVirtualDeIndice(i) {
  for (let k = 1; k < anclasOrdenadas.length; k += 1) {
    const [i0, km0] = anclasOrdenadas[k - 1]; const [i1, km1] = anclasOrdenadas[k];
    if (i <= i1) return km0 + ((km1 - km0) * (acumulado[i] - acumulado[i0])) / ((acumulado[i1] - acumulado[i0]) || 1);
  }
  return DISTANCIA_KM;
}
Object.defineProperty(viaAppia, 'kmVirtualDeIndice', { value: kmVirtualDeIndice, enumerable: false });
module.exports = viaAppia;
