// Writer de CAMBIO DE MODALIDAD con el motor unificado (Etapa 4A-3e).
//
// Se usa solo si MOTOR_PROGRESO_WRITERS incluye "modalidad" Y "efectos" (ver flagsMotor). Con la
// flag apagada, PUT /usuarios/modalidad sigue ejecutando exactamente el código viejo.
//
// Cambiar de modalidad no cambia los km (cuentan todas las actividades) pero sí el objetivo: pasar
// de ride a run lo divide por 3 y puede completar el desafío en el acto.
//
// Flujo:
//  1. Leer el desafío (user_id + challenge_id) con su status y su marca. Duplicado → 500 SIN escribir.
//  2. 'pending': solo se cambia la modalidad (CAS sobre el status). El motor no calcula pending.
//  3. 'active': UN update atómico con la modalidad y una marca nueva de recálculo, condicionado al
//     status y a la marca leídos (protocolo de lib/marcaRecalculo.js). Si algo cambió, relee.
//  4. Recalcular ese desafío con el motor (base sumada, pausas, un pausado no se completa, sin
//     objetivo nunca se completa). Si completa, se registra el evento 'completado' (una vez).
//  5. Borrar la marca solo si es propia.
//  6. Disparar el procesamiento de los eventos creados, sin esperarlo: la respuesta no depende de
//     PDF/email/push. Si el proceso muere, la recuperación periódica los procesa.
const { recalcularConReintentos, logMotor } = require('./recuperacionRecalculo');
const { generarMarcaUnica, distintaDe } = require('./marcaRecalculo');
const { candadoPorUsuario } = require('./candadoUsuario');

const INTENTOS_CAMBIO = 4;
const MENSAJE_OK = 'Modalidad actualizada y kilómetros recalculados';
const NO_ACTIVO = { error: 'No tenés este desafío activo', detalle: 'Tu sesión puede estar desactualizada. Cerrá sesión y volvé a entrar.' };
const errorViejo = (detalle) => ({ status: 500, body: { error: 'Error actualizando modalidad', detalle } });

const logModalidad = (datos) => logMotor({ writer: 'modalidad', ...datos });

/**
 * @returns {Promise<{ status: number, body: object }>}
 */
const cambiarModalidadConMotor = async ({
  repo, userId, challengeId, modalidad, ahoraMs = Date.now(), log = logModalidad, esperasMs, esperar,
  generarMarca = generarMarcaUnica, candado = candadoPorUsuario, dispararEfectos = () => {},
}) => candado(String(userId), async () => {
  let uc = null;
  let fila = null;
  let marca = null;
  let marcaLeida = null;

  for (let intento = 1; intento <= INTENTOS_CAMBIO && !fila; intento++) {
    const lectura = await repo.leerDesafioParaModalidad({ userId, challengeId });
    if (lectura.estado === 'duplicado') {
      log({ resultado: 'duplicado', user_id: userId, challenge_id: challengeId });
      return errorViejo('Hay más de una inscripción para este desafío');
    }
    if (lectura.estado !== 'ok' || !['active', 'pending'].includes(lectura.uc.status)) return { status: 404, body: NO_ACTIVO };
    uc = lectura.uc;

    if (uc.status === 'pending') {
      fila = await repo.cambiarModalidadCAS({ id: uc.id, statusLeido: 'pending', modalidad });
      if (fila) {
        log({ resultado: 'modalidad_pending', user_challenge_id: uc.id, modalidad });
        return { status: 200, body: { mensaje: MENSAJE_OK, data: fila, progreso: { motor: true, recalculo: 'no_aplica' } } };
      }
      continue;
    }

    marcaLeida = uc.recalculo_pendiente_desde ?? null;
    marca = distintaDe(generarMarca(ahoraMs), marcaLeida);
    fila = await repo.cambiarModalidadCAS({ id: uc.id, statusLeido: 'active', modalidad, marcaLeida, marcaNueva: marca });
  }
  if (!fila) {
    log({ resultado: 'cambio_no_logrado', user_challenge_id: uc && uc.id });
    return errorViejo('El desafío cambió durante la operación. Intentá de nuevo.');
  }

  const propia = marcaLeida === null;
  if (!propia) log({ resultado: 'marca_compartida', user_challenge_id: uc.id, marca });

  const r = await recalcularConReintentos({
    repo,
    userId: uc.user_id,
    challengeId: uc.challenge_id,
    marcasALimpiar: propia ? [{ id: uc.id, marca }] : [],
    motivo: 'modalidad',
    ahoraMs,
    esperasMs,
    esperar,
  });

  if (!r.ok) {
    log({ resultado: 'modalidad_recalculo_pendiente', user_challenge_id: uc.id, marca, intentos: r.intentos, error: r.error && r.error.message });
    return {
      status: 200,
      body: { mensaje: MENSAJE_OK, data: fila, progreso: { motor: true, recalculo: 'pendiente', recuperacion: 'automatica' } },
    };
  }

  const registro = r.informe.desafios.find((d) => d.user_challenge_id === uc.id) || null;
  const eventos = r.informe.eventos_para_procesar;
  const completado = r.informe.completados.includes(uc.id);
  if (eventos.length > 0) dispararEfectos(eventos);

  log({
    resultado: 'modalidad_cambiada',
    recalculo: 'ok',
    user_challenge_id: uc.id,
    modalidad,
    accion: registro && registro.accion,
    km_leido: registro && registro.km_leido,
    km_nuevo: registro && registro.km_nuevo,
    completado,
    eventos_creados: eventos.length,
    escrituras: r.informe.escrituras,
    intentos: r.intentos,
    marca_para_recuperacion: !propia || r.marcasBorradas === 0,
  });
  return {
    status: 200,
    body: {
      mensaje: MENSAJE_OK,
      data: fila,
      progreso: {
        motor: true,
        recalculo: 'ok',
        accion: registro ? registro.accion : null,
        km_antes: registro ? registro.km_leido : null,
        km_despues: registro ? registro.km_nuevo : null,
        completado,
        eventos_pendientes: eventos.length,
      },
    },
  };
});

module.exports = { cambiarModalidadConMotor };
