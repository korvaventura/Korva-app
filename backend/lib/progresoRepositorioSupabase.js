// Motor unificado de progreso — Etapa 4A, REPOSITORIO SUPABASE.
//
// Implementación real de las operaciones que usan progresoServicio y completionEventos.
// La usan los writers del motor detrás de MOTOR_PROGRESO_WRITERS: REANUDAR (4A-3c) y
// ELIMINAR ACTIVIDAD (4A-3d), y la recuperación de recálculos pendientes.
//
// Escrituras posibles (y solo estas):
//  - user_challenges: km_completed (CAS sobre status='active' y el km leído). La transición a
//    'completed' (+ completed_at + evento 'completado') va por la RPC completar_desafio_motor, atómica.
//  - user_challenges: cierre de una pausa (pausado, pausado_at, periodos_pausados) junto con la
//    marca persistente recalculo_pendiente_desde, en el MISMO update; condicionado a que siga
//    pausada con el mismo pausado_at leído y (si se indica) con la misma marca leída.
//  - user_challenges.recalculo_pendiente_desde: poner/renovar la marca (compare-and-set sobre el
//    valor leído) y borrarla (compare-and-set sobre el valor propio). Ver lib/marcaRecalculo.js.
//  - activities.excluida = true de UNA actividad del usuario (eliminar actividad, igual que hoy).
//  - user_challenges.version (4A-3e; modalidad la sincroniza el trigger de la base), condicionada al
//    status leído y, si está activo, junto con la marca de recálculo en el MISMO update.
//  - progreso_eventos: reclamo, avance y resultado de los efectos, siempre con fencing por token.
//  - Nunca se escriben km_base ni km_base_motivo.
//  - progreso_eventos (4A-3a): alta de eventos y su estado. actualizado_at lo pone la base (trigger).
const { clienteSoloLectura, traerTodo } = require('./progresoSombra');

const CAMPOS_USER_CHALLENGE = 'id, user_id, challenge_id, status, started_at, pausado, pausado_at, periodos_pausados, version, modalidad, km_completed, km_base, km_base_motivo';
const CAMPOS_CHALLENGE = 'id, title, modalidades, total_distance_km';
const CAMPOS_ACTIVIDAD = 'id, user_id, distance_km, recorded_at, excluida';
const TAMANO_LOTE_IDS = 100;
const CAMPOS_EVENTO = 'id, user_challenge_id, user_id, tipo, estado, intentos, datos, resultado, ultimo_error, procesando_desde, creado_at, actualizado_at';

const filtrarKmLeido = (consulta, kmLeido) =>
  kmLeido === null || kmLeido === undefined ? consulta.is('km_completed', null) : consulta.eq('km_completed', kmLeido);

