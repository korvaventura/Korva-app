const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {crearCorteRuta}=require('../services/mapa3d/rutaPlaybackCore');
const {ubicarEtiquetas,seSuperponen}=require('../services/mapa3d/etiquetasCore');
const gestos=require('../services/mapa3d/gestosCore');

test('replay estático: el corte usa distancia 3D, conserva cobertura y crece sin reconstruir',()=>{
  const ruta=[{x:0,z:0,h:0,km:0},{x:1,z:0,h:0,km:4},{x:1,z:0,h:3,km:19.4}];
  const cortar=crearCorteRuta(ruta,{x:x=>x,z:z=>z,y:y=>y},100);
  assert.equal(cortar(0),0);assert.equal(cortar(19.4),3600);
  assert.equal(cortar(4),900); // quarter of 3D arc length, not 4/19.4
  let anterior=0;
  for(let i=0;i<=500;i++) {
    const corte=cortar(i/500*19.4);assert(corte>=anterior);assert.equal(corte%36,0);
    assert.equal(corte+(3600-corte),3600);anterior=corte;
  }
});

test('etiquetas: mantienen lado y separación al mover la cámara unos píxeles',()=>{
  const items=[{id:'a',x:90,y:150,texto:'PILE'},{id:'b',x:170,y:240,texto:'BOKAR'}];
  const antes=ubicarEtiquetas(items,360,500,{ocultarSiNoCabe:true});
  const preferidas=Object.fromEntries(items.map(p=>[p.id,{lado:antes[p.id].lado,dx:antes[p.id].x-p.x,dy:antes[p.id].y-p.y}]));
  const despues=ubicarEtiquetas(items.map(p=>({...p,x:p.x+3,y:p.y+2})),360,500,{ocultarSiNoCabe:true,preferidas});
  for(const p of items){assert.equal(despues[p.id].lado,antes[p.id].lado);assert.equal(despues[p.id].x,antes[p.id].x+3);assert.equal(despues[p.id].y,antes[p.id].y+2);}
  assert(!seSuperponen(despues.a,despues.b));
});

test('handlers reales: tap no bloquea scroll; arrastre, release y cancel liberan el bloqueo',()=>{
  const source=fs.readFileSync(require.resolve('../components/MapaRecorrido3D'),'utf8');
  const releases=source.slice(source.indexOf('  const liberarGesto ='),source.indexOf('  const seleccionarCheckpoint ='));
  const handlers=source.slice(source.indexOf('  const touchHandlers ='),source.indexOf('  // Decodificar el horneado'));
  const locks=[];
  const refs=Object.fromEntries(['inicioToqueRef','gestoRef','arrastrandoRef','ultimoArrastreRef','playbackRef','r3fRef','wrapRef','overlayRef','ultimaPublicacionRef','camaraManualHastaRef'].map(k=>[k,{current:k==='ultimoArrastreRef'?0:null}]));
  const context=vm.createContext({...refs,...gestos,useCallback:f=>f,useMemo:f=>f(),onInteraccionMapa:v=>locks.push(v),setMoviendoMapa:()=>{},aplicarCamara:()=>{},seleccionarCheckpoint:()=>{},escena:{},cancelAnimationFrame:()=>{},setKmPlayback:()=>{},setReproduciendo:()=>{}});
  const h=vm.runInContext(releases+handlers+'\ntouchHandlers',context);
  refs.playbackRef.current=71;
  context.cancelAnimationFrame=()=>{throw Error('A gesture must not stop replay');};
  const event=(x,y)=>({nativeEvent:{touches:[{identifier:1,pageX:x,pageY:y}]}});
  h.onTouchStart(event(100,100));assert.equal(h.onStartShouldSetResponder(),false);
  h.onResponderGrant(event(100,100));h.onTouchMove(event(104,103));assert(!locks.includes(true));
  h.onTouchMove(event(120,100));assert.equal(locks.at(-1),true);
  h.onResponderTerminate();assert.equal(locks.at(-1),false);assert.equal(refs.arrastrandoRef.current,false);assert.equal(refs.gestoRef.current,null);
  h.onTouchStart(event(100,100));h.onTouchMove(event(125,100));h.onTouchCancel();assert.equal(locks.at(-1),false);
  h.onTouchStart(event(100,100));h.onTouchMove(event(125,100));h.onResponderRelease();assert.equal(locks.at(-1),false);
  assert.equal(refs.playbackRef.current,71);
});

