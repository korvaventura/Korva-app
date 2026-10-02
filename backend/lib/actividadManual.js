// Writer de CARGA MANUAL de actividad con el motor unificado (Etapa 4A-6).
//
// Se usa solo si MOTOR_PROGRESO_WRITERS incluye "actividad_manual". Con la flag apagada,
// POST /actividades/manual sigue ejecutando exactamente el código viejo (recalcularKmUsuario).
// Las validaciones del endpoint (límite diario, distancia, desafío del usuario) son las mismas en
// los dos caminos y se hacen antes de llegar acá.
//
// Orden de operaciones (cada paso es seguro aunque el proceso muera justo antes o después):
//  1. Marca: en TODOS los desafíos 'active' del usuario se pone (o renueva) la marca persistente
//     recalculo_pendiente_desde, con compare-and-set (protocolo de lib/marcaRecalculo.js). Si no se
//     puede marcar alguno, NO se inserta la actividad y se responde el error viejo.
//  2. Alta de la actividad: el mismo INSERT que hoy (source 'manual', external_id, etc.).
//  3. Corrimiento de started_at: misma regla que hoy (una actividad anterior al inicio del desafío
//     elegido lo corre hacia atrás, como máximo 30 días). Cambia una ENTRADA del cálculo: por eso va
//     después de marcar y antes de recalcular.
//  4. Recálculo: el motor recalcula TODOS los desafíos del usuario (una actividad suma a todos los
//     activos): km_base + actividades válidas, versión Estándar/Extendida, pausas, terminales
//     congelados. La completitud va por la RPC (evento 'completado' en la misma transacción).
//  5. Borrado de marcas: solo las PROPIAS, con compare-and-set. Las demás quedan para la recuperación.
//  6. Efectos: se dispara el procesamiento de los eventos creados SIN esperarlo (certificado, emails,
//     push los hace completionEventos). Si el proceso muere, la recuperación periódica los procesa.
//
// Si el recálculo falla después de insertar, la actividad queda guardada, las marcas quedan puestas
// y la recuperación periódica completa el recálculo (y sus efectos). La respuesta sigue siendo 200
// con el mismo mensaje y la actividad, porque la actividad sí se registró.
//
// No hace: escribir km_completed/status/completed_at por fuera del motor, escribir km_base, mandar
// el push de completitud (lo manda el procesador de efectos).
const { recalcularConReintentos, logMotor } = require('./recuperacionRecalculo');
const { tomarMarca, renovarMarcas, generarMarcaUnica } = require('./marcaRecalculo');
const { candadoPorUsuario } = require('./candadoUsuario');

const MENSAJE_OK = 'Actividad registrada y kilómetros sumados';
const ERROR_VIEJO = 'Error registrando actividad';
const RENOVAR_MARCAS_DESPUES_MS = 30 * 1000;

const logManual = (datos) => logMotor({ writer: 'actividad_manual', ...datos });

/** Misma forma de error que el camino viejo (500 { error, detalle }). */
const respuestaError = (detalle) => ({ status: 500, body: { error: ERROR_VIEJO, detalle } });

/**
 * @param {object} p
 * @param {object} p.repo
 * @param {string} p.userId
 * @param {string|null} p.challengeId     desafío elegido al cargar (o null: modo libre)
 * @param {object} p.actividad           fila a insertar en activities (ya armada como hoy)
 * @param {string|undefined} p.recordedAt recorded_at tal como vino en el pedido (para el corrimiento)
 * @returns {Promise<{ status: number, body: object, eventos: string[] }>}
 */
