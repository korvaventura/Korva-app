const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { duracionDemo, estadoDemo, controlDemo } = require('../services/mapa3d/demoCore');
const { normalizarCheckpoints } = require('../services/mapa3d/journeyCore');

test('demo: duration bounded; smooth progress reaches full route regardless of real user km', () => {
  assert.equal(duracionDemo(), 12);
  assert.equal(duracionDemo(''), 12);
  assert.equal(duracionDemo(-2), 12);
  assert.equal(duracionDemo(999), 120);
  assert.equal(duracionDemo(.1), 1);
  for (const total of [103, 68, 57, 19.4]) {
    assert.equal(estadoDemo(0, 12, total).km, 0);
    assert.equal(estadoDemo(6, 12, total).km, total / 2);
    assert.equal(estadoDemo(12, 12, total).km, total);
    assert.equal(estadoDemo(13.99, 12, total).terminado, false);
    assert.equal(estadoDemo(14, 12, total).terminado, true);
    assert.equal(estadoDemo(.01, 12, total).km < estadoDemo(6.01, 12, total).km - total / 2, true);
  }
});

test('demo: common camera stays finite and within zoom limits across all four scenes', () => {
  for (const file of ['finDelMundo', 'monteFuji', 'sanAndres', 'dubrovnik']) {
    const escena = require(`../services/mapa3d/escenas/${file}`);
    const camara = escena.camara;
    let control;
    for (let n = 0; n <= 840; n++) {
      const estado = estadoDemo(n / 60, 12, escena.distanciaKm);
      control = controlDemo({ estado, punto: [estado.km / 100, 1, .5], anterior: [0, 1, 0], siguiente: [.01, 1, -1], camara, control, dt: 1 / 60 });
      assert(Object.values(control).flat().every(Number.isFinite));
      assert(control.zoom >= (camara.zoomMin ?? .5));
      assert(control.zoom <= (camara.zoomMax ?? 1.7));
    }
  }
});

test('GL demo: pauses in background, completes at 14 s, then freezes; no native overlay needed', () => {
  const source = fs.readFileSync(require.resolve('../components/mapa3d/DemoRecorrido'), 'utf8');
  const start = source.indexOf('  const marcador');
  const body = source.slice(start, source.indexOf('  return (', start));
  let frame;
  let frames = 0;
  const publications = [];
  const punto = km => ({ x: km, y: 0, z: 0, toArray() { return [this.x, this.y, this.z]; } });
  const demoRef = { current: { activo: true, duracion: 12, tiempo: 0, checkpoints: [{ id: 'a', km: 0 }, { id: 'b', km: 10 }] } };
  const progresoRef = { current: { km: 4, animando: false } };
  const controlRef = { current: null };
  const context = vm.createContext({ useRef: current => ({ current }), useMemo: f => f(), useFrame: f => { frame = f; }, normalizarCheckpoints,
    demoRef, progresoRef, controlRef, mundo: { datos: {}, conv: {} }, escena: { distanciaKm: 10, camara: { distancia: 8, objetivo: [0, 0, 0], elevacionGrados: 33, azimutGrados: 0 } },
    posicionEnKm: (d, c, km) => punto(km), estadoDemo, controlDemo,
    configurarCamara: () => { frames++; }, actualizarAtmosfera: () => {}, onAvance: e => publications.push(e),
  });
  vm.runInContext(body, context);
  const render = () => frame({ camera: {}, size: { width: 360, height: 800 } }, 1 / 60);
  for (let i = 0; i < 120; i++) render();
  const pausedKm = progresoRef.current.km;
  demoRef.current.pausado = true;
  for (let i = 0; i < 600; i++) render();
  assert.equal(progresoRef.current.km, pausedKm);
  demoRef.current.pausado = false;
  for (let i = 0; i < 750; i++) render();
  assert.equal(progresoRef.current.km, 10);
  assert.equal(publications.at(-1).terminado, true);
  const stopped = frames;
  for (let i = 0; i < 120; i++) render();
  assert.equal(frames, stopped);
  assert(publications.length < 150, 'React updates stay below roughly 10 Hz');
  assert(frames > 800, 'camera is driven by GL frames, not the ordinary 30 Hz scheduler');
});

test('demo exit restores latest real progress and pre-demo camera without calling checkpoint selection', () => {
  const source = fs.readFileSync(require.resolve('../components/MapaRecorrido3D'), 'utf8');
  const start = source.indexOf('  const salirDemo = useCallback(() => {') + '  const salirDemo = useCallback(() => {'.length;
  const end = source.indexOf('  }, [kmProgresoReal, aplicarCamara]);', start);
  const oldControl = { azimut: .4, zoom: 1.1, objetivo: [2, 1, 0] };
  const demoRef = { current: { activo: true, control: oldControl, detalle: false, llegada: false } };
  const progresoRef = { current: { km: 103, animando: true } };
  const controlRef = { current: {} };
  let kmPlayback = 103;
  const noop = () => {};
  const context = vm.createContext({ demoRef, progresoRef, controlRef, kmProgresoReal: 7.5, ultimaPublicacionRef: { current: 1 }, aplicarCamara: noop,
    setSesionDemo: noop, setDemoTerminado: noop, setDemoEnMeta: noop, setKmPlayback: n => { kmPlayback = n; }, setReproduciendo: noop, setDetalleActivo: noop, setLlegadaFinal: noop });
  vm.runInContext(`(() => {${source.slice(start, end)}})()`, context);
  assert.equal(demoRef.current, null);
  assert.equal(progresoRef.current.km, 7.5);
  assert.equal(progresoRef.current.animando, false);
  assert.equal(kmPlayback, null);
  assert.equal(controlRef.current, oldControl);
});

test('demo refuses to start for a non-admin even when called directly', () => {
  const source = fs.readFileSync(require.resolve('../components/MapaRecorrido3D'), 'utf8');
  const start = source.indexOf('  const iniciarDemo = () => {') + '  const iniciarDemo = () => {'.length;
  const end = source.indexOf('\n  };', start);
  // Any attempt to proceed beyond authorization references dependencies absent here.
  const context = vm.createContext({ esAdmin: false });
  assert.doesNotThrow(() => vm.runInContext(`(() => {${source.slice(start, end)}})()`, context));
});
