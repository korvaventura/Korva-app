// Tests del writer canario REANUDAR con el motor unificado (Etapa 4A-3c).
// Unitarios: usan el repositorio Supabase REAL sobre un cliente en memoria.
// Integración: levantan backend/index.js real en un proceso hijo (con Supabase en memoria)
// y llaman a POST /challenges/reanudar con la flag apagada y encendida.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
const { levantarBackend: levantarBackendHijo } = require('./helpers/backendHijo');
const { crearRepositorioSupabase } = require('../lib/progresoRepositorioSupabase');
const { reanudarDesafioConMotor } = require('../lib/reanudarDesafio');
const { recalcularProgresoUsuario, MODOS } = require('../lib/progresoServicio');
const { writerMotorActivo, writersActivos, healthMotorActivo } = require('../lib/flagsMotor');
const { recuperarRecalculosPendientes, iniciarRecuperacionPeriodica, iniciarRecuperacion } = require('../lib/recuperacionRecalculo');

// ---------------------------------------------------------------------------
// Escenario base
//   inicio 01/09 · actividad 02/09 (10 km, antes de la pausa)
//   pausa abierta desde 05/09 · actividad 06/09 (7 km, DURANTE la pausa)
//   reanuda el 10/09 · actividad 11/09 (5 km, DESPUÉS de reanudar; llega más tarde)
// ---------------------------------------------------------------------------
const U = 'u1';
const AHORA = Date.parse('2026-09-10T12:00:00Z');
const CH = { id: 'c1', title: 'Fin del Mundo', modalidades: [{ tipo: 'run', distancia_km: 103 }], total_distance_km: 103 };

const uc = (extra = {}) => ({
  id: 'uc1', user_id: U, challenge_id: 'c1', status: 'active', modalidad: 'run',
  started_at: '2026-09-01T00:00:00', pausado: true, pausado_at: '2026-09-05T08:00:00.123456',
  periodos_pausados: [], km_completed: 50, km_base: 40, km_base_motivo: 'legado_historico', completed_at: null,
  ...extra,
});
const act = (id, recorded_at, km, extra = {}) => ({ id, user_id: U, distance_km: km, recorded_at, excluida: false, ...extra });
const ACT_ANTES = act('a1', '2026-09-02T07:00:00', 10);
const ACT_DURANTE = act('a2', '2026-09-06T07:00:00', 7);
const ACT_DESPUES = act('a3', '2026-09-11T07:00:00', 5);

const montar = ({ ucs = [uc()], actividades = [ACT_ANTES, ACT_DURANTE], fallar } = {}) => {
  const m = crearSupabaseMemoria({ user_challenges: ucs, challenges: [CH], activities: actividades, progreso_eventos: [] }, { fallar });
  const logs = [];
  const repo = crearRepositorioSupabase(m.cliente);
  const esperas = [];
  const esperar = async (ms) => { esperas.push(ms); };
  const reanudar = (extra = {}) => reanudarDesafioConMotor({ repo, userId: U, challengeId: 'c1', ahoraMs: AHORA, log: (l) => logs.push(l), esperar, generarMarca: (ms) => new Date(ms).toISOString(), ...extra });
  const fila = (id = 'uc1') => m.db.user_challenges.find((x) => x.id === id);
  const recuperar = (extra = {}) => recuperarRecalculosPendientes({ repo, ahoraMs: AHORA + 10 * 60 * 1000, log: (l) => logs.push(l), esperar, ...extra });
  return { m, repo, reanudar, recuperar, fila, logs, esperas };
};

const escriturasConKmBase = (registro) =>
  registro.filter((op) => op.tipo !== 'select' && op.valores && ('km_base' in op.valores || 'km_base_motivo' in op.valores));

// ---------------------------------------------------------------------------
// Flag
// ---------------------------------------------------------------------------

test('flag: apagada por defecto; se enciende solo con "reanudar" explícito', () => {
  assert.equal(writerMotorActivo('reanudar', {}), false);
  assert.equal(writerMotorActivo('reanudar', { MOTOR_PROGRESO_WRITERS: '' }), false);
  assert.equal(writerMotorActivo('reanudar', { MOTOR_PROGRESO_WRITERS: 'reanudar' }), true);
  assert.equal(writerMotorActivo('reanudar', { MOTOR_PROGRESO_WRITERS: ' Reanudar , otro ' }), true);
  assert.equal(writerMotorActivo('reanudar', { MOTOR_PROGRESO_WRITERS: 'reanudarx,manual' }), false);
  assert.deepEqual(writersActivos({ MOTOR_PROGRESO_WRITERS: 'manual,strava,reanudar' }), ['reanudar']); // solo writers conocidos
});

