// Writer de ELIMINAR ACTIVIDAD con el motor unificado (Etapa 4A-3d).
//
// Se usa solo si MOTOR_PROGRESO_WRITERS incluye "eliminar_actividad". Con la flag apagada,
// DELETE /actividades/:actividadId sigue ejecutando exactamente el código viejo.
//
// Orden de operaciones (cada paso es seguro aunque el proceso muera justo antes o después):
//  1. Marca: en TODOS los desafíos 'active' del usuario se pone (o renueva) la marca persistente
//     recalculo_pendiente_desde, con compare-and-set. Si no se puede marcar alguno, NO se excluye
//     nada y se responde error (como el viejo ante un error).
//  2. Exclusión: activities.excluida = true de esa actividad del usuario (igual que hoy; no borra la
//     fila). Si no existe o es de otro usuario no excluye nada. Repetirla es inocuo.
//  3. Recálculo: el motor recalcula TODOS los desafíos del usuario con una sola lectura de
//     actividades: km_base + actividades válidas, pausas respetadas (cerradas y la abierta),
//     terminales congelados, 'pending' sin calcular. Hasta 3 intentos inmediatos.
//  4. Borrado de marcas: solo las PROPIAS (las que este pedido encontró en NULL), con
//     compare-and-set sobre su valor. Las demás quedan para la recuperación periódica.
//
// Protocolo y argumento de corrección: lib/marcaRecalculo.js. El candado por usuario en memoria es
// solo una optimización: la corrección no depende de él ni de que haya un único proceso.
//
// No hace: procesar efectos de progreso_eventos (un evento 'completado' o 'cruce_75' queda
// PENDIENTE), escribir km_base, tocar otros writers.
const { recalcularConReintentos, logMotor } = require('./recuperacionRecalculo');
const { tomarMarca, renovarMarcas, generarMarcaUnica } = require('./marcaRecalculo');
const { candadoPorUsuario } = require('./candadoUsuario');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MENSAJE_OK = 'Actividad eliminada y km recalculados';
const ERROR_VIEJO = 'Error eliminando actividad';

// Si entre marcar y excluir pasa más que esto, se renuevan las marcas antes de excluir: así la
// recuperación (que solo toma marcas de más de 2 min) nunca toma la marca de este pedido en curso.
const RENOVAR_MARCAS_DESPUES_MS = 30 * 1000;

const logEliminar = (datos) => logMotor({ writer: 'eliminar_actividad', ...datos });

/** Misma forma de error que el DELETE viejo (responde 200 con { error, detalle }). */
const respuestaError = (detalle) => ({ status: 200, body: { error: ERROR_VIEJO, detalle } });

/**
 * @returns {Promise<{ status: number, body: object }>}
 */
const eliminarActividadConMotor = async ({
  repo, userId, actividadId, ahoraMs = Date.now(), log = logEliminar, esperasMs, esperar,
  generarMarca = generarMarcaUnica, candado = candadoPorUsuario, reloj = Date.now,
}) => {
  // Entradas inválidas: el viejo terminaba en un error de la base con la misma respuesta.
  if (!userId || !UUID_RE.test(String(userId))) return respuestaError('user_id inválido');
  if (!actividadId || !UUID_RE.test(String(actividadId))) return respuestaError('actividadId inválido');

  return candado(String(userId), async () => {
    // 1. Marcar todos los desafíos activos del usuario ANTES de tocar la actividad.
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
        log({ resultado: 'marcas_renovadas', actividad_id: actividadId, marcas: marcas.length });
        marcas = await renovarMarcas({ repo, marcas, ahoraMs, generarMarca });
      }
    } catch (e) {
      // No se excluyó nada. Las marcas que sí se pusieron las borra la recuperación (sin cambios de km).
      log({ resultado: 'no_se_pudo_marcar', actividad_id: actividadId, error: e && e.message });
      return respuestaError(e && e.message);
    }
    const propias = marcas.filter((m) => m.propia);
    const compartidas = marcas.filter((m) => !m.propia);

    // 2. Excluir la actividad (si esto falla, las marcas quedan y la recuperación recalcula igual:
    //    el error puede haber ocurrido después de que la base aplicó el cambio).
    let encontrada;
    try {
      ({ encontrada } = await repo.excluirActividad({ actividadId, userId }));
    } catch (e) {
      log({ resultado: 'exclusion_fallida', actividad_id: actividadId, marcas: marcas.length, error: e && e.message });
      return respuestaError(e && e.message);
    }

    // 3 y 4. Recalcular todos los desafíos del usuario y borrar solo las marcas propias.
    const r = await recalcularConReintentos({
      repo,
      userId,
      challengeId: null,
      marcasALimpiar: propias.map((m) => ({ id: m.id, marca: m.marca })),
      motivo: 'eliminar_actividad',
      ahoraMs,
      esperasMs,
      esperar,
    });

    if (!r.ok) {
      log({
        resultado: 'eliminada_recalculo_pendiente', actividad_id: actividadId, actividad_encontrada: encontrada,
        marcas: marcas.length, intentos: r.intentos, error: r.error && r.error.message,
      });
      return {
        status: 200,
        body: {
          mensaje: 'Actividad eliminada',
          progreso: { motor: true, recalculo: 'pendiente', recuperacion: 'automatica', actividad_encontrada: encontrada },
        },
      };
    }

    const desafios = r.informe.desafios.map((d) => ({
      user_challenge_id: d.user_challenge_id,
      accion: d.accion,
      km_antes: d.km_leido,
      km_despues: d.km_nuevo,
    }));
    const marcasParaRecuperacion = compartidas.length + (propias.length - r.marcasBorradas);
    log({
      resultado: 'eliminada',
      recalculo: 'ok',
      actividad_id: actividadId,
      actividad_encontrada: encontrada,
      desafios,
      escrituras: r.informe.escrituras,
      eventos_creados: r.informe.eventos_creados.length,
      intentos: r.intentos,
      marcas_para_recuperacion: marcasParaRecuperacion,
    });
    return {
      status: 200,
      body: {
        mensaje: MENSAJE_OK,
        progreso: {
          motor: true,
          recalculo: 'ok',
          actividad_encontrada: encontrada,
          desafios,
          eventos_pendientes: r.informe.eventos_creados.length,
          marcas_para_recuperacion: marcasParaRecuperacion,
        },
      },
    };
  });
};

module.exports = { eliminarActividadConMotor };