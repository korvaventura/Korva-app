import * as THREE from 'three';
import { base64ABytes } from '../../services/mapa3d/horneadoCore';

// Carga perezosa: los buffers y las texturas se solicitan al construir Appia.
const modelos = {
  coliseo: () => [require('../../assets/mapa3d/appia-hitos/coliseo'), require('../../assets/mapa3d/appia-hitos/coliseo.jpg')],
  brindisi: () => [require('../../assets/mapa3d/appia-hitos/brindisi'), require('../../assets/mapa3d/appia-hitos/brindisi.jpg')],
  benevento: () => [require('../../assets/mapa3d/appia-hitos/benevento'), require('../../assets/mapa3d/appia-hitos/benevento.jpg')],
  oria: () => [require('../../assets/mapa3d/appia-hitos/oria'), require('../../assets/mapa3d/appia-hitos/oria.jpg')],
  gravina: () => [require('../../assets/mapa3d/appia-hitos/gravina'), require('../../assets/mapa3d/appia-hitos/gravina.jpg')],
  cecilia_metella: () => [require('../../assets/mapa3d/appia-hitos/cecilia_metella'), require('../../assets/mapa3d/appia-hitos/cecilia_metella.jpg')],
};

export function crearObjetosAppia(escena, posicionEnKm, alturaEnPosicion) {
  const grupo = new THREE.Group(), materiales = [], texturas = [], monumentos = {};
  grupo.name = 'Miniaturas de la Vía Appia';
  for (const ancla of escena.territorio.anclas) {
    if (!ancla.modelo || !modelos[ancla.modelo]) continue;
    const [datos, textura] = modelos[ancla.modelo]();
    const g = new THREE.BufferGeometry();
    for (const [nombre, n] of [['position', 3], ['normal', 3], ['uv', 2]]) {
      g.setAttribute(nombre, new THREE.BufferAttribute(new Float32Array(base64ABytes(datos[nombre]).buffer), n));
    }
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(base64ABytes(datos.index).buffer), 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({ color: '#DDD5C5', roughness: .95, metalness: 0, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, material);
    mesh.name = ancla.hito;
    mesh.userData = { modelo: ancla.modelo, source: datos.source, triangles: datos.triangles };
    mesh.scale.setScalar(ancla.escala);
    // Rumbo mundial: 0=norte (-Z). El frente real se eligió viendo los GLB.
    const frenteLocal = { '+Z': 180, '+X': 90, '-Z': 0, '-X': 270 }[ancla.ejeFrenteModelo];
    mesh.rotation.y = THREE.MathUtils.degToRad(frenteLocal - ancla.frenteGrados + (ancla.rotacionGrados || 0));
    mesh.position.copy(posicionEnKm(ancla.km));
    const a = posicionEnKm(Math.max(0, ancla.km - 1));
    const b = posicionEnKm(Math.min(escena.distanciaKm, ancla.km + 1));
    const dx = b.x - a.x, dz = b.z - a.z, norma = Math.hypot(dx, dz) || 1;
    const lateral = (ancla.desplazamientoLateralKm || 0) / escena.kmPorUnidad;
    mesh.position.x += -dz / norma * lateral;
    mesh.position.z += dx / norma * lateral;
    // El ancla de ruta incluye una elevación para la línea; la miniatura apoya
    // sobre el terreno real en su posición lateral, sin heredar esa elevación.
    mesh.position.y = alturaEnPosicion(mesh.position.x, mesh.position.z) + .001;
    mesh.updateMatrixWorld(true);
    grupo.add(mesh); materiales.push(material); texturas.push(textura);
    monumentos[ancla.hito] = mesh;
  }
  return { grupo, monumentos, modeloMeshy: { id: 'appia_hitos', materiales, texturas, texturasListas: false } };
}
