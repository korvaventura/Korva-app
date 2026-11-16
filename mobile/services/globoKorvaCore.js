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

module.exports = { GLOBO_ZOOM_MIN, GLOBO_ZOOM_MAX, UMBRAL_TOPE, giroHacia, avanzarTope, destinosParaGlobo, ubicacionLocal, resolverActual };