const registrarActividadManualConMotor = async ({
  repo, userId, challengeId = null, actividad, recordedAt, ahoraMs = Date.now(), log = logManual,
  esperasMs, esperar, generarMarca = generarMarcaUnica, candado = candadoPorUsuario, reloj = Date.now,
  dispararEfectos = () => {},
}) => candado(String(userId), async () => {
  // 1. Marcar todos los desafíos activos del usuario ANTES de tocar las entradas del cálculo.
  let marcas;
  try {
    const inicioMarcas = reloj();
    const activos = await repo.leerMarcasDesafiosActivos({ userId });
    marcas = [];
    for (const uc of activos) {
      const m = await tomarMarca({ repo, id: uc.id, marcaLeida: uc.recalculo_pendiente_desde ?? null, ahoraMs, generarMarca });
      if (m) marcas.push(m);
    }
    if (reloj() - inicioMarcas > RENOVAR_MARCAS_DESPUES_MS) {
      log({ resultado: 'marcas_renovadas', marcas: marcas.length });
      marcas = await renovarMarcas({ repo, marcas, ahoraMs, generarMarca });
    }
  } catch (e) {
    log({ resultado: 'no_se_pudo_marcar', error: e && e.message });
    return { ...respuestaError(e && e.message), eventos: [] };
  }
  const propias = marcas.filter((m) => m.propia);
  const compartidas = marcas.filter((m) => !m.propia);

  // 2. Alta de la actividad (si falla, las marcas quedan y la recuperación recalcula sin cambios).
  let nuevaActividad;
  try {
    nuevaActividad = await repo.insertarActividadManual({ actividad });
  } catch (e) {
    log({ resultado: 'alta_fallida', marcas: marcas.length, error: e && e.message });
    return { ...respuestaError(e && e.message), eventos: [] };
  }

  // 3. Corrimiento de started_at (misma regla que el camino viejo; sus errores no cortaban el pedido).
  let inicioCorrido = false;
  if (recordedAt && challengeId) {
    try {
      inicioCorrido = await repo.correrInicioPorActividad({ userId, challengeId, recordedAt });
    } catch (e) {
      log({ resultado: 'corrimiento_inicio_fallido', actividad_id: nuevaActividad && nuevaActividad.id, error: e && e.message });
    }
  }

  // 4 y 5. Recalcular todos los desafíos del usuario y borrar solo las marcas propias.
  const r = await recalcularConReintentos({
    repo,
    userId,
    challengeId: null,
    marcasALimpiar: propias.map((m) => ({ id: m.id, marca: m.marca })),
    motivo: 'actividad_manual',
    ahoraMs,
    esperasMs,
    esperar,
  });

  if (!r.ok) {
    log({
      resultado: 'registrada_recalculo_pendiente', actividad_id: nuevaActividad && nuevaActividad.id,
      marcas: marcas.length, intentos: r.intentos, error: r.error && r.error.message,
    });
    return {
      status: 200,
      body: {
        mensaje: MENSAJE_OK,
        actividad: nuevaActividad,
        progreso: { motor: true, recalculo: 'pendiente', recuperacion: 'automatica' },
      },
      eventos: [],
    };
  }

  // 6. Efectos de los eventos creados por ESTE recálculo, sin bloquear la respuesta.
  const eventos = r.informe.eventos_para_procesar;
  if (eventos.length > 0) dispararEfectos(eventos);

  const desafios = r.informe.desafios.map((d) => ({
    user_challenge_id: d.user_challenge_id,
    accion: d.accion,
    km_antes: d.km_leido,
    km_despues: d.km_nuevo,
  }));
  const marcasParaRecuperacion = compartidas.length + (propias.length - r.marcasBorradas);
  log({
    resultado: 'registrada',
    recalculo: 'ok',
    actividad_id: nuevaActividad && nuevaActividad.id,
    inicio_corrido: inicioCorrido,
    desafios,
    completados: r.informe.completados,
    escrituras: r.informe.escrituras,
    eventos_creados: r.informe.eventos_creados.length,
    intentos: r.intentos,
    marcas_para_recuperacion: marcasParaRecuperacion,
  });
  return {
    status: 200,
    body: {
      mensaje: MENSAJE_OK,
      actividad: nuevaActividad,
      progreso: {
        motor: true,
        recalculo: 'ok',
        desafios,
        completados: r.informe.completados,
        eventos_pendientes: eventos.length,
        marcas_para_recuperacion: marcasParaRecuperacion,
      },
    },
    eventos,
  };
});

module.exports = { registrarActividadManualConMotor };
