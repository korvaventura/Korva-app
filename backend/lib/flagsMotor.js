// Flags del motor unificado de progreso (Etapa 4A).
//
// Cada writer viejo pasa al motor solo si su nombre está en la variable de entorno
//   MOTOR_PROGRESO_WRITERS   (lista separada por comas, ej.: "reanudar")
// Si la variable no existe o está vacía, TODOS siguen con el código viejo (OFF por defecto).
// Rollback de un writer: sacar su nombre de la variable en Railway.

const WRITERS_CONOCIDOS = ['reanudar'];

const writersActivos = (env = process.env) =>
  String(env.MOTOR_PROGRESO_WRITERS || '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => WRITERS_CONOCIDOS.includes(w));

/** true solo si el writer está explícitamente encendido. Se evalúa en cada pedido. */
const writerMotorActivo = (nombre, env = process.env) => writersActivos(env).includes(String(nombre).toLowerCase());

module.exports = { WRITERS_CONOCIDOS, writersActivos, writerMotorActivo };