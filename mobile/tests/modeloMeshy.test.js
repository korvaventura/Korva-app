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
