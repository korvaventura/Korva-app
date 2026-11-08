const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');
const escena = require('../services/mapa3d/escenas/viaAppia');
const horneado = require('../services/mapa3d/escenas/viaAppia.horneado');
const motor = require('./helpers/motorAppia');
const mundo = motor.construirMundo(escena, horneado);
const ids = ['brindisi', 'oria', 'gravina', 'benevento', 'cecilia_metella', 'roma'];
const visores = [[320, 480], [360, 640], [375, 667], [390, 560], [390, 640], [390, 844], [393, 852], [414, 896], [430, 932], [480, 320], [640, 360], [667, 375], [844, 390], [932, 430]];
const corners = box => [box.min.x, box.max.x].flatMap(x => [box.min.y, box.max.y].flatMap(y => [box.min.z, box.max.z].map(z => new THREE.Vector3(x, y, z))));

test('seis miniaturas reales: buffers válidos, presupuesto y una textura por material', () => {
  assert.deepEqual(Object.keys(mundo.monumentos), ids);
  let triangles = 0, bytes = 0;
  for (const mesh of Object.values(mundo.monumentos)) {
    const g = mesh.geometry, vertices = g.attributes.position.count;
    assert.equal(g.attributes.normal.count, vertices);
    assert.equal(g.attributes.uv.count, vertices);
    for (const k of ['position', 'normal', 'uv']) {
      for (const v of g.attributes[k].array) assert.ok(Number.isFinite(v), `${mesh.name}.${k}`);
      bytes += g.attributes[k].array.byteLength;
    }
    for (const i of g.index.array) assert.ok(i >= 0 && i < vertices);
    bytes += g.index.array.byteLength;
    triangles += g.index.count / 3;
    assert.equal(mesh.userData.triangles, g.index.count / 3);
    assert.equal(mesh.material.metalness, 0);
  }
  assert.equal(triangles, 48675);
  assert.ok(bytes < 2300000, `geometría ${bytes} bytes`);
  assert.equal(mundo.modeloMeshy.texturas.length, 6);
  assert.equal(mundo.modeloMeshy.materiales.length, 6);
  for (const jpg of mundo.modeloMeshy.texturas) assert.ok(fs.statSync(jpg).size < 350000);
});

test('apoyo en terreno y separación entre miniaturas cercanas a Roma; ruta intacta', () => {
  for (const mesh of Object.values(mundo.monumentos)) {
    const altura = mundo.conv.y(mundo.datos.campo.muestrear(mundo.conv.aKm(mesh.position.x), mundo.conv.aKm(mesh.position.z)));
    assert.ok(Math.abs(mesh.position.y - altura - .001) < 1e-8);
  }
  const a = new THREE.Box3().setFromObject(mundo.monumentos.roma, true);
  const b = new THREE.Box3().setFromObject(mundo.monumentos.cecilia_metella, true);
  assert.equal(a.intersectsBox(b), false, 'mausoleo y Coliseo no se atraviesan');
  assert.equal(mundo.datos.ruta[0].km, 0);
  assert.equal(mundo.datos.ruta.at(-1).km, 611);
  assert.equal(escena.territorio.llegada, 'roma');
});

test('cámaras: monumentos completos debajo del HUD en 14 visores, con frente visible', () => {
  for (const id of ids) for (const [w, h] of visores) {
    const mesh = mundo.monumentos[id], ancla = escena.territorio.anclas.find(a => a.hito === id);
    const c = motor.controlMonumento(mesh, ancla, escena, mundo, w, h);
    const camera = new THREE.PerspectiveCamera();
    motor.configurarCamara(camera, escena, w / h, c, mundo);
    const box = new THREE.Box3().setFromObject(mesh);
    const posiciones = mesh.geometry.attributes.position;
    const pp = Array.from({length: posiciones.count}, (_, i) => new THREE.Vector3().fromBufferAttribute(posiciones, i).applyMatrix4(mesh.matrixWorld).project(camera)).map(p => ({ x: (p.x + 1) * w / 2, y: (1 - p.y) * h / 2, z: p.z }));
    for (const p of pp) assert.ok(p.z > -1 && p.z < 1 && p.x >= 18 && p.x <= w - 18 && p.y >= 165 && p.y <= h - 60,
      `${id} cortado en ${w}x${h}: ${JSON.stringify(p)}`);
    const ancho = Math.max(...pp.map(p => p.x)) - Math.min(...pp.map(p => p.x));
    const alto = Math.max(...pp.map(p => p.y)) - Math.min(...pp.map(p => p.y));
    assert.ok(ancho > w * .25 || alto > (h - 234) * .35, `${id} demasiado pequeño en ${w}x${h}`);
    const frente = new THREE.Vector3(...(ancla.ejeFrenteModelo === '+X' ? [1, 0, 0] : [0, 0, 1])).applyQuaternion(mesh.quaternion);
    const haciaCamara = camera.position.clone().sub(box.getCenter(new THREE.Vector3())).normalize();
    assert.ok(frente.dot(haciaCamara) > .35, `${id}: cámara detrás del monumento`);
  }
});

test('Coliseo como llegada: cámara usa el modelo real y conserva el ángulo frontal', () => {
  const ancla = escena.territorio.anclas.find(a => a.hito === 'roma');
  assert.equal(ancla.modelo, 'coliseo');
  const c = motor.controlMonumento(mundo.monumentos.roma, ancla, escena, mundo, 390, 640);
  assert.ok(c.zoom >= escena.camara.zoomMin && c.zoom < .1);
  assert.equal(Math.round((c.azimut * 180 / Math.PI + escena.camara.azimutGrados + 360) % 360), 225);
});

test('detalle y llegada: destaca una miniatura; General recupera las seis sin moverlas', () => {
  const { mostrarMonumentos } = require('../services/mapa3d/visibilidadMonumentosCore');
  const posiciones = Object.values(mundo.monumentos).map(m => m.position.toArray());
  mostrarMonumentos(mundo.monumentos, 'roma');
  assert.deepEqual(Object.entries(mundo.monumentos).filter(([, m]) => m.visible).map(([id]) => id), ['roma']);
  mostrarMonumentos(mundo.monumentos, 'cecilia_metella');
  assert.deepEqual(Object.entries(mundo.monumentos).filter(([, m]) => m.visible).map(([id]) => id), ['cecilia_metella']);
  mostrarMonumentos(mundo.monumentos);
  assert.ok(Object.values(mundo.monumentos).every(m => m.visible));
  assert.deepEqual(Object.values(mundo.monumentos).map(m => m.position.toArray()), posiciones);
});
