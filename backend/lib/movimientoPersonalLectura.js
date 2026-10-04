// Lectura de la capa personal. No consulta desafíos ni invoca writers del motor.
const { clienteSoloLectura, traerTodo } = require('./progresoSombra');
const { calcularMovimientoPersonal } = require('./movimientoPersonal');

const CAMPOS_ACTIVIDAD = 'id, user_id, source, sport_type, distance_km, duration_seconds, recorded_at, excluida';
const CAMPOS_HEALTH = 'id, user_id, fecha, timezone, distancia_caminando_km, distancia_bici_km, pasos, updated_at';

async function leerMovimientoPersonal({ supabase, userId, timezone, ahoraMs }) {
  // La misma función determina el rango antes de leer (y valida parámetros).
  const rango = calcularMovimientoPersonal({ userId, timezone, ahoraMs }).semana;
  const db = clienteSoloLectura(supabase);
  const [actividades, dailyMovement] = await Promise.all([
    traerTodo(() => db.from('activities').select(CAMPOS_ACTIVIDAD).eq('user_id', userId)),
    traerTodo(() => db.from('daily_movement').select(CAMPOS_HEALTH).eq('user_id', userId)
      .gte('fecha', rango.desde).lte('fecha', rango.hasta)),
  ]);
  return calcularMovimientoPersonal({ userId, timezone, ahoraMs, actividades, dailyMovement });
}

module.exports = { leerMovimientoPersonal };
