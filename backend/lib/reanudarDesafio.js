// Writer canario de REANUDAR con el motor unificado (Etapa 4A-3c).
//
// Se usa solo si MOTOR_PROGRESO_WRITERS incluye "reanudar". Con la flag apagada
// /challenges/reanudar sigue ejecutando exactamente el código viejo.
//
// Orden de operaciones:
//  1. Leer el desafío (igual que antes: user_id + challenge_id).
//  2. Cerrar la pausa abierta con compare-and-set: sigue pausado y con el mismo pausado_at.
//     Se agrega el período { desde: pausado_at, hasta: ahora } a periodos_pausados.
//  3. Recalcular SOLO ese desafío con el motor (km_base + actividades válidas, respetando
//     todos los períodos de pausa ya cerrados), usando el estado recién guardado.
//
// Garantías:
//  - km_base nunca se escribe (el motor no puede; el repo no lo incluye en ningún UPDATE).
//  - Un desafío con base no pierde progreso: el motor siempre suma la base.
//  - Terminales congelados: el motor no escribe completed/cargado/shipped (la pausa sí se cierra).
//  - Recuperación garantizada: el mismo update que cierra la pausa deja la marca persistente
//    user_challenges.recalculo_pendiente_desde. Después se recalcula con hasta 3 intentos
//    inmediatos; la marca se borra solo cuando el recálculo terminó bien. Si todos fallan (o el
//    proceso muere en cualquier punto después de cerrar la pausa), la marca queda en la base y la
//    recuperación periódica (recuperacionRecalculo.js, al arrancar y cada 10 min) lo completa.
//    La pausa NO se revierte; km_completed y km_base no se tocan hasta que el motor recalcule bien.
//  - Los eventos que se registren (ej. 'completado') quedan PENDIENTES: en esta fase no se
//    procesan efectos (certificado/email/push) automáticamente.
const { recalcularConReintentos } = require('./recuperacionRecalculo');

const logEstructurado = (datos) => {
  try {
    console.log(JSON.stringify({ evento: 'motor_progreso', writer: 'reanudar', ...datos }));
  } catch {
    // no romper el pedido por un log
  }
};

/**
 * @returns {Promise<{ status: number, body: object }>}
 */
const reanudarDesafioConMotor = async ({ repo, userId, challengeId, ahoraMs = Date.now(), log = logEstructurado, esperasMs, esperar }) => {
  const lectura = await repo.leerDesafioParaReanudar({ userId, challengeId });
  if (lectura.estado !== 'ok') {
    if (lectura.estado === 'duplicado') log({ resultado: 'duplicado', user_id: userId, challenge_id: challengeId });
    return { status: 404, body: { error: 'Desafío no encontrado' } };
  }

  const uc = lectura.uc;
  if (uc.pausado !== true) {
    return { status: 200, body: { mensaje: 'No estaba pausado' } };
  }

  // 2. Cerrar la pausa. Si pausado_at falta (no debería), no se inventa un período:
  //    se cierra la pausa sin agregarlo y se deja registrado.
  const periodosActuales = Array.isArray(uc.periodos_pausados) ? uc.periodos_pausados : [];
  const ahoraIso = new Date(ahoraMs).toISOString();
  const periodosNuevos = uc.pausado_at
    ? [...periodosActuales, { desde: uc.pausado_at, hasta: ahoraIso }]
    : periodosActuales;
  if (!uc.pausado_at) log({ resultado: 'pausa_sin_pausado_at', user_challenge_id: uc.id });

  // La marca de recálculo pendiente viaja en el MISMO update: no hay instante en que la pausa
  // esté cerrada sin la marca.
  const marcaIso = ahoraIso;
  const cerro = await repo.cerrarPausaCAS({ id: uc.id, pausadoAtLeido: uc.pausado_at, periodosNuevos, marcaRecalculoIso: marcaIso });
  if (!cerro) {
    // Otra reanudación simultánea la cerró primero: mismo resultado que el viejo cuando ya no está pausado.
    log({ resultado: 'pausa_ya_cerrada_por_otro', user_challenge_id: uc.id });
    return { status: 200, body: { mensaje: 'No estaba pausado' } };
  }

  // 3. Recalcular solo este desafío con el estado recién guardado (reintentos acotados).
  const r = await recalcularConReintentos({
    repo,
    userId: uc.user_id,
    challengeId: uc.challenge_id,
    ucId: uc.id,
    marcaIso,
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
};

module.exports = { reanudarDesafioConMotor };