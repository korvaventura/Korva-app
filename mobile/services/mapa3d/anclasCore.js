// Anclas de monumentos y cámaras de inspección/llegada del modo desafío.
// Puro (sin three): recibe posiciones ya proyectadas a unidades de escena.
//
// Un ancla describe dónde irá una miniatura (km, desplazamiento lateral,
// escala, rotación, frente del modelo) y cómo mirarla. Funciona sin modelo:
// la cámara apunta al punto del ancla aunque la miniatura no esté cargada.
// Así un país o un monumento nunca altera la traza ni el progreso.

const rad = (g) => (g * Math.PI) / 180;

function buscarAncla(territorio, foco) {
  const anclas = territorio?.anclas || [];
  if (!foco || foco.general) return null;
  return anclas.find((a) => (foco.id != null ? a.id === foco.id || a.hito === foco.id : a.km === foco.km))
    || anclas.find((a) => a.id === territorio.inspeccionPorDefecto || a.hito === territorio.inspeccionPorDefecto)
    || null;
}

const anclaLlegada = (territorio) => (territorio?.anclas || [])
  .find((a) => a.id === territorio.llegada || a.hito === territorio.llegada) || null;

// Rumbo de la cámara (grados, 0 = norte, 90 = este) para un ancla: explícito,
// o el frente del monumento (la cámara se para frente a él), o el de la escena.
function rumboCamara(ancla) {
  if (Number.isFinite(ancla?.camara?.azimutGrados)) return ancla.camara.azimutGrados;
  if (Number.isFinite(ancla?.frenteGrados)) return ancla.frenteGrados;
  return null;
}

// Objetivo de la cámara: base del ancla + desplazamiento. `tangente` es la
// dirección de marcha en x/z (unidades), para el desplazamiento lateral en km.
function objetivoAncla(ancla, base, tangente = null, kmPorUnidad = 1) {
  const c = ancla.camara || {};
  if (Array.isArray(c.desplazamiento)) return [base.x + c.desplazamiento[0], base.y + c.desplazamiento[1], base.z + c.desplazamiento[2]];
  const lateral = (ancla.desplazamientoLateralKm || 0) / kmPorUnidad;
  let dx = 0; let dz = 0;
  if (lateral && tangente) {
    const n = Math.hypot(tangente.x, tangente.z) || 1;
    // Derecha de la marcha con x = este, z = sur: (-tz, tx) rota 90° horario visto desde arriba.
    dx = (-tangente.z / n) * lateral; dz = (tangente.x / n) * lateral;
  }
  return [base.x + dx, base.y + (c.alturaObjetivoUnidades ?? 0.065), base.z + dz];
}

// Control de cámara (mismo formato que los gestos) para inspeccionar un ancla.
function controlAncla(ancla, base, camaraEscena, tangente = null, kmPorUnidad = 1) {
  const c = ancla.camara || {};
  const rumbo = rumboCamara(ancla);
  return {
    azimut: rumbo == null ? 0 : rad(rumbo - camaraEscena.azimutGrados),
    elevacion: Number.isFinite(c.elevacionGrados) ? rad(c.elevacionGrados - camaraEscena.elevacionGrados) : 0,
    zoom: c.zoom ?? 0.025,
    objetivo: objetivoAncla(ancla, base, tangente, kmPorUnidad),
  };
}

// Interpolación hacia la cámara de llegada (sin saltos, ángulo por el camino corto).
function interpolarLlegada(inicio, destino, t) {
  let da = (destino.azimut || 0) - (inicio.azimut || 0);
  da = Math.atan2(Math.sin(da), Math.cos(da));
  if (t >= 1) {
    // Exactamente el destino, en la vuelta equivalente más cercana (sin salto de 2π).
    const vueltas = Math.round(((inicio.azimut || 0) + da - (destino.azimut || 0)) / (2 * Math.PI));
    return { ...destino, azimut: (destino.azimut || 0) + vueltas * 2 * Math.PI, objetivo: [...destino.objetivo] };
  }
  const s = t * t * (3 - 2 * t);
  return {
    azimut: (inicio.azimut || 0) + da * s,
    elevacion: (inicio.elevacion || 0) * (1 - s) + destino.elevacion * s,
    zoom: Math.exp(Math.log(inicio.zoom || 1) * (1 - s) + Math.log(destino.zoom) * s),
    objetivo: inicio.objetivo.map((v, i) => v + (destino.objetivo[i] - v) * s),
  };
}

function tituloAncla(ancla, checkpoints = []) {
  if (!ancla) return null;
  return ancla.titulo || checkpoints.find((cp) => cp.id === ancla.hito)?.nombre || 'Vista de detalle';
}

module.exports = { buscarAncla, anclaLlegada, rumboCamara, objetivoAncla, controlAncla, interpolarLlegada, tituloAncla };
