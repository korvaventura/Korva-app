// Lógica pura del paso ruta ↔ globo Korva. Sin React ni Three para poder probarla con node --test.
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Mismos límites de zoom que Korva Mundi.
const GLOBO_ZOOM_MIN = 0.72;
const GLOBO_ZOOM_MAX = 2.35;

// Cuánto hay que seguir pellizcando contra el tope (proporción de distancia
// entre dedos) para cambiar de vista. 0.72 = juntar los dedos ~28 % más.
const UMBRAL_TOPE = 0.72;

// Giro del globo que deja (lat, lon) mirando a cámara. Misma fórmula que Korva Mundi.
function giroHacia(latitud, longitud, giroYActual = null) {
  let giroY = -Number(longitud) * DEG - Math.PI / 2;
  if (Number.isFinite(giroYActual)) {
    let delta = giroY - giroYActual;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    giroY = giroYActual + delta;
  }
  const giroX = clamp(Number(latitud) * DEG * 0.72, -0.62, 0.62);
  return { giroX, giroY };
}

// Cuenta cuánto sigue el usuario pellizcando cuando el zoom ya no se mueve
// porque llegó al tope. `direccion`: 'alejar' (dedos se juntan) o 'acercar'.
// Devuelve el acumulado nuevo y si hay que cambiar de vista.
function avanzarTope(acumulado, muestra, { direccion = 'alejar', umbral = UMBRAL_TOPE } = {}) {
  const { n, distanciaAnterior, distanciaActual, zoomAntes, zoomDespues, enTope } = muestra || {};
  if (n !== 2 || !(distanciaAnterior > 0) || !(distanciaActual > 0)) return { acumulado: 1, cambiar: false };
  const razon = distanciaActual / distanciaAnterior;
  const empuja = direccion === 'alejar' ? razon < 1 : razon > 1;
  const bloqueado = enTope != null ? enTope : Math.abs((zoomDespues ?? 0) - (zoomAntes ?? 0)) < 1e-6;
  if (!empuja) return { acumulado: razon === 1 ? acumulado : 1, cambiar: false };
  if (!bloqueado) return { acumulado: 1, cambiar: false };
  const siguiente = acumulado * (direccion === 'alejar' ? razon : 1 / razon);
  return siguiente <= umbral ? { acumulado: 1, cambiar: true } : { acumulado: siguiente, cambiar: false };
}

// Borde de la ruta en el plano del mapa (x, z): centro y radio que cubre todos los puntos.
function bordeDeRuta(puntos = []) {
  const ps = puntos.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  if (!ps.length) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of ps) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const radio = Math.max(...ps.map((p) => Math.hypot(p.x - cx, p.z - cz)), 0.5);
  return { cx, cz, radio };
}

// Factor sobre el radio de la ruta a partir del cual arrastrar el mapa lleva al globo.
const FACTOR_BORDE = 1.5;
function fueraDeBorde(objetivo, borde, factor = FACTOR_BORDE) {
  if (!borde || !objetivo) return false;
  return Math.hypot(objetivo[0] - borde.cx, objetivo[2] - borde.cz) > borde.radio * factor;
}

// Mapas con límites (Camino, Appia): si el arrastre choca contra el borde y el
// usuario sigue empujando ~160 px, se pasa al globo.
const UMBRAL_BORDE_PX = 160;
function avanzarBloqueoPan(acumulado, { bloqueado, px }, umbral = UMBRAL_BORDE_PX) {
  if (!bloqueado || !(px > 0)) return { acumulado: 0, cambiar: false };
  const siguiente = acumulado + px;
  return siguiente >= umbral ? { acumulado: 0, cambiar: true } : { acumulado: siguiente, cambiar: false };
}

// Coordenadas conocidas en la app (llegada) para abrir el globo sin esperar al catálogo.
function ubicacionLocal(id) {
  const { DESTINOS_PRUEBA } = require('./korvaMundiCore');
  const { ISLANDIA_MUNDI } = require('./rutaLibreMundiCore');
  const d = [...DESTINOS_PRUEBA, ISLANDIA_MUNDI].find((x) => x.id === id);
  return d ? { latitude: d.latitude, longitude: d.longitude, lugar: d.lugar } : null;
}

