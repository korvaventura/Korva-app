// Motor unificado de progreso — EFECTOS DE COMPLETAR (outbox durable). Etapa 4A-3e.
//
// La fuente durable es progreso_eventos: el motor completa el desafío con compare-and-set y
// registra el evento UNA vez (UNIQUE user_challenge_id + tipo). Este módulo ejecuta después los
// efectos externos de cada evento como PASOS, y guarda el estado de cada paso en `resultado`.
// La corrección del progreso nunca depende de que un efecto funcione.
//
// Garantías del procesamiento:
//  - Reclamo con compare-and-set sobre la versión leída (estado, intentos, procesando_desde):
//    un solo procesador por vez. En el MISMO update se suma `intentos` (un evento que tumba al
//    proceso no se reintenta para siempre) y se guarda un token único en procesando_desde.
//  - Fencing: TODA escritura posterior (avance de un paso, resultado final) exige que el evento
//    siga 'procesando' con ESE token. Si el lease venció y otro lo reclamó, el procesador viejo
//    no puede escribir nada más y se detiene (EventoCercado).
//  - Pasos: cada efecto externo registra su intención ('en_curso', con fencing) ANTES de llamar
//    al servicio externo. Si un procesador encuentra un paso 'en_curso' (el anterior murió en el
//    medio), el efecto decide: reintentar (si es seguro) o 'incierto' (no se reintenta).
//  - Reintentos: un evento con pasos en 'error' vuelve a procesarse con esperas crecientes,
//    hasta MAX_INTENTOS. Lo ya hecho ('ok'/'omitido') nunca se repite.
//  - Intervención: si no queda nada que el sistema pueda hacer solo (paso crítico 'definitivo',
//    'incierto' o 'bloqueado', o se agotaron los intentos) el evento queda en 'error' con
//    intentos = MAX_INTENTOS y resultado.requiere_intervencion = true. Ya no se lista.
//
// Los efectos reales se inyectan (lib/efectosCompletado.js); este módulo no envía nada.
const { generarMarcaUnica } = require('./marcaRecalculo');

const ESTADOS = { PENDIENTE: 'pendiente', PROCESANDO: 'procesando', HECHO: 'hecho', ERROR: 'error' };
const PASO = {
  PENDIENTE: 'pendiente', EN_CURSO: 'en_curso', OK: 'ok', OMITIDO: 'omitido',
  ERROR: 'error', DEFINITIVO: 'definitivo', INCIERTO: 'incierto', BLOQUEADO: 'bloqueado',
};
const PASOS_TERMINALES = [PASO.OK, PASO.OMITIDO, PASO.DEFINITIVO, PASO.INCIERTO, PASO.BLOQUEADO];
const PASOS_MALOS = [PASO.DEFINITIVO, PASO.INCIERTO, PASO.BLOQUEADO];

const MAX_INTENTOS = 8;
const LEASE_MS_DEFECTO = 10 * 60 * 1000;
const GRACIA_PENDIENTE_MS = 2 * 60 * 1000; // la ronda periódica deja primero al pedido que lo creó
const MIN = 60 * 1000;
// Espera antes del intento n+1 (después de n intentos fallidos). Todo entra en ~16 h.
const ESPERAS_REINTENTO_MS = [2 * MIN, 10 * MIN, 30 * MIN, 60 * MIN, 120 * MIN, 240 * MIN, 480 * MIN];

/**
 * Pasos de cada tipo de evento, en orden. `depende`: pasos que tienen que estar ok/omitido antes.
 * `critico`: si termina mal, el evento requiere intervención.
 */
