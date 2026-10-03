// Motor unificado de progreso — Etapa 4A, DECISIÓN PURA.
//
// A partir del resultado del núcleo (progresoDesafio.calcularProgresoChallenge)
// decide qué habría que escribir en user_challenges. No lee ni escribe nada.
//
// Reglas (Etapa 4A, aprobadas):
//  - Solo se escriben desafíos 'active'. pending / completed / cargado / shipped no se tocan (D1: terminales congelados).
//  - km_completed = km_base + actividades válidas (valor exacto, redondeado a 6 decimales). Puede subir o bajar.
//  - Si no cambia (|Δ| <= 1e-6) no se escribe nada (idempotencia: recálculos repetidos no escriben).
//  - active → completed cuando el progreso alcanza el objetivo, salvo que el desafío esté pausado
//    o no tenga objetivo. Nunca completed → active.
//  - km_base jamás forma parte de lo que se escribe.

const EPSILON_KM = 1e-6;
const UMBRAL_AVISO = 0.75;

const ACCIONES = {
  NADA: 'nada',
  ACTUALIZAR_KM: 'actualizar_km',
  COMPLETAR: 'completar',
};

const redondear6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * @param {object} uc         fila de user_challenges tal como se leyó (status, km_completed, pausado)
 * @param {object} resultado  salida de calcularProgresoChallenge (usa resultado.exacto)
 * @returns {{ accion, motivo, kmLeido, kmNuevo, cruzaAviso75 }}
 */
const decidirAccion = (uc, resultado) => {
  const exacto = resultado && resultado.exacto;
  if (!exacto) throw new Error('decidirAccion necesita el resultado del núcleo (falta resultado.exacto)');

  const kmLeido = uc.km_completed === null || uc.km_completed === undefined ? null : Number(uc.km_completed);
  const base = { kmLeido, kmNuevo: kmLeido, cruzaAviso75: false };

  if (uc.status !== 'active') {
    return { ...base, accion: ACCIONES.NADA, motivo: uc.status === 'pending' ? 'pending_sin_calculo' : 'estado_no_activo' };
  }

  const kmNuevo = redondear6(exacto.kmProgreso);
  // 4B: el progreso visible puede incluir Health provisional, pero completar solo
  // usa el total estable. Sin kmAptoCompletar (4A puro), conserva la semántica anterior.
  const kmAptoCompletar = redondear6(exacto.kmAptoCompletar ?? exacto.kmProgreso);
  const cambia = kmLeido === null || Math.abs(kmNuevo - kmLeido) > EPSILON_KM;
  const objetivo = exacto.objetivoKm;
  const alcanza = objetivo !== null && objetivo > 0 && kmAptoCompletar >= objetivo - EPSILON_KM;
  const pausado = uc.pausado === true;

  const cruzaAviso75 = objetivo !== null && objetivo > 0 && !alcanza &&
    (kmLeido === null ? 0 : kmLeido) / objetivo < UMBRAL_AVISO && kmNuevo / objetivo >= UMBRAL_AVISO;

  if (alcanza && !pausado) {
    // Al congelar un terminal persistimos el total estable, no Health provisional.
    return { kmLeido, kmNuevo: kmAptoCompletar, kmVisible: kmNuevo, cruzaAviso75: false, accion: ACCIONES.COMPLETAR, motivo: 'alcanza_objetivo' };
  }
  if (!cambia) {
    return { ...base, accion: ACCIONES.NADA, motivo: alcanza ? 'alcanza_objetivo_pero_pausado' : 'sin_cambios' };
  }
  return {
    kmLeido,
    kmNuevo,
    cruzaAviso75,
    accion: ACCIONES.ACTUALIZAR_KM,
    motivo: kmLeido !== null && kmNuevo < kmLeido ? 'baja' : 'sube',
  };
};

module.exports = { ACCIONES, EPSILON_KM, UMBRAL_AVISO, redondear6, decidirAccion };