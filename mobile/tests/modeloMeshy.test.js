const test = require('node:test');
const assert = require('node:assert/strict');
const { decodificarModelo, crearMuestreadorModelo } = require('../services/mapa3d/modeloMeshyCore');
const meta = require('../assets/mapa3d/dubrovnik/meta');
const buffers = Object.fromEntries(['position', 'normal', 'uv', 'index'].map(k => [k, require('../assets/mapa3d/dubrovnik/' + k)]));

test('Dubrovnik móvil: malla íntegra, dentro del presupuesto y con normales válidas', () => {
  const mesh = decodificarModelo(meta, buffers);
  assert(meta.triangles < 200000);
  assert.equal(mesh.index.length, meta.triangles * 3);
  for (let v = 0; v < meta.vertices; v += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const p = mesh.position[v * 3 + axis];
      assert(Number.isFinite(p));
      assert(p >= meta.min[axis] - 1e-6 && p <= meta.min[axis] + meta.span[axis] + 1e-6);
    }
    const normalLength = Math.hypot(...mesh.normal.subarray(v * 3, v * 3 + 3)) / 127;
    assert(normalLength > 0.98 && normalLength < 1.02);
  }
  assert(mesh.index.every(i => i < meta.vertices));
  assert.throws(() => decodificarModelo(meta, { ...buffers, index: '' }), /incompletos/);
});

test('Dubrovnik móvil: superficie finita para ruta y cámara, mar fuera del modelo', () => {
  const sample = crearMuestreadorModelo(meta);
  const [min, max] = meta.heightBounds;
  assert.equal(sample(min[0] - 1, min[1] - 1), 0);
  assert.equal(sample(max[0] + 1, max[1] + 1), 0);
  let highest = 0;
  for (let z = 0; z <= 40; z += 1) for (let x = 0; x <= 40; x += 1) {
    const h = sample(min[0] + (max[0] - min[0]) * x / 40, min[1] + (max[1] - min[1]) * z / 40);
    assert(Number.isFinite(h) && h >= 0 && h < 1);
    highest = Math.max(highest, h);
  }
  assert(highest > 0.1);
});

test('ruta visual: conserva anclas de kilómetros y elimina picos verticales sin enterrar la línea', () => {
  const { crearRutaVisualModelo } = require('../services/mapa3d/modeloMeshyCore');
  const conv = { aKm: x => x * 0.3, y: h => h * 0.004 };
  const sample = (x) => x > 0.12 && x < 0.15 ? 60 : 5;
  const route = crearRutaVisualModelo([[0,0,0],[0.5,0],[1,0,4],[1,1,19.4]], sample, conv);
  assert.equal(route[0].km, 0); assert.equal(route.at(-1).km, 19.4);
  const anchor = route.find(p => p.km === 4);
  assert.equal(anchor.x, 0.3); assert.equal(anchor.z, 0);
  for (let i = 0; i < route.length; i += 1) {
    const p = route[i]; assert(p.h >= sample(p.x) - 1e-8);
    if (!i) continue;
    const a = route[i - 1]; assert(p.km > a.km);
    const d = Math.hypot(p.x - a.x, p.z - a.z) / 0.3;
    assert(Math.abs(conv.y(p.h - a.h)) <= 0.35 * d + 1e-8);
  }
});

 test('entorno Dubrovnik: presupuesto móvil, geometría íntegra y plataforma libre para ciudad y puerto', () => {
  const meta = require('../assets/mapa3d/dubrovnik-entorno/meta');
  const buffers = Object.fromEntries(['position','normal','uv','index'].map(k => [k, require('../assets/mapa3d/dubrovnik-entorno/' + k)]));
  const mesh = decodificarModelo(meta, buffers);
  assert(meta.triangles < 150000);
  assert(mesh.index.every(i => i < meta.vertices));
  assert(mesh.position.every(Number.isFinite));
  let reserved = 0, mountain = 0;
  for (let i = 0; i < mesh.position.length; i += 3) {
    const [x,y,z] = mesh.position.subarray(i,i+3);
    if (x > -.95 && x < 2.05 && z > -1.14 && z < .37) { assert(y < -.027); reserved++; }
    mountain = Math.max(mountain,y);
  }
  assert(reserved > 100); assert(mountain > .5);
  const sample = crearMuestreadorModelo(meta);
  assert.equal(sample(.5,-.4),0);
 });
