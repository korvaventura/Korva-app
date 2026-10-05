const { traerTodo } = require('./progresoSombra');
const TERMINALES = ['completed', 'shipped', 'cargado'];
const ALIAS = {
  mexico: 'México', peru: 'Perú', panama: 'Panamá', espana: 'España',
  'republica dominicana': 'República Dominicana', brasil: 'Brasil', brazil: 'Brasil',
  usa: 'Estados Unidos', 'united states': 'Estados Unidos', 'estados unidos': 'Estados Unidos',
  'corea del sur': 'Corea del Sur', croatia: 'Croacia', croacia: 'Croacia',
};
const clavePais = (pais) => pais.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function contarCompletadosPorPais(inscripciones, usuarios) {
  const porUsuario = new Map(usuarios.map((u) => [u.id, u.pais]));
  const vistos = new Set();
  const conteo = new Map();
  let total = 0;
  let sinPais = 0;
  for (const uc of inscripciones) {
    if (!TERMINALES.includes(uc.status) || !uc.user_id || !uc.challenge_id) continue;
    const key = JSON.stringify([uc.user_id, uc.challenge_id]);
    if (vistos.has(key)) continue;
    vistos.add(key);
    total += 1;
    const valor = porUsuario.get(uc.user_id);
    const limpio = typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '';
    if (!limpio) { sinPais += 1; continue; }
    const clave = clavePais(limpio);
    const pais = ALIAS[clave] || limpio.toLocaleLowerCase('es').replace(/(^|\s)\p{L}/gu, (letra) => letra.toLocaleUpperCase('es'));
    const anterior = conteo.get(clavePais(pais));
    conteo.set(clavePais(pais), { pais, cantidad: (anterior?.cantidad || 0) + 1 });
  }
  return {
    tipo: 'comunidad_paises_v1', total_completados: total,
    completados_con_pais: total - sinPais, sin_pais: sinPais,
    paises: [...conteo.values()].sort((a, b) => b.cantidad - a.cantidad || a.pais.localeCompare(b.pais, 'es')),
  };
}

async function leerComunidadPaises(supabase) {
  const inscripciones = await traerTodo(() => supabase.from('user_challenges')
    .select('id, user_id, challenge_id, status').in('status', TERMINALES));
  const ids = [...new Set(inscripciones.map((uc) => uc.user_id).filter(Boolean))];
  const usuarios = [];
  for (let desde = 0; desde < ids.length; desde += 100) {
    usuarios.push(...await traerTodo(() => supabase.from('users').select('id, pais').in('id', ids.slice(desde, desde + 100))));
  }
  return contarCompletadosPorPais(inscripciones, usuarios);
}

function crearLecturaCache(leer, ahora = Date.now) {
  let guardado;
  let vence = 0;
  let pendiente;
  return async () => {
    if (guardado && ahora() < vence) return guardado;
    if (!pendiente) {
      pendiente = Promise.resolve().then(leer).then((datos) => {
        guardado = datos;
        vence = ahora() + 30000;
        return datos;
      }).finally(() => { pendiente = null; });
    }
    return pendiente;
  };
}
module.exports = { contarCompletadosPorPais, leerComunidadPaises, crearLecturaCache };
