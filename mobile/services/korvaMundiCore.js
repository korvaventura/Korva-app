// Lógica pura de Korva Mundi: coordenadas válidas y destinos de prueba interna.
// Sin React ni red, para poder probarla con node --test.

// Una coordenada sólo es válida si viene informada (no null, undefined ni texto
// vacío), es un número finito y está dentro de rango. `Number(null)` y
// `Number('')` valen 0: sin esta validación, un desafío sin ubicación aparecía
// en el océano frente a África (0°, 0°).
function numeroInformado(valor) {
  if (valor === null || valor === undefined || typeof valor === 'boolean') return null;
  if (typeof valor === 'string' && valor.trim() === '') return null;
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function coordenadasValidas(latitud, longitud) {
  const lat = numeroInformado(latitud);
  const lon = numeroInformado(longitud);
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { latitude: lat, longitude: lon };
}

// Desafíos del catálogo con ubicación válida, ya convertida a número.
function conUbicacion(catalogo) {
  return (Array.isArray(catalogo) ? catalogo : []).flatMap((c) => {
    const coords = c ? coordenadasValidas(c.latitude, c.longitude) : null;
    return coords ? [{ ...c, ...coords }] : [];
  });
}

// Pines de prueba interna: sólo administradores en una build de desarrollo
// (`esAdmin && __DEV__`, el mismo acceso de las pantallas de prueba local).
// Ubicación = llegada de cada escena 3D (último punto de su trazado):
// Praza do Obradoiro y Porta Capena, a ~700 m del Coliseo.
// No consultan ni escriben backend, Supabase ni Shopify.
const DESTINOS_PRUEBA = Object.freeze([
  Object.freeze({
    id: 'e6424df6-3949-4503-8af0-69408b4b34a2',
    title: 'Camino de Santiago 775K',
    lugar: 'Santiago de Compostela · España',
    latitude: 42.88049, longitude: -8.54575,
    total_distance_km: 775,
    description: 'Prueba interna. Camino Francés de Roncesvalles a Santiago de Compostela: 775 km y 13 hitos.',
    pruebaInterna: true,
    pantallaPrueba: 'CaminoSantiagoPrueba',
  }),
  Object.freeze({
    id: '54865c93-6b1b-4d2b-8324-71d705133998',
    title: 'Vía Appia 611K',
    lugar: 'Roma · Italia',
    latitude: 41.88437, longitude: 12.48903,
    total_distance_km: 611,
    description: 'Prueba interna. De Brindisi a Roma por la vía Appia: 611 km y 13 hitos, con llegada al Coliseo.',
    pruebaInterna: true,
    pantallaPrueba: 'ViaAppiaPrueba',
  }),
]);

function destinosPrueba({ esAdmin = false, desarrollo = false, catalogo = [] } = {}) {
  if (esAdmin !== true || desarrollo !== true) return [];
  // Si el desafío ya llega en el catálogo (p. ej. ya activo), no se duplica.
  const enCatalogo = new Set((Array.isArray(catalogo) ? catalogo : []).map((c) => c?.id));
  return DESTINOS_PRUEBA.filter((d) => !enCatalogo.has(d.id)).map((d) => ({ ...d }));
}

module.exports = { numeroInformado, coordenadasValidas, conUbicacion, DESTINOS_PRUEBA, destinosPrueba };
