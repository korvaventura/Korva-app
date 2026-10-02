// Protocolo de la marca persistente user_challenges.recalculo_pendiente_desde (Etapa 4A-3c/4A-3d).
//
// Invariante que protege: si el km_completed de un desafío activo NO coincide con lo que calcula
// el motor, entonces el desafío tiene marca (y la recuperación periódica lo va a recalcular).
// No depende de ningún candado en memoria ni de que haya un solo proceso: solo de la base.
//
// Reglas:
//  1. Antes de cambiar datos que afectan el progreso (cerrar una pausa, excluir una actividad), el
//     writer pone la marca con compare-and-set sobre el valor que leyó. Siempre escribe un valor
//     NUEVO y único: si había otra marca, la renueva (así invalida el borrado de quien la puso).
//  2. Es DUEÑO de la marca solo si la encontró en NULL. Solo el dueño la borra, con
//     compare-and-set sobre su propio valor, y solo después de recalcular bien.
//  3. Si encontró otra marca (otro pedido en curso, o un pendiente), la renueva pero NO la borra:
//     la deja para la recuperación periódica, que recalcula todo desde cero y la borra.
//
// Por qué alcanza: cualquier cambio de otro writer va precedido de su marca. Si esa marca cae
// después de la mía, mi borrado falla (ya no es mi valor). Si cayó antes, yo la encontré puesta y
// no soy dueño. En los dos casos la marca sobrevive hasta un recálculo completo. Solapamientos,
// reinicios y caídas en cualquier punto terminan en "marca presente → la recuperación converge".
//
// La marca nueva SIEMPRE es distinta de la leída: así una renovación cambia el valor aunque los
// microsegundos aleatorios coincidan, y el borrado de quien la puso antes falla.
//
// Límite conocido (documentado): la recuperación solo toma marcas de más de 2 minutos, y el writer
// de eliminar renueva sus marcas si pasaron más de 30 s antes de aplicar el cambio. Solo un pedido
// cuyo propio UPDATE de la exclusión tarde más de ~90 s en la base y que además muera justo después
// podría quedar sin recálculo hasta el próximo cálculo del motor para ese usuario.
const crypto = require('crypto');

/**
 * Marca con precisión de microsegundos (timestamptz la guarda completa): los 3 últimos dígitos son
 * aleatorios, así dos pedidos en el mismo milisegundo casi nunca generan la misma marca.
 * Ej.: 2026-10-02T11:00:00.123456Z
 */
const generarMarcaUnica = (ahoraMs = Date.now()) => {
  const iso = new Date(ahoraMs).toISOString(); // ...ss.mmmZ
  const micro = String(crypto.randomInt(0, 1000)).padStart(3, '0');
  return `${iso.slice(0, -1)}${micro}Z`;
};

/**
 * Instante en microsegundos de un timestamptz en texto. Acepta lo que escribimos
 * ("2026-10-02T11:00:00.123456Z") y lo que devuelve PostgREST ("2026-10-02T11:00:00.123456+00:00").
 * null si no se puede interpretar.
 */
const aMicros = (texto) => {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(String(texto).trim().replace(' ', 'T'));
  if (!m) return null;
  let zona = m[3] || 'Z';
  if (/^[+-]\d{2}$/.test(zona)) zona += ':00';
  else if (/^[+-]\d{4}$/.test(zona)) zona = `${zona.slice(0, 3)}:${zona.slice(3)}`;
  const segundosMs = Date.parse(`${m[1]}${zona}`);
  if (Number.isNaN(segundosMs)) return null;
  return segundosMs * 1000 + Number((m[2] || '').padEnd(6, '0').slice(0, 6));
};

const deMicros = (us) => `${new Date(Math.floor(us / 1000)).toISOString().slice(0, -1)}${String(us % 1000).padStart(3, '0')}Z`;

/**
 * Devuelve `marca` si representa un instante distinto de `leida`; si es el mismo instante
 * (aunque esté escrito distinto: "Z" vs "+00:00"), la corre 1 microsegundo.
 */
const distintaDe = (marca, leida) => {
  if (leida === null || leida === undefined) return marca;
  const a = aMicros(marca);
  const b = aMicros(leida);
  if (a === null || b === null) return marca === leida ? deMicros(Date.now() * 1000) : marca;
  return a === b ? deMicros(a + 1) : marca;
};

const INTENTOS_MARCAR = 4;

/**
 * Pone o renueva la marca de UN desafío (regla 1). Devuelve { id, marca, propia }.
 * `marcaLeida` es lo que se leyó antes (null si no tenía). Si otro escribió en el medio, relee y
 * reintenta. Tira error si no lo logra (el writer NO debe aplicar su cambio en ese caso).
 */
const tomarMarca = async ({ repo, id, marcaLeida, ahoraMs, generarMarca = generarMarcaUnica, intentos = INTENTOS_MARCAR }) => {
  let leida = marcaLeida === undefined ? await repo.leerMarcaRecalculo({ id }) : marcaLeida;
  for (let i = 0; i < intentos; i++) {
    if (leida === undefined) return null; // el desafío ya no existe: nada que marcar
    const marca = distintaDe(generarMarca(ahoraMs ?? Date.now()), leida);
    if (await repo.marcarRecalculoCAS({ id, marcaLeida: leida, marcaNueva: marca })) {
      return { id, marca, propia: leida === null };
    }
    leida = await repo.leerMarcaRecalculo({ id });
  }
  throw new Error(`no se pudo marcar el desafío ${id} (la marca cambió ${intentos} veces seguidas)`);
};

/**
 * Renueva marcas ya tomadas (si el pedido se demoró antes de aplicar su cambio). Sigue siendo
 * dueño de una marca solo si la encuentra igual a la que puso (o en NULL: la borró la recuperación).
 */
const renovarMarcas = async ({ repo, marcas, ahoraMs, generarMarca = generarMarcaUnica }) => {
  const renovadas = [];
  for (const m of marcas) {
    const actual = await repo.leerMarcaRecalculo({ id: m.id });
    const nueva = await tomarMarca({ repo, id: m.id, marcaLeida: actual, ahoraMs, generarMarca });
    if (!nueva) continue;
    renovadas.push({ ...nueva, propia: nueva.propia || (m.propia && actual === m.marca) });
  }
  return renovadas;
};

module.exports = { generarMarcaUnica, distintaDe, aMicros, tomarMarca, renovarMarcas, INTENTOS_MARCAR };