const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const core=require('../services/mapa3d/modeloMeshyCore');
const meta=require('../assets/mapa3d/fin-del-mundo-unificado/meta');
const escena=require('../services/mapa3d/escenas/finDelMundo');
const buffers=Object.fromEntries(['position','normal','uv','index'].map(k=>[k,require('../assets/mapa3d/fin-del-mundo-unificado/'+k)]));
const conv={x:x=>x/10,z:z=>z/10,y:h=>h*.00046,aKm:x=>x*10};

test('Fin del Mundo: modelo completo, atributos íntegros y presupuesto móvil',()=>{
 const mesh=core.decodificarModelo(meta,buffers);
 assert.equal(meta.composition,'single-unified-source');assert.match(meta.source,/Tierra_Del_Fuego/);
 assert(meta.triangles<=220000 && meta.vertices<150000);assert(meta.simplificationError<.001);
 assert(mesh.position.every(Number.isFinite));assert(mesh.index.every(i=>i<meta.vertices));
 let valid=0;for(let i=0;i<meta.vertices;i++){const n=Math.hypot(...mesh.normal.subarray(i*3,i*3+3))/127;if(n>.98 && n<1.02)valid++;}assert(valid/meta.vertices>.99);
 const assets=path.resolve(__dirname,'../assets/mapa3d/fin-del-mundo-unificado');
 assert(fs.readdirSync(assets).reduce((sum,f)=>sum+fs.statSync(path.join(assets,f)).size,0)<6000000);
});

test('Fin del Mundo: conserva 103 km y las cinco anclas de checkpoints sobre su ruta propia',()=>{
 const route=meta.visualSurfaceRoute;
 assert.equal(route[0].km,0);assert.equal(route.at(-1).km,103);
 for(const km of [0,20,45,80,103])assert(route.some(p=>p.km===km));
 for(let i=0;i<route.length;i++) {const p=route[i];assert([p.x,p.z,p.h,p.km].every(Number.isFinite));assert(conv.y(p.h)>=0 && conv.y(p.h)<.31);if(i)assert(p.km>route[i-1].km);}
 for(const [x,z,km] of meta.visualRoute){const p=route.find(p=>p.km===km);assert(p);assert(Math.abs(conv.x(p.x)-x)<1e-8 && Math.abs(conv.z(p.z)-z)<1e-8);}
 assert.equal(escena.distanciaKm,103);assert.equal(require('../services/mapa3d/replayCamaraCore').duracionReplay(103),25000);
});

test('Fin del Mundo: montaje real selecciona su malla sin alterar ejes; ruta sobre la superficie',async()=>{
 const THREE=await import('three'),file=path.resolve(__dirname,'../components/mapa3d/modeloMeshy.js');
 const source=fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const construir=vm.runInNewContext(source+'\nconstruirModeloMeshy',{THREE,...core,require:createRequire(file)});
 const mundo=construir({campo:{}},conv,escena),mesh=mundo.grupo.children[1];
 assert.equal(mundo.modeloMeshy.id,'fin_del_mundo');assert.equal(mundo.grupo.children.length,2);
 assert.equal(mesh.geometry.index.count,meta.triangles*3);assert.equal(Math.hypot(mesh.rotation.x,mesh.rotation.y,mesh.rotation.z),0);assert.equal(mesh.position.length(),0);
 mesh.updateMatrixWorld(true);const ray=new THREE.Raycaster();
 for(const p of meta.visualSurfaceRoute.filter((p,i)=>i%25===0 || [0,20,45,80,103].includes(p.km))) {
  ray.set(new THREE.Vector3(conv.x(p.x),2,conv.z(p.z)),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObject(mesh)[0];assert(hit);assert(Math.abs(conv.y(p.h)-hit.point.y)<.001);
 }
 const dub=construir({campo:{}},conv,{id:'dubrovnik'});assert.equal(dub.modeloMeshy.id,'dubrovnik');assert.match(dub.modeloMeshy.meta.source,/Dubrovnik/);
});

test('Fin del Mundo: encuadre inicial incluye el paisaje y todos los checkpoints',async()=>{
 const THREE=await import('three'),c=escena.camara,camera=new THREE.PerspectiveCamera(c.fov,.82,.05,200);
 const el=c.elevacionGrados*Math.PI/180,az=c.azimutGrados*Math.PI/180,[x,y,z]=c.objetivo;
 camera.position.set(x+Math.sin(az)*Math.cos(el)*c.distancia,y+Math.sin(el)*c.distancia,z-Math.cos(az)*Math.cos(el)*c.distancia);camera.lookAt(x,y,z);camera.updateMatrixWorld(true);
 const mesh=core.decodificarModelo(meta,buffers),v=new THREE.Vector3();let inside=0,total=0;
 for(let i=0;i<meta.vertices;i+=100){v.fromArray(mesh.position,i*3).project(camera);total++;if(Math.abs(v.x)<=1 && Math.abs(v.y)<=1 && v.z<1)inside++;}assert(inside/total>.99);
 for(const p of meta.visualSurfaceRoute.filter(p=>[0,20,45,80,103].includes(p.km))) {v.set(conv.x(p.x),conv.y(p.h)+.075,conv.z(p.z)).project(camera);assert(Math.abs(v.x)<.95 && Math.abs(v.y)<.95);}
});
