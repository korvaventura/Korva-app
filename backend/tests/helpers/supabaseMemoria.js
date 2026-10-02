// Cliente Supabase EN MEMORIA para tests (no toca ninguna base real).
// Soporta lo que usan el writer viejo de reanudar y el repositorio del motor:
//   from(t).select(campos) / .update(valores) / .insert(fila)
//   filtros: eq, is, in, gte, lt, neq, not(is null) ; order, range, limit ; terminales: then, single, maybeSingle
//   select('..., challenges(...)') adjunta el challenge (como el join de PostgREST).
// Registra cada operación en `registro` para poder afirmar qué se leyó y qué se escribió.
// progreso_eventos imita la base: creado_at/actualizado_at al insertar y el trigger que pone
// actualizado_at en cada UPDATE (con `opciones.reloj`, inyectable en los tests).
// Migración 4A-3e-a (probada en Postgres real), imitada acá con la misma semántica:
//  - rpc('completar_desafio_motor'): CAS active→completed + km + completed_at + evento 'completado'
//    (origen motor, pendiente), todo o nada. `opciones.fallar({ tabla: 'rpc', nombre })` la hace fallar
//    SIN cambiar nada (como el rollback de la transacción).
//  - trg_completado_legado: un UPDATE de status active/pending → completed/cargado/shipped (fuera de
//    la RPC) crea el evento 'completado' origen 'legado' ya 'hecho'.
//  - trg_proteger_certificado_serial: reemplazar un serial asignado por otro valor → error P0001.
// Migración "versión del desafío" (probada en Postgres real), imitada acá:
//  - trg_sincronizar_version_modalidad: espejo modalidad ↔ version en INSERT y en UPDATE que nombre
//    alguna de las dos (manda la que cambió; si cambian las dos deben coincidir → 23514).
//    Las filas iniciales se dejan como vienen: una fila SIN version imita un objeto/cliente viejo.
const TERMINALES = ['completed', 'cargado', 'shipped'];
const VERSIONES = ['estandar', 'extendida'];
const versionDe = (modalidad) => (modalidad === 'ride' ? 'extendida' : 'estandar');
const modalidadDe = (version) => (version === 'extendida' ? 'ride' : 'run');
const errorVersion = (m) => ({ code: '23514', message: m });

/** Igual que la función del trigger. Devuelve un error o null; modifica `nueva`. */
const espejoInsert = (nueva) => {
  if (nueva.version != null && !VERSIONES.includes(nueva.version)) return errorVersion(`version inválida: ${nueva.version}`);
  if (nueva.version == null) nueva.version = versionDe(nueva.modalidad);
  else if (nueva.modalidad == null) nueva.modalidad = modalidadDe(nueva.version);
  else if (nueva.version !== versionDe(nueva.modalidad)) return errorVersion('modalidad y version no coinciden');
  return null;
};
const espejoUpdate = (vieja, nueva) => {
  if (nueva.version === null) return { code: '23502', message: 'null value in column "version" violates not-null constraint' };
  if (nueva.version != null && !VERSIONES.includes(nueva.version)) return errorVersion(`version inválida: ${nueva.version}`);
  const versionVieja = vieja.version ?? versionDe(vieja.modalidad);
  const versionNueva = nueva.version ?? versionDe(nueva.modalidad);
  if (versionNueva === versionVieja) nueva.version = versionDe(nueva.modalidad);
  else if ((nueva.modalidad ?? null) === (vieja.modalidad ?? null)) nueva.modalidad = modalidadDe(versionNueva);
  else if (versionNueva !== versionDe(nueva.modalidad)) return errorVersion('modalidad y version no coinciden');
  return null;
};

