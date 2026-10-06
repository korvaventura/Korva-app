import * as THREE from 'three';
import { decodificarModelo, crearMuestreadorModelo } from '../../services/mapa3d/modeloMeshyCore';

// Required only when Dubrovnik opens. Original GLB is retained separately;
// these buffers are its simplified, quantized mobile derivative.
export function construirModeloMeshy(datosOriginales, conv) {
  const meta = require('../../assets/mapa3d/dubrovnik-completo/meta');
  const buffers = {
    position: require('../../assets/mapa3d/dubrovnik-completo/position'),
    normal: require('../../assets/mapa3d/dubrovnik-completo/normal'),
    uv: require('../../assets/mapa3d/dubrovnik-completo/uv'),
    index: require('../../assets/mapa3d/dubrovnik-completo/index'),
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
  // Graduated grid: detail near the coast, sparse geometry toward the horizon.
  const aguaGeometry = new THREE.PlaneGeometry(180, 180, 96, 96);
  const verticesAgua = aguaGeometry.attributes.position;
  const coloresAgua = new Float32Array(verticesAgua.count * 3);
  const profundo = new THREE.Color('#073A62');
  const costa = new THREE.Color('#209CAB');
  const [min, max] = meta.heightBounds;
  for (let i = 0; i < verticesAgua.count; i += 1) {
    const u = verticesAgua.getX(i) / 90; const v = verticesAgua.getY(i) / 90;
    const x = Math.sign(u) * Math.abs(u) ** 3 * 90;
    const z = -Math.sign(v) * Math.abs(v) ** 3 * 90;
    verticesAgua.setXY(i, x, -z);
    const distancia = Math.hypot(Math.max(min[0] - x, 0, x - max[0]), Math.max(min[1] - z, 0, z - max[1]));
    const mezcla = Math.exp(-distancia * 1.8) * (0.78 + 0.08 * Math.sin(x * 2.1 + z * 1.7));
    const color = profundo.clone().lerp(costa, mezcla);
    color.toArray(coloresAgua, i * 3);
  }
  aguaGeometry.setAttribute('color', new THREE.BufferAttribute(coloresAgua, 3));
  aguaGeometry.computeBoundingSphere();
  const mar = new THREE.Mesh(aguaGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.08 }));
  mar.rotation.x = -Math.PI / 2; mar.position.y = 0.012;
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
  const ids = [require('../../assets/mapa3d/dubrovnik-completo/color.jpg'), require('../../assets/mapa3d/dubrovnik-completo/normal.jpg'), require('../../assets/mapa3d/dubrovnik-completo/surface.jpg')];
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
    // A small texture-colored fill retains facade detail in shaded mobile views.
    modelo.material.emissive.set('#FFFFFF'); modelo.material.emissiveMap = color; modelo.material.emissiveIntensity = 0.12;
    modelo.material.normalScale.set(0.65, 0.65);
    modelo.material.roughnessMap = surface; modelo.material.metalnessMap = surface; modelo.material.metalness = 1;
    modelo.material.needsUpdate = true; modelo.texturasListas = true;
    invalidate();
  }).catch(error => { modelo.carga = null; throw error; });
  return modelo.carga;
}
