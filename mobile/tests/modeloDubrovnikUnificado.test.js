const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const core = require('../services/mapa3d/modeloMeshyCore');
const meta = require('../assets/mapa3d/dubrovnik-unificado/meta');
const buffers = Object.fromEntries(['position','normal','uv','index'].map(k=>[k,require('../assets/mapa3d/dubrovnik-unificado/'+k)]));

test('modelo unificado: geometría móvil íntegra y una sola fuente conservada', () => {
  const mesh = core.decodificarModelo(meta, buffers);
  assert.equal(meta.composition, 'single-unified-source');
  assert.match(meta.source, /Dubrovnik_3D_Map_Flat/);
  assert(meta.triangles < 250000 && meta.vertices < 200000);
  assert(meta.simplificationError < .001);
  assert(mesh.index.every(i => i < meta.vertices));
  assert(mesh.position.every(Number.isFinite));
  let valid = 0;
  for(let i=0;i<meta.vertices;i++) {
    const length=Math.hypot(...mesh.normal.subarray(i*3,i*3+3))/127;
    if(length>.98 && length<1.02) valid++;
  }
  assert(valid/meta.vertices>.99);
});

test('modelo unificado: ruta propia, 19,4 km y checkpoints sin reutilizar el casco anterior', () => {
  const route=meta.visualSurfaceRoute;
  assert(route.length>1000);
  assert.equal(route[0].km,0);assert.equal(route.at(-1).km,19.4);
  for(let i=0;i<route.length;i++) {
    const p=route[i];assert([p.x,p.z,p.h,p.km].every(Number.isFinite));
    assert(p.h*.004 > 0 && p.h*.004 < .5);
    if(i) assert(p.km>route[i-1].km);
  }
  for(const [x,z,km] of meta.visualRoute) {
    const p=route.find(p=>p.km===km);assert(p);
    assert(Math.abs(p.x-x*.3)<1e-8 && Math.abs(p.z-z*.3)<1e-8);
  }
});

test('montaje real: no rota ni mezcla paisajes y la ruta permanece sobre la malla', async () => {
  const THREE=await import('three');
  const file=path.resolve(__dirname,'../components/mapa3d/modeloMeshy.js');
  const source=fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const context=vm.createContext({THREE,...core,require:createRequire(file)});
  const construir=vm.runInContext(source+'\nconstruirModeloMeshy',context);
  const conv={x:x=>x/.3,z:z=>z/.3,y:h=>h*.004,aKm:x=>x*.3};
  const mundo=construir({campo:{}},conv);
  assert.equal(mundo.grupo.children.length,2); // source landscape plus outer sea
  const landscape=mundo.grupo.children[1];
  assert.equal(landscape.geometry.index.count,meta.triangles*3);
  assert.equal(landscape.rotation.y,0);
  assert.equal(landscape.position.length(),0);
  landscape.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  const samples=meta.visualSurfaceRoute.filter((p,i)=>i%30===0||meta.visualRoute.some(a=>a[2]===p.km));
  for(const p of samples) {
    ray.set(new THREE.Vector3(conv.x(p.x),2,conv.z(p.z)),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(landscape)[0];assert(hit);
    const clearance=conv.y(p.h)-hit.point.y;
    assert(clearance>=-.001 && clearance<.04,'Route clearance '+clearance);
  }
});

test('encuadre: ciudad, puerto y montaña entran en la cámara inicial', async () => {
  const THREE=await import('three');
  const escena=require('../services/mapa3d/escenas/dubrovnik');
  const mesh=core.decodificarModelo(meta,buffers),c=escena.camara;
  const camera=new THREE.PerspectiveCamera(c.fov,.82,.05,200);
  const el=c.elevacionGrados*Math.PI/180,az=c.azimutGrados*Math.PI/180,[x,y,z]=c.objetivo;
  camera.position.set(x+Math.sin(az)*Math.cos(el)*c.distancia,y+Math.sin(el)*c.distancia,z-Math.cos(az)*Math.cos(el)*c.distancia);
  camera.lookAt(x,y,z);camera.updateMatrixWorld(true);
  const v=new THREE.Vector3();let inside=0,total=0;
  for(let i=0;i<meta.vertices;i+=100) {
    v.fromArray(mesh.position,i*3).project(camera);total++;
    if(Math.abs(v.x)<=1 && Math.abs(v.y)<=1 && v.z<1)inside++;
  }
  assert(inside/total>.99);
});