test('revivir: arranca centrado, acelera moderadamente y el seguimiento respeta el control manual',()=>{
  const {duracionReplay,controlInicialReplay,seguirReplay}=require('../services/mapa3d/replayCamaraCore');
  assert(duracionReplay(19.4)>30000 && duracionReplay(19.4)<35000);
  const base=[0,.22,.65],control=controlInicialReplay(base);
  assert.equal(control.azimut,0);assert.equal(control.elevacion,0);assert.equal(control.zoom,1);
  assert.deepEqual(control.objetivo,base);assert.notEqual(control.objetivo,base);
  const manual={azimut:2.8,elevacion:.1,zoom:.62,objetivo:[2,.3,3]};
  assert.equal(seguirReplay(manual,[0,.2,1],base,16,false),manual);
  const retomado=seguirReplay(manual,[0,.2,1],base,16,true);
  assert.equal(retomado.azimut,manual.azimut);assert.equal(retomado.zoom,manual.zoom);
  assert(Math.hypot(...retomado.objetivo.map((v,i)=>v-manual.objetivo[i]))<.1);
  let seguido=control;
  for(let i=0;i<200;i++)seguido=seguirReplay(seguido,[1,.3,1.5],base,16,true);
  assert(seguido.objetivo[0]>.64 && seguido.objetivo[0]<.66); // gentle framing, not a chase camera
});


test('etiquetas: el cuadro publicado conserva su cámara y progreso aunque avance el replay',()=>{
  const {crearCuadroReplay,controlInicialReplay}=require('../services/mapa3d/replayCamaraCore');
  const control=controlInicialReplay([0,.22,.65],.86),progreso={km:18,animando:true};
  assert.equal(control.zoom,.86);
  const cuadro=crearCuadroReplay(control,progreso);
  control.objetivo[0]=3;control.zoom=.6;progreso.km=19;
  assert.equal(cuadro.control.objetivo[0],0);assert.equal(cuadro.control.zoom,.86);assert.equal(cuadro.progreso.km,18);
});

test('pines GL: comparten posición de ruta y cámara sin commit nativo y conservan tamaño en zoom',()=>{
  const THREE=require('three');
  const source=fs.readFileSync(require.resolve('../components/mapa3d/pinesMesh'),'utf8').replace(/import[^;]+;/,'').replace('export function','function');
  const crear=vm.runInNewContext(source+'\ncrearPinesMesh',{THREE});
  const base=new THREE.Vector3(.2,.1,.6),cabeza=base.clone().add(new THREE.Vector3(0,.075,0));
  const pines=crear([{id:'a',km:4,base,cabeza}],'#44F2DC');
  const camera=new THREE.PerspectiveCamera(42,360/455,.05,200);
  for(const [x,y,z] of [[0,4,8],[4,3,2],[-3,5,-4],[0,2,4]]) {
    camera.position.set(x,y,z);camera.lookAt(base);camera.updateMatrixWorld(true);
    pines.actualizar(camera,455,8,'a',base);
    const [tallo,borde,centro]=pines.grupo.children;
    assert.deepEqual(borde.position.toArray(),cabeza.toArray());
    const posiciones=tallo.geometry.attributes.position;
    assert(Math.abs(posiciones.getX(0)-base.x)<1e-6);assert(Math.abs(posiciones.getZ(0)-base.z)<1e-6);
    assert.deepEqual(borde.quaternion.toArray(),camera.quaternion.toArray());
    const derecha=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion).multiplyScalar(borde.scale.x);
    const a=borde.position.clone().project(camera),b=borde.position.clone().add(derecha).project(camera);
    assert(Math.abs((b.x-a.x)*360/2-11)<1e-6);
    assert.equal(centro.material.color.getHexString(),'44f2dc');
    assert.deepEqual(pines.grupo.children[4].position.toArray(),base.toArray());
  }
  pines.dispose();
});

test('arrastre: invalida GL inmediatamente y no espera ni solicita un commit de etiquetas',()=>{
  const source=fs.readFileSync(require.resolve('../components/MapaRecorrido3D'),'utf8');
  const fn=source.slice(source.indexOf('  const aplicarCamara ='),source.indexOf('  const moverObjetivo ='));
  let renders=0;const frames=[],cuadros=[];
  const refs={r3fRef:{current:{invalidate:()=>renders++}},arrastrandoRef:{current:true},revisionPendienteRef:{current:null},ultimaPublicacionRef:{current:0},controlRef:{current:{zoom:.86}},progresoRef:{current:{km:8,animando:true}}};
  const context=vm.createContext({...refs,useCallback:f=>f,requestAnimationFrame:fn=>{frames.push(fn);return 1;},setRevisionCamara:v=>cuadros.push(v),crearCuadroReplay:require('../services/mapa3d/replayCamaraCore').crearCuadroReplay});
  const aplicar=vm.runInContext(fn+'\naplicarCamara',context);
  aplicar();assert.equal(renders,1);assert.equal(frames.length,0);assert.equal(cuadros.length,0);
  refs.arrastrandoRef.current=false;aplicar();assert.equal(renders,2);assert.equal(frames.length,1);
  frames[0]();assert.equal(cuadros[0].progreso.km,8);
});