test('flag Health: OFF por defecto y ON solo con MOTOR_PROGRESO_HEALTH=1', () => {
  assert.equal(healthMotorActivo({}), false);
  assert.equal(healthMotorActivo({ MOTOR_PROGRESO_HEALTH: '' }), false);
  assert.equal(healthMotorActivo({ MOTOR_PROGRESO_HEALTH: '0' }), false);
  assert.equal(healthMotorActivo({ MOTOR_PROGRESO_HEALTH: 'true' }), false);
  assert.equal(healthMotorActivo({ MOTOR_PROGRESO_HEALTH: ' 1 ' }), true);
});

// ---------------------------------------------------------------------------
// Reanudar con el motor
// ---------------------------------------------------------------------------

test('con km_base: reanudar no pierde progreso (base + actividades fuera de pausa)', async () => {
  const { reanudar, fila, m } = montar();
  const r = await reanudar();
  assert.equal(r.status, 200);
  assert.equal(r.body.mensaje, 'Desafío reanudado y km recalculados');
  assert.equal(fila().km_completed, 50); // 40 de base + 10 antes de la pausa; los 7 de la pausa no
  assert.equal(fila().km_base, 40);
  assert.equal(fila().km_base_motivo, 'legado_historico');
  assert.equal(r.body.progreso.recalculo, 'ok');
  assert.deepEqual(escriturasConKmBase(m.registro), []);
});

test('cierra la pausa: pausado=false, pausado_at=null y agrega { desde: pausado_at, hasta: ahora }', async () => {
  const { reanudar, fila } = montar({ ucs: [uc({ periodos_pausados: [{ desde: '2026-08-20T00:00:00', hasta: '2026-08-21T00:00:00.000Z' }] })] });
  await reanudar();
  assert.equal(fila().pausado, false);
  assert.equal(fila().pausado_at, null);
  assert.deepEqual(fila().periodos_pausados, [
    { desde: '2026-08-20T00:00:00', hasta: '2026-08-21T00:00:00.000Z' },
    { desde: '2026-09-05T08:00:00.123456', hasta: '2026-09-10T12:00:00.000Z' },
  ]);
});

test('actividades antes / durante / después de la pausa', async () => {
  const { reanudar, fila, repo, m } = montar({ ucs: [uc({ km_base: 0, km_base_motivo: null, km_completed: 10 })] });
  await reanudar();
  assert.equal(fila().km_completed, 10); // antes cuenta, durante no
  m.db.activities.push(ACT_DESPUES); // llega una actividad después de reanudar
  await recalcularProgresoUsuario({ repo, userId: U, motivo: 'test', modo: MODOS.ESCRIBIR });
  assert.equal(fila().km_completed, 15); // después de reanudar cuenta
});

test('sin km_base: el progreso se reconstruye solo con actividades, y puede bajar', async () => {
  // El valor guardado incluía por error la actividad hecha durante la pausa (17).
  const { reanudar, fila } = montar({ ucs: [uc({ km_base: 0, km_base_motivo: null, km_completed: 17 })] });
  const r = await reanudar();
  assert.equal(fila().km_completed, 10);
  assert.equal(r.body.progreso.km_antes, 17);
  assert.equal(r.body.progreso.km_despues, 10);
});

test('sin cambios: si ya estaba bien, el motor no escribe km', async () => {
  const { reanudar, m } = montar();
  await reanudar();
  const updatesKm = m.registro.filter((op) => op.tipo === 'update' && op.valores && 'km_completed' in op.valores);
  assert.equal(updatesKm.length, 0);
});

test('idempotencia: reanudar dos veces → la segunda responde "No estaba pausado" y no cambia nada', async () => {
  const { reanudar, fila } = montar();
  await reanudar();
  const despuesDeLaPrimera = JSON.parse(JSON.stringify(fila()));
  const r2 = await reanudar({ ahoraMs: AHORA + 60000 });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.mensaje, 'No estaba pausado');
  assert.deepEqual(fila(), despuesDeLaPrimera);
});

