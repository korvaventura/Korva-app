const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const {createRequire}=require('node:module');
const core=require('../services/mapa3d/modeloMeshyCore');const meta=require('../assets/mapa3d/san-andres-unificado/meta');
const escena=require('../services/mapa3d/escenas/sanAndres');
test('San Andrés: modelo completo dentro del presupuesto, kilómetros y checkpoints conservados',()=>{
  const buffers=Object.fromEntries(['position','normal','uv','index'].map(k=>[k,require('../assets/mapa3d/san-andres-unificado/'+k)]));
  const attrs=core.decodificarModelo(meta,buffers);
  assert(meta.triangles<=220000);assert(meta.vertices<180000);assert(attrs.index.every(i=>i<meta.vertices));assert(attrs.position.every(Number.isFinite));
  assert.equal(meta.composition,'single-unified-source');assert.equal(escena.distanciaKm,57);
  assert.equal(meta.visualSurfaceRoute[0].km,0);assert.equal(meta.visualSurfaceRoute.at(-1).km,57);
  for(const km of [0,11,21,34,44,57])assert(meta.visualSurfaceRoute.some(p=>Math.abs(p.km-km)<1e-8));
  for(let i=1;i<meta.visualSurfaceRoute.length;i++)assert(meta.visualSurfaceRoute[i].km>=meta.visualSurfaceRoute[i-1].km);
  assert(fs.statSync(path.resolve(__dirname,'../assets/mapa3d/san-andres-unificado/color.jpg')).size<1500000);
});
test('San Andrés: constructor real, superficie alineada y cámara sin recortar el modelo',async()=>{
  const THREE=await import('three');const file=path.resolve(__dirname,'../components/mapa3d/modeloMeshy.js');
  const src=fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const crear=vm.runInNewContext(src+'\nconstruirModeloMeshy',{THREE,...core,require:createRequire(file)});
  const conv={x:x=>x/.3,z:z=>z/.3,y:y=>y*.004,aKm:x=>x*.3};
  const mundo=crear({campo:{}},conv,'san_andres');assert.equal(mundo.modeloMeshy.id,'san_andres');assert.equal(mundo.grupo.children.length,2);
  const mesh=mundo.grupo.children[1];assert.equal(mesh.rotation.x,0);assert.equal(mesh.rotation.y,0);assert.equal(mesh.rotation.z,0);mesh.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  for(let i=0;i<meta.visualSurfaceRoute.length;i+=30){const p=meta.visualSurfaceRoute[i];ray.set(new THREE.Vector3(conv.x(p.x),2,conv.z(p.z)),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(mesh)[0];assert(hit);assert(Math.abs(conv.y(p.h)-hit.point.y)<.001);}
  const c=escena.camara,el=c.elevacionGrados*Math.PI/180,az=c.azimutGrados*Math.PI/180,[x,y,z]=c.objetivo;
  const cam=new THREE.PerspectiveCamera(c.fov,c.aspectoReferencia,.05,200);cam.position.set(x+Math.sin(az)*Math.cos(el)*c.distancia,y+Math.sin(el)*c.distancia,z-Math.cos(az)*Math.cos(el)*c.distancia);cam.lookAt(x,y,z);cam.updateMatrixWorld(true);
  const v=new THREE.Vector3(),pos=mesh.geometry.attributes.position;
  for(let i=0;i<pos.count;i+=50){v.fromBufferAttribute(pos,i).project(cam);assert(Math.abs(v.x)<1 && Math.abs(v.y)<1);}
});
test('San Andrés: punta continua sin escalones, shaders complementarios y replay moderado',()=>{
  const {crearFraccionRuta}=require('../services/mapa3d/rutaPlaybackCore');
  const f=crearFraccionRuta(meta.visualSurfaceRoute,{x:x=>x/.3,z:z=>z/.3,y:y=>y*.004});
  assert.equal(f(0),0);assert.equal(f(57),1);
  for(let km=.01;km<57;km+=.11)assert(f(km+.00001)>f(km));
  const {duracionReplay}=require('../services/mapa3d/replayCamaraCore');
  assert.equal(duracionReplay(57,'san_andres'),14000);assert.equal(duracionReplay(0,'san_andres'),0);
  assert(duracionReplay(1,'san_andres')>=4000);assert.equal(duracionReplay(1400,'islandia'),25000);
  const file=path.resolve(__dirname,'../components/mapa3d/rutaContinua.js');
  const configure=vm.runInNewContext(fs.readFileSync(file,'utf8').replace(/export /g,'')+'\nconfigurarRutaContinua');
  const avance={value:.5},hecho={},pendiente={};configure(hecho,avance,true);configure(pendiente,avance,false);
  for(const [material,condition] of [[hecho,'>'],[pendiente,'<=']]) {
    const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.korvaAvance,avance);assert(shader.vertexShader.includes('korvaTramo = uv.x;'));
    assert(shader.fragmentShader.includes('korvaTramo '+condition+' korvaAvance'));
  }
  assert.notEqual(hecho.customProgramCacheKey(),pendiente.customProgramCacheKey());
});
