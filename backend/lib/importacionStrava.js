// Writer de IMPORTACIÓN STRAVA (GET /strava/actividades/:userId) con el motor unificado (Etapa 4A-7).
//
// Se usa solo si MOTOR_PROGRESO_WRITERS incluye "strava_import" Y "efectos". Con la flag apagada
// (o sin "efectos") la ruta sigue ejecutando exactamente el código viejo (calcularKmDeChallenge +
// Math.max + UPDATE condicional + email/push propios).
//
// Lo que NO cambia respecto del camino viejo y queda en la ruta (antes de llegar acá): token de
// Strava, lectura de las últimas actividades, filtro sin distancia, corte por el started_at más
// reciente, anti-duplicados del mismo día (yaExisteActividad) y armado de cada fila.
//
// Orden de operaciones (seguro aunque el proceso muera en cualquier punto):
//  1. Marca: en TODOS los desafíos 'active' del usuario (protocolo de lib/marcaRecalculo.js). Si no
//     se puede marcar, NO se escribe ninguna actividad y se responde el error viejo.
//  2. Upsert de cada actividad por external_id (igual que hoy). Reimportar la misma actividad la
//     reescribe sin duplicarla, y NO toca `excluida`: una actividad que el usuario eliminó sigue
//     excluida. Si un upsert falla, se sigue con las demás (como el viejo, que no lo revisaba) y se
//     informa.
//  3. Recálculo de TODOS los desafíos del usuario con el motor: km_base + actividades válidas (1:1,
//     cualquier deporte), versión Estándar/Extendida, pausas, terminales congelados. La completitud
//     va por la RPC con su evento 'completado' (único por desafío).
//  4. Borrado de las marcas PROPIAS (compare-and-set). Las ajenas quedan para la recuperación.
//  5. Efectos: se dispara el procesamiento de los eventos creados, sin esperarlo. Si el proceso
//     muere, la recuperación periódica los procesa (una sola vez).
//
// Si el recálculo falla, las actividades ya quedaron guardadas y marcadas: la recuperación lo
// completa. La respuesta sigue siendo la de una importación correcta, con progreso 'pendiente'.
const { recalcularConReintentos, logMotor } = require('./recuperacionRecalculo');
const { tomarMarca, renovarMarcas, generarMarcaUnica } = require('./marcaRecalculo');
const { candadoPorUsuario } = require('./candadoUsuario');

const ERROR_VIEJO = 'Error importando actividades';
const RENOVAR_MARCAS_DESPUES_MS = 30 * 1000;

const logImportacion = (datos) => logMotor({ writer: 'strava_import', ...datos });

/**
 * @param {object} p
 * @param {object} p.repo
 * @param {string} p.userId
 * @param {object[]} p.filas   filas de activities a upsertear (ya filtradas y sin duplicados del día)
 * @returns {Promise<{ ok: boolean, error?: string, importadas: number, fallidas: object[], progreso: object|null, eventos: string[] }>}
 */
const importarActividadesStravaConMotor = async ({
  repo, userId, filas, ahoraMs = Date.now(), log = logImportacion, esperasMs, esperar,
  generarMarca = generarMarcaUnica, candado = candadoPorUsuario, reloj = Date.now, dispararEfectos = () => {},
}) => {
  if (!Array.isArray(filas) || filas.length === 0) {
    return { ok: true, importadas: 0, fallidas: [], progreso: null, eventos: [] };
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
      log({ resultado: 'no_se_pudo_marcar', error: e && e.message });
      return { ok: false, error: e && e.message, importadas: 0, fallidas: [], progreso: null, eventos: [] };
    }
    const propias = marcas.filter((m) => m.propia);
    const compartidas = marcas.filter((m) => !m.propia);

    // 2. Upsert de cada actividad (por external_id).
    let importadas = 0;
    const fallidas = [];
    for (const fila of filas) {
      try {
        await repo.upsertActividadStrava({ fila });
        importadas += 1;
      } catch (e) {
        fallidas.push({ external_id: fila.external_id, error: e && e.message });
      }
    }
    if (fallidas.length > 0) log({ resultado: 'upserts_fallidos', fallidas });

    // 3 y 4. Recalcular todos los desafíos del usuario y borrar solo las marcas propias.
    const r = await recalcularConReintentos({
      repo,
      userId,
      challengeId: null,
      marcasALimpiar: propias.map((m) => ({ id: m.id, marca: m.marca })),
      motivo: 'strava_import',
      ahoraMs,
      esperasMs,
      esperar,
    });

    if (!r.ok) {
      log({ resultado: 'importada_recalculo_pendiente', importadas, marcas: marcas.length, intentos: r.intentos, error: r.error && r.error.message });
      return {
        ok: true, importadas, fallidas, eventos: [],
        progreso: { motor: true, recalculo: 'pendiente', recuperacion: 'automatica' },
      };
    }

    // 5. Efectos de los eventos creados por ESTE recálculo, sin bloquear la respuesta.
    const eventos = r.informe.eventos_para_procesar;
    if (eventos.length > 0) dispararEfectos(eventos);

    const desafios = r.informe.desafios.map((d) => ({
      user_challenge_id: d.user_challenge_id, accion: d.accion, km_antes: d.km_leido, km_despues: d.km_nuevo,
    }));
    const marcasParaRecuperacion = compartidas.length + (propias.length - r.marcasBorradas);
    log({
      resultado: 'importada',
      recalculo: 'ok',
      importadas,
      fallidas: fallidas.length,
      desafios,
      completados: r.informe.completados,
      escrituras: r.informe.escrituras,
      eventos_creados: r.informe.eventos_creados.length,
      intentos: r.intentos,
      marcas_para_recuperacion: marcasParaRecuperacion,
    });
    return {
      ok: true, importadas, fallidas, eventos,
      progreso: {
        motor: true,
        recalculo: 'ok',
        desafios,
        completados: r.informe.completados,
        eventos_pendientes: eventos.length,
        marcas_para_recuperacion: marcasParaRecuperacion,
      },
    };
  });
};

module.exports = { importarActividadesStravaConMotor, ERROR_VIEJO };
