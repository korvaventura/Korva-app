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

// Destinos del globo vistos desde un desafío: el actual va primero y resaltado.
function destinosParaGlobo(destinos = [], actual) {
  const lista = destinos.filter((d) => d && Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude)));
  if (!actual || !Number.isFinite(Number(actual.latitude)) || !Number.isFinite(Number(actual.longitude))) return lista;
  const resto = lista.filter((d) => d.id !== actual.id);
  const base = lista.find((d) => d.id === actual.id) || {};
  return [{ ...base, ...actual, estado: 'en_curso', esActual: true }, ...resto];
}

module.exports = { GLOBO_ZOOM_MIN, GLOBO_ZOOM_MAX, UMBRAL_TOPE, giroHacia, avanzarTope, destinosParaGlobo };
