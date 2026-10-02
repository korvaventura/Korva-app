// Writer canario de REANUDAR con el motor unificado (Etapa 4A-3c; protocolo de marca 4A-3d).
//
// Se usa solo si MOTOR_PROGRESO_WRITERS incluye "reanudar". Con la flag apagada
// /challenges/reanudar sigue ejecutando exactamente el código viejo.
//
// Orden de operaciones:
//  1. Leer el desafío (igual que antes: user_id + challenge_id), incluida su marca actual.
//  2. Cerrar la pausa abierta con compare-and-set: sigue pausado, con el mismo pausado_at y con la
//     misma marca leída. Se agrega el período { desde: pausado_at, hasta: ahora } y, en el MISMO
//     update, una marca nueva de recálculo pendiente. Si la marca cambió en el medio, se relee y
//     se reintenta (acotado).
//  3. Recalcular SOLO ese desafío con el motor (km_base + actividades válidas, respetando
//     todos los períodos de pausa ya cerrados), usando el estado recién guardado.
//  4. Borrar la marca SOLO si este pedido es su dueño (la encontró en NULL), con compare-and-set.
//     Si había otra marca (otro pedido en curso o un pendiente), se deja para la recuperación.
//     Protocolo completo: lib/marcaRecalculo.js.
//
// Garantías:
//  - km_base nunca se escribe (el motor no puede; el repo no lo incluye en ningún UPDATE).
//  - Un desafío con base no pierde progreso: el motor siempre suma la base.
//  - Terminales congelados: el motor no escribe completed/cargado/shipped (la pausa sí se cierra).
//  - Si el recálculo falla (o el proceso muere en cualquier punto después de cerrar la pausa), la
//    marca queda en la base y la recuperación periódica (al arrancar y cada 10 min) lo completa.
//  - Los eventos que se registren (ej. 'completado') quedan PENDIENTES: en esta fase no se
//    procesan efectos (certificado/email/push) automáticamente.
const { recalcularConReintentos, logMotor } = require('./recuperacionRecalculo');
const { generarMarcaUnica, distintaDe } = require('./marcaRecalculo');
const { candadoPorUsuario } = require('./candadoUsuario');

const INTENTOS_CIERRE = 4;

const logReanudar = (datos) => logMotor({ writer: 'reanudar', ...datos });

/**
 * @returns {Promise<{ status: number, body: object }>}
 */
const reanudarDesafioConMotor = async ({
  repo, userId, challengeId, ahoraMs = Date.now(), log = logReanudar, esperasMs, esperar,
  generarMarca = generarMarcaUnica, candado = candadoPorUsuario,
}) => candado(String(userId), async () => {
  let uc = null;
  let cerro = false;
  let marcaIso = null;
  let marcaLeida = null;

  for (let intento = 1; intento <= INTENTOS_CIERRE && !cerro; intento++) {
    const lectura = await repo.leerDesafioParaReanudar({ userId, challengeId });
    if (lectura.estado !== 'ok') {
      if (lectura.estado === 'duplicado') log({ resultado: 'duplicado', user_id: userId, challenge_id: challengeId });
      return { status: 404, body: { error: 'Desafío no encontrado' } };
    }
    uc = lectura.uc;
    if (uc.pausado !== true) {
      // Otra reanudación simultánea la cerró primero: mismo resultado que el viejo cuando ya no está pausado.
      if (intento > 1) log({ resultado: 'pausa_ya_cerrada_por_otro', user_challenge_id: uc.id });
      return { status: 200, body: { mensaje: 'No estaba pausado' } };
    }

    // 2. Cerrar la pausa. Si pausado_at falta (no debería), no se inventa un período:
    //    se cierra la pausa sin agregarlo y se deja registrado.
    const periodosActuales = Array.isArray(uc.periodos_pausados) ? uc.periodos_pausados : [];
    const ahoraIso = new Date(ahoraMs).toISOString();
    const periodosNuevos = uc.pausado_at
      ? [...periodosActuales, { desde: uc.pausado_at, hasta: ahoraIso }]
      : periodosActuales;
    if (!uc.pausado_at && intento === 1) log({ resultado: 'pausa_sin_pausado_at', user_challenge_id: uc.id });

    // La marca viaja en el MISMO update: no hay instante en que la pausa esté cerrada sin marca.
    marcaLeida = uc.recalculo_pendiente_desde === undefined ? null : uc.recalculo_pendiente_desde;
    marcaIso = distintaDe(generarMarca(ahoraMs), marcaLeida);
    cerro = await repo.cerrarPausaCAS({
      id: uc.id, pausadoAtLeido: uc.pausado_at, periodosNuevos, marcaRecalculoIso: marcaIso, marcaLeida,
    });
  }
  if (!cerro) {
    // La marca cambió en cada intento (mucha actividad concurrente): no se cerró nada.
    log({ resultado: 'cierre_no_logrado', user_challenge_id: uc && uc.id });
    throw new Error('No se pudo cerrar la pausa: el desafío cambió durante la operación');
  }

  const propia = marcaLeida === null;
  if (!propia) log({ resultado: 'marca_compartida', user_challenge_id: uc.id, marca: marcaIso });

  // 3. Recalcular solo este desafío con el estado recién guardado (reintentos acotados).
  //    4. Solo el dueño borra la marca.
  const r = await recalcularConReintentos({
    repo,
    userId: uc.user_id,
    challengeId: uc.challenge_id,
    marcasALimpiar: propia ? [{ id: uc.id, marca: marcaIso }] : [],
    motivo: 'reanudar',
    ahoraMs,
    esperasMs,
    esperar,
  });

  if (!r.ok) {
    log({
      resultado: 'reanudado_recalculo_pendiente', user_challenge_id: uc.id, marca: marcaIso,
      intentos: r.intentos, error: r.error && r.error.message,
    });
    return {
      status: 200,
      body: {
        mensaje: 'Desafío reanudado',
        progreso: { motor: true, recalculo: 'pendiente', recuperacion: 'automatica' },
      },
    };
  }

  const registro = r.informe.desafios.find((d) => d.user_challenge_id === uc.id) || null;
  log({
    resultado: 'reanudado',
    recalculo: 'ok',
    user_challenge_id: uc.id,
    accion: registro && registro.accion,
    km_leido: registro && registro.km_leido,
    km_nuevo: registro && registro.km_nuevo,
    km_base: registro && registro.km_base,
    escrituras: r.informe.escrituras,
    eventos_creados: r.informe.eventos_creados.length,
    intentos: r.intentos,
    marca_para_recuperacion: !propia || r.marcasBorradas === 0,
  });
  return {
    status: 200,
    body: {
      mensaje: 'Desafío reanudado y km recalculados',
      progreso: {
        motor: true,
        recalculo: 'ok',
        km_antes: registro ? registro.km_leido : null,
        km_despues: registro ? registro.km_nuevo : null,
        eventos_pendientes: r.informe.eventos_creados.length,
      },
    },
  };
});

module.exports = { reanudarDesafioConMotor };