// Motor unificado de progreso — Etapa 4A, REPOSITORIO SUPABASE.
//
// Implementación real de las operaciones que usan progresoServicio y completionEventos.
// Lo usa solo el writer canario de REANUDAR (4A-3c), detrás de MOTOR_PROGRESO_WRITERS.
//
// Escrituras posibles (y solo estas):
//  - user_challenges: km_completed, y en la transición también status='completed' + completed_at.
//    Siempre condicionadas (compare-and-set) a status='active' y al km_completed leído.
//  - user_challenges: cierre de una pausa (pausado, pausado_at, periodos_pausados) junto con la
//    marca persistente recalculo_pendiente_desde, en el MISMO update; condicionado a que siga
//    pausada con el mismo pausado_at leído. La marca se limpia solo cuando el recálculo terminó bien.
//  - Nunca se escriben km_base ni km_base_motivo.
//  - progreso_eventos (4A-3a): alta de eventos y su estado. actualizado_at lo pone la base (trigger).
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
    /**
     * Desafío a reanudar, buscado igual que el writer viejo: por user_id + challenge_id.
     * Devuelve { estado: 'ok' | 'no_encontrado' | 'duplicado', uc }.
     */
    leerDesafioParaReanudar: async ({ userId, challengeId }) => {
      if (!userId || !challengeId) return { estado: 'no_encontrado', uc: null };
      const { data, error } = await lectura
        .from('user_challenges')
        .select('id, user_id, challenge_id, status, pausado, pausado_at, periodos_pausados')
        .eq('user_id', userId)
        .eq('challenge_id', challengeId)
        .limit(2);
      if (error) throw error;
      if (!data || data.length === 0) return { estado: 'no_encontrado', uc: null };
      if (data.length > 1) return { estado: 'duplicado', uc: null };
      return { estado: 'ok', uc: data[0] };
    },

    /**
     * Cierra la pausa abierta: solo si el desafío sigue pausado con el mismo pausado_at leído.
     * Devuelve true solo para la llamada que la cerró (dos reanudaciones a la vez → una sola cierra).
     */
    cerrarPausaCAS: async ({ id, pausadoAtLeido, periodosNuevos, marcaRecalculoIso }) => {
      let consulta = supabase
        .from('user_challenges')
        .update({ pausado: false, pausado_at: null, periodos_pausados: periodosNuevos, recalculo_pendiente_desde: marcaRecalculoIso })
        .eq('id', id)
        .eq('pausado', true);
      consulta = pausadoAtLeido === null || pausadoAtLeido === undefined
        ? consulta.is('pausado_at', null)
        : consulta.eq('pausado_at', pausadoAtLeido);
      const { data, error } = await consulta.select('id');
      if (error) throw error;
      return Array.isArray(data) && data.length === 1;
    },

    /** Quita la marca de recálculo pendiente solo si sigue siendo la misma que se puso (no borra una más nueva). */
    limpiarRecalculoPendienteCAS: async ({ id, marcaIso }) => {
      const { data, error } = await supabase
        .from('user_challenges')
        .update({ recalculo_pendiente_desde: null })
        .eq('id', id)
        .eq('recalculo_pendiente_desde', marcaIso)
        .select('id');
      if (error) throw error;
      return Array.isArray(data) && data.length === 1;
    },

    /** Desafíos con recálculo pendiente marcado antes de anteriorAIso (para la recuperación). */
    listarRecalculosPendientes: async ({ limite, anteriorAIso }) => {
      const { data, error } = await lectura
        .from('user_challenges')
        .select('id, user_id, challenge_id, recalculo_pendiente_desde')
        .not('recalculo_pendiente_desde', 'is', null)
        .lt('recalculo_pendiente_desde', anteriorAIso)
        .order('recalculo_pendiente_desde', { ascending: true })
        .limit(limite);
      if (error) throw error;
      return data || [];
    },

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
        .update({ estado: 'procesando', procesando_desde: ahoraIso })
        .eq('id', id)
        .or(`estado.in.(pendiente,error),and(estado.eq.procesando,procesando_desde.lt."${vencidoAntesDeIso}")`)
        .select('id, user_challenge_id, user_id, tipo, estado, intentos, datos, resultado')
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    guardarResultadoEvento: async ({ id, estado, resultado, ultimoError, intentos }) => {
      const { error } = await supabase
        .from('progreso_eventos')
        .update({ estado, resultado, ultimo_error: ultimoError || null, intentos, procesando_desde: null })
        .eq('id', id)
        .eq('estado', 'procesando');
      if (error) throw error;
    },
  });
};

module.exports = { crearRepositorioSupabase };