test('concurrencia: dos reanudaciones simultáneas → un solo período agregado y km correcto', async () => {
  const { reanudar, fila } = montar();
  const [a, b] = await Promise.all([reanudar(), reanudar()]);
  assert.equal(fila().periodos_pausados.length, 1);
  assert.equal(fila().km_completed, 50);
  const mensajes = [a.body.mensaje, b.body.mensaje].sort();
  assert.deepEqual(mensajes, ['Desafío reanudado y km recalculados', 'No estaba pausado']);
});

// ---------------------------------------------------------------------------
// Recuperación ante fallos después de cerrar la pausa
// ---------------------------------------------------------------------------

const MARCA = '2026-09-10T12:00:00.000Z';

test('la marca de recálculo pendiente se escribe en el MISMO update que cierra la pausa', async () => {
  const { reanudar, m } = montar();
  await reanudar();
  const cierre = m.registro.find((op) => op.tipo === 'update' && op.valores && op.valores.pausado === false);
  assert.equal(cierre.valores.recalculo_pendiente_desde, MARCA);
  assert.equal(cierre.valores.pausado_at, null);
});

test('recálculo exitoso: la marca se borra', async () => {
  const { reanudar, fila } = montar();
  const r = await reanudar();
  assert.equal(r.body.progreso.recalculo, 'ok');
  assert.equal(fila().recalculo_pendiente_desde, null);
});

test('falla el 1.er recálculo y el reintento inmediato funciona: ok y marca borrada', async () => {
  let fallas = 1;
  const { reanudar, fila, esperas } = montar({
    ucs: [uc({ km_base: 0, km_base_motivo: null, km_completed: 17 })],
    fallar: (op) => op.tabla === 'activities' && op.tipo === 'select' && fallas-- > 0,
  });
  const r = await reanudar();
  assert.equal(r.body.progreso.recalculo, 'ok');
  assert.equal(fila().km_completed, 10);
  assert.equal(fila().recalculo_pendiente_desde, null);
  assert.deepEqual(esperas, [250]); // esperó antes del 2.º intento
});

test('fallan todos los intentos: pausa cerrada, marca PERSISTENTE, km y base intactos', async () => {
  const { reanudar, fila, logs, esperas } = montar({
    ucs: [uc({ km_completed: 50 })],
    fallar: (op) => op.tabla === 'activities' && op.tipo === 'select',
  });
  const r = await reanudar();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.progreso, { motor: true, recalculo: 'pendiente', recuperacion: 'automatica' });
  assert.equal(fila().pausado, false);
  assert.equal(fila().periodos_pausados.length, 1);
  assert.equal(fila().recalculo_pendiente_desde, MARCA); // señal persistente
  assert.equal(fila().km_completed, 50);
  assert.equal(fila().km_base, 40);
  assert.deepEqual(esperas, [250, 1000]);
  assert.ok(logs.some((l) => l.resultado === 'reanudado_recalculo_pendiente' && l.marca === MARCA));
});

test('la recuperación periódica completa lo que quedó pendiente y borra la marca', async () => {
  let fallar = true;
  const { reanudar, recuperar, fila, logs } = montar({
    ucs: [uc({ km_base: 0, km_base_motivo: null, km_completed: 17 })],
    fallar: (op) => fallar && op.tabla === 'activities' && op.tipo === 'select',
  });
  await reanudar();
  assert.equal(fila().recalculo_pendiente_desde, MARCA);
  fallar = false; // la base volvió
  const r = await recuperar();
  assert.deepEqual([r.revisados, r.recuperados], [1, 1]);
  assert.equal(fila().km_completed, 10);
  assert.equal(fila().recalculo_pendiente_desde, null);
  assert.ok(logs.some((l) => l.writer === 'recuperacion' && l.resultado === 'recuperado'));
});

test('si también falla la recuperación, la marca sigue y la próxima ronda lo vuelve a intentar', async () => {
  let fallar = true;
  const { reanudar, recuperar, fila } = montar({
    ucs: [uc({ km_base: 0, km_base_motivo: null, km_completed: 17 })],
    fallar: (op) => fallar && op.tabla === 'activities' && op.tipo === 'select',
  });
  await reanudar();
  const r1 = await recuperar();
  assert.deepEqual([r1.revisados, r1.recuperados], [1, 0]);
  assert.equal(fila().recalculo_pendiente_desde, MARCA);
  assert.equal(fila().km_completed, 17); // nada se rompió ni se perdió
  fallar = false;
  const r2 = await recuperar();
  assert.equal(r2.recuperados, 1);
  assert.equal(fila().km_completed, 10);
  assert.equal(fila().recalculo_pendiente_desde, null);
});

