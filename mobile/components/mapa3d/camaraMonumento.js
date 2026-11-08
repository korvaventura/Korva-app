import * as THREE from 'three';
import { controlAncla } from '../../services/mapa3d/anclasCore';
import { resolverGeneralCamino } from '../../services/mapa3d/vistaCaminoCore';
import { configurarCamara } from './construirMundo';

// Se calcula al inspeccionar un modelo o llegar a él, nunca por cada cuadro.
export function controlMonumento(mesh, ancla, escena, mundo, ancho, alto) {
  const inicial = controlAncla({ ...ancla, desplazamientoLateralKm: 0 }, mesh.position, escena.camara);
  if (!ancho || !alto) return inicial;
  mesh.updateWorldMatrix(true, false);
  // Proyecta la silueta real: una caja mundial agranda demasiado edificios
  // diagonales. El bucle usa escalares para no crear miles de Vector3 por iteración.
  const posiciones = mesh.geometry.attributes.position.array;
  const camera = new THREE.PerspectiveCamera();
  const matriz = new THREE.Matrix4();
  return resolverGeneralCamino(control => {
    configurarCamara(camera, escena, ancho / alto, control, mundo);
    matriz.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
    const m = matriz.elements;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < posiciones.length; i += 3) {
      const x = posiciones[i], y = posiciones[i + 1], z = posiciones[i + 2];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      const px = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
      const py = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
    return [{ x: minX, y: minY }, { x: maxX, y: maxY }];
  }, inicial, ancho, alto, {
    top: 168,
    bottom: 66,
    zoomMin: escena.camara.zoomMin,
    zoomMax: .2,
    margenZoom: 1.06,
  });
}
