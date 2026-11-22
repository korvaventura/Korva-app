// Presentación de un desafío ya completado. No recalcula ni escribe progreso.
const { distanciaDeInscripcion, etiquetaDeInscripcion } = require('../utils/versionDesafio');

const positivo = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const datosDesafioCompletado = (item) => {
  if (!item || item.pending) return null;
  const total = positivo(item.distancia_total ?? item.distance_km)
    ?? distanciaDeInscripcion(item, item.challenges)
    ?? positivo(item.challenges?.distance_km ?? item.challenges?.distance);
  if (!total) return null;
  const km = Number(item.km_completados ?? item.km_completed);
  const terminal = ['completed', 'shipped', 'cargado'].includes(item.status);
  // No inferir completitud por una fecha objetivo, un porcentaje suelto o el deporte.
  if (!terminal && !(Number.isFinite(km) && km >= total)) return null;
  const fecha = item.completed_at ? new Date(item.completed_at) : null;
  const inicio = item.started_at ? new Date(item.started_at) : null;
  const lapso = inicio && fecha ? fecha.getTime() - inicio.getTime() : NaN;
  const dias = Number.isFinite(lapso) && lapso >= 0 ? Math.max(1, Math.ceil(lapso / 86400000)) : null;
  return {
    dias,
    dorsal: /^\d+$/.test(String(item.numero_bib ?? '')) && Number(item.numero_bib) > 0 ? String(item.numero_bib).padStart(4, '0') : null,
    nombre: String(item.challenge || item.challenge_title || item.challenges?.title || item.challenges?.name || 'Desafío'),
    distancia: total,
    distanciaTexto: String(Number(total.toFixed(2))),
    version: etiquetaDeInscripcion(item),
    fecha: fecha && Number.isFinite(fecha.getTime()) ? fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : null,
  };
};

module.exports = { datosDesafioCompletado };
