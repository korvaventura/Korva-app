const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {crearCorteRuta}=require('../services/mapa3d/rutaPlaybackCore');
const {ubicarEtiquetas,seSuperponen}=require('../services/mapa3d/etiquetasCore');
const {AJUSTES_MAPA}=require('../services/mapa3d/ajustesInteraccion');
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
  const refs=Object.fromEntries(['inicioToqueRef','gestoRef','arrastrandoRef','ultimoArrastreRef','playbackRef','r3fRef','wrapRef','overlayRef','ultimaPublicacionRef','camaraManualHastaRef','topeAlejarRef'].map(k=>[k,{current:k==='ultimoArrastreRef'?0:null}]));
  const context=vm.createContext({...refs,...gestos,AJUSTES_MAPA,useCallback:f=>f,useMemo:f=>f(),onInteraccionMapa:v=>locks.push(v),aplicarCamara:()=>{},seleccionarCheckpoint:()=>{},escena:{},cancelAnimationFrame:()=>{},setKmPlayback:()=>{},setReproduciendo:()=>{},onAlejarAlGlobo:undefined});
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
  assert.equal(duracionReplay(19.4),25000);
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
  assert(seguido.objetivo[0]>.4 && seguido.objetivo[0]<.46); // gentle framing, not a chase camera
});


test('mapas registrados: comparten replay de 25 s, centro propio y seguimiento manual independiente',()=>{
  const {escenaParaConfig,clavesConEscena}=require('../services/mapa3d/escenas');
  const {duracionReplay,controlInicialReplay,seguirReplay}=require('../services/mapa3d/replayCamaraCore');
  assert.deepEqual(clavesConEscena().sort(),['camino_santiago','default','dubrovnik','islandia','monte_fuji','san_andres','via_appia']);
  for(const clave of clavesConEscena()) {
    const {escena}=escenaParaConfig(clave);
    assert.equal(duracionReplay(escena.distanciaKm),25000);
    const control=controlInicialReplay(escena.camara.objetivo);
    assert.deepEqual(control.objetivo,escena.camara.objetivo);
    assert.equal(control.azimut,0);assert.equal(control.elevacion,0);assert.equal(control.zoom,1);
    assert.equal(seguirReplay(control,[1,2,3],escena.camara.objetivo,16,false),control);
  }
});

test('Islandia: replay continuo según distancia y cero kilómetros solo recentra',()=>{
  const {duracionReplay}=require('../services/mapa3d/replayCamaraCore');
  assert.equal(duracionReplay(0,'islandia'),0);
  assert.equal(duracionReplay(48,'islandia'),10000);
  assert.equal(duracionReplay(350,'islandia'),16000);
  assert.equal(duracionReplay(1400,'islandia'),25000);
  let anterior=0;
  for(let km=1;km<=1400;km++) {
    const ms=duracionReplay(km,'islandia');
    assert(ms>=anterior && ms<=25000);anterior=ms;
  }
  assert(Math.abs(duracionReplay(48.001,'islandia')-10000)<1);
  assert(Math.abs(duracionReplay(350.001,'islandia')-16000)<1);
  const source=fs.readFileSync(require.resolve('../components/MapaRecorrido3D'),'utf8');
  const inicio=source.slice(source.indexOf('  const iniciarJourney ='),source.indexOf('    // El replay debe'));
  const context=vm.createContext({mundo:{},reproduciendo:false,playbackRef:{current:null},kmProgresoReal:0,
    recenter:()=>{context.centrados++;},centrados:0,cancelAnimationFrame:()=>{}});
  vm.runInContext(inicio+'\n}; iniciarJourney();',context);
  assert.equal(context.centrados,1);
});

test('replay y zoom: el overlay usa la cámara aplicada, aunque el gesto esté adelantado',()=>{
  const source=fs.readFileSync(require.resolve('../components/MapaRecorrido3D'),'utf8');
  const prelude=source.slice(source.indexOf('    // Project from the camera'),source.indexOf('    const aPx ='));
  const applied={position:{x:5},projectionMatrix:{zoom:.7}};
  const context=vm.createContext({r3fRef:{current:{camera:applied}},controlRef:{current:{zoom:1.6}},configurarCamara:()=>{throw Error('No proyectar desde el gesto pendiente');}});
  assert.equal(vm.runInContext(`(()=>{${prelude}\nreturn cam;})()`,context),applied);
  context.r3fRef.current=null;
  assert.equal(vm.runInContext(`(()=>{${prelude}\nreturn cam;})()`,context),null);
});

