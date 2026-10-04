const test = require('node:test');
const assert = require('node:assert/strict');
const { crearClienteMovimientoPersonal, crearCargaMovimientoPersonal } = require('../services/movimientoPersonalCore');

const session = { access_token: 'token-test', user: { id: 'u1' } };
const resumen = () => ({ regla_version: 'movimiento_personal_v1_2026-10-04', timezone: 'Europe/Zagreb',
  historial: { km_actividades: 5 }, hoy: { fecha: '2026-10-04', km_movimiento: 8, pasos: 10000 },
  semana: { km_movimiento: 8, dias_con_datos_pasos: 1,
    dias: [{ fecha: '2026-10-04', km_movimiento: 8, pasos: 10000 }] } });
const opciones = { userId: 'u1', timezone: 'Europe/Zagreb' };
const cliente = (extra = {}) => crearClienteMovimientoPersonal({
  getSession: async () => ({ data: { session }, error: null }),
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => resumen() }),
  baseUrl: 'https://backend.invalid', ...extra,
});
const diferido = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('movimiento mobile: lee con token y zona del teléfono, sin user_id elegido por el cliente', async () => {
  let pedido;
  const r = await cliente({ fetchImpl: async (url, init) => {
    pedido = { url, init }; return { ok: true, status: 200, json: async () => resumen() };
  } })(opciones);
  assert.equal(pedido.url, 'https://backend.invalid/movimiento-personal?timezone=Europe%2FZagreb');
  assert.equal(pedido.init.headers.Authorization, 'Bearer token-test');
  assert.ok(!pedido.url.includes('u1'));
  assert.equal(r.hoy.km_movimiento, 8);
});

test('movimiento mobile: ausencia de sesión y cambio de cuenta impiden la petición', async () => {
  let pedidos = 0;
  for (const s of [null, { ...session, user: { id: 'u2' } }, { user: { id: 'u1' } }]) {
    await assert.rejects(cliente({ getSession: async () => ({ data: { session: s } }),
      fetchImpl: async () => { pedidos++; } })(opciones), { codigo: 'sesion' });
  }
  assert.equal(pedidos, 0);
});

test('movimiento mobile: 404 anterior al deploy no se convierte en cero ni intenta parsear HTML', async () => {
  await assert.rejects(cliente({ fetchImpl: async () => ({ status: 404, ok: false,
    json: () => { throw new Error('No debe parsear'); } }) })(opciones), { codigo: 'no_disponible' });
});

test('movimiento mobile: 401 se distingue de un fallo temporal del servidor', async () => {
  for (const [status, codigo] of [[401, 'sesion'], [500, 'error'], [503, 'error']]) {
    await assert.rejects(cliente({ fetchImpl: async () => ({ status, ok: false }) })(opciones), { codigo });
  }
});

test('movimiento mobile: respuesta 200 inválida no se muestra como movimiento cero', async () => {
  for (const payload of [[], { error: 'Error cargando datos' }, { ...resumen(), hoy: { ...resumen().hoy, km_movimiento: '8' } }]) {
    await assert.rejects(cliente({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload }) })(opciones), { codigo: 'respuesta_invalida' });
  }
});

test('movimiento mobile: rechaza resumen de otra zona y números imposibles', async () => {
  const a = resumen(); a.timezone = 'UTC';
  const b = resumen(); b.hoy.pasos = -1;
  const c = resumen(); c.semana.km_movimiento = Infinity;
  const d = resumen(); d.semana.dias_con_datos_pasos = 7;
  for (const payload of [a, b, c, d]) {
    await assert.rejects(cliente({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload }) })(opciones), { codigo: 'respuesta_invalida' });
  }
});

test('movimiento mobile: cero medido y pasos ausentes conservan su diferencia', async () => {
  for (const pasos of [0, null]) {
    const payload = resumen(); payload.hoy.pasos = pasos; payload.hoy.km_movimiento = 0;
    const r = await cliente({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload }) })(opciones);
    assert.equal(r.hoy.pasos, pasos);
    assert.equal(r.hoy.km_movimiento, 0);
  }
});

