// Flags del motor unificado de progreso (Etapa 4A).
//
// Cada writer viejo pasa al motor solo si su nombre está en la variable de entorno
//   MOTOR_PROGRESO_WRITERS   (lista separada por comas, ej.: "reanudar,eliminar_actividad,efectos,modalidad")
// Writers conocidos: reanudar (4A-3c), eliminar_actividad (4A-3d), modalidad (4A-3e).
// "efectos" (4A-3e) no es un writer: enciende el procesamiento de efectos de progreso_eventos
// (certificado, emails, push). "modalidad" solo entra al motor si "efectos" también está encendido.
// Si la variable no existe o está vacía, TODOS siguen con el código viejo (OFF por defecto).
// Rollback de un writer: sacar su nombre de la variable en Railway.

const WRITERS_CONOCIDOS = ['reanudar', 'eliminar_actividad', 'modalidad', 'efectos'];

const writersActivos = (env = process.env) =>
  String(env.MOTOR_PROGRESO_WRITERS || '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => WRITERS_CONOCIDOS.includes(w));

/** true solo si el writer está explícitamente encendido. Se evalúa en cada pedido. */
const writerMotorActivo = (nombre, env = process.env) => writersActivos(env).includes(String(nombre).toLowerCase());

/** true si hay al menos un writer del motor encendido (la recuperación periódica queda activa). */
const algunWriterMotorActivo = (env = process.env) => writersActivos(env).length > 0;

/** true si el procesamiento de efectos (certificado, emails, push) está encendido. */
const efectosMotorActivos = (env = process.env) => writerMotorActivo('efectos', env);

/** modalidad usa el motor solo con "modalidad" Y "efectos" encendidos (si no, completaría sin efectos). */
const modalidadMotorActiva = (env = process.env) => writerMotorActivo('modalidad', env) && efectosMotorActivos(env);

module.exports = { WRITERS_CONOCIDOS, writersActivos, writerMotorActivo, algunWriterMotorActivo, efectosMotorActivos, modalidadMotorActiva };