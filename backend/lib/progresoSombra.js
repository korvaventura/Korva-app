// Progreso unificado — Etapa 4A, CAPA DE DATOS EN MODO SOMBRA (solo lectura).
//
// Lee user_challenges, challenges y activities y calcula el progreso con el
// núcleo puro (progresoDesafio.js). NO escribe nada.
//
// Garantía de solo lectura: todas las consultas pasan por clienteSoloLectura(),
// que solo expone .from(tabla).select(...) sobre las tres tablas permitidas.
// No hay forma de llamar insert/update/upsert/delete/rpc desde este módulo:
// esos métodos no existen en el objeto que recibe el resto del código.
const { calcularProgresoChallenge, resumirResultados } = require('./progresoDesafio');

const TABLAS_PERMITIDAS = ['user_challenges', 'challenges', 'activities'];
const TAMANO_PAGINA = 1000;
const TAMANO_LOTE_IDS = 100;

const CAMPOS_USER_CHALLENGE = 'id, user_id, challenge_id, status, started_at, pausado, pausado_at, periodos_pausados, version, modalidad, km_completed, km_base, km_base_motivo';
const CAMPOS_CHALLENGE = 'id, title, modalidades, total_distance_km';
const CAMPOS_ACTIVIDAD = 'id, user_id, distance_km, recorded_at, excluida';

/**
 * Envuelve un cliente de Supabase y deja disponible únicamente
 * from(<tabla permitida>).select(...). Cualquier otra cosa no existe o tira error.
 */
const clienteSoloLectura = (supabase) =>
  Object.freeze({
    from: (tabla) => {
      if (!TABLAS_PERMITIDAS.includes(tabla)) {
        throw new Error(`Tabla no permitida en modo sombra 4A: ${tabla}`);
      }
      const consulta = supabase.from(tabla);
      return Object.freeze({ select: (...args) => consulta.select(...args) });
    },
  });

/** Trae todas las filas de una consulta paginando de a TAMANO_PAGINA (orden estable por id). */
const traerTodo = async (construirConsulta) => {
  const filas = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await construirConsulta().order('id', { ascending: true }).range(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < TAMANO_PAGINA) break;
  }
  return filas;
};

const enLotes = (lista, tamano) => {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
};

const traerChallenges = async (db, ids) => {
  const mapa = new Map();
  for (const lote of enLotes([...new Set(ids)].filter(Boolean), TAMANO_LOTE_IDS)) {
    const filas = await traerTodo(() => db.from('challenges').select(CAMPOS_CHALLENGE).in('id', lote));
    filas.forEach((c) => mapa.set(c.id, c));
  }
  return mapa;
};

const traerActividadesPorUsuario = async (db, userIds) => {
  const mapa = new Map();
  for (const lote of enLotes([...new Set(userIds)].filter(Boolean), TAMANO_LOTE_IDS)) {
    const filas = await traerTodo(() => db.from('activities').select(CAMPOS_ACTIVIDAD).in('user_id', lote));
    filas.forEach((a) => {
      if (!mapa.has(a.user_id)) mapa.set(a.user_id, []);
      mapa.get(a.user_id).push(a);
    });
  }
  return mapa;
};

const calcularDesafios = (userChallenges, challenges, actividadesPorUsuario, incluirDetalle) =>
  userChallenges.map((uc) =>
    calcularProgresoChallenge({
      uc,
      challenge: challenges.get(uc.challenge_id) || null,
      actividades: actividadesPorUsuario.get(uc.user_id) || [],
      incluirDetalle,
    })
  );

/** Progreso en sombra de todos los desafíos de un usuario (con detalle de actividades). */
const progresoSombraUsuario = async (supabase, userId) => {
  const db = clienteSoloLectura(supabase);
  const userChallenges = await traerTodo(() => db.from('user_challenges').select(CAMPOS_USER_CHALLENGE).eq('user_id', userId));
  const challenges = await traerChallenges(db, userChallenges.map((uc) => uc.challenge_id));
  const actividades = await traerActividadesPorUsuario(db, [userId]);
  const resultados = calcularDesafios(userChallenges, challenges, actividades, true);
  return { desafios: resultados, resumen: resumirResultados(resultados) };
};

/** Reporte en sombra de TODOS los desafíos 'active' (sin detalle de actividades). */
const reporteSombraActivos = async (supabase, { soloDiferencias = false } = {}) => {
  const db = clienteSoloLectura(supabase);
  const userChallenges = await traerTodo(() => db.from('user_challenges').select(CAMPOS_USER_CHALLENGE).eq('status', 'active'));
  const challenges = await traerChallenges(db, userChallenges.map((uc) => uc.challenge_id));
  const actividades = await traerActividadesPorUsuario(db, userChallenges.map((uc) => uc.user_id));
  const resultados = calcularDesafios(userChallenges, challenges, actividades, false)
    .sort((a, b) => b.diferencia_km - a.diferencia_km);
  const resumen = resumirResultados(resultados);
  return {
    desafios: soloDiferencias ? resultados.filter((r) => r.categoria_diferencia !== 'coincide') : resultados,
    resumen,
  };
};

module.exports = {
  TABLAS_PERMITIDAS,
  clienteSoloLectura,
  traerTodo,
  progresoSombraUsuario,
  reporteSombraActivos,
};