test('replay: frames de 160 ms no duplican su duración; interrupciones quedan limitadas',()=>{
  const source=fs.readFileSync(require.resolve('../components/MapaRecorrido3D'),'utf8');
  const step=source.slice(source.indexOf('      const elapsed ='),source.indexOf('      const t = THREE.MathUtils.clamp'));
  const context=vm.createContext({ahora:160,anterior:0,transcurrido:0,AJUSTES_MAPA});
  vm.runInContext(`(()=>{${step}})()`,context);
  assert.equal(context.transcurrido,160);
  context.ahora=10000;
  vm.runInContext(`(()=>{${step}})()`,context);
  assert.equal(context.transcurrido,410);
  const {duracionReplay}=require('../services/mapa3d/replayCamaraCore');
  assert.equal(duracionReplay(68,'monte_fuji'),20000);
});

test('frame GL: aplica cámara y atmósfera antes de publicar los checkpoints',()=>{
  const source=fs.readFileSync(require.resolve('../components/MapaRecorrido3D'),'utf8');
  const start=source.indexOf('  useFrame(() => {');
  const frame=source.slice(start,source.indexOf('  });',start)+5);
  let renderFrame;const events=[];const camera={zoom:1};const controlRef={current:{zoom:.7}};
  const context=vm.createContext({useFrame:f=>renderFrame=f,camera,controlRef,escena:{id:'san_andres'},size:{width:360,height:600},mundo:{},
    configurarCamara:(cam,scene,aspect,control)=>{cam.zoom=control.zoom;events.push('camara');},
    actualizarAtmosfera:()=>events.push('atmosfera'),
    onCamaraAplicada:()=>{assert.equal(camera.zoom,controlRef.current.zoom);events.push('puntos');}});
  vm.runInContext(frame,context);
  assert.equal(camera.zoom,1);renderFrame();assert.deepEqual(events,['camara','atmosfera','puntos']);
  controlRef.current={zoom:1.4};renderFrame();assert.equal(camera.zoom,1.4);
});

test('Camino: el cierre espera el zoom completo y termina encuadrando la catedral',()=>{
  const source=fs.readFileSync(require.resolve('../components/MapaRecorrido3D'),'utf8');
  // La llegada se configura en escena.territorio (ancla 'catedral'); mismos tiempos y cámara final.
  const start=source.indexOf('        const ancla = completado ? anclaLlegada(escena.territorio) : null;');
  assert(start>0);
  const end=source.indexOf('} else mostrarCierre();',start)+'} else mostrarCierre();'.length;
  let now=0, frame, cierres=0, detalle=false;
  const controlRef={current:{zoom:1,azimut:.4,elevacion:.2,objetivo:[0,0,0]}};
  const anclas=require('../services/mapa3d/anclasCore');
  const escena=require('../services/mapa3d/escenas/caminoSantiago');
  const context=vm.createContext({completado:true,escena,controlRef,playbackRef:{current:null},
    anclaLlegada:anclas.anclaLlegada,interpolarLlegada:anclas.interpolarLlegada,
    controlInspeccion:a=>anclas.controlAncla(a,{x:3,y:2,z:1},escena.camara),
    Date:{now:()=>now},setLlegadaFinal:v=>{detalle=v;},aplicarCamara:()=>{},
    requestAnimationFrame:f=>{frame=f;return 1;},mostrarCierre:()=>{cierres++;}});
  vm.runInContext(source.slice(start,end),context);
  assert.equal(detalle,true);
  for(let i=0;i<17;i++){now+=100;frame();assert.equal(cierres,0);}
  now+=100;frame();
  assert.equal(cierres,1);
  assert(Math.abs(controlRef.current.zoom-.025)<1e-10);
  assert.deepEqual(Array.from(controlRef.current.objetivo),[2.955,2.065,1]);
  assert.equal(controlRef.current.azimut,0);
  assert(Math.abs(controlRef.current.elevacion-(-19*Math.PI/180))<1e-12);
});
