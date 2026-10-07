import * as THREE from 'three';
import { decodificarModelo, crearMuestreadorModelo } from '../../services/mapa3d/modeloMeshyCore';

function malla(meta, buffers, nombre, recalcular = false) {
  const attrs = decodificarModelo(meta, buffers);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(attrs.position, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(attrs.uv, 2, true));
  if (recalcular) {
    geometry.setIndex(new THREE.BufferAttribute(attrs.index, 1));
    // Float32 normals: never write computed normals into a normalized Int8 buffer.
    geometry.computeVertexNormals();
  } else {
    geometry.setAttribute('normal', new THREE.BufferAttribute(attrs.normal, 3, true));
    geometry.setIndex(new THREE.BufferAttribute(attrs.index, 1));
  }
  geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  const material = new THREE.MeshStandardMaterial({ color: '#DDD5C5', roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = nombre;
  return mesh;
}

export function construirModeloMeshy(datosOriginales, conv, modeloId = 'dubrovnik') {
  const islandia = modeloId === 'islandia', sanAndres = modeloId === 'san_andres';
  const marAmplio = islandia || sanAndres;
  const meta = sanAndres ? require('../../assets/mapa3d/san-andres-unificado/meta') : islandia ? require('../../assets/mapa3d/islandia-unificado/meta') : require('../../assets/mapa3d/dubrovnik-unificado/meta');
  const buffers = sanAndres ? {
    position: require('../../assets/mapa3d/san-andres-unificado/position'),
    normal: require('../../assets/mapa3d/san-andres-unificado/normal'),
    uv: require('../../assets/mapa3d/san-andres-unificado/uv'),
    index: require('../../assets/mapa3d/san-andres-unificado/index'),
  } : islandia ? {
    position: require('../../assets/mapa3d/islandia-unificado/position'),
    normal: require('../../assets/mapa3d/islandia-unificado/normal'),
    uv: require('../../assets/mapa3d/islandia-unificado/uv'),
    index: require('../../assets/mapa3d/islandia-unificado/index'),
  } : {
    position: require('../../assets/mapa3d/dubrovnik-unificado/position'),
    normal: require('../../assets/mapa3d/dubrovnik-unificado/normal'),
    uv: require('../../assets/mapa3d/dubrovnik-unificado/uv'),
    index: require('../../assets/mapa3d/dubrovnik-unificado/index'),
  };
  const paisaje = malla(meta, buffers, sanAndres ? 'San Andrés — modelo unificado' : islandia ? 'Islandia — modelo unificado' : 'Dubrovnik — modelo unificado');
  // No rotations, reflections, masked terrain or joins: preserve the complete source.
  const alturaModelo = crearMuestreadorModelo(meta);
  const campo = { ...datosOriginales.campo, muestrear: (x, z) => alturaModelo(conv.x(x), conv.z(z)) / conv.y(1) };
  const datos = { ...datosOriginales, campo };
  const grupo = new THREE.Group();
  // Extend only the sea beyond the supplied model, below its lowest vertex.
  const mar = new THREE.Mesh(new THREE.PlaneGeometry(marAmplio ? 600 : 180, marAmplio ? 600 : 180),
    marAmplio
      ? new THREE.MeshBasicMaterial({color: sanAndres ? '#0C416D' : '#29485B'})
      : new THREE.MeshStandardMaterial({color: '#0C3553', roughness: 1, metalness: 0}));
  mar.rotation.x = -Math.PI / 2;
  mar.position.y = meta.min[1] - .002;
  grupo.add(mar, paisaje);
  return {grupo,datos,modeloMeshy:{id:modeloId,material:paisaje.material,materiales:[paisaje.material],meta,texturasListas:false},limites:marAmplio ? {minX:-300,maxX:300,minZ:-300,maxZ:300} : {minX:-90,maxX:90,minZ:-90,maxZ:90}};
}

export function cargarTexturasMeshy(mundo,invalidate) {
  const modelo=mundo.modeloMeshy;
  if(!modelo||modelo.texturasListas)return Promise.resolve();
  if(modelo.carga)return modelo.carga;
  const loader=new THREE.TextureLoader(),loaded=[];
  const ids=[modelo.id === 'san_andres' ? require('../../assets/mapa3d/san-andres-unificado/color.jpg') : modelo.id === 'islandia' ? require('../../assets/mapa3d/islandia-unificado/color.jpg') : require('../../assets/mapa3d/dubrovnik-unificado/color.jpg')];
  modelo.carga=Promise.allSettled(ids.map(id=>new Promise((resolve,reject)=>loader.load(id,t=>{t.flipY=false;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.colorSpace=THREE.SRGBColorSpace;loaded.push(t);resolve(t);},undefined,reject)))).then(results=>{
    const failure=results.find(r=>r.status==='rejected');if(failure){loaded.forEach(t=>t.dispose());throw failure.reason;}
    results.forEach((r,i)=>{const material=modelo.materiales[i];material.color.set('#FFFFFF');material.map=r.value;material.emissive.set('#FFFFFF');material.emissiveMap=r.value;material.emissiveIntensity=.08;material.needsUpdate=true;});
    modelo.texturasListas=true;invalidate();
  }).catch(error=>{modelo.carga=null;throw error;});return modelo.carga;
}
