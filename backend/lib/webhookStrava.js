// Writer del WEBHOOK DE STRAVA (POST /strava/webhook) con el motor unificado (Etapa 4A-8).
//
// Se usa solo si MOTOR_PROGRESO_WRITERS incluye "strava_webhook" Y "efectos". Con la flag apagada
// (o sin "efectos") la ruta sigue ejecutando exactamente el código viejo (procesarActividad).
//
// Este módulo procesa UN evento ya guardado en la bandeja persistente (lib/bandejaWebhookStrava.js).
// La bandeja garantiza que el evento no se pierde (se guarda ANTES de responder 200 a Strava) y que
// se reintenta si el proceso muere; acá solo se aplica el evento, de forma idempotente:
//  - create / update → 'upsert': se lee la actividad de Strava (FUERA del candado: una consulta lenta
//    a Strava no frena las otras escrituras del usuario) y se guarda por external_id con la RPC
//    guardar_actividad_strava. Mismos filtros que el viejo (sin distancia, duplicada del mismo día).
//  - delete → 'delete': RPC borrar_actividad_strava: deja una LÁPIDA persistente del external_id y
//    excluye la actividad si ya existe. Aunque todavía no exista (delete antes que create, o un create
//    o una importación en otro proceso), la lápida hace que cuando llegue se guarde excluida.
//
// La consistencia NO depende del candado en memoria (que se mantiene como optimización):
//  - lápida + guardado son atómicos entre procesos (pg_advisory_xact_lock por external_id en las RPC);
//  - marca persistente en TODOS los desafíos activos antes de escribir la actividad;
//  - recálculo idempotente con compare-and-set; completitud por la RPC con evento único;
//  - recuperación periódica de marcas y de efectos.
//
// Orden: preparar (sin escribir) → candado → marcar → escribir (RPC) → recalcular → limpiar marcas
// propias → disparar efectos.
const { recalcularConReintentos, logMotor } = require('./recuperacionRecalculo');
const { tomarMarca, renovarMarcas, generarMarcaUnica } = require('./marcaRecalculo');
const { candadoPorUsuario } = require('./candadoUsuario');

const RENOVAR_MARCAS_DESPUES_MS = 30 * 1000;
const OPERACIONES = { UPSERT: 'upsert', DELETE: 'delete' };

const logWebhook = (datos) => logMotor({ writer: 'strava_webhook', ...datos });

/** Traduce el evento de Strava a una operación del motor (o null si no se procesa). */
const operacionDeEvento = (evento) => {
  if (!evento || evento.object_type !== 'activity') return null;
  if (evento.aspect_type === 'create' || evento.aspect_type === 'update') return OPERACIONES.UPSERT;
  if (evento.aspect_type === 'delete') return OPERACIONES.DELETE;
  return null;
};

/**
 * @param {object} p
 * @param {object} p.repo                  repositorio del motor (con guardarActividadStravaConLapida / borrarActividadStrava)
 * @param {string} p.userId
 * @param {'upsert'|'delete'} p.operacion
 * @param {string} p.externalId             id de la actividad en Strava (texto)
 * @param {Function} [p.prepararFila]       solo 'upsert': async () => ({ fila }) | ({ ignorar: motivo })
 * @param {number|null} [p.ownerId]         atleta de Strava (solo informativo en la lápida)
 * @param {string|null} [p.eventoId]        id del evento en la bandeja (solo informativo en la lápida)
 * @returns {Promise<{ ok: boolean, resultado: string, motivo?: string, error?: string, insertada?: boolean, progreso: object|null, eventos: string[], desafios: object[] }>}
 */