// Completa el desafío actual con coordenadas: primero las locales, si no, las del catálogo.
function resolverActual(actual, catalogo = []) {
  if (!actual?.id) return actual || null;
  if (Number.isFinite(Number(actual.latitude)) && Number.isFinite(Number(actual.longitude))
    && actual.latitude !== null && actual.longitude !== null) return actual;
  const local = ubicacionLocal(actual.id);
  if (local) return { ...actual, ...local };
  const c = (catalogo || []).find((x) => x?.id === actual.id);
  if (c && c.latitude != null && c.longitude != null && Number.isFinite(Number(c.latitude)) && Number.isFinite(Number(c.longitude))) {
    return { ...c, ...actual, latitude: Number(c.latitude), longitude: Number(c.longitude) };
  }
  return { ...actual, latitude: null, longitude: null };
}

// Destinos del globo vistos desde un desafío: el actual va primero y resaltado.
function destinosParaGlobo(destinos = [], actual) {
  const { coordenadasValidas } = require('./korvaMundiCore');
  const lista = destinos.filter((d) => d && coordenadasValidas(d.latitude, d.longitude));
  if (!actual || actual.latitude == null || actual.longitude == null
    || !Number.isFinite(Number(actual.latitude)) || !Number.isFinite(Number(actual.longitude))) return lista;
  const resto = lista.filter((d) => d.id !== actual.id);
  const base = lista.find((d) => d.id === actual.id) || {};
  return [{ ...base, ...actual, estado: 'en_curso', esActual: true }, ...resto];
}

const COMPLETADOS = new Set(['completed', 'shipped', 'cargado']);
const clamp01 = (v) => Math.max(0, Math.min(100, v));

// Estado del destino para el usuario (mismos criterios que Korva Mundi).
function estadoInscripcion(uc, objetivo) {
  if (!uc) return 'por_conquistar';
  const km = Number(uc.km_completed || 0);
  const pct = objetivo > 0 ? clamp01(km / objetivo * 100) : 0;
  if (COMPLETADOS.has(uc.status) || pct >= 100) return 'conquistado';
  if (km > 0 || uc.status === 'active') return 'en_curso';
  return 'adquirido';
}

// Parámetros que espera DetalleReto, armados desde la fila de user_challenges.
function itemDetalleReto(uc, objetivo) {
  const km = Number(uc?.km_completed || 0);
  return {
    challenge_id: uc.challenge_id,
    challenge: uc.challenges?.title,
    km_completados: km,
    distancia_total: objetivo,
    porcentaje: objetivo > 0 ? clamp01(km / objetivo * 100) : 0,
    started_at: uc.started_at || null,
    completed_at: uc.completed_at || null,
    meta_fecha: uc.meta_fecha || null,
    status: uc.status,
  };
}

// Qué pasa al tocar "ir" en un destino del globo.
function accionDestino(destino, uc, { islandiaId, objetivo = 0 } = {}) {
  if (!destino || destino.esActual) return null;
  if (destino.pruebaInterna && destino.pantallaPrueba) return { tipo: 'prueba', texto: 'Ver ficha y mapa', pantalla: destino.pantallaPrueba };
  if (destino.id === islandiaId || destino.gratuita) return { tipo: 'rutaLibre', texto: 'Ver Islandia' };
  if (uc) return { tipo: 'miDesafio', texto: 'Ver mi desafío y mapa', item: itemDetalleReto(uc, objetivo) };
  return { tipo: 'catalogo', texto: 'Descubrir desafío' };
}

module.exports = { estadoInscripcion, itemDetalleReto, accionDestino, FACTOR_BORDE, UMBRAL_BORDE_PX, bordeDeRuta, fueraDeBorde, avanzarBloqueoPan, GLOBO_ZOOM_MIN, GLOBO_ZOOM_MAX, UMBRAL_TOPE, giroHacia, avanzarTope, destinosParaGlobo, ubicacionLocal, resolverActual };