test('movimiento mobile: timeout aborta la petición y no deja una carga interminable', async () => {
  let abortado = false;
  await assert.rejects(cliente({ timeoutMs: 10, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { abortado = true; reject(new Error('aborted')); });
  }) })(opciones), { codigo: 'timeout' });
  assert.equal(abortado, true);
});

test('movimiento mobile: cancelación mientras se obtiene sesión impide el fetch', async () => {
  const d = diferido(); const controller = new AbortController(); let fetches = 0;
  const p = cliente({ getSession: () => d.promise, fetchImpl: async () => { fetches++; } })({ ...opciones, signal: controller.signal });
  controller.abort(); d.resolve({ data: { session } });
  await assert.rejects(p, { codigo: 'cancelado' });
  assert.equal(fetches, 0);
});

test('movimiento mobile: error de red no emite métricas disponibles', async () => {
  const estados = [];
  const carga = crearCargaMovimientoPersonal({ leer: cliente({ fetchImpl: async () => { throw new Error('offline'); } }), emitir: (e) => estados.push(e) });
  await carga.actualizar(opciones);
  assert.deepEqual(estados.map((e) => e.status), ['cargando', 'error']);
  assert.ok(estados.every((e) => e.datos === null));
});

test('movimiento mobile: una respuesta vieja no pisa una actualización nueva', async () => {
  const primero = diferido(), segundo = diferido(); const estados = []; let n = 0;
  const carga = crearCargaMovimientoPersonal({ leer: () => ++n === 1 ? primero.promise : segundo.promise,
    emitir: (e) => estados.push(e) });
  const p1 = carga.actualizar(opciones); const p2 = carga.actualizar(opciones);
  const nuevo = resumen(); nuevo.hoy.km_movimiento = 12;
  segundo.resolve(nuevo); await p2;
  primero.resolve(resumen()); await p1;
  assert.deepEqual(estados.map((e) => e.status), ['cargando', 'cargando', 'disponible']);
  assert.equal(estados.at(-1).datos.hoy.km_movimiento, 12);
});

test('movimiento mobile: blur o unmount cancela y descarta la respuesta pendiente', async () => {
  const d = diferido(); const estados = []; let signal;
  const carga = crearCargaMovimientoPersonal({ leer: (o) => { signal = o.signal; return d.promise; }, emitir: (e) => estados.push(e) });
  const p = carga.actualizar(opciones); carga.cancelar(); d.resolve(resumen()); await p;
  assert.equal(signal.aborted, true);
  assert.deepEqual(estados.map((e) => e.status), ['cargando']);
});

test('movimiento mobile: el cambio de usuario descarta todos los datos anteriores', async () => {
  const d = diferido(); const estados = [];
  const carga = crearCargaMovimientoPersonal({ leer: () => d.promise, emitir: (e) => estados.push(e) });
  const p = carga.actualizar(opciones);
  await carga.actualizar({ ...opciones, userId: null });
  d.resolve(resumen()); await p;
  assert.deepEqual(estados.map((e) => e.status), ['cargando', 'esperando']);
  assert.equal(estados.at(-1).userId, null);
  assert.equal(estados.at(-1).datos, null);
});

test('movimiento mobile: próxima disponibilidad y sesión inválida conservan estados separados', async () => {
  for (const codigo of ['no_disponible', 'sesion']) {
    const estados = [];
    const carga = crearCargaMovimientoPersonal({ leer: async () => { throw Object.assign(new Error(codigo), { codigo }); }, emitir: (e) => estados.push(e) });
    await carga.actualizar(opciones);
    assert.equal(estados.at(-1).status, codigo);
    assert.equal(estados.at(-1).datos, null);
  }
});
