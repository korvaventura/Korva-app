// Motor unificado de progreso — Etapa 4A, EFECTOS DE COMPLETAR (outbox).
//
// El servicio de progreso solo REGISTRA eventos ('completado', 'cruce_75') en una tabla
// con clave única (user_challenge_id, tipo): aunque dos procesos lo intenten, existe un
// solo evento por desafío y tipo. Este módulo los PROCESA:
//
//  1. reclamarEvento: pasa el evento a 'procesando' con un compare-and-set. Solo un
//     procesador lo obtiene. Si un procesador murió a mitad de camino, el evento se puede
//     volver a reclamar cuando vence el plazo (leaseMs).
//  2. Ejecuta cada efecto configurado para el tipo, en orden, y guarda cuáles salieron bien.
//     En un reintento solo se ejecutan los que faltan (un push que falló no reenvía el certificado).
//  3. Marca 'hecho', o 'error' con el detalle para reintentar.
//
// Los efectos reales (certificado + email, push) se inyectan: este módulo no envía nada por sí
// mismo. Cada efecto real además tiene que ser idempotente por su cuenta cuando pueda
// (ej.: el certificado solo se genera si user_challenges.certificado_serial es NULL).
//
// Nada corre "en segundo plano sin control": quien llama espera el resultado y lo puede loguear,
// y hay una reconciliación explícita (procesarEventosPendientes) para lo que haya quedado pendiente.

const EFECTOS_POR_TIPO = {
  completado: ['certificado', 'push_completado'],
  cruce_75: ['push_aviso_direccion'],
};

const ESTADOS = { PENDIENTE: 'pendiente', PROCESANDO: 'procesando', HECHO: 'hecho', ERROR: 'error' };
const LEASE_MS_DEFECTO = 10 * 60 * 1000;

/**
 * Procesa un evento ya leído.
 * repo:   reclamarEvento({ id, ahoraIso, vencidoAntesDeIso }) → evento reclamado o null
 *         guardarResultadoEvento({ id, estado, resultado, ultimoError, intentos })
 * efectos: { certificado: async (evento) => ..., push_completado: ..., push_aviso_direccion: ... }
 */
const procesarEvento = async ({ repo, efectos, evento, ahoraMs = Date.now(), leaseMs = LEASE_MS_DEFECTO }) => {
  const reclamado = await repo.reclamarEvento({
    id: evento.id,
    ahoraIso: new Date(ahoraMs).toISOString(),
    vencidoAntesDeIso: new Date(ahoraMs - leaseMs).toISOString(),
  });
  if (!reclamado) return { id: evento.id, procesado: false, motivo: 'no_reclamado' };

  const lista = EFECTOS_POR_TIPO[reclamado.tipo];
  if (!lista) {
    await repo.guardarResultadoEvento({
      id: reclamado.id, estado: ESTADOS.ERROR, resultado: reclamado.resultado || {},
      ultimoError: `tipo de evento desconocido: ${reclamado.tipo}`, intentos: (reclamado.intentos || 0) + 1,
    });
    return { id: reclamado.id, procesado: true, estado: ESTADOS.ERROR };
  }

  const resultado = { ...(reclamado.resultado || {}), efectos: { ...((reclamado.resultado || {}).efectos || {}) } };
  let error = null;

  for (const nombre of lista) {
    if (resultado.efectos[nombre] === 'ok') continue; // ya hecho en un intento anterior
    const efecto = efectos && efectos[nombre];
    if (typeof efecto !== 'function') {
      error = `efecto no configurado: ${nombre}`;
      resultado.efectos[nombre] = 'error';
      break;
    }
    try {
      await efecto(reclamado);
      resultado.efectos[nombre] = 'ok';
    } catch (e) {
      error = `${nombre}: ${e && e.message ? e.message : String(e)}`;
      resultado.efectos[nombre] = 'error';
      break; // se corta: el resto se intenta en el próximo procesamiento, en el mismo orden
    }
  }

  const estado = error ? ESTADOS.ERROR : ESTADOS.HECHO;
  await repo.guardarResultadoEvento({
    id: reclamado.id, estado, resultado, ultimoError: error, intentos: (reclamado.intentos || 0) + 1,
  });
  return { id: reclamado.id, procesado: true, estado, efectos: resultado.efectos, error };
};

/**
 * Procesa eventos pendientes, con error o con plazo vencido. Pensado para:
 *  - quien acaba de completar un desafío (procesa sus propios eventos y espera el resultado), y
 *  - una reconciliación explícita de admin.
 * repo.listarEventosProcesables({ limite, vencidoAntesDeIso, ids? }) → eventos
 */
const procesarEventosPendientes = async ({ repo, efectos, limite = 20, ids = null, ahoraMs = Date.now(), leaseMs = LEASE_MS_DEFECTO, maxIntentosPorEvento = 5 }) => {
  const eventos = await repo.listarEventosProcesables({
    limite,
    ids,
    vencidoAntesDeIso: new Date(ahoraMs - leaseMs).toISOString(),
  });
  const resultados = [];
  for (const evento of eventos) {
    if ((evento.intentos || 0) >= maxIntentosPorEvento) {
      resultados.push({ id: evento.id, procesado: false, motivo: 'max_intentos' });
      continue;
    }
    resultados.push(await procesarEvento({ repo, efectos, evento, ahoraMs, leaseMs }));
  }
  return resultados;
};

module.exports = { EFECTOS_POR_TIPO, ESTADOS, LEASE_MS_DEFECTO, procesarEvento, procesarEventosPendientes };