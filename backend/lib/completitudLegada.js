// Convivencia de los writers VIEJOS con el motor (Etapa 4A-3e).
//
// Mientras no se migren, los caminos viejos (recalcularKmUsuario: carga manual y modalidad con la
// flag apagada; Strava: webhook, importación y Home) siguen completando desafíos y mandando sus
// propios efectos (certificado, email, push). Para que nunca manden efectos de una completitud que
// ganó OTRO camino (el motor u otro writer viejo), el UPDATE que completa es condicional:
//     ... WHERE id = :id AND status IN ('active', 'pending')
// y solo si ESA llamada cambió la fila, el writer manda sus efectos. La base registra el evento
// 'legado' de esa completitud en la misma transacción (trigger trg_completado_legado, 4A-3e-a).
//
// Cuando no es una completitud nueva, el UPDATE queda exactamente como antes.

const ESTADOS_ANTES_DE_COMPLETAR = ['active', 'pending'];

/**
 * @param {object} supabase
 * @param {object} p
 * @param {string} p.id         user_challenges.id
 * @param {object} p.valores    lo mismo que escribía el writer viejo
 * @param {boolean} p.completa  true si este UPDATE es la completitud (los efectos dependen de ganarla)
 * @param {string} [p.origen]   para el log
 * @returns {Promise<{ gano: boolean }>} gano = este UPDATE hizo la completitud
 */
const actualizarConCompletitudCondicional = async (supabase, { id, valores, completa, origen = 'writer_viejo' }) => {
  const consulta = supabase.from('user_challenges').update(valores).eq('id', id);
  if (!completa) {
    await consulta; // igual que antes (los writers viejos no revisaban este resultado)
    return { gano: false };
  }
  const { data, error } = await consulta.in('status', ESTADOS_ANTES_DE_COMPLETAR).select('id');
  if (error) {
    console.error(`[convivencia] ${origen}: error completando ${id}:`, error.message);
    return { gano: false };
  }
  const gano = Array.isArray(data) && data.length === 1;
  if (!gano) console.log(`[convivencia] ${origen}: ${id} ya lo completó otro camino; no se repiten efectos`);
  return { gano };
};

module.exports = { actualizarConCompletitudCondicional, ESTADOS_ANTES_DE_COMPLETAR };
