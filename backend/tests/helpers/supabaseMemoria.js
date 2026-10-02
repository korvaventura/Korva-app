// Cliente Supabase EN MEMORIA para tests (no toca ninguna base real).
// Soporta lo que usan el writer viejo de reanudar y el repositorio del motor:
//   from(t).select(campos) / .update(valores) / .insert(fila)
//   filtros: eq, is, in, gte, lt, neq, not(is null) ; order, range, limit ; terminales: then, single, maybeSingle
//   select('..., challenges(...)') adjunta el challenge (como el join de PostgREST).
// Registra cada operación en `registro` para poder afirmar qué se leyó y qué se escribió.
const crearSupabaseMemoria = (tablas = {}, opciones = {}) => {
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
        if (tabla === 'progreso_eventos') {
          if (db[tabla].some((e) => e.user_challenge_id === fila.user_challenge_id && e.tipo === fila.tipo)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "progreso_eventos_unico"' } };
          }
          Object.assign(fila, { estado: 'pendiente', intentos: 0, resultado: {}, procesando_desde: null, ...op.valores });
        }
        db[tabla].push(fila);
        return { data: op.devolver ? [proyectar(fila)] : null, error: null };
      }
      let filas = db[tabla].filter(coincide);
      if (op.tipo === 'update') {
        filas.forEach((f) => Object.assign(f, JSON.parse(JSON.stringify(op.valores))));
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

  return { cliente: { from, rpc: async () => ({ data: null, error: null }) }, db, registro };
};

module.exports = { crearSupabaseMemoria };