const crearSupabaseMemoria = (tablas = {}, opciones = {}) => {
  const ahoraIso = () => new Date(opciones.reloj ? opciones.reloj() : Date.now()).toISOString();
  let nEventos = 0;
  const insertarEvento = (fila) => {
    if (!db.progreso_eventos) db.progreso_eventos = [];
    const existente = db.progreso_eventos.find((e) => e.user_challenge_id === fila.user_challenge_id && e.tipo === fila.tipo);
    if (existente) return { creado: false, evento: existente };
    const evento = {
      id: `ev-${++nEventos}`, estado: 'pendiente', intentos: 0, resultado: {}, procesando_desde: null, ultimo_error: null,
      creado_at: ahoraIso(), actualizado_at: ahoraIso(), datos: null, ...fila,
    };
    db.progreso_eventos.push(evento);
    return { creado: true, evento };
  };
  const db = JSON.parse(JSON.stringify(tablas));
  const registro = [];
  let secuencia = 0;

  const from = (tabla) => {
    if (!db[tabla]) db[tabla] = [];
    const op = { tabla, tipo: 'select', campos: null, valores: null, filtros: [], devolver: false, limite: null, rango: null };
    registro.push(op);

    const coincide = (fila) => op.filtros.every(([t, c, v]) => {
      const x = fila[c];
      if (t === 'eq') return x === v || (typeof x === 'number' && Number(v) === x && v !== null && v !== '');
      if (t === 'neq') return x !== v;
      if (t === 'is') return v === null ? x === null || x === undefined : x === v;
      if (t === 'in') return v.includes(x);
      if (t === 'gte') return x >= v;
      if (t === 'lt') return x !== null && x !== undefined && x < v;
      if (t === 'not_is_null') return x !== null && x !== undefined;
      return true;
    });

    const proyectar = (fila) => {
      const copia = JSON.parse(JSON.stringify(fila));
      if (op.campos && /challenges\(/.test(op.campos)) {
        copia.challenges = (db.challenges || []).find((c) => c.id === fila.challenge_id) || null;
      }
      return copia;
    };

    const ejecutar = () => {
      if (opciones.fallar && opciones.fallar(op)) return { data: null, error: { message: 'falla simulada', code: 'XX000' } };
      if (op.tipo === 'insert') {
        const fila = { id: `id-${++secuencia}`, ...op.valores };
        if (tabla === 'progreso_eventos') delete fila.id; // id lo pone insertarEvento
        if (tabla === 'activities' && fila.excluida === undefined) fila.excluida = false; // DEFAULT false de la base
        if (tabla === 'progreso_eventos') {
          const r = insertarEvento({ ...op.valores });
          if (!r.creado) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "progreso_eventos_unico"' } };
          return { data: op.devolver ? [proyectar(r.evento)] : null, error: null };
        }
        if (tabla === 'user_challenges') {
          const e = espejoInsert(fila);
          if (e) return { data: null, error: e };
        }
        db[tabla].push(fila);
        return { data: op.devolver ? [proyectar(fila)] : null, error: null };
      }
      let filas = db[tabla].filter(coincide);
      if (op.tipo === 'update') {
        if (tabla === 'user_challenges' && 'certificado_serial' in op.valores) {
          const pisa = filas.find((f) => f.certificado_serial && op.valores.certificado_serial && op.valores.certificado_serial !== f.certificado_serial);
          if (pisa) return { data: null, error: { code: 'P0001', message: `certificado_serial ya asignado (${pisa.certificado_serial}): no se puede reemplazar` } };
        }
        if (tabla === 'user_challenges' && ('modalidad' in op.valores || 'version' in op.valores)) {
          // trg_sincronizar_version_modalidad: se calcula para todas las filas antes de escribir (todo o nada)
          const nuevas = [];
          for (const f of filas) {
            const nueva = { ...f, ...JSON.parse(JSON.stringify(op.valores)) };
            const e = espejoUpdate(f, nueva);
            if (e) return { data: null, error: e };
            nuevas.push(nueva);
          }
          filas.forEach((f, i) => { f.modalidad = nuevas[i].modalidad; f.version = nuevas[i].version; });
        }
        filas.forEach((f) => {
          const statusAntes = f.status;
          const espejo = tabla === 'user_challenges' ? { modalidad: f.modalidad, version: f.version } : null;
          Object.assign(f, JSON.parse(JSON.stringify(op.valores)));
          if (espejo && ('modalidad' in op.valores || 'version' in op.valores)) Object.assign(f, espejo);
          if (tabla === 'progreso_eventos') f.actualizado_at = ahoraIso(); // trigger de la base
          if (tabla === 'user_challenges' && ['active', 'pending'].includes(statusAntes) && TERMINALES.includes(f.status)) {
            // trg_completado_legado (fuera de la RPC del motor)
            insertarEvento({
              user_challenge_id: f.id, user_id: f.user_id, tipo: 'completado', estado: 'hecho',
              datos: { origen: 'legado', status: f.status }, resultado: { origen: 'legado', efectos: 'codigo_viejo' },
            });
          }
        });
        return { data: op.devolver ? filas.map(proyectar) : null, error: null };
      }
      if (op.rango) filas = filas.slice(op.rango[0], op.rango[1] + 1);
      if (op.limite !== null) filas = filas.slice(0, op.limite);
      return { data: filas.map(proyectar), error: null };
    };

    const q = {
      select: (campos) => { if (op.tipo === 'select') op.campos = campos; else op.devolver = true; return q; },
      update: (v) => { op.tipo = 'update'; op.valores = v; return q; },
      insert: (v) => { op.tipo = 'insert'; op.valores = v; return q; },
      eq: (c, v) => { op.filtros.push(['eq', c, v]); return q; },
      neq: (c, v) => { op.filtros.push(['neq', c, v]); return q; },
      is: (c, v) => { op.filtros.push(['is', c, v]); return q; },
      in: (c, v) => { op.filtros.push(['in', c, v]); return q; },
      gte: (c, v) => { op.filtros.push(['gte', c, v]); return q; },
      lt: (c, v) => { op.filtros.push(['lt', c, v]); return q; },
      not: (c, operador, v) => { if (operador === 'is' && v === null) op.filtros.push(['not_is_null', c, null]); return q; },
      order: () => q,
      range: (a, b) => { op.rango = [a, b]; return q; },
      limit: (n) => { op.limite = n; return q; },
      or: () => q,
      single: async () => {
        const r = ejecutar();
        if (r.error) return r;
        const filas = Array.isArray(r.data) ? r.data : [];
        if (filas.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'no exactamente una fila' } };
        return { data: filas[0], error: null };
      },
      maybeSingle: async () => {
        const r = ejecutar();
        if (r.error) return r;
        const filas = Array.isArray(r.data) ? r.data : [];
        return { data: filas[0] || null, error: null };
      },
      then: (resolver, rechazar) => Promise.resolve(ejecutar()).then(resolver, rechazar),
    };
    return q;
  };

  /** RPC completar_desafio_motor: todo o nada (síncrono = atómico en este doble). */
  const completarDesafioMotor = (args) => {
    const op = { tabla: 'rpc', tipo: 'rpc', nombre: 'completar_desafio_motor', args, valores: { status: 'completed', km_completed: args.p_km_nuevo, completed_at: args.p_completed_at }, filtros: [] };
    registro.push(op);
    if (opciones.fallar && opciones.fallar(op)) return { data: null, error: { message: 'falla simulada', code: 'XX000' } };
    const fila = (db.user_challenges || []).find((u) => u.id === args.p_id);
    const kmGuardado = fila ? (fila.km_completed ?? null) : undefined;
    const kmLeido = args.p_km_leido ?? null;
    if (!fila || fila.status !== 'active' || kmGuardado !== kmLeido) {
      return { data: [{ gano: false, evento_id: null, evento_nuevo: false }], error: null };
    }
    Object.assign(fila, { status: 'completed', km_completed: args.p_km_nuevo, completed_at: args.p_completed_at });
    const r = insertarEvento({ user_challenge_id: fila.id, user_id: fila.user_id, tipo: 'completado', datos: { ...(args.p_datos || {}), origen: 'motor' } });
    return { data: [{ gano: true, evento_id: r.evento.id, evento_nuevo: r.creado }], error: null };
  };
  const rpc = async (nombre, args) => {
    if (nombre === 'completar_desafio_motor') return completarDesafioMotor(args);
    return opciones.rpc && opciones.rpc[nombre] ? opciones.rpc[nombre](args) : { data: null, error: null };
  };
  return { cliente: { from, rpc }, db, registro };
};

module.exports = { crearSupabaseMemoria };