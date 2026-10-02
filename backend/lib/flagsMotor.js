// Flags del motor unificado de progreso (Etapa 4A).
//
// Cada writer viejo pasa al motor solo si su nombre está en la variable de entorno
//   MOTOR_PROGRESO_WRITERS   (lista separada por comas, ej.: "reanudar,eliminar_actividad")
// Writers conocidos: reanudar (4A-3c), eliminar_actividad (4A-3d).
// Si la variable no existe o está vacía, TODOS siguen con el código viejo (OFF por defecto).
// Rollback de un writer: sacar su nombre de la variable en Railway.

const WRITERS_CONOCIDOS = ['reanudar', 'eliminar_actividad'];

const writersActivos = (env = process.env) =>
  String(env.MOTOR_PROGRESO_WRITERS || '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => WRITERS_CONOCIDOS.includes(w));

/** true solo si el writer está explícitamente encendido. Se evalúa en cada pedido. */
const writerMotorActivo = (nombre, env = process.env) => writersActivos(env).includes(String(nombre).toLowerCase());

/** true si hay al menos un writer del motor encendido (la recuperación periódica queda activa). */
const algunWriterMotorActivo = (env = process.env) => writersActivos(env).length > 0;

module.exports = { WRITERS_CONOCIDOS, writersActivos, writerMotorActivo, algunWriterMotorActivo };