const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const {createRequire}=require('node:module');
const core=require('../services/mapa3d/modeloMeshyCore');const meta=require('../assets/mapa3d/islandia-unificado/meta');
const historia=require('../services/desafios/islandia');
test('Islandia: modelo íntegro bajo presupuesto y una ruta de 1400 con todos los checkpoints',()=>{
  const buffers=Object.fromEntries(['position','normal','uv','index'].map(k=>[k,require('../assets/mapa3d/islandia-unificado/'+k)]));
  const attrs=core.decodificarModelo(meta,buffers);
  assert(meta.triangles<=220000);assert(meta.vertices<180000);assert(attrs.index.every(i=>i<meta.vertices));assert(attrs.position.every(Number.isFinite));
  assert.equal(meta.visualSurfaceRoute[0].km,0);assert.equal(meta.visualSurfaceRoute.at(-1).km,1400);
  assert.equal(historia.capitulos.length,5);
  for(const cp of historia.checkpoints)assert(meta.visualSurfaceRoute.some(p=>Math.abs(p.km-cp.kmFisico)<1e-8));
});
test('Islandia: constructor real preserva fuente, ruta sobre superficie y ambiente liviano sin loops',async()=>{
  const THREE=await import('three');
  const file=path.resolve(__dirname,'../components/mapa3d/modeloMeshy.js');
  const src=fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const ctx=vm.createContext({THREE,...core,require:createRequire(file)});
  const crear=vm.runInContext(src+'\nconstruirModeloMeshy',ctx);
  const conv={x:x=>x/.3,z:z=>z/.3,y:y=>y*.004,aKm:x=>x*.3};
  const mundo=crear({campo:{}},conv,'islandia');assert.equal(mundo.modeloMeshy.id,'islandia');
  const mesh=mundo.grupo.children[1];assert.equal(mesh.rotation.x,0);assert.equal(mesh.rotation.y,0);assert.equal(mesh.rotation.z,0);mesh.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  for(let i=0;i<meta.visualSurfaceRoute.length;i+=60){const p=meta.visualSurfaceRoute[i];ray.set(new THREE.Vector3(conv.x(p.x),2,conv.z(p.z)),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(mesh)[0];assert(hit);assert(Math.abs(conv.y(p.h)-hit.point.y)<.001);}
  const ambienteFile=path.resolve(__dirname,'../components/mapa3d/ambienteIslandia.js');
  const ambienteSrc=fs.readFileSync(ambienteFile,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const ambiente=vm.runInNewContext(ambienteSrc+'\ncrearAmbienteIslandia()',{THREE});
  assert.equal(ambiente.children.length,6);let triangles=0;
  ambiente.traverse(o=>{if(o.geometry)triangles+=o.geometry.index.count/3;});assert(triangles<500);
});
