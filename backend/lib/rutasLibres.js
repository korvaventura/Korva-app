const { calcularProgresoChallenge, instanteUTC } = require('./progresoDesafio');
const ISLANDIA = Object.freeze({ id: '3b211caf-ee16-54c8-a93c-343a5eb2d57e', clave: 'islandia',
  titulo: 'Islandia · Ring Road', distancia_km: 1400, gratuita: true, medalla_disponible: false,
  aceptacion_version: 'ruta-libre-v1', capitulos: ['Fuego y agua', 'Hielo', 'Fiordos y monstruos', 'Volcanes y auroras', 'Sagas y regreso'] });

// Se reconstruye desde activities: no inserta actividades ni escribe progreso de compras.
function progresoRutaLibre(participacion, actividades, userId, ahoraMs = Date.now()) {
  if (!participacion) return null;
  if (participacion.user_id !== userId || participacion.route_id !== ISLANDIA.id
    || instanteUTC(participacion.accepted_at) === null) throw new Error('Participación inválida');
  const ids = new Set();
  const validas = actividades.filter((a) => {
    if (a.user_id !== userId || a.excluida !== false) return false;
    const ms = instanteUTC(a.recorded_at), km = Number(a.distance_km);
    if (!a.id || ms === null || ms > ahoraMs || !Number.isFinite(km) || km <= 0) return false;
    if (ids.has(a.id)) throw new Error('Actividad repetida');
    ids.add(a.id); return true;
  });
  const r = calcularProgresoChallenge({
    uc: { id: participacion.id, user_id: userId, challenge_id: ISLANDIA.id, status: 'active',
      started_at: participacion.accepted_at, pausado: participacion.paused_at !== null,
      pausado_at: participacion.paused_at, periodos_pausados: participacion.pause_periods || [],
      km_base: 0, km_completed: 0, version: 'estandar' },
    challenge: { id: ISLANDIA.id, title: ISLANDIA.titulo, total_distance_km: ISLANDIA.distancia_km },
    actividades: validas, incluirDetalle: true,
  });
  const cuentan = r.detalle_actividades.filter((a) => a.motivo === 'cuenta')
    .sort((a,b) => a.recorded_at_utc.localeCompare(b.recorded_at_utc) || String(a.id).localeCompare(String(b.id)));
  const kmPorId = new Map(validas.map((a) => [a.id, Number(a.distance_km)]));
  let km = 0, completadoAt = null;
  for (const a of cuentan) { km += kmPorId.get(a.id); if (!completadoAt && km >= ISLANDIA.distancia_km) completadoAt = a.recorded_at_utc; }
  return { id: participacion.id, accepted_at: participacion.accepted_at,
    started_at: cuentan[0]?.recorded_at_utc || null, completed_at: completadoAt,
    km: Math.min(ISLANDIA.distancia_km, Math.round(km * 1000) / 1000),
    porcentaje: Math.min(100, km / ISLANDIA.distancia_km * 100),
    pausado: participacion.paused_at !== null, abandonado: !!participacion.left_at,
    estado: participacion.left_at ? 'abandonada' : completadoAt ? 'completada' : participacion.paused_at ? 'pausada' : cuentan.length ? 'en_curso' : 'elegida' };
}
module.exports = { ISLANDIA, progresoRutaLibre };
