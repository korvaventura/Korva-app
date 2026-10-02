// Motor unificado de progreso — Etapa 4A, SERVICIO.
//
// Única definición de progreso para todos los caminos que hoy escriben km_completed:
//   progreso(desafío) = km_base + actividades válidas      (4A; Health recién en 4B)
//
// El servicio no conoce Supabase: recibe un "repo" con estas operaciones
// (implementación real en progresoRepositorioSupabase.js, simulada en los tests):
//   leerEstadoUsuario(userId)                       → { userChallenges, challenges (Map), actividades }
//   actualizarKmCAS({ id, kmLeido, kmNuevo })       → true si escribió (solo si status sigue 'active'
//                                                     y km_completed sigue siendo kmLeido)
//   completarCAS({ id, kmLeido, kmNuevo, completedAtIso }) → true si ESTA llamada hizo active → completed
//   registrarEvento({ userChallengeId, userId, tipo, datos }) → { creado, id }  (único por desafío y tipo)
//
// Garantías:
//  - Pureza del cálculo: todo sale de progresoDesafio + progresoDecision.
//  - Idempotencia: si nada cambió, no escribe ni registra eventos.
//  - Concurrencia: escritura condicional (compare-and-set). Si otro proceso escribió en el medio,
//    se relee todo y se recalcula (hasta maxIntentos). Si se agotan, se informa el conflicto; el
//    próximo recálculo lo corrige (el valor es un caché reconstruible).
//  - La transición active → completed la gana UNA sola llamada; solo esa registra el evento
//    'completado'. Los efectos (certificado, email, push) NO se ejecutan acá: los procesa
//    completionEventos.procesarEventosPendientes, de forma explícita y observable.
//  - km_base nunca se escribe ni se recalcula.
const { calcularProgresoChallenge } = require('./progresoDesafio');
const { decidirAccion, ACCIONES } = require('./progresoDecision');

const MODOS = { ESCRIBIR: 'escribir', SIMULAR: 'simular' };
const TIPOS_EVENTO = { COMPLETADO: 'completado', CRUCE_75: 'cruce_75' };

/**
 * Recalcula (y, en modo 'escribir', materializa) el progreso de los desafíos de un usuario.
 *
 * @param {object} opciones
 * @param {object} opciones.repo
 * @param {string} opciones.userId
 * @param {string} opciones.motivo          quién lo pide (para logs/auditoría): 'reanudar', 'excluir', ...
 * @param {string|null} [opciones.challengeId]  limitar a un challenge_id (el resto no se toca)
 * @param {'escribir'|'simular'} [opciones.modo='simular']
 * @param {number} [opciones.ahoraMs]       instante para completed_at (inyectable en tests)
 * @param {number} [opciones.maxIntentos=3]
 */
const recalcularProgresoUsuario = async ({
  repo,
  userId,
  motivo,
  challengeId = null,
  modo = MODOS.SIMULAR,
  ahoraMs = Date.now(),
  maxIntentos = 3,
}) => {
  if (!repo) throw new Error('Falta repo');
  if (!userId) throw new Error('Falta userId');
  if (!motivo) throw new Error('Falta motivo');
  if (!Object.values(MODOS).includes(modo)) throw new Error(`Modo inválido: ${modo}`);

  const informe = {
    user_id: userId,
    motivo,
    modo,
    intentos: 0,
    desafios: [],
    escrituras: 0,
    completados: [],
    eventos_creados: [],
    conflictos_sin_resolver: [],
  };

  let pendientesDeReintento = null; // ids de desafíos que tuvieron conflicto en el intento anterior

  for (let intento = 1; intento <= maxIntentos; intento++) {
    informe.intentos = intento;
    const estado = await repo.leerEstadoUsuario(userId);
    const conflictos = [];

    const objetivos = (estado.userChallenges || []).filter((uc) =>
      (challengeId === null || uc.challenge_id === challengeId) &&
      (pendientesDeReintento === null || pendientesDeReintento.has(uc.id))
    );

    for (const uc of objetivos) {
      const resultado = calcularProgresoChallenge({
        uc,
        challenge: estado.challenges.get(uc.challenge_id) || null,
        actividades: estado.actividades,
      });
      const decision = decidirAccion(uc, resultado);
      const registro = {
        user_challenge_id: uc.id,
        challenge_id: uc.challenge_id,
        status_leido: uc.status,
        accion: decision.accion,
        motivo: decision.motivo,
        km_leido: decision.kmLeido,
        km_nuevo: decision.kmNuevo,
        km_base: resultado.km_base,
        escrito: false,
      };

      if (modo === MODOS.ESCRIBIR && decision.accion === ACCIONES.ACTUALIZAR_KM) {
        const ok = await repo.actualizarKmCAS({ id: uc.id, kmLeido: decision.kmLeido, kmNuevo: decision.kmNuevo });
        if (!ok) {
          conflictos.push(uc.id);
          registro.conflicto = true;
        } else {
          registro.escrito = true;
          informe.escrituras += 1;
          if (decision.cruzaAviso75) {
            const ev = await repo.registrarEvento({
              userChallengeId: uc.id, userId, tipo: TIPOS_EVENTO.CRUCE_75,
              datos: { km: decision.kmNuevo, objetivo_km: resultado.objetivo_km, motivo },
            });
            if (ev && ev.creado) informe.eventos_creados.push({ id: ev.id, tipo: TIPOS_EVENTO.CRUCE_75, user_challenge_id: uc.id });
          }
        }
      }

      if (modo === MODOS.ESCRIBIR && decision.accion === ACCIONES.COMPLETAR) {
        const ok = await repo.completarCAS({
          id: uc.id,
          kmLeido: decision.kmLeido,
          kmNuevo: decision.kmNuevo,
          completedAtIso: new Date(ahoraMs).toISOString(),
        });
        if (!ok) {
          conflictos.push(uc.id);
          registro.conflicto = true;
        } else {
          registro.escrito = true;
          informe.escrituras += 1;
          informe.completados.push(uc.id);
          const ev = await repo.registrarEvento({
            userChallengeId: uc.id, userId, tipo: TIPOS_EVENTO.COMPLETADO,
            datos: { km: decision.kmNuevo, objetivo_km: resultado.objetivo_km, motivo, challenge_titulo: resultado.challenge_titulo },
          });
          if (ev && ev.creado) informe.eventos_creados.push({ id: ev.id, tipo: TIPOS_EVENTO.COMPLETADO, user_challenge_id: uc.id });
        }
      }

      // Guardar solo la última versión de cada desafío en el informe.
      informe.desafios = informe.desafios.filter((d) => d.user_challenge_id !== uc.id).concat(registro);
    }

    if (conflictos.length === 0) {
      informe.conflictos_sin_resolver = [];
      return informe;
    }
    pendientesDeReintento = new Set(conflictos);
    informe.conflictos_sin_resolver = conflictos;
  }

  return informe;
};

module.exports = { MODOS, TIPOS_EVENTO, recalcularProgresoUsuario };