test('Railway cae justo después de cerrar la pausa: la marca quedó y la recuperación al arrancar lo resuelve', async () => {
  // Simulación: el cierre se guardó (con marca) y el proceso murió antes de recalcular.
  const { repo, recuperar, fila } = montar({ ucs: [uc({ km_base: 0, km_base_motivo: null, km_completed: 17 })] });
  await repo.cerrarPausaCAS({ id: 'uc1', pausadoAtLeido: '2026-09-05T08:00:00.123456', periodosNuevos: [{ desde: '2026-09-05T08:00:00.123456', hasta: MARCA }], marcaRecalculoIso: MARCA });
  assert.equal(fila().pausado, false);
  assert.equal(fila().km_completed, 17); // desactualizado, pero marcado
  const r = await recuperar();
  assert.equal(r.recuperados, 1);
  assert.equal(fila().km_completed, 10);
  assert.equal(fila().recalculo_pendiente_desde, null);
});

test('Railway cae DURANTE el recálculo (km ya escrito, marca sin borrar): la marca queda y la recuperación converge', async () => {
  let fallaBorrado = true; // simula que el proceso murió después de escribir km y antes de borrar la marca
  const { reanudar, recuperar, fila, m } = montar({
    ucs: [uc({ km_base: 0, km_base_motivo: null, km_completed: 17 })],
    fallar: (op) => fallaBorrado && op.tabla === 'user_challenges' && op.tipo === 'update' &&
      op.valores && Object.keys(op.valores).length === 1 && op.valores.recalculo_pendiente_desde === null,
  });
  await reanudar();
  assert.equal(fila().km_completed, 10); // el km sí quedó escrito
  assert.equal(fila().recalculo_pendiente_desde, MARCA); // la marca no se pudo borrar
  fallaBorrado = false;
  const escriturasKm = () => m.registro.filter((op) => op.tipo === 'update' && op.valores && 'km_completed' in op.valores).length;
  const antes = escriturasKm();
  const r = await recuperar();
  assert.equal(r.recuperados, 1);
  assert.equal(escriturasKm(), antes); // idempotente: no volvió a escribir km
  assert.equal(fila().km_completed, 10);
  assert.equal(fila().recalculo_pendiente_desde, null);
});

test('marcas recientes no se tocan (pueden ser de un pedido en curso)', async () => {
  const { repo, fila } = montar();
  await repo.cerrarPausaCAS({ id: 'uc1', pausadoAtLeido: '2026-09-05T08:00:00.123456', periodosNuevos: [], marcaRecalculoIso: MARCA });
  const r = await recuperarRecalculosPendientes({ repo, ahoraMs: Date.parse(MARCA) + 60 * 1000, log: () => {} });
  assert.equal(r.revisados, 0);
  assert.equal(fila().recalculo_pendiente_desde, MARCA);
});

test('borrar la marca no borra una marca más nueva de otra reanudación', async () => {
  const { repo, fila } = montar();
  await repo.cerrarPausaCAS({ id: 'uc1', pausadoAtLeido: '2026-09-05T08:00:00.123456', periodosNuevos: [], marcaRecalculoIso: '2026-09-12T00:00:00.000Z' });
  const borro = await repo.limpiarRecalculoPendienteCAS({ id: 'uc1', marcaIso: MARCA });
  assert.equal(borro, false);
  assert.equal(fila().recalculo_pendiente_desde, '2026-09-12T00:00:00.000Z');
});

test('recuperación periódica: corre al arrancar y luego por intervalo, sin superponer rondas', async () => {
  const { repo, fila } = montar({ ucs: [uc({ km_base: 0, km_base_motivo: null, km_completed: 17 })] });
  await repo.cerrarPausaCAS({ id: 'uc1', pausadoAtLeido: '2026-09-05T08:00:00.123456', periodosNuevos: [], marcaRecalculoIso: '2026-01-01T00:00:00.000Z' });
  const rondas = [];
  await new Promise((listo) => {
    const h = iniciarRecuperacionPeriodica({
      crearRepo: () => repo, intervaloMs: 20, demoraInicialMs: 5, log: () => {}, noRetenerProceso: false,
      alTerminarRonda: (r, e) => { rondas.push(r ? r.recuperados : `error ${e.message}`); if (rondas.length === 3) { h.detener(); listo(); } },
    });
  });
  assert.deepEqual(rondas, [1, 0, 0]);
  assert.equal(fila().recalculo_pendiente_desde, null);
  assert.equal(fila().km_completed, 17); // en este armado no se guardó ningún período: cuentan las 2 actividades
});