const procesarWebhookStravaConMotor = async ({
  repo, userId, operacion, externalId, prepararFila, ownerId = null, eventoId = null,
  ahoraMs = Date.now(), log = logWebhook, esperasMs, esperar,
  generarMarca = generarMarcaUnica, candado = candadoPorUsuario, reloj = Date.now, dispararEfectos = () => {},
}) => {
  const vacio = (resultado, extra = {}) => ({ ok: true, resultado, progreso: null, eventos: [], desafios: [], ...extra });
  const fallo = (resultado, e, extra = {}) => ({ ok: false, resultado, error: e && e.message, progreso: null, eventos: [], desafios: [], ...extra });
  if (operacion !== OPERACIONES.UPSERT && operacion !== OPERACIONES.DELETE) return vacio('ignorada', { motivo: 'operacion_desconocida' });

  // 0. Preparar (sin escribir nada y SIN candado: puede tardar lo que tarde Strava).
  let fila = null;
  if (operacion === OPERACIONES.UPSERT) {
    let preparada;
    try {
      preparada = await prepararFila();
    } catch (e) {
      log({ resultado: 'no_se_pudo_leer_strava', operacion, external_id: externalId, error: e && e.message });
      return fallo('no_se_pudo_leer_strava', e);
    }
    if (!preparada || !preparada.fila) {
      const motivo = (preparada && preparada.ignorar) || 'sin_fila';
      log({ resultado: 'ignorada', operacion, external_id: externalId, motivo });
      return vacio('ignorada', { motivo });
    }
    fila = preparada.fila;
  }

  return candado(String(userId), async () => {
    // 1. Marcar todos los desafíos activos ANTES de cambiar las actividades.
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
      log({ resultado: 'no_se_pudo_marcar', operacion, external_id: externalId, error: e && e.message });
      return fallo('no_se_pudo_marcar', e);
    }
    const propias = marcas.filter((m) => m.propia);
    const compartidas = marcas.filter((m) => !m.propia);

    // 2. Escribir con la RPC (atómica con las lápidas). Si falla, las marcas quedan: la recuperación
    //    recalcula, y la bandeja reintenta el evento.
    let escrito;
    try {
      escrito = operacion === OPERACIONES.UPSERT
        ? await repo.guardarActividadStravaConLapida({ fila })
        : await repo.borrarActividadStrava({ userId, externalId, ownerId, eventoId });
    } catch (e) {
      log({ resultado: 'no_se_pudo_escribir', operacion, external_id: externalId, marcas: marcas.length, error: e && e.message });
      return fallo('no_se_pudo_escribir', e);
    }
    const insertada = operacion === OPERACIONES.UPSERT && escrito.insertada === true;
    const detalle = operacion === OPERACIONES.UPSERT
      ? { insertada, excluida: escrito.excluida === true, lapida: escrito.lapida === true }
      : { lapida_nueva: escrito.lapida_nueva === true, excluidas: Number(escrito.excluidas || 0) };

    // 3 y 4. Recalcular todos los desafíos del usuario y borrar solo las marcas propias.
    const r = await recalcularConReintentos({
      repo,
      userId,
      challengeId: null,
      marcasALimpiar: propias.map((m) => ({ id: m.id, marca: m.marca })),
      motivo: 'strava_webhook',
      ahoraMs,
      esperasMs,
      esperar,
    });

    if (!r.ok) {
      log({ resultado: 'escrita_recalculo_pendiente', operacion, external_id: externalId, ...detalle, marcas: marcas.length, intentos: r.intentos, error: r.error && r.error.message });
      return {
        ok: true, resultado: 'escrita', insertada, detalle, eventos: [], desafios: [],
        progreso: { motor: true, recalculo: 'pendiente', recuperacion: 'automatica' },
      };
    }

    // 5. Efectos de los eventos creados por ESTE recálculo, sin bloquear.
    const eventos = r.informe.eventos_para_procesar;
    if (eventos.length > 0) dispararEfectos(eventos);

    const desafios = r.informe.desafios.map((d) => ({
      user_challenge_id: d.user_challenge_id, challenge_id: d.challenge_id, status_leido: d.status_leido,
      accion: d.accion, escrito: d.escrito, km_antes: d.km_leido, km_despues: d.km_nuevo,
    }));
    const marcasParaRecuperacion = compartidas.length + (propias.length - r.marcasBorradas);
    log({
      resultado: 'procesada',
      operacion,
      external_id: externalId,
      ...detalle,
      recalculo: 'ok',
      desafios: desafios.map(({ user_challenge_id, accion, km_antes, km_despues }) => ({ user_challenge_id, accion, km_antes, km_despues })),
      completados: r.informe.completados,
      escrituras: r.informe.escrituras,
      eventos_creados: r.informe.eventos_creados.length,
      intentos: r.intentos,
      marcas_para_recuperacion: marcasParaRecuperacion,
    });
    return {
      ok: true, resultado: 'escrita', insertada, detalle, eventos, desafios,
      progreso: {
        motor: true,
        recalculo: 'ok',
        completados: r.informe.completados,
        eventos_pendientes: eventos.length,
        marcas_para_recuperacion: marcasParaRecuperacion,
      },
    };
  });
};

module.exports = { procesarWebhookStravaConMotor, operacionDeEvento, OPERACIONES };