const PASOS_POR_TIPO = {
  completado: [
    { nombre: 'serial', critico: true },
    { nombre: 'contexto', critico: true },
    { nombre: 'email_admin_medalla', depende: ['serial', 'contexto'], critico: true },
    { nombre: 'email_usuario', depende: ['serial', 'contexto'], critico: true },
    { nombre: 'email_consolidado', depende: ['serial', 'contexto'], critico: false },
    { nombre: 'push_completado', depende: ['serial'], critico: false }, // serial incluye la verificación de completitud
  ],
  cruce_75: [
    { nombre: 'push_aviso_direccion', critico: false },
  ],
};
// Compatibilidad con 4A-3b: nombres de efectos por tipo.
const EFECTOS_POR_TIPO = Object.fromEntries(Object.entries(PASOS_POR_TIPO).map(([t, ps]) => [t, ps.map((p) => p.nombre)]));

class EventoCercado extends Error {
  constructor() { super('el lease del evento ya no es de este procesador'); this.name = 'EventoCercado'; }
}

const iso = (ms) => new Date(ms).toISOString();
const clonar = (o) => JSON.parse(JSON.stringify(o || {}));
const mensaje = (e) => (e && e.message ? e.message : String(e));

/** Cierra sin ejecutar nada un evento que ya agotó los intentos (el último procesador murió). */
const cerrarPorMaxIntentos = async ({ repo, evento }) => {
  const resultado = { ...clonar(evento.resultado), requiere_intervencion: true };
  const ok = await repo.cerrarEventoAgotadoCAS({ leido: evento, resultado, ultimoError: 'max_intentos: el último procesamiento no terminó' });
  return { id: evento.id, procesado: ok, estado: ESTADOS.ERROR, requiere_intervencion: true, motivo: 'max_intentos' };
};

/**
 * Procesa un evento ya leído (lo reclama primero).
 * repo:    reclamarEventoCAS, guardarAvanceEventoCAS, finalizarEventoCAS, cerrarEventoAgotadoCAS
 * efectos: { [nombrePaso]: { ejecutar: async (ctx) => salida, alEncontrarEnCurso?: (paso, ctx) => 'reintentar'|'incierto' } }
 *   ctx = { evento, efectos (estado de los pasos hasta ahora), previo (estado previo de este paso),
 *           ahoraMs, guardarIntencion(datos) }
 *   salida = { estado: 'ok'|'omitido'|'error'|'definitivo'|'incierto', ...datos }
 */
