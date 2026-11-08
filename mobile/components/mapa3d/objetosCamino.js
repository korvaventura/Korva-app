import * as THREE from 'three';
import { base64ABytes } from '../../services/mapa3d/horneadoCore';
// Miniaturas simbólicas; no modifican el trazado ni los kilómetros.
export function crearObjetosCamino(posicionEnKm) {
  const grupo = new THREE.Group(), materiales = [], texturas = [];
  const modelos = [
    [require('../../assets/mapa3d/camino-hitos/catedral'),require('../../assets/mapa3d/camino-hitos/catedral.jpg'),775,.18,-.045,Math.PI],
    [require('../../assets/mapa3d/camino-hitos/puente'),require('../../assets/mapa3d/camino-hitos/puente.jpg'),69,.20,.025,.4],
    [require('../../assets/mapa3d/camino-hitos/mojon'),require('../../assets/mapa3d/camino-hitos/mojon.jpg'),0,.09,-.025,Math.PI],
  ];
  for (const [datos,textura,km,escala,dx,giro] of modelos) {
    const g=new THREE.BufferGeometry();
    for(const [nombre,n] of [['position',3],['normal',3],['uv',2]])g.setAttribute(nombre,new THREE.BufferAttribute(new Float32Array(base64ABytes(datos[nombre]).buffer),n));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(base64ABytes(datos.index).buffer),1));g.computeBoundingSphere();
    const material=new THREE.MeshStandardMaterial({color:'#DDD5C5',roughness:.95,metalness:0,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(g,material);mesh.name=datos.source;mesh.scale.setScalar(escala);mesh.rotation.y=giro;
    mesh.position.copy(posicionEnKm(km));mesh.position.x+=dx;mesh.position.y+=.004;
    grupo.add(mesh);materiales.push(material);texturas.push(textura);
  }
  return {grupo,modeloMeshy:{id:'camino_hitos',materiales,texturas,texturasListas:false}};
}