const filtrarMarcaLeida = (consulta, marcaLeida) =>
  marcaLeida === null ? consulta.is('recalculo_pendiente_desde', null) : consulta.eq('recalculo_pendiente_desde', marcaLeida);

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
        .select('id, user_id, challenge_id, status, pausado, pausado_at, periodos_pausados, recalculo_pendiente_desde')
        .eq('user_id', userId)
        .eq('challenge_id', challengeId)
        .limit(2);
      if (error) throw error;
      if (!data || data.length === 0) return { estado: 'no_encontrado', uc: null };
      if (data.length > 1) return { estado: 'duplicado', uc: null };
      return { estado: 'ok', uc: data[0] };
    },

    /**
     * Cierra la pausa abierta: solo si el desafío sigue pausado con el mismo pausado_at leído y,
     * si se pasa marcaLeida (null o un valor), con la misma marca de recálculo leída.
     * Devuelve true solo para la llamada que la cerró (dos reanudaciones a la vez → una sola cierra).
     */
    cerrarPausaCAS: async ({ id, pausadoAtLeido, periodosNuevos, marcaRecalculoIso, marcaLeida }) => {
      let consulta = supabase
        .from('user_challenges')
        .update({ pausado: false, pausado_at: null, periodos_pausados: periodosNuevos, recalculo_pendiente_desde: marcaRecalculoIso })
        .eq('id', id)
        .eq('pausado', true);
      consulta = pausadoAtLeido === null || pausadoAtLeido === undefined
        ? consulta.is('pausado_at', null)
        : consulta.eq('pausado_at', pausadoAtLeido);
      if (marcaLeida !== undefined) consulta = filtrarMarcaLeida(consulta, marcaLeida);
      const { data, error } = await consulta.select('id');
      if (error) throw error;
      return Array.isArray(data) && data.length === 1;
    },

    /**
     * Desafío para cambiar de versión (estandar/extendida), buscado igual que el writer viejo (user_id + challenge_id).
     * Devuelve { estado: 'ok' | 'no_encontrado' | 'duplicado', uc }.
     */
    leerDesafioParaModalidad: async ({ userId, challengeId }) => {
      if (!userId || !challengeId) return { estado: 'no_encontrado', uc: null };
      const { data, error } = await lectura
        .from('user_challenges')
        .select('id, user_id, challenge_id, status, version, modalidad, recalculo_pendiente_desde')
        .eq('user_id', userId)
        .eq('challenge_id', challengeId)
        .limit(2);
      if (error) throw error;
      if (!data || data.length === 0) return { estado: 'no_encontrado', uc: null };
      if (data.length > 1) return { estado: 'duplicado', uc: null };
      return { estado: 'ok', uc: data[0] };
    },

    /**
     * Cambia la VERSIÓN con compare-and-set sobre el status leído (modalidad la sincroniza el trigger
     * trg_sincronizar_version_modalidad). Si `marcaNueva` viene
     * (desafío activo), en el MISMO update pone la marca de recálculo, condicionado a la marca
     * leída. Devuelve la fila completa actualizada (igual que el viejo `.select()`) o null.
     */
    cambiarModalidadCAS: async ({ id, statusLeido, version, marcaLeida, marcaNueva }) => {
      if (version !== 'estandar' && version !== 'extendida') throw new Error(`version inválida: ${version}`);
      const valores = { version };
      if (marcaNueva !== undefined) valores.recalculo_pendiente_desde = marcaNueva;
      let consulta = supabase.from('user_challenges').update(valores).eq('id', id).eq('status', statusLeido);
      if (marcaNueva !== undefined) consulta = filtrarMarcaLeida(consulta, marcaLeida);
      const { data, error } = await consulta.select();
      if (error) throw error;
      return Array.isArray(data) && data.length === 1 ? data[0] : null;
    },

    /** Desafíos 'active' del usuario con su marca actual (para marcarlos antes de excluir una actividad). */
    leerMarcasDesafiosActivos: async ({ userId }) => {
      const { data, error } = await lectura
        .from('user_challenges')
        .select('id, challenge_id, status, recalculo_pendiente_desde')
        .eq('user_id', userId)
        .eq('status', 'active');
      if (error) throw error;
      return data || [];
    },

    /** Marca actual de un desafío. undefined si el desafío ya no existe. */
    leerMarcaRecalculo: async ({ id }) => {
      const { data, error } = await lectura
        .from('user_challenges')
        .select('id, recalculo_pendiente_desde')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data ? data.recalculo_pendiente_desde : undefined;
    },

    /**
     * Pone (si estaba en NULL) o renueva (si tenía otro valor) la marca, solo si sigue siendo la
     * marca leída. Devuelve true si esta llamada la escribió.
     */
    marcarRecalculoCAS: async ({ id, marcaLeida, marcaNueva }) => {
      const consulta = supabase.from('user_challenges').update({ recalculo_pendiente_desde: marcaNueva }).eq('id', id);
      const { data, error } = await filtrarMarcaLeida(consulta, marcaLeida).select('id');
      if (error) throw error;
      return Array.isArray(data) && data.length === 1;
    },

    /**
     * Excluye UNA actividad del usuario (excluida = true), igual que el DELETE viejo: no borra la
     * fila. Devuelve { encontrada } (false si no existe o es de otro usuario). Repetirlo es inocuo.
     */
    excluirActividad: async ({ actividadId, userId }) => {
      const { data, error } = await supabase
        .from('activities')
        .update({ excluida: true })
        .eq('id', actividadId)
        .eq('user_id', userId)
        .select('id');
      if (error) throw error;
      return { encontrada: Array.isArray(data) && data.length === 1 };
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

    /**
     * active → completed + evento 'completado', ATÓMICO (RPC completar_desafio_motor, 4A-3e-a).
     * Devuelve { gano, eventoId, eventoNuevo }: gano solo para la llamada que hizo la transición.
     * La RPC nunca toca km_base.
     */
    completarCAS: async ({ id, kmLeido, kmNuevo, completedAtIso, datos }) => {
      const { data, error } = await supabase.rpc('completar_desafio_motor', {
        p_id: id,
        p_km_leido: kmLeido === undefined ? null : kmLeido,
        p_km_nuevo: kmNuevo,
        p_completed_at: completedAtIso,
        p_datos: datos || {},
      });
      if (error) throw error;
      const fila = Array.isArray(data) ? data[0] : data;
      return { gano: !!(fila && fila.gano), eventoId: (fila && fila.evento_id) || null, eventoNuevo: !!(fila && fila.evento_nuevo) };
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

    /**
     * Eventos que podrían procesarse: pendiente/error con intentos < máximo, y 'procesando'
     * (para detectar leases vencidos o eventos que agotaron intentos en pleno procesamiento).
     * El filtro fino (gracia, espera entre reintentos, lease) lo hace completionEventos.
     */
    listarEventosProcesables: async ({ limite, ids = null, maxIntentos }) => {
      const base = () => {
        let c = supabase.from('progreso_eventos').select(CAMPOS_EVENTO);
        if (Array.isArray(ids)) c = c.in('id', ids);
        return c;
      };
      const [libres, enProceso] = await Promise.all([
        base().in('estado', ['pendiente', 'error']).lt('intentos', maxIntentos).order('creado_at', { ascending: true }).limit(limite),
        base().eq('estado', 'procesando').order('creado_at', { ascending: true }).limit(limite),
      ]);
      if (libres.error) throw libres.error;
      if (enProceso.error) throw enProceso.error;
      return [...(libres.data || []), ...(enProceso.data || [])];
    },

    /**
     * Reclamo con compare-and-set sobre la versión leída (estado, intentos y procesando_desde).
     * En el MISMO update: estado 'procesando', token propio en procesando_desde e intentos + 1.
     * Devuelve el evento reclamado o null si otro lo tomó/cambió.
     */
    reclamarEventoCAS: async ({ leido, token }) => {
      let consulta = supabase
        .from('progreso_eventos')
        .update({ estado: 'procesando', procesando_desde: token, intentos: (leido.intentos || 0) + 1 })
        .eq('id', leido.id)
        .eq('estado', leido.estado)
        .eq('intentos', leido.intentos || 0);
      consulta = leido.procesando_desde ? consulta.eq('procesando_desde', leido.procesando_desde) : consulta.is('procesando_desde', null);
      const { data, error } = await consulta.select(CAMPOS_EVENTO);
      if (error) throw error;
      return Array.isArray(data) && data.length === 1 ? data[0] : null;
    },

    /** Guarda el avance de los pasos SOLO si el evento sigue siendo de este procesador (fencing). */
    guardarAvanceEventoCAS: async ({ id, token, resultado }) => {
      const { data, error } = await supabase
        .from('progreso_eventos')
        .update({ resultado })
        .eq('id', id)
        .eq('estado', 'procesando')
        .eq('procesando_desde', token)
        .select('id');
      if (error) throw error;
      return Array.isArray(data) && data.length === 1;
    },

    /** Resultado final (hecho / error), con fencing. `intentos` solo si hay que fijarlo (al máximo). */
    finalizarEventoCAS: async ({ id, token, estado, resultado, ultimoError, intentos }) => {
      const valores = { estado, resultado, ultimo_error: ultimoError || null, procesando_desde: null };
      if (intentos !== undefined) valores.intentos = intentos;
      const { data, error } = await supabase
        .from('progreso_eventos')
        .update(valores)
        .eq('id', id)
        .eq('estado', 'procesando')
        .eq('procesando_desde', token)
        .select('id');
      if (error) throw error;
      return Array.isArray(data) && data.length === 1;
    },

    /** Un 'procesando' abandonado que ya agotó los intentos: pasa a error para intervención. */
    cerrarEventoAgotadoCAS: async ({ leido, resultado, ultimoError }) => {
      const { data, error } = await supabase
        .from('progreso_eventos')
        .update({ estado: 'error', resultado, ultimo_error: ultimoError, procesando_desde: null })
        .eq('id', leido.id)
        .eq('estado', 'procesando')
        .eq('procesando_desde', leido.procesando_desde)
        .select('id');
      if (error) throw error;
      return Array.isArray(data) && data.length === 1;
    },
  });
};

module.exports = { crearRepositorioSupabase };