const procesarEvento = async ({
  repo, efectos, evento, ahoraMs = Date.now(), leaseMs = LEASE_MS_DEFECTO,
  maxIntentos = MAX_INTENTOS, generarToken = generarMarcaUnica, log = () => {},
}) => {
  // Los eventos 'legado' (completitudes de los caminos viejos, migración 4A-3e-a) nacen 'hecho':
  // sus efectos los manda el código viejo. Nunca se procesan acá.
  if (evento.datos && evento.datos.origen === 'legado') return { id: evento.id, procesado: false, motivo: 'legado' };
  if ((evento.intentos || 0) >= maxIntentos) {
    if (evento.estado === ESTADOS.PROCESANDO) return cerrarPorMaxIntentos({ repo, evento });
    return { id: evento.id, procesado: false, motivo: 'max_intentos' };
  }
  const token = generarToken(ahoraMs);
  const reclamado = await repo.reclamarEventoCAS({ leido: evento, token });
  if (!reclamado) return { id: evento.id, procesado: false, motivo: 'no_reclamado' };

  const intentos = reclamado.intentos;
  const resultado = clonar(reclamado.resultado);
  resultado.efectos = resultado.efectos || {};
  const guardar = async () => {
    if (!(await repo.guardarAvanceEventoCAS({ id: reclamado.id, token, resultado }))) throw new EventoCercado();
  };

  const pasos = PASOS_POR_TIPO[reclamado.tipo];
  try {
    if (!pasos) {
      resultado.requiere_intervencion = true;
      if (!(await repo.finalizarEventoCAS({
        id: reclamado.id, token, estado: ESTADOS.ERROR, resultado,
        ultimoError: `tipo de evento desconocido: ${reclamado.tipo}`, intentos: maxIntentos,
      }))) throw new EventoCercado();
      return { id: reclamado.id, procesado: true, estado: ESTADOS.ERROR, requiere_intervencion: true };
    }

    for (const paso of pasos) {
      const previo = resultado.efectos[paso.nombre] || { estado: PASO.PENDIENTE };
      if (PASOS_TERMINALES.includes(previo.estado)) continue;

      const deps = (paso.depende || []).map((d) => (resultado.efectos[d] || {}).estado || PASO.PENDIENTE);
      if (deps.some((e) => PASOS_MALOS.includes(e))) {
        resultado.efectos[paso.nombre] = { ...previo, estado: PASO.BLOQUEADO, motivo: 'un paso previo terminó mal' };
        await guardar();
        continue;
      }
      if (!deps.every((e) => e === PASO.OK || e === PASO.OMITIDO)) continue; // se intenta cuando estén listos

      const efecto = efectos && efectos[paso.nombre];
      if (!efecto || typeof efecto.ejecutar !== 'function') {
        resultado.efectos[paso.nombre] = { ...previo, estado: PASO.ERROR, error: `efecto no configurado: ${paso.nombre}` };
        await guardar();
        continue;
      }

      const desde = previo.desde || iso(ahoraMs);
      const ctx = {
        evento: reclamado,
        efectos: resultado.efectos,
        previo,
        ahoraMs,
        // Registra la intención (con fencing) ANTES de un efecto externo.
        guardarIntencion: async (datos = {}) => {
          resultado.efectos[paso.nombre] = { ...datos, estado: PASO.EN_CURSO, desde, en: iso(ahoraMs) };
          await guardar();
        },
      };

      if (previo.estado === PASO.EN_CURSO) {
        const decision = efecto.alEncontrarEnCurso ? efecto.alEncontrarEnCurso(previo, ctx) : 'incierto';
        if (decision !== 'reintentar') {
          resultado.efectos[paso.nombre] = { ...previo, estado: PASO.INCIERTO, motivo: 'el procesamiento anterior se cortó después de iniciar este paso' };
          await guardar();
          log({ resultado: 'paso_incierto', evento_id: reclamado.id, paso: paso.nombre });
          continue;
        }
      }

      let salida;
      try {
        salida = await efecto.ejecutar(ctx);
      } catch (e) {
        if (e instanceof EventoCercado) throw e;
        // Un error inesperado después de registrar la intención es incierto; antes, reintentable.
        const actual = resultado.efectos[paso.nombre] || {};
        salida = actual.estado === PASO.EN_CURSO
          ? { estado: PASO.INCIERTO, error: mensaje(e) }
          : { estado: PASO.ERROR, error: mensaje(e) };
      }
      resultado.efectos[paso.nombre] = { ...salida, desde, en: iso(ahoraMs) };
      await guardar();
    }

    const estados = pasos.map((p) => (resultado.efectos[p.nombre] || {}).estado || PASO.PENDIENTE);
    const todosTerminales = estados.every((e) => PASOS_TERMINALES.includes(e));
    const criticoMal = pasos.some((p, i) => p.critico && PASOS_MALOS.includes(estados[i]));
    const errores = pasos
      .filter((p, i) => !PASOS_TERMINALES.includes(estados[i]) || PASOS_MALOS.includes(estados[i]))
      .map((p) => `${p.nombre}: ${(resultado.efectos[p.nombre] || {}).error || (resultado.efectos[p.nombre] || {}).estado || 'pendiente'}`);

    let estado = ESTADOS.ERROR;
    let intentosFinal;
    if (todosTerminales && !criticoMal) {
      estado = ESTADOS.HECHO;
      resultado.requiere_intervencion = false;
    } else if (todosTerminales || intentos >= maxIntentos) {
      resultado.requiere_intervencion = true;
      intentosFinal = maxIntentos; // ya no se lista
    }
    if (!(await repo.finalizarEventoCAS({
      id: reclamado.id, token, estado, resultado, ultimoError: estado === ESTADOS.HECHO ? null : errores.join(' | '), intentos: intentosFinal,
    }))) throw new EventoCercado();

    if (resultado.requiere_intervencion) log({ resultado: 'evento_requiere_intervencion', evento_id: reclamado.id, tipo: reclamado.tipo, errores });
    return { id: reclamado.id, procesado: true, estado, efectos: resultado.efectos, requiere_intervencion: !!resultado.requiere_intervencion, intentos };
  } catch (e) {
    if (e instanceof EventoCercado) {
      log({ resultado: 'evento_cercado', evento_id: reclamado.id });
      return { id: reclamado.id, procesado: false, motivo: 'cercado' };
    }
    throw e;
  }
};

