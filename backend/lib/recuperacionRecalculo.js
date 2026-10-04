// Recuperación de recálculos pendientes (Etapa 4A-3c, generalizada en 4A-3d).
//
// Antes de cambiar datos que afectan el progreso, cada writer del motor deja una marca persistente
// user_challenges.recalculo_pendiente_desde (protocolo en lib/marcaRecalculo.js). La marca se borra
// solo cuando el recálculo del motor terminó bien (y solo la borra su dueño). Si el recálculo falla,
// el proceso muere o dos pedidos se solapan, la marca queda en la base y esta recuperación la resuelve:
//   - recalcularConReintentos: reintentos inmediatos y acotados dentro del mismo pedido.
//   - recuperarRecalculosPendientes: busca marcas viejas y recalcula esos desafíos.
//   - iniciarRecuperacionPeriodica: corre lo anterior al arrancar el backend y cada N minutos.
// Si recibe `procesarEventos` (flag "efectos" encendida, 4A-3e), cada ronda además procesa los
// efectos de progreso_eventos: primero los que creó la misma ronda y después los pendientes, con
// error ya vencido o con lease vencido. Así una caída después de completar converge sola.
const { recalcularProgresoUsuario, MODOS } = require('./progresoServicio');

const ESPERAS_REINTENTO_MS = [0, 250, 1000]; // 3 intentos dentro del mismo pedido
const ANTIGUEDAD_MINIMA_MS = 2 * 60 * 1000;  // no tocar marcas de pedidos que pueden estar en curso
const INTERVALO_MS = 10 * 60 * 1000;
const DEMORA_INICIAL_MS = 30 * 1000;
const LIMITE_POR_RONDA = 50;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Log de una línea en JSON. Railway parsea las líneas JSON como logs estructurados y usa el campo
 * `message` como texto del log: sin él, la búsqueda por texto no los encuentra. Los demás campos
 * quedan como atributos (filtrables con @evento:motor_progreso, @writer:..., @resultado:...).
 */
const logMotor = (datos) => {
  try {
    const { writer, resultado } = datos;
    console.log(JSON.stringify({
      message: ['motor_progreso', writer, resultado].filter(Boolean).join(' '),
      evento: 'motor_progreso',
      ...datos,
    }));
  } catch {
    // no romper por un log
  }
};

/**
 * Recalcula con el motor (un desafío o todos los del usuario) y, si terminó bien, borra las marcas
 * PROPIAS indicadas, cada una con compare-and-set sobre su valor (no borra una marca más nueva).
 * Devuelve { ok, intentos, informe, error, marcasBorradas }. Nunca tira error.
 *
 * Compatibilidad: { ucId, marcaIso } equivale a marcasALimpiar: [{ id: ucId, marca: marcaIso }].
 */
const recalcularConReintentos = async ({
  repo, userId, challengeId = null, marcasALimpiar, ucId, marcaIso, motivo, ahoraMs,
  // Health pasivo NO entra a desafíos por defecto. Solo podrá incluirse mediante una
  // decisión explícita por desafío; daily_movement sigue disponible para Tu movimiento.
  incluirHealth = false, esperasMs = ESPERAS_REINTENTO_MS, esperar = dormir,
}) => {
  const marcas = marcasALimpiar || (ucId ? [{ id: ucId, marca: marcaIso }] : []);
  let ultimoError = null;
  for (let i = 0; i < esperasMs.length; i++) {
    if (esperasMs[i] > 0) await esperar(esperasMs[i]);
    try {
      const informe = await recalcularProgresoUsuario({
        repo, userId, challengeId, motivo, modo: MODOS.ESCRIBIR, incluirHealth, ahoraMs: ahoraMs ?? Date.now(),
      });
      if (informe.conflictos_sin_resolver.length > 0) {
        ultimoError = new Error('conflictos_sin_resolver');
        continue;
      }
      // Recién ahora, con el progreso ya escrito, se borran las marcas propias (solo si siguen iguales).
      let marcasBorradas = 0;
      for (const m of marcas) {
        if (await repo.limpiarRecalculoPendienteCAS({ id: m.id, marcaIso: m.marca })) marcasBorradas += 1;
      }
      return { ok: true, intentos: i + 1, informe, error: null, marcasBorradas };
    } catch (e) {
      ultimoError = e;
    }
  }
  return { ok: false, intentos: esperasMs.length, informe: null, error: ultimoError, marcasBorradas: 0 };
};

