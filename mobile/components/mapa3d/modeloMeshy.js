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

export function construirModeloMeshy(datosOriginales, conv) {
  const meta = require('../../assets/mapa3d/dubrovnik-completo/meta');
  const ciudad = malla(meta, {
    position: require('../../assets/mapa3d/dubrovnik-completo/position'),
    normal: require('../../assets/mapa3d/dubrovnik-completo/normal'),
    uv: require('../../assets/mapa3d/dubrovnik-completo/uv'),
    index: require('../../assets/mapa3d/dubrovnik-completo/index'),
  }, 'Casco original Dubrovnik');
  const fondo = malla(require('../../assets/mapa3d/dubrovnik-revision-fondo/meta'), {
    position: require('../../assets/mapa3d/dubrovnik-revision-fondo/position'),
    normal: require('../../assets/mapa3d/dubrovnik-revision-fondo/normal'),
    uv: require('../../assets/mapa3d/dubrovnik-revision-fondo/uv'),
    index: require('../../assets/mapa3d/dubrovnik-revision-fondo/index'),
  }, 'Ladera y barrios exteriores', true);
  const alturaModelo = crearMuestreadorModelo(meta);
  const campo = { ...datosOriginales.campo, muestrear: (x, z) => alturaModelo(conv.x(x), conv.z(z)) / conv.y(1) };
  const datos = { ...datosOriginales, campo, ruta: datosOriginales.ruta.map(p => ({ ...p, h: campo.muestrear(p.x, p.z) })) };
  const grupo = new THREE.Group();
  const aguaGeometry = new THREE.PlaneGeometry(180, 180, 64, 64);
  const vertices = aguaGeometry.attributes.position, colors = new Float32Array(vertices.count * 3);
  const profundo = new THREE.Color('#073A62'), costa = new THREE.Color('#209CAB');
  const [min,max] = meta.heightBounds;
  for (let i=0;i<vertices.count;i++) {
    const u=vertices.getX(i)/90,v=vertices.getY(i)/90;
    const x=Math.sign(u)*Math.abs(u)**3*90,z=-Math.sign(v)*Math.abs(v)**3*90;
    vertices.setXY(i,x,-z);
    const distance=Math.hypot(Math.max(min[0]-x,0,x-max[0]),Math.max(min[1]-z,0,z-max[1]));
    profundo.clone().lerp(costa,Math.exp(-distance*1.8)*.78).toArray(colors,i*3);
  }
  aguaGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));aguaGeometry.computeBoundingSphere();
  const mar=new THREE.Mesh(aguaGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.46,metalness:.02}));
  mar.rotation.x=-Math.PI/2;mar.position.y=-.004;
  grupo.add(mar,fondo,ciudad);
  return {grupo,datos,modeloMeshy:{material:ciudad.material,materiales:[ciudad.material,fondo.material],meta,texturasListas:false},limites:{minX:-90,maxX:90,minZ:-90,maxZ:90}};
}

export function cargarTexturasMeshy(mundo,invalidate) {
  const modelo=mundo.modeloMeshy;
  if(!modelo||modelo.texturasListas)return Promise.resolve();
  if(modelo.carga)return modelo.carga;
  const loader=new THREE.TextureLoader(),loaded=[];
  const ids=[require('../../assets/mapa3d/dubrovnik-completo/color.jpg'),require('../../assets/mapa3d/dubrovnik-revision-fondo/color.jpg')];
  modelo.carga=Promise.allSettled(ids.map(id=>new Promise((resolve,reject)=>loader.load(id,t=>{t.flipY=false;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.colorSpace=THREE.SRGBColorSpace;loaded.push(t);resolve(t);},undefined,reject)))).then(results=>{
    const failure=results.find(r=>r.status==='rejected');if(failure){loaded.forEach(t=>t.dispose());throw failure.reason;}
    results.forEach((r,i)=>{const material=modelo.materiales[i];material.color.set('#FFFFFF');material.map=r.value;material.emissive.set('#FFFFFF');material.emissiveMap=r.value;material.emissiveIntensity=.08;material.needsUpdate=true;});
    modelo.texturasListas=true;invalidate();
  }).catch(error=>{modelo.carga=null;throw error;});return modelo.carga;
}