/** ¿Este evento ya puede (re)procesarse? */
const esProcesable = (evento, { ahoraMs, leaseMs, graciaPendienteMs, esperasMs }) => {
  if (evento.estado === ESTADOS.PROCESANDO) {
    return !!evento.procesando_desde && Date.parse(evento.procesando_desde) < ahoraMs - leaseMs;
  }
  if (evento.estado === ESTADOS.PENDIENTE) {
    return !evento.creado_at || Date.parse(evento.creado_at) <= ahoraMs - graciaPendienteMs;
  }
  if (evento.estado === ESTADOS.ERROR) {
    const n = Math.max(1, evento.intentos || 1);
    const espera = esperasMs[Math.min(n, esperasMs.length) - 1];
    return !evento.actualizado_at || Date.parse(evento.actualizado_at) <= ahoraMs - espera;
  }
  return false;
};

/**
 * Procesa los eventos que ya pueden procesarse: pendientes (después de una gracia), con error
 * (después de su espera) y 'procesando' con lease vencido. Con `ids`, solo esos y sin gracia
 * (lo usa el pedido que acaba de crearlos).
 */
const procesarEventosPendientes = async ({
  repo, efectos, limite = 20, ids = null, ahoraMs = Date.now(), leaseMs = LEASE_MS_DEFECTO,
  maxIntentos = MAX_INTENTOS, graciaPendienteMs, esperasMs = ESPERAS_REINTENTO_MS, generarToken, log,
}) => {
  const gracia = graciaPendienteMs !== undefined ? graciaPendienteMs : (ids ? 0 : GRACIA_PENDIENTE_MS);
  const candidatos = await repo.listarEventosProcesables({ limite, ids, maxIntentos });
  const resultados = [];
  for (const evento of candidatos) {
    if (!esProcesable(evento, { ahoraMs, leaseMs, graciaPendienteMs: gracia, esperasMs })) continue;
    resultados.push(await procesarEvento({ repo, efectos, evento, ahoraMs, leaseMs, maxIntentos, generarToken, log }));
  }
  return resultados;
};

/**
 * Procesador para el backend: dispara el procesamiento de eventos recién creados (sin esperar,
 * sin frenar la respuesta) y ofrece una ronda completa para la recuperación periódica.
 */
const crearProcesadorEventos = ({ crearRepo, efectos, log = () => {} }) => {
  const ronda = async ({ repo = crearRepo(), ids = null, ahoraMs = Date.now() } = {}) => {
    const r = await procesarEventosPendientes({ repo, efectos, ids, ahoraMs, log });
    const resumen = {
      procesados: r.filter((x) => x.procesado).length,
      hechos: r.filter((x) => x.estado === ESTADOS.HECHO).length,
      intervencion: r.filter((x) => x.requiere_intervencion).length,
    };
    if (r.length > 0) log({ resultado: 'eventos_procesados', ...resumen });
    return resumen;
  };
  const disparar = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    setImmediate(() => {
      ronda({ ids }).catch((e) => log({ resultado: 'eventos_fallo_inmediato', error: mensaje(e) }));
    });
  };
  return { ronda, disparar };
};

module.exports = {
  ESTADOS, PASO, PASOS_POR_TIPO, EFECTOS_POR_TIPO, MAX_INTENTOS, LEASE_MS_DEFECTO, GRACIA_PENDIENTE_MS,
  ESPERAS_REINTENTO_MS, EventoCercado, procesarEvento, procesarEventosPendientes, esProcesable, crearProcesadorEventos,
};
