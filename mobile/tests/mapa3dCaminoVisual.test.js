const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const THREE = require('three');
const terreno = require('../services/mapa3d/terrenoCore');
const horneadoCore = require('../services/mapa3d/horneadoCore');
const escena = require('../services/mapa3d/escenas/caminoSantiago');
const horneado = require('../services/mapa3d/escenas/caminoSantiago.horneado');

function cargarMotor() {
  const source = fs.readFileSync(path.join(__dirname, '../components/mapa3d/construirMundo.js'), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
  return new Function('THREE', 'crearObjetosCamino', 'construirModeloMeshy', 'crearAmbienteIslandia', 'crearRutaVisualModelo', 'construirDatosDiorama', 'puntoEnKm', 'indiceCercano', 'deserializarDiorama', source + '\nreturn {construirMundo,configurarCamara,actualizarAtmosfera,posicionEnKm};')(
    THREE, () => null, () => null, () => null, () => null,
    terreno.construirDatosDiorama, terreno.puntoEnKm, terreno.indiceCercano, horneadoCore.deserializarDiorama);
}

test('Camino: la niebla de la vista general deja legible todo el recorrido', () => {
  const motor = cargarMotor();
  const mundo = motor.construirMundo(escena, horneado);
  for (const aspecto of [390 / 560, 430 / 650, 1]) {
    const camera = new THREE.PerspectiveCamera();
    motor.configurarCamara(camera, escena, aspecto, { zoom: 1, objetivo: escena.camara.objetivo }, mundo);
    motor.actualizarAtmosfera(mundo, escena, camera);
    for (let km = 0; km <= 775; km += 5) {
      const eye = motor.posicionEnKm(mundo.datos, mundo.conv, km, 0).applyMatrix4(camera.matrixWorldInverse);
      const factor = THREE.MathUtils.smoothstep(-eye.z, mundo.niebla.near, mundo.niebla.far);
      assert(factor < .15, `niebla excesiva en km ${km}, aspecto ${aspecto}: ${factor}`);
    }
  }
});

test('Camino: la fachada de la catedral apunta a la cámara de llegada', () => {
  const file = path.join(__dirname, '../components/mapa3d/objetosCamino.js');
  const realRequire = createRequire(file);
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
  const crear = new Function('THREE', 'base64ABytes', 'require', source + '\nreturn crearObjetosCamino;')(
    THREE, horneadoCore.base64ABytes, id => id.endsWith('.jpg') ? id : realRequire(id));
  const objetos = crear(() => new THREE.Vector3());
  const catedral = objetos.grupo.children[0];
  // El frente del modelo fuente se verificó visualmente en el eje +X.
  const frente = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), catedral.rotation.y);
  const az = THREE.MathUtils.degToRad(escena.camara.azimutGrados);
  const haciaCamara = new THREE.Vector3(Math.sin(az), 0, -Math.cos(az));
  assert(frente.dot(haciaCamara) > .99, 'la cámara debe mirar la fachada, no el ábside');
  objetos.grupo.children.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
});

test('Camino: General conserva el recorrido dentro del encuadre en pantallas verticales', () => {
  const motor = cargarMotor();
  const mundo = motor.construirMundo(escena, horneado);
  for (const aspecto of [390 / 625, 390 / 560, 430 / 650]) {
    const camera = new THREE.PerspectiveCamera();
    motor.configurarCamara(camera, escena, aspecto, { zoom: escena.camara.zoomGeneral, objetivo: escena.camara.objetivoGeneral }, mundo);
    for (let km = 0; km <= 775; km += 5) {
      const p = motor.posicionEnKm(mundo.datos, mundo.conv, km, 0).add(new THREE.Vector3(0, escena.alturaPinUnidades, 0)).project(camera);
      assert(Math.abs(p.x) < .9 && p.y > -.85 && p.y < .65, `encuadre de km ${km}, aspecto ${aspecto}`);
    }
  }
});