/**
 * Una ronda de recuperación: recalcula los desafíos con marca más vieja que ANTIGUEDAD_MINIMA_MS.
 * Si uno falla, su marca queda y se reintenta en la próxima ronda.
 */
const recuperarRecalculosPendientes = async ({
  repo, ahoraMs = Date.now(), limite = LIMITE_POR_RONDA, antiguedadMinimaMs = ANTIGUEDAD_MINIMA_MS, log = logMotor, esperasMs, esperar,
}) => {
  const pendientes = await repo.listarRecalculosPendientes({
    limite,
    anteriorAIso: new Date(ahoraMs - antiguedadMinimaMs).toISOString(),
  });
  const resultados = [];
  const eventosCreados = [];
  for (const p of pendientes) {
    const r = await recalcularConReintentos({
      repo, userId: p.user_id, challengeId: p.challenge_id,
      marcasALimpiar: [{ id: p.id, marca: p.recalculo_pendiente_desde }],
      motivo: 'recuperacion', ahoraMs, esperasMs, esperar,
    });
    if (r.ok) r.informe.eventos_para_procesar.forEach((id) => eventosCreados.push(id));
    log({
      writer: 'recuperacion', resultado: r.ok ? 'recuperado' : 'sigue_pendiente', user_challenge_id: p.id,
      marca: p.recalculo_pendiente_desde, intentos: r.intentos, error: r.error && r.error.message,
    });
    resultados.push({ user_challenge_id: p.id, ok: r.ok });
  }
  return { revisados: pendientes.length, recuperados: resultados.filter((r) => r.ok).length, resultados, eventosCreados };
};

const MARCA_FUTURA_ISO = '9999-12-31T00:00:00.000Z';

/** ¿Queda alguna marca, de cualquier antigüedad? (una consulta indexada, limit 1) */
const hayRecalculosPendientes = async (repo) =>
  (await repo.listarRecalculosPendientes({ limite: 1, anteriorAIso: MARCA_FUTURA_ISO })).length > 0;

/**
 * Bucle de rondas de recuperación. Cada ronda programa la siguiente al terminar (nunca se
 * superponen). Los timers usan unref(): no impiden que Node/Railway terminen.
 * Si `detenerSiNoQuedanPendientes` es true (modo drenaje), se detiene solo cuando ya no
 * queda ninguna marca en la base.
 */
const iniciarRecuperacionPeriodica = ({
  crearRepo, intervaloMs = INTERVALO_MS, demoraInicialMs = DEMORA_INICIAL_MS, log = logMotor, alTerminarRonda,
  noRetenerProceso = true, detenerSiNoQuedanPendientes = false, alDetenerse, procesarEventos,
  temporizadores = { setTimeout, clearTimeout },
}) => {
  let temporizador = null;
  let detenido = false;

  const programar = (ms) => {
    temporizador = temporizadores.setTimeout(ronda, ms);
    if (noRetenerProceso && temporizador && temporizador.unref) temporizador.unref();
  };
  const detener = (motivo = 'detenido') => {
    if (detenido) return;
    detenido = true;
    if (temporizador) temporizadores.clearTimeout(temporizador);
    temporizador = null;
    if (alDetenerse) alDetenerse(motivo);
  };

  async function ronda() {
    temporizador = null;
    let seguir = true;
    try {
      const repo = crearRepo();
      const r = await recuperarRecalculosPendientes({ repo, log });
      if (r.revisados > 0) log({ writer: 'recuperacion', resultado: 'ronda', revisados: r.revisados, recuperados: r.recuperados });
      if (procesarEventos) {
        // Efectos (4A-3e): un fallo acá no frena la recuperación de marcas.
        try {
          if (r.eventosCreados.length > 0) await procesarEventos({ repo, ids: r.eventosCreados });
          await procesarEventos({ repo });
        } catch (e) {
          log({ writer: 'efectos', resultado: 'ronda_eventos_fallida', error: e && e.message });
        }
      }
      if (alTerminarRonda) alTerminarRonda(r);
      if (detenerSiNoQuedanPendientes && !(await hayRecalculosPendientes(repo))) {
        log({ writer: 'recuperacion', resultado: 'drenaje_terminado' });
        seguir = false;
      }
    } catch (e) {
      log({ writer: 'recuperacion', resultado: 'ronda_fallida', error: e && e.message });
      if (alTerminarRonda) alTerminarRonda(null, e);
    }
    if (detenido) return;
    if (seguir) programar(intervaloMs);
    else detener('sin_pendientes');
  }

  programar(demoraInicialMs);
  return { detener: () => detener('detenido') };
};

