import * as THREE from 'three';
import { decodificarModelo, crearMuestreadorModelo } from '../../services/mapa3d/modeloMeshyCore';

// Required only when Dubrovnik opens. Original GLB is retained separately;
// these buffers are its simplified, quantized mobile derivative.
export function construirModeloMeshy(datosOriginales, conv) {
  const meta = require('../../assets/mapa3d/dubrovnik/meta');
  const buffers = {
    position: require('../../assets/mapa3d/dubrovnik/position'),
    normal: require('../../assets/mapa3d/dubrovnik/normal'),
    uv: require('../../assets/mapa3d/dubrovnik/uv'),
    index: require('../../assets/mapa3d/dubrovnik/index'),
  };
  const attrs = decodificarModelo(meta, buffers);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(attrs.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(attrs.normal, 3, true));
  geometry.setAttribute('uv', new THREE.BufferAttribute(attrs.uv, 2, true));
  geometry.setIndex(new THREE.BufferAttribute(attrs.index, 1));
  geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  const material = new THREE.MeshStandardMaterial({ color: '#DDD5C5', roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const modelo = new THREE.Mesh(geometry, material);
  modelo.name = 'Dubrovnik Meshy mobile';
  const alturaModelo = crearMuestreadorModelo(meta);
  const campo = { ...datosOriginales.campo, muestrear: (x, z) => alturaModelo(conv.x(x), conv.z(z)) / conv.y(1) };
  const datos = { ...datosOriginales, campo, ruta: datosOriginales.ruta.map(p => ({ ...p, h: campo.muestrear(p.x, p.z) })) };
  const grupo = new THREE.Group();
  const mar = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshStandardMaterial({ color: '#147C91', roughness: 0.6, metalness: 0.05 }));
  mar.rotation.x = -Math.PI / 2; mar.position.y = -0.006;
  grupo.add(mar, modelo);
  return { grupo, datos, modeloMeshy: { material, meta, texturasListas: false }, limites: { minX: -90, maxX: 90, minZ: -90, maxZ: 90 } };
}

// Called from the native Canvas, after R3F installs its Expo TextureLoader.
// JPG assets avoid unsupported ArrayBuffer -> Blob embedded-GLB images.
export function cargarTexturasMeshy(mundo, invalidate) {
  const modelo = mundo.modeloMeshy;
  if (!modelo || modelo.texturasListas) return Promise.resolve();
  if (modelo.carga) return modelo.carga;
  const loader = new THREE.TextureLoader();
  const ids = [require('../../assets/mapa3d/dubrovnik/color.jpg'), require('../../assets/mapa3d/dubrovnik/normal.jpg'), require('../../assets/mapa3d/dubrovnik/surface.jpg')];
  const loaded = [];
  modelo.carga = Promise.allSettled(ids.map(id => new Promise((resolve, reject) => loader.load(id, t => {
    t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    loaded.push(t); resolve(t);
  }, undefined, reject)))).then(results => {
    const failure = results.find(r => r.status === 'rejected');
    if (failure) { loaded.forEach(t => t.dispose()); throw failure.reason; }
    const [color, normal, surface] = results.map(r => r.value);
    color.colorSpace = THREE.SRGBColorSpace;
    modelo.material.color.set('#FFFFFF');
    modelo.material.map = color; modelo.material.normalMap = normal;
    modelo.material.normalScale.set(0.65, 0.65);
    modelo.material.roughnessMap = surface; modelo.material.metalnessMap = surface; modelo.material.metalness = 1;
    modelo.material.needsUpdate = true; modelo.texturasListas = true;
    invalidate();
  }).catch(error => { modelo.carga = null; throw error; });
  return modelo.carga;
}