// ---------------------------------------------------------------------------
// Activación de la recuperación según la flag (sin timers reales)
// ---------------------------------------------------------------------------

/** Temporizadores falsos: guardan los callbacks para ejecutarlos a mano y registran unref(). */
const temporizadoresFalsos = () => {
  const pendientes = new Map();
  let n = 0;
  const t = {
    creados: 0,
    unrefs: 0,
    setTimeout: (fn, ms) => {
      const id = ++n;
      t.creados += 1;
      const h = { id, ms, unref: () => { t.unrefs += 1; return h; } };
      pendientes.set(id, { fn, h });
      return h;
    },
    clearTimeout: (h) => { if (h) pendientes.delete(h.id); },
    activos: () => pendientes.size,
    correrSiguiente: async () => {
      const [id, { fn }] = pendientes.entries().next().value;
      pendientes.delete(id);
      await fn();
    },
  };
  return t;
};

const contarLecturasMarca = (registro) =>
  registro.filter((op) => op.tipo === 'select' && op.tabla === 'user_challenges' && op.campos && op.campos.includes('recalculo_pendiente_desde')).length;

test('flag OFF y sin marcas: una sola consulta al arrancar, ningún timer', async () => {
  const { repo, m } = montar({ ucs: [uc({ pausado: false, pausado_at: null })] });
  const t = temporizadoresFalsos();
  const r = await iniciarRecuperacion({ crearRepo: () => repo, reanudarActivo: false, log: () => {}, temporizadores: t });
  assert.equal(r.modo, 'inactivo');
  assert.equal(t.creados, 0);
  assert.equal(contarLecturasMarca(m.registro), 1);
  r.detener();
});

test('flag OFF con marcas que quedaron: drena, borra las marcas y se detiene sola', async () => {
  const { repo, fila } = montar({ ucs: [uc({ km_base: 0, km_base_motivo: null, km_completed: 17 })] });
  await repo.cerrarPausaCAS({ id: 'uc1', pausadoAtLeido: '2026-09-05T08:00:00.123456', periodosNuevos: [{ desde: '2026-09-05T08:00:00.123456', hasta: MARCA }], marcaRecalculoIso: MARCA });
  const t = temporizadoresFalsos();
  let motivoFin = null;
  const r = await iniciarRecuperacion({ crearRepo: () => repo, reanudarActivo: false, log: () => {}, temporizadores: t, alDetenerse: (mo) => { motivoFin = mo; } });
  assert.equal(r.modo, 'drenaje');
  assert.equal(t.activos(), 1);
  await t.correrSiguiente(); // primera ronda
  assert.equal(fila().recalculo_pendiente_desde, null);
  assert.equal(fila().km_completed, 10);
  assert.equal(t.activos(), 0); // no reprograma: se detuvo
  assert.equal(motivoFin, 'sin_pendientes');
  // ya no hay recuperación registrada: otra llamada vuelve a verificar
  const otra = await iniciarRecuperacion({ crearRepo: () => repo, reanudarActivo: false, log: () => {}, temporizadores: t });
  assert.equal(otra.modo, 'inactivo');
});

test('flag OFF con una marca todavía reciente: sigue drenando hasta resolverla', async () => {
  const { repo, fila } = montar({ ucs: [uc({ km_base: 0, km_base_motivo: null, km_completed: 17 })] });
  const reciente = new Date(Date.now() - 30 * 1000).toISOString(); // 30 s: menor que la antigüedad mínima
  await repo.cerrarPausaCAS({ id: 'uc1', pausadoAtLeido: '2026-09-05T08:00:00.123456', periodosNuevos: [], marcaRecalculoIso: reciente });
  const t = temporizadoresFalsos();
  const r = await iniciarRecuperacion({ crearRepo: () => repo, reanudarActivo: false, log: () => {}, temporizadores: t });
  await t.correrSiguiente();
  assert.equal(fila().recalculo_pendiente_desde, reciente); // todavía no la tocó
  assert.equal(t.activos(), 1); // pero no abandonó: programó otra ronda
  r.detener();
  assert.equal(t.activos(), 0);
});

