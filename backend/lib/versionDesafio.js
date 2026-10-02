// Versión del desafío: ESTÁNDAR o EXTENDIDA (migración "versión del desafío", 2 oct 2026).
//
// - La versión define SOLO la distancia objetivo. No es un deporte: cualquier versión se completa
//   caminando, corriendo o en bici, y todos los km cuentan 1:1 (el deporte vive en
//   activities.sport_type y no interviene acá).
// - user_challenges.version ('estandar' | 'extendida') es la semántica nueva.
//   user_challenges.modalidad ('run' | 'ride') queda solo como espejo legacy: el trigger de la base
//   (trg_sincronizar_version_modalidad) mantiene las dos columnas sincronizadas.
// - challenges.modalidades: [{ tipo, label, version, distancia_km }]. 'tipo' (run/ride) se mantiene
//   para apps viejas; el código nuevo busca por 'version'.
//
// Compatibilidad defensiva (registros o clientes viejos): si falta 'version', se deduce de
// 'modalidad' / 'tipo' con la MISMA regla del trigger: solo 'ride' es la extendida; 'run', NULL o
// cualquier otro valor = estándar.

const VERSIONES = Object.freeze({ ESTANDAR: 'estandar', EXTENDIDA: 'extendida' });
const LISTA_VERSIONES = [VERSIONES.ESTANDAR, VERSIONES.EXTENDIDA];
const ETIQUETAS = Object.freeze({ [VERSIONES.ESTANDAR]: 'Estándar', [VERSIONES.EXTENDIDA]: 'Extendida' });
const MODALIDAD_LEGACY = Object.freeze({ [VERSIONES.ESTANDAR]: 'run', [VERSIONES.EXTENDIDA]: 'ride' });

const esVersion = (v) => LISTA_VERSIONES.includes(v);

/** Regla legacy (idéntica al trigger): 'ride' → extendida; cualquier otra cosa → estándar. */
const versionDesdeModalidad = (modalidad) => (modalidad === 'ride' ? VERSIONES.EXTENDIDA : VERSIONES.ESTANDAR);

/**
 * Lo que manda un cliente (app nueva: 'estandar'/'extendida'; app vieja: 'run'/'ride').
 * Devuelve la versión o null si el valor no es ninguno de los aceptados (para responder 400).
 */
const versionDesdePedido = ({ version, modalidad } = {}) => {
  if (version !== undefined && version !== null && version !== '') {
    return esVersion(version) ? version : null;
  }
  if (modalidad === 'run' || modalidad === 'ride') return versionDesdeModalidad(modalidad);
  return null;
};

/** Versión de una inscripción: 'version' si es válida; si no (fila/objeto viejo), desde modalidad. */
const versionDeInscripcion = (uc) => (esVersion(uc?.version) ? uc.version : versionDesdeModalidad(uc?.modalidad));

const etiquetaVersion = (version) => ETIQUETAS[esVersion(version) ? version : VERSIONES.ESTANDAR];
const modalidadLegacy = (version) => MODALIDAD_LEGACY[esVersion(version) ? version : VERSIONES.ESTANDAR];

const numeroPositivo = (valor) => {
  const n = parseFloat(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Versiones ofrecidas por un desafío, normalizadas: [{ version, distancia_km, label }] (mismo orden). */
const versionesDelDesafio = (challenge) => {
  const lista = Array.isArray(challenge?.modalidades) ? challenge.modalidades : [];
  return lista.filter((m) => m && typeof m === 'object').map((m) => {
    const version = esVersion(m.version) ? m.version : versionDesdeModalidad(m.tipo);
    return { version, distancia_km: numeroPositivo(m.distancia_km), label: etiquetaVersion(version) };
  });
};

/** Distancia de una versión concreta del desafío (null si no la ofrece). */
const distanciaDeVersion = (challenge, version) => {
  const op = versionesDelDesafio(challenge).find((m) => m.version === version);
  return op ? op.distancia_km : null;
};

/**
 * Objetivo de una inscripción: versión elegida → primera versión ofrecida → total_distance_km.
 * Misma cadena de respaldo que el motor usaba con modalidad. Sin objetivo → objetivo_km null.
 */
const objetivoDeInscripcion = (uc, challenge) => {
  const version = versionDeInscripcion(uc);
  const opciones = versionesDelDesafio(challenge);
  const elegida = opciones.find((m) => m.version === version);
  if (elegida && elegida.distancia_km !== null) return { objetivo_km: elegida.distancia_km, origen: 'version_elegida', version };
  if (opciones.length > 0 && opciones[0].distancia_km !== null) return { objetivo_km: opciones[0].distancia_km, origen: 'primera_version', version };
  const total = numeroPositivo(challenge?.total_distance_km);
  if (total !== null) return { objetivo_km: total, origen: 'total_distance_km', version };
  return { objetivo_km: null, origen: 'sin_objetivo', version };
};

module.exports = {
  VERSIONES,
  LISTA_VERSIONES,
  esVersion,
  versionDesdeModalidad,
  versionDesdePedido,
  versionDeInscripcion,
  etiquetaVersion,
  modalidadLegacy,
  versionesDelDesafio,
  distanciaDeVersion,
  objetivoDeInscripcion,
};
