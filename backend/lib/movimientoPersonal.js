// Capa personal v1. Función pura: no lee/escribe DB ni ejecuta el motor.
// El historial incluye activities válidas una vez, sin depender de desafíos.
// Hoy/semana consolidan activities + residual Health; pasos son independientes.
// No reconstruye kilómetros históricos faltantes a partir de km_completed/km_base.
const {
  esTimezoneValida, fechaLocalDe, sumarDias, ventanaDiaUTC, recordedAtAMs,
  asignarActividadAlDia, calcularResidualDia,
} = require('./residualMovimiento');

const REGLA_VERSION = 'movimiento_personal_v1_2026-10-04';
const redondear = (n) => Math.round(n * 1000) / 1000;
const numeroValido = (n) => n !== null && n !== undefined && n !== ''
  && Number.isFinite(Number(n)) && Number(n) >= 0;
const fechaValida = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)
  && Number.isFinite(Date.parse(`${f}T00:00:00Z`))
  && new Date(`${f}T00:00:00Z`).toISOString().slice(0, 10) === f;

function calcularMovimientoPersonal({ userId, actividades = [], dailyMovement = [], timezone, ahoraMs }) {
  if (typeof userId !== 'string' || !userId.trim()) throw new Error('userId requerido');
  if (!esTimezoneValida(timezone)) throw new Error('timezone inválida');
  if (!Number.isFinite(ahoraMs)) throw new Error('ahoraMs requerido');
  if (!Array.isArray(actividades) || !Array.isArray(dailyMovement)) throw new Error('Datos inválidos');

  const hoy = fechaLocalDe(ahoraMs, timezone);
  const diaSemana = new Date(`${hoy}T00:00:00Z`).getUTCDay();
  const desde = sumarDias(hoy, -((diaSemana + 6) % 7));
  const advertencias = new Set();
  const ids = new Set();
  const validas = [];
  for (const a of actividades) {
    if (a.user_id !== userId || a.excluida === true) continue;
    const inicio = recordedAtAMs(a.recorded_at);
    if (!a.id || !numeroValido(a.distance_km) || inicio === null
      || (a.duration_seconds != null && !numeroValido(a.duration_seconds))) {
      advertencias.add('actividad_invalida');
      continue;
    }
    if (inicio > ahoraMs) { advertencias.add('actividad_futura'); continue; }
    // Una fila repetida indica un error de lectura: fallar evita elegir valores arbitrarios.
    if (ids.has(a.id)) throw new Error('Actividad repetida en la lectura');
    ids.add(a.id);
    if (Number(a.distance_km) > 0) validas.push(a);
  }

  const healthPorFecha = new Map();
  for (const fila of dailyMovement) {
    if (fila.user_id !== userId) continue;
    if (!fechaValida(fila.fecha)) { advertencias.add('health_fecha_invalida'); continue; }
    if (fila.fecha < desde || fila.fecha > hoy) continue;
    if (healthPorFecha.has(fila.fecha)) throw new Error('Día Health repetido en la lectura');
    healthPorFecha.set(fila.fecha, fila);
  }

  const dias = [];
  for (let fecha = desde; fecha <= hoy; fecha = sumarDias(fecha, 1)) {
    const ventana = ventanaDiaUTC(fecha, timezone);
    const asignadas = validas.map((a) => asignarActividadAlDia(a, ventana, timezone)).filter(Boolean);
    const kmActividades = asignadas.reduce((s, a) => s + a.km_asignados_sin_redondear, 0);
    const fila = healthPorFecha.get(fecha);
    let healthEstado = 'sin_datos';
    let residualKm = 0;
    let pasos = null;
    let actualizadoAt = null;
    if (fila) {
      if (!esTimezoneValida(fila.timezone)
        || !numeroValido(fila.distancia_caminando_km) || !numeroValido(fila.distancia_bici_km)
        || (fila.pasos != null && (!Number.isInteger(fila.pasos) || fila.pasos < 0))) {
        healthEstado = 'datos_invalidos';
        advertencias.add('health_datos_invalidos');
      } else {
        const origen = ventanaDiaUTC(fecha, fila.timezone);
        // No prorratear totales diarios al viajar: no conocemos a qué hora se produjeron.
        // Zonas distintas con la MISMA ventana sí son compatibles (p. ej. Zagreb/Warsaw).
        if (origen.inicioMs !== ventana.inicioMs || origen.finMs !== ventana.finMs) {
          healthEstado = 'zona_incompatible';
          advertencias.add('health_zona_incompatible');
        } else {
          const residual = calcularResidualDia(fila, validas, ahoraMs);
          residualKm = residual.residual.total_crudo_km;
          pasos = fila.pasos ?? null;
          actualizadoAt = fila.updated_at ?? null;
          healthEstado = 'disponible';
        }
      }
    }
    dias.push({
      fecha,
      km_actividades: redondear(kmActividades),
      km_health_adicional: residualKm,
      km_movimiento: redondear(kmActividades + residualKm),
      pasos,
      health_estado: healthEstado,
      health_actualizado_at: actualizadoAt,
      // Los valores pueden variar por sync, edición/eliminación o una corrección de Health.
      revisable: true,
    });
  }

  return {
    regla_version: REGLA_VERSION,
    timezone,
    calculado_at: new Date(ahoraMs).toISOString(),
    historial: {
      km_actividades: redondear(validas.reduce((s, a) => s + Number(a.distance_km), 0)),
      cantidad_actividades: validas.length,
      // Solo lo que está respaldado por activities; no es el total histórico de Health.
      fuente: 'activities',
    },
    hoy: dias[dias.length - 1],
    semana: {
      desde, hasta: hoy,
      km_actividades: redondear(dias.reduce((s, d) => s + d.km_actividades, 0)),
      km_health_adicional: redondear(dias.reduce((s, d) => s + d.km_health_adicional, 0)),
      km_movimiento: redondear(dias.reduce((s, d) => s + d.km_movimiento, 0)),
      pasos_disponibles: dias.some((d) => d.pasos !== null)
        ? dias.reduce((s, d) => s + (d.pasos ?? 0), 0) : null,
      dias_con_datos_pasos: dias.filter((d) => d.pasos !== null).length,
      dias_con_datos_health: dias.filter((d) => d.health_estado === 'disponible').length,
      dias,
    },
    advertencias: [...advertencias].sort(),
  };
}

module.exports = { REGLA_VERSION, calcularMovimientoPersonal };