test('flag ON: modo activo, timers con unref y sin duplicados', async () => {
  const { repo } = montar({ ucs: [uc({ pausado: false, pausado_at: null })] });
  const t = temporizadoresFalsos();
  const a = await iniciarRecuperacion({ crearRepo: () => repo, reanudarActivo: true, log: () => {}, temporizadores: t });
  const b = await iniciarRecuperacion({ crearRepo: () => repo, reanudarActivo: true, log: () => {}, temporizadores: t });
  assert.equal(a.modo, 'activo');
  assert.equal(b, a); // misma instancia: no se creó un segundo bucle
  assert.equal(t.creados, 1);
  assert.equal(t.unrefs, 1); // no retiene el proceso
  await t.correrSiguiente(); // ronda sin marcas
  assert.equal(t.activos(), 1); // en modo activo sigue programando
  assert.equal(t.unrefs, 2);
  a.detener();
  assert.equal(t.activos(), 0);
});

test('flag OFF y la verificación inicial falla: lo loguea, sin timers y sin romper el arranque', async () => {
  const { repo } = montar({ fallar: (op) => op.tipo === 'select' && op.campos && op.campos.includes('recalculo_pendiente_desde') });
  const t = temporizadoresFalsos();
  const logs = [];
  const r = await iniciarRecuperacion({ crearRepo: () => repo, reanudarActivo: false, log: (l) => logs.push(l), temporizadores: t });
  assert.equal(r.modo, 'inactivo');
  assert.equal(t.creados, 0);
  assert.ok(logs.some((l) => l.resultado === 'verificacion_fallida'));
});

test('con timers reales y unref, la recuperación no deja handles abiertos al detenerla', async () => {
  const { repo } = montar({ ucs: [uc({ pausado: false, pausado_at: null })] });
  // Envoltorio sobre los timers REALES de Node: guarda los handles para inspeccionarlos.
  const creados = [];
  const limpiados = [];
  const temporizadores = {
    setTimeout: (fn, ms) => { const h = setTimeout(fn, ms); creados.push(h); return h; },
    clearTimeout: (h) => { limpiados.push(h); clearTimeout(h); },
  };
  const r = await iniciarRecuperacion({ crearRepo: () => repo, reanudarActivo: true, log: () => {}, temporizadores });
  assert.equal(r.modo, 'activo');
  assert.equal(creados.length, 1);
  // unref: el timer existe pero NO retiene el proceso (Railway/Node pueden terminar limpio).
  assert.equal(creados[0].hasRef(), false);
  r.detener();
  // detener() cancela el timer pendiente y libera el singleton.
  assert.deepEqual(limpiados, [creados[0]]);
  const otra = await iniciarRecuperacion({ crearRepo: () => repo, reanudarActivo: false, log: () => {} });
  assert.equal(otra.modo, 'inactivo');
});

test('falla al cerrar la pausa: no se recalcula y el error sube (la ruta responde 500 como hoy)', async () => {
  const { reanudar, fila } = montar({ fallar: (op) => op.tabla === 'user_challenges' && op.tipo === 'update' });
  await assert.rejects(reanudar());
  assert.equal(fila().pausado, true);
  assert.equal(fila().km_completed, 50);
});

test('terminal pausado: se cierra la pausa pero km y estado quedan congelados (D1)', async () => {
  const { reanudar, fila } = montar({ ucs: [uc({ status: 'completed', km_completed: 120, km_base: 0, km_base_motivo: null })] });
  await reanudar();
  assert.equal(fila().pausado, false);
  assert.equal(fila().status, 'completed');
  assert.equal(fila().km_completed, 120);
});

test('pausado sin pausado_at: cierra sin inventar un período inválido y lo registra', async () => {
  const { reanudar, fila, logs } = montar({ ucs: [uc({ pausado_at: null })] });
  const r = await reanudar();
  assert.equal(r.status, 200);
  assert.equal(fila().pausado, false);
  assert.deepEqual(fila().periodos_pausados, []);
  assert.ok(logs.some((l) => l.resultado === 'pausa_sin_pausado_at'));
});

