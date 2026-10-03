// Flags del motor unificado de progreso (Etapa 4A).
//
// Cada writer viejo pasa al motor solo si su nombre está en la variable de entorno
//   MOTOR_PROGRESO_WRITERS   (lista separada por comas, ej.: "reanudar,eliminar_actividad,efectos,modalidad")
// Writers conocidos: reanudar (4A-3c), eliminar_actividad (4A-3d), modalidad (4A-3e), actividad_manual (4A-6),
// strava_import (4A-7), strava_webhook (4A-8).
// "efectos" (4A-3e) no es un writer: enciende el procesamiento de efectos de progreso_eventos
// (certificado, emails, push). "modalidad", "actividad_manual", "strava_import" y "strava_webhook" solo entran al motor si "efectos" también
// está encendido (completan desafíos: sin efectos quedarían sin certificado, emails ni push).
// Si la variable no existe o está vacía, TODOS siguen con el código viejo (OFF por defecto).
// Rollback de un writer: sacar su nombre de la variable en Railway.

const WRITERS_CONOCIDOS = ['reanudar', 'eliminar_actividad', 'modalidad', 'efectos', 'actividad_manual', 'strava_import', 'strava_webhook'];

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

/** carga manual usa el motor solo con "actividad_manual" Y "efectos" encendidos (mismo motivo que modalidad). */
const actividadManualMotorActiva = (env = process.env) => writerMotorActivo('actividad_manual', env) && efectosMotorActivos(env);

/** importación Strava usa el motor solo con "strava_import" Y "efectos" encendidos (completa desafíos). */
const stravaImportMotorActiva = (env = process.env) => writerMotorActivo('strava_import', env) && efectosMotorActivos(env);

/** webhook de Strava usa el motor solo con "strava_webhook" Y "efectos" encendidos (completa desafíos). */
const stravaWebhookMotorActiva = (env = process.env) => writerMotorActivo('strava_webhook', env) && efectosMotorActivos(env);

module.exports = { WRITERS_CONOCIDOS, writersActivos, writerMotorActivo, algunWriterMotorActivo, efectosMotorActivos, modalidadMotorActiva, actividadManualMotorActiva, stravaImportMotorActiva, stravaWebhookMotorActiva };