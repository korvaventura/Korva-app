// Lógica pura del "modo aventura" del GPS: qué desafío se muestra, cuántos km
// de vista previa lleva y dónde va la cámara detrás del corredor.
const rad = (g) => g * Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const ESTADOS_ACTIVOS = new Set(['active']);

// Inscripciones que pueden avanzar con esta actividad: activas y no pausadas,
// con el desafío cargado. Orden: la que más avanzó primero (la que se está corriendo).
function desafiosParaAventura(inscripciones = []) {
  return (inscripciones || [])
    .filter((uc) => uc && ESTADOS_ACTIVOS.has(uc.status) && !uc.pausado && uc.challenges?.id)
    .sort((a, b) => (Number(b.km_completed) || 0) - (Number(a.km_completed) || 0));
}

// Km que se ven en el mapa durante la actividad: lo ya sumado + lo de esta salida.
// Es sólo una vista previa: los km se suman de verdad al confirmar la actividad.
function kmAventura({ kmPrevio = 0, kmSesion = 0, total = 0 }) {
  const previo = Math.max(0, Number(kmPrevio) || 0);
  const sesion = Math.max(0, Number(kmSesion) || 0);
  const objetivo = Math.max(0, Number(total) || 0);
  const km = objetivo > 0 ? Math.min(objetivo, previo + sesion) : previo + sesion;
  return { km, progreso: objetivo > 0 ? km / objetivo : 0, completado: objetivo > 0 && km >= objetivo };
}

// Cámara en tercera persona: detrás del marcador mirando hacia donde sigue la ruta.
// p: posición actual; a → b: tramo de ruta alrededor (dirección de marcha).
// radioRuta: tamaño de la ruta en unidades de escena (para que la distancia sirva
// igual en Dubrovnik 19 km que en el Camino 775 km).
const ELEVACION_PERSECUCION = 24;
function controlPersecucion({ p, a, b, radioRuta, camara }) {
  const c = camara || {};
  const tx = (b?.x ?? 0) - (a?.x ?? 0);
  const tz = (b?.z ?? 0) - (a?.z ?? 0);
  const n = Math.hypot(tx, tz);
  // configurarCamara: posición = objetivo + (sin az, ·, −cos az)·d. Detrás = −dirección.
  const az = n > 1e-9 ? Math.atan2(-tx / n, tz / n) : rad(c.azimutGrados || 0);
  const base = rad(c.elevacionGrados || 0);
  const elevacion = clamp(rad(ELEVACION_PERSECUCION), rad(10), rad(70)) - base;
  const distancia = clamp((Number(radioRuta) || 1) * 0.16, 0.25, 4);
  const zoom = clamp(distancia / Math.max(0.1, Number(c.distancia) || 10), c.zoomMin ?? 0.02, 1);
  return { azimut: az - rad(c.azimutGrados || 0), elevacion, zoom, objetivo: [p.x, p.y, p.z] };
}

// Islandia (ruta gratuita) no está en user_challenges: se suma desde su participación
// si está en curso (no abandonada, no pausada, no completada).
function entradaRutaLibre(participacion, islandia) {
  const p = participacion;
  if (!p || p.abandonado || p.pausado || p.estado === 'completada' || !islandia?.id) return null;
  return {
    challenge_id: islandia.id, status: 'active', pausado: false, libre: true,
    km_completed: Number(p.km) || 0,
    challenges: { id: islandia.id, title: islandia.title, total_distance_km: islandia.total_distance_km },
  };
}

module.exports = { entradaRutaLibre, desafiosParaAventura, kmAventura, controlPersecucion, ELEVACION_PERSECUCION };