// Una sola recuperación por proceso (evita timers duplicados).
let recuperacionActual = null;

/**
 * Arranque de la recuperación según las flags del motor (se evalúan al iniciar el proceso; en
 * Railway cambiar una variable reinicia el servicio):
 *  - algún writer del motor ON → modo 'activo': rondas al arrancar (+30 s) y cada 10 min.
 *  - todos OFF → una única consulta de lectura al arrancar:
 *      · sin marcas pendientes → modo 'inactivo': ningún timer, ninguna consulta más.
 *      · con marcas (quedaron de cuando estuvo encendido) → modo 'drenaje': rondas hasta que no
 *        quede ninguna marca y después se detiene sola. Así apagar las flags nunca abandona marcas.
 * `motorActivo` (o su nombre anterior `reanudarActivo`) indica si hay algún writer encendido.
 * Devuelve { modo, detener }. Nunca tira error.
 */
const iniciarRecuperacion = async ({
  crearRepo, motorActivo, reanudarActivo, log = logMotor, ...opciones
}) => {
  if (recuperacionActual) return recuperacionActual;
  const activo = motorActivo !== undefined ? motorActivo : reanudarActivo;
  const registrar = (modo, h) => {
    recuperacionActual = {
      modo,
      detener: () => { if (h) h.detener(); recuperacionActual = null; },
    };
    return recuperacionActual;
  };

  if (activo) {
    log({ writer: 'recuperacion', resultado: 'iniciada', modo: 'activo' });
    return registrar('activo', iniciarRecuperacionPeriodica({ crearRepo, log, ...opciones }));
  }

  // reservar el lugar antes de la consulta (dos llamadas simultáneas no crean dos recuperaciones)
  recuperacionActual = { modo: 'verificando', detener: () => { recuperacionActual = null; } };
  let pendientes = false;
  try {
    pendientes = await hayRecalculosPendientes(crearRepo());
  } catch (e) {
    log({ writer: 'recuperacion', resultado: 'verificacion_fallida', error: e && e.message });
    recuperacionActual = null;
    return { modo: 'inactivo', detener: () => {} };
  }
  if (!pendientes) {
    recuperacionActual = null;
    return { modo: 'inactivo', detener: () => {} };
  }
  log({ writer: 'recuperacion', resultado: 'iniciada', modo: 'drenaje' });
  const h = iniciarRecuperacionPeriodica({
    crearRepo, log, detenerSiNoQuedanPendientes: true, ...opciones,
    alDetenerse: (motivo) => {
      if (recuperacionActual && recuperacionActual.modo === 'drenaje') recuperacionActual = null;
      if (opciones.alDetenerse) opciones.alDetenerse(motivo);
    },
  });
  return registrar('drenaje', h);
};

module.exports = {
  ESPERAS_REINTENTO_MS, ANTIGUEDAD_MINIMA_MS, INTERVALO_MS, DEMORA_INICIAL_MS,
  logMotor, recalcularConReintentos, recuperarRecalculosPendientes, hayRecalculosPendientes,
  iniciarRecuperacionPeriodica, iniciarRecuperacion,
};