test('no encontrado / duplicado / no pausado: mismas respuestas que el writer viejo', async () => {
  const noEsta = montar({ ucs: [] });
  assert.deepEqual(await noEsta.reanudar(), { status: 404, body: { error: 'Desafío no encontrado' } });
  const duplicado = montar({ ucs: [uc(), uc({ id: 'uc2' })] });
  assert.deepEqual(await duplicado.reanudar(), { status: 404, body: { error: 'Desafío no encontrado' } });
  const activo = montar({ ucs: [uc({ pausado: false, pausado_at: null })] });
  assert.deepEqual(await activo.reanudar(), { status: 200, body: { mensaje: 'No estaba pausado' } });
  const sinDatos = montar();
  assert.equal((await sinDatos.reanudar({ userId: undefined })).status, 404);
});

test('reanudar solo recalcula ESE desafío (los otros del usuario no se tocan)', async () => {
  const otro = uc({ id: 'uc2', challenge_id: 'c2', pausado: false, pausado_at: null, km_completed: 999, km_base: 0, km_base_motivo: null });
  const { reanudar, fila } = montar({ ucs: [uc(), otro] });
  await reanudar();
  assert.equal(fila('uc2').km_completed, 999);
});

test('si reanudar completa el desafío: evento PENDIENTE, sin ejecutar efectos', async () => {
  const { reanudar, fila, m } = montar({ ucs: [uc({ km_base: 95, km_completed: 95 })] });
  const r = await reanudar();
  assert.equal(fila().status, 'completed');
  assert.equal(fila().km_completed, 105);
  assert.equal(r.body.progreso.eventos_pendientes, 1);
  assert.equal(m.db.progreso_eventos.length, 1);
  assert.equal(m.db.progreso_eventos[0].estado, 'pendiente');
  assert.equal(m.db.progreso_eventos[0].tipo, 'completado');
});

// ---------------------------------------------------------------------------
// Integración: index.js real con la flag apagada y encendida
// ---------------------------------------------------------------------------

// Proceso hijo con index.js real: helper compartido (tests/helpers/backendHijo.js), portable a
// Windows, sin shell y con volcado por IPC.
const levantarBackend = async (flag) => {
  const b = await levantarBackendHijo({
    flag,
    tablas: { user_challenges: [uc()], challenges: [CH], activities: [ACT_ANTES, ACT_DURANTE], progreso_eventos: [], users: [] },
  });
  const reanudar = () => b.pedir({ metodo: 'POST', ruta: '/challenges/reanudar', body: { user_id: U, challenge_id: 'c1' } });
  return { reanudar, cerrar: b.cerrar, forzarCierre: b.forzarCierre };
};

test('integración flag OFF: corre el código viejo (y muestra su bug: pierde la base)', async () => {
  const b = await levantarBackend('');
  let r;
  try { r = await b.reanudar(); } catch (e) { await b.forzarCierre(); throw e; }
  const { db, registro, exitCode, signal } = await b.cerrar();
  assert.equal(exitCode, 0); // volcado limpio por IPC, sin matar el proceso
  assert.equal(signal, null);
  assert.equal(r.status, 200);
  assert.equal(r.body.mensaje, 'Desafío reanudado y km recalculados');
  assert.equal(r.body.progreso, undefined); // respuesta vieja
  const fila = db.user_challenges[0];
  assert.equal(fila.pausado, false);
  assert.equal(fila.km_completed, 10); // BUG viejo: 40 de base perdidos en km_completed
  assert.equal(fila.km_base, 40); // la base sigue guardada: el motor la puede restaurar
  assert.ok(!registro.some((op) => op.tabla === 'progreso_eventos'));
});

test('integración flag ON ("reanudar"): corre el motor y conserva la base', async () => {
  const b = await levantarBackend('reanudar');
  let r;
  try { r = await b.reanudar(); } catch (e) { await b.forzarCierre(); throw e; }
  const { db, registro, logs, exitCode, signal } = await b.cerrar();
  assert.equal(exitCode, 0);
  assert.equal(signal, null);
  assert.equal(r.status, 200);
  assert.equal(r.body.progreso.motor, true);
  const fila = db.user_challenges[0];
  assert.equal(fila.pausado, false);
  assert.equal(fila.periodos_pausados.length, 1);
  assert.equal(fila.km_completed, 50);
  assert.equal(fila.km_base, 40);
  assert.equal(fila.recalculo_pendiente_desde, null); // recálculo ok → marca borrada
  assert.deepEqual(escriturasConKmBase(registro), []);
  assert.match(logs, /"evento":"motor_progreso","writer":"reanudar"/);
});