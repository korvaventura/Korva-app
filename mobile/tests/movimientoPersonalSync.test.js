const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function cargarHook(nombre, contexto) {
  const fuente = fs.readFileSync(require.resolve(`../services/${nombre}.js`), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace('export default function ', 'function ');
  const sandbox = { ...contexto };
  vm.runInNewContext(fuente, sandbox);
  return sandbox;
}

function prepararSync(resultado) {
  let limpiar, iniciar;
  const eventos = [];
  const hook = cargarHook('health/useHealthAutoSync', {
    useEffect: (fn) => { limpiar = fn(); },
    Platform: { OS: 'ios' },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    InteractionManager: { runAfterInteractions: (fn) => fn() },
    DeviceEventEmitter: { emit: (...args) => eventos.push(args) },
    ejecutarSyncAutomatico: () => resultado,
    setTimeout: (fn) => { iniciar = fn; return 1; }, clearTimeout() {},
  });
  hook.useHealthAutoSync('u1');
  return { eventos, iniciar, limpiar };
}

test('Salud: solo una sincronización exitosa solicita refrescar el resumen de su cuenta', async () => {
  for (const motivo of ['ok', 'reciente', 'sin_datos', 'sin_permiso', 'error_backend']) {
    const h = prepararSync(Promise.resolve({ motivo }));
    h.iniciar();
    await Promise.resolve();
    assert.equal(h.eventos.length, motivo === 'ok' ? 1 : 0);
    if (motivo === 'ok') {
      assert.equal(h.eventos[0][0], 'korva:movimiento-actualizado');
      assert.equal(h.eventos[0][1].userId, 'u1');
    }
    h.limpiar();
  }
});

test('Salud: un sync de una sesión desmontada no dispara actualizaciones', async () => {
  let resolver;
  const h = prepararSync(new Promise((resolve) => { resolver = resolve; }));
  h.iniciar(); h.limpiar(); resolver({ motivo: 'ok' });
  await Promise.resolve();
  assert.equal(h.eventos.length, 0);
});

test('Resumen: refresca tras Salud solo en Inicio activo y para la misma cuenta; elimina suscripciones al salir', () => {
  let limpiar, recibir, lecturas = 0, eliminadas = 0, canceladas = 0;
  const appState = { currentState: 'active', addEventListener: () => ({ remove() { eliminadas++; } }) };
  const h = cargarHook('useMovimientoPersonal', {
    useState: () => [{ status: 'esperando' }, () => {}], useRef: () => ({ current: null }),
    useCallback: (fn) => fn, useFocusEffect: (fn) => { limpiar = fn(); },
    AppState: appState, Intl, leerMovimientoPersonal() {},
    DeviceEventEmitter: { addListener: (evento, fn) => {
      assert.equal(evento, 'korva:movimiento-actualizado'); recibir = fn;
      return { remove() { eliminadas++; } };
    } },
    require: () => ({ crearCargaMovimientoPersonal: () => ({
      actualizar: () => { lecturas++; }, cancelar: () => { canceladas++; },
    }) }),
  });
  h.useMovimientoPersonal('u1');
  assert.equal(lecturas, 1);
  recibir({ userId: 'u2' }); recibir(null);
  assert.equal(lecturas, 1);
  recibir({ userId: 'u1' });
  assert.equal(lecturas, 2);
  appState.currentState = 'background'; recibir({ userId: 'u1' });
  assert.equal(lecturas, 2);
  limpiar();
  assert.equal(eliminadas, 2); assert.equal(canceladas, 1);
});
