// Candado por usuario EN MEMORIA (Etapa 4A-3d).
//
// Solo una optimización dentro de un proceso: hace que dos pedidos del mismo usuario que cambian
// su progreso (eliminar actividad, reanudar) corran uno después del otro, así casi nunca se pisan
// y no dejan marcas para la recuperación.
//
// NO es necesario para la corrección: si hay varios procesos (deploy, réplicas, reinicio) el
// candado no los coordina, y el sistema igual converge por la marca persistente, el
// compare-and-set, el recálculo idempotente y la recuperación (ver lib/marcaRecalculo.js).

const crearCandado = () => {
  const colas = new Map(); // clave → promesa que se resuelve cuando termina el último en la fila

  return async (clave, fn) => {
    const previa = colas.get(clave) || Promise.resolve();
    let liberar;
    const propia = new Promise((r) => { liberar = r; });
    const cola = previa.then(() => propia);
    colas.set(clave, cola);
    await previa;
    try {
      return await fn();
    } finally {
      liberar();
      if (colas.get(clave) === cola) colas.delete(clave); // nadie más esperando: no acumular claves
    }
  };
};

/** Candado compartido por los writers del motor dentro de este proceso. */
const candadoPorUsuario = crearCandado();

/** Sin candado (para tests que simulan varios procesos). */
const sinCandado = async (_clave, fn) => fn();

module.exports = { crearCandado, candadoPorUsuario, sinCandado };