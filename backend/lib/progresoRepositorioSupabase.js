// Motor unificado de progreso — Etapa 4A, REPOSITORIO SUPABASE.
//
// Implementación real de las operaciones que usan progresoServicio y completionEventos.
// EN ESTA FASE NO LO USA NINGUNA RUTA: queda listo para el primer writer canario.
//
// Escrituras posibles (y solo estas):
//  - user_challenges: km_completed, y en la transición también status='completed' + completed_at.
//    Siempre condicionadas (compare-and-set) a status='active' y al km_completed leído.
//    Nunca se escriben km_base ni km_base_motivo.
//  - progreso_eventos (tabla nueva, ver migración propuesta 4A-3a): alta de eventos y su estado.
const { clienteSoloLectura, traerTodo } = require('./progresoSombra');

const CAMPOS_USER_CHALLENGE = 'id, user_id, challenge_id, status, started_at, pausado, pausado_at, periodos_pausados, modalidad, km_completed, km_base, km_base_motivo';
const CAMPOS_CHALLENGE = 'id, title, modalidades, total_distance_km';
const CAMPOS_ACTIVIDAD = 'id, user_id, distance_km, recorded_at, excluida';
const TAMANO_LOTE_IDS = 100;

const filtrarKmLeido = (consulta, kmLeido) =>
  kmLeido === null || kmLeido === undefined ? consulta.is('km_completed', null) : consulta.eq('km_completed', kmLeido);

const crearRepositorioSupabase = (supabase) => {
  const lectura = clienteSoloLectura(supabase);

  return Object.freeze({
    /** Estado completo de un usuario: sus desafíos, los challenges y TODAS sus actividades. */
    leerEstadoUsuario: async (userId) => {
      const userChallenges = await traerTodo(() => lectura.from('user_challenges').select(CAMPOS_USER_CHALLENGE).eq('user_id', userId));
      const ids = [...new Set(userChallenges.map((uc) => uc.challenge_id).filter(Boolean))];
      const challenges = new Map();
      for (let i = 0; i < ids.length; i += TAMANO_LOTE_IDS) {
        const filas = await traerTodo(() => lectura.from('challenges').select(CAMPOS_CHALLENGE).in('id', ids.slice(i, i + TAMANO_LOTE_IDS)));
        filas.forEach((c) => challenges.set(c.id, c));
      }
      const actividades = await traerTodo(() => lectura.from('activities').select(CAMPOS_ACTIVIDAD).eq('user_id', userId));
      return { userChallenges, challenges, actividades };
    },

    /** Escribe km_completed solo si el desafío sigue activo y nadie lo cambió desde la lectura. */
    actualizarKmCAS: async ({ id, kmLeido, kmNuevo }) => {
      const consulta = supabase.from('user_challenges').update({ km_completed: kmNuevo }).eq('id', id).eq('status', 'active');
      const { data, error } = await filtrarKmLeido(consulta, kmLeido).select('id');
      if (error) throw error;
      return Array.isArray(data) && data.length === 1;
    },

    /** active → completed. Devuelve true solo para la llamada que hizo la transición. */
    completarCAS: async ({ id, kmLeido, kmNuevo, completedAtIso }) => {
      const consulta = supabase
        .from('user_challenges')
        .update({ status: 'completed', completed_at: completedAtIso, km_completed: kmNuevo })
        .eq('id', id)
        .eq('status', 'active');
      const { data, error } = await filtrarKmLeido(consulta, kmLeido).select('id');
      if (error) throw error;
      return Array.isArray(data) && data.length === 1;
    },

    /** Alta de evento; la clave única (user_challenge_id, tipo) impide duplicados. */
    registrarEvento: async ({ userChallengeId, userId, tipo, datos }) => {
      const { data, error } = await supabase
        .from('progreso_eventos')
        .insert({ user_challenge_id: userChallengeId, user_id: userId, tipo, datos: datos || null })
        .select('id')
        .single();
      if (error) {
        if (error.code === '23505') return { creado: false, id: null };
        throw error;
      }
      return { creado: true, id: data.id };
    },

    listarEventosProcesables: async ({ limite, vencidoAntesDeIso, ids = null }) => {
      let consulta = supabase
        .from('progreso_eventos')
        .select('id, user_challenge_id, user_id, tipo, estado, intentos, datos, resultado, procesando_desde')
        .or(`estado.in.(pendiente,error),and(estado.eq.procesando,procesando_desde.lt."${vencidoAntesDeIso}")`)
        .order('creado_at', { ascending: true })
        .limit(limite);
      if (Array.isArray(ids)) consulta = consulta.in('id', ids);
      const { data, error } = await consulta;
      if (error) throw error;
      return data || [];
    },

    /** Reclamo atómico: solo un procesador pasa el evento a 'procesando'. */
    reclamarEvento: async ({ id, ahoraIso, vencidoAntesDeIso }) => {
      const { data, error } = await supabase
        .from('progreso_eventos')
        .update({ estado: 'procesando', procesando_desde: ahoraIso, actualizado_at: ahoraIso })
        .eq('id', id)
        .or(`estado.in.(pendiente,error),and(estado.eq.procesando,procesando_desde.lt."${vencidoAntesDeIso}")`)
        .select('id, user_challenge_id, user_id, tipo, estado, intentos, datos, resultado')
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    guardarResultadoEvento: async ({ id, estado, resultado, ultimoError, intentos }) => {
      const ahora = new Date().toISOString();
      const { error } = await supabase
        .from('progreso_eventos')
        .update({ estado, resultado, ultimo_error: ultimoError || null, intentos, procesando_desde: null, actualizado_at: ahora })
        .eq('id', id)
        .eq('estado', 'procesando');
      if (error) throw error;
    },
  });
};

module.exports = { crearRepositorioSupabase };