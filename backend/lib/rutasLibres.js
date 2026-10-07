const { calcularProgresoChallenge, instanteUTC } = require('./progresoDesafio');
const { calcularResidualesHealth, calcularProgresoChallengeHealth } = require('./progresoHealth');
const { filtrarResidualesAutorizados } = require('./consentimientoHealth');
const { evaluarElegibilidadDia } = require('./progresoHealthSombra');
const ISLANDIA = Object.freeze({ id: '3b211caf-ee16-54c8-a93c-343a5eb2d57e', clave: 'islandia',
  titulo: 'Islandia · Ring Road', distancia_km: 1400, gratuita: true, medalla_disponible: false,
  aceptacion_version: 'ruta-libre-v1', capitulos: ['Fuego y agua', 'Hielo', 'Fiordos y monstruos', 'Volcanes y auroras', 'Sagas y regreso'] });

// Se reconstruye desde activities: no inserta actividades ni escribe progreso de compras.
function progresoRutaLibre(participacion, actividades, userId, ahoraMs = Date.now(), health = null) {
  if (!participacion) return null;
  if (participacion.user_id !== userId || participacion.route_id !== ISLANDIA.id
    || instanteUTC(participacion.accepted_at) === null) throw new Error('Participación inválida');
  if (participacion.health_completed_at) return {
    id: participacion.id, accepted_at: participacion.accepted_at,
    started_at: participacion.health_started_at || participacion.accepted_at,
    completed_at: participacion.health_completed_at, km: ISLANDIA.distancia_km,
    porcentaje: 100, pausado: !!participacion.paused_at, abandonado: !!participacion.left_at,
    estado: 'completada',
  };
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
  let kmHealth = 0, inicioHealth = null;
  if (health) {
    const residuales = filtrarResidualesAutorizados({ userId, tipo: 'libre', participacionId: participacion.id,
      ventanas: health.ventanas || [], residuales: calcularResidualesHealth({
        dailyMovement: health.dias || [], actividades, ahoraMs,
      }) });
    const combinado = calcularProgresoChallengeHealth({
      uc: { id: participacion.id, user_id: userId, challenge_id: ISLANDIA.id, status: 'active',
        started_at: participacion.accepted_at, pausado: participacion.paused_at !== null,
        pausado_at: participacion.paused_at, periodos_pausados: participacion.pause_periods || [],
        km_base: 0, km_completed: 0, version: 'estandar' },
      challenge: { id: ISLANDIA.id, title: ISLANDIA.titulo, total_distance_km: ISLANDIA.distancia_km },
      actividades: validas, residuales,
    });
    kmHealth = combinado.km_health_elegible || 0;
    km += kmHealth;
    if (!completadoAt && !participacion.paused_at && combinado.exacto.kmAptoCompletar >= ISLANDIA.distancia_km) {
      completadoAt = new Date(ahoraMs).toISOString();
    }
    if (kmHealth > 0) inicioHealth = residuales.filter((d) => d.residual.total_crudo_km > 0
      && evaluarElegibilidadDia({ started_at: participacion.accepted_at,
        pausado: !!participacion.paused_at, pausado_at: participacion.paused_at,
        periodos_pausados: participacion.pause_periods || [] }, d).elegible)
      .map((d) => d.ventana_utc.fin).sort()[0] || null;
  }
  const inicioActividad = cuentan[0]?.recorded_at_utc || null;
  const inicio = [inicioActividad, inicioHealth].filter(Boolean).sort()[0] || null;
  return { id: participacion.id, accepted_at: participacion.accepted_at,
    started_at: inicio, completed_at: completadoAt, km_movimiento_diario: kmHealth,
    km: Math.min(ISLANDIA.distancia_km, Math.round(km * 1000) / 1000),
    porcentaje: Math.min(100, km / ISLANDIA.distancia_km * 100),
    pausado: participacion.paused_at !== null, abandonado: !!participacion.left_at,
    estado: participacion.left_at ? 'abandonada' : completadoAt ? 'completada' : participacion.paused_at ? 'pausada' : inicio ? 'en_curso' : 'elegida' };
}
module.exports = { ISLANDIA, progresoRutaLibre };
