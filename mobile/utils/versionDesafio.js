// Versión del desafío: ESTÁNDAR o EXTENDIDA.
//
// La versión define SOLO la distancia. No es un deporte: cualquier versión se completa caminando,
// corriendo o en bici, y todos los km cuentan 1:1. (El deporte de cada ACTIVIDAD sigue siendo
// activities.sport_type y no pasa por acá.)
//
// Fuentes, en orden de preferencia:
//  - backend nuevo: `version` ('estandar' | 'extendida') y `version_label`;
//  - compatibilidad: `modalidad` legacy, que puede venir como 'run'/'ride' (base de datos) o como
//    'Running'/'Ciclismo' (respuesta vieja de la Home). Solo 'ride'/'Ciclismo' = Extendida.
// CommonJS a propósito: Metro lo importa igual que un módulo ES y los tests corren con node --test.

const ESTANDAR = 'estandar';
const EXTENDIDA = 'extendida';
const ETIQUETAS = { [ESTANDAR]: 'Estándar', [EXTENDIDA]: 'Extendida' };

const esVersion = (v) => v === ESTANDAR || v === EXTENDIDA;

const versionDesdeModalidad = (modalidad) =>
  (modalidad === 'ride' || modalidad === 'Ciclismo' ? EXTENDIDA : ESTANDAR);

/** Versión de una inscripción (fila de Supabase, ítem de la Home, ranking, admin). */
const versionDeInscripcion = (item) =>
  (esVersion(item && item.version) ? item.version : versionDesdeModalidad(item && item.modalidad));

const etiquetaVersion = (version) => ETIQUETAS[esVersion(version) ? version : ESTANDAR];

/** Etiqueta para mostrar: la del backend si viene, si no la calculada. */
const etiquetaDeInscripcion = (item) =>
  (item && typeof item.version_label === 'string' && item.version_label ? item.version_label : etiquetaVersion(versionDeInscripcion(item)));

/** 'run' / 'ride' para el backend mientras convivan clientes viejos (el backend acepta ambos). */
const modalidadLegacy = (version) => (version === EXTENDIDA ? 'ride' : 'run');

/** Ícono neutro (Ionicons) por versión: nunca un deporte. */
const iconoVersion = (version) => (version === EXTENDIDA ? 'trending-up-outline' : 'flag-outline');

const numeroPositivo = (valor) => {
  const n = parseFloat(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Versiones que ofrece un desafío: [{ version, label, distancia_km }] en el orden guardado. */
const versionesDelDesafio = (challenge) => {
  const lista = Array.isArray(challenge && challenge.modalidades) ? challenge.modalidades : [];
  return lista.filter((m) => m && typeof m === 'object').map((m) => {
    const version = esVersion(m.version) ? m.version : versionDesdeModalidad(m.tipo);
    return { version, label: etiquetaVersion(version), distancia_km: numeroPositivo(m.distancia_km) };
  });
};

/** Distancia de una versión del desafío (null si no la ofrece). */
const distanciaDeVersion = (challenge, version) => {
  const op = versionesDelDesafio(challenge).find((v) => v.version === version);
  return op ? op.distancia_km : null;
};

/** Distancia objetivo de una inscripción: versión elegida → primera versión → total_distance_km. */
const distanciaDeInscripcion = (item, challenge) => {
  const opciones = versionesDelDesafio(challenge);
  const elegida = opciones.find((v) => v.version === versionDeInscripcion(item));
  if (elegida && elegida.distancia_km !== null) return elegida.distancia_km;
  if (opciones.length > 0 && opciones[0].distancia_km !== null) return opciones[0].distancia_km;
  return numeroPositivo(challenge && challenge.total_distance_km);
};

/**
 * Plan sugerido. Escala SOLO por la distancia de la versión (la Extendida es más larga y reparte
 * más sesiones); no asume ningún deporte.
 */
const planDeVersion = (version) =>
  (version === EXTENDIDA ? { sesionesPorSemana: 5, factorDescanso: 0.75 } : { sesionesPorSemana: 4, factorDescanso: 0.6 });

module.exports = {
  ESTANDAR,
  EXTENDIDA,
  esVersion,
  versionDesdeModalidad,
  versionDeInscripcion,
  etiquetaVersion,
  etiquetaDeInscripcion,
  modalidadLegacy,
  iconoVersion,
  versionesDelDesafio,
  distanciaDeVersion,
  distanciaDeInscripcion,
  planDeVersion,
};
