const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');
const terreno = require('../services/mapa3d/terrenoCore');
const hc = require('../services/mapa3d/horneadoCore');
const escena = require('../services/mapa3d/escenas/caminoSantiago');
const horneado = require('../services/mapa3d/escenas/caminoSantiago.horneado');
const { resolverGeneralCamino, limitarVistaCamino } = require('../services/mapa3d/vistaCaminoCore');
const source = fs.readFileSync(path.join(__dirname, '../components/mapa3d/construirMundo.js'), 'utf8').replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
const motor = new Function('THREE','crearObjetosCamino','construirModeloMeshy','crearAmbienteIslandia','crearRutaVisualModelo','construirDatosDiorama','puntoEnKm','indiceCercano','deserializarDiorama',source+';return {construirMundo, configurarCamara, actualizarAtmosfera, posicionEnKm, profundidadBordeVisible};')(
  THREE,()=>null,()=>null,()=>null,()=>null,terreno.construirDatosDiorama,terreno.puntoEnKm,terreno.indiceCercano,hc.deserializarDiorama);
const mundo = motor.construirMundo(escena, horneado);
function general(w, h) {
  const camera = new THREE.PerspectiveCamera();
  const puntos = [];
  for (let km=0;km<=775;km+=5) { const p=motor.posicionEnKm(mundo.datos,mundo.conv,km,0); puntos.push(p,p.clone().add(new THREE.Vector3(0,escena.alturaPinUnidades,0))); }
  const proyectar=c=>{motor.configurarCamara(camera,escena,w/h,c,mundo);return puntos.map(p=>p.clone().project(camera));};
  const control=resolverGeneralCamino(proyectar,{azimut:0,elevacion:0,zoom:1,objetivo:escena.camara.objetivoGeneral},w,h);
  return {control, proyectar, camera};
}

test('Camino: la resolución del contexto visible se mantiene por debajo de 4,5 km',()=>{
  const g=terreno.crearGrilla(escena),l=escena.limitesKm;
  for(const [eje,min,max]of[[g.xs,l.minX,l.maxX],[g.zs,l.minZ,l.maxZ]])for(let i=1;i<eje.length;i++){
    const medio=(eje[i]+eje[i-1])/2;
    if(medio>=min-escena.mundo.radioContextoKm && medio<=max+escena.mundo.radioContextoKm)assert(eje[i]-eje[i-1]<=4.501);
  }
});

test('Camino: General encuadra bases y cabezas, con espacio para HUD y etiquetas',()=>{
  for(const[w,h]of[[390,400],[430,400],[390,480],[390,560],[390,625],[430,650]]){
    const {control,proyectar}=general(w,h),puntos=proyectar(control);
    const top=Math.min(138,h*.22),bottom=Math.min(90,h*.14);
    assert(control.zoom>0 && control.zoom<1.44);
    for(const p of puntos){const x=(p.x+1)*w/2,y=(1-p.y)*h/2;assert(x>=30&&x<=w-30&&y>=top-1&&y<=h-bottom+1,`encuadre ${w}x${h}: ${x},${y}`);}
  }
});

test('Camino: los gestos limitan alejamiento, inclinación y desplazamiento sin mutar la vista',()=>{
  const {control}=general(390,625);
  const entrada={azimut:Math.PI*9,elevacion:-20,zoom:8,objetivo:[90,0,-90]},copia=JSON.parse(JSON.stringify(entrada));
  const c=limitarVistaCamino(entrada,escena.camara,control);
  assert.deepEqual(entrada,copia);assert.equal(c.azimut,entrada.azimut);
  assert(c.zoom<=Math.max(escena.camara.zoomExploracionMax,control.zoom));
  assert(c.elevacion+escena.camara.elevacionGrados*Math.PI/180>=35*Math.PI/180-1e-12);
  assert(Math.abs(c.objetivo[0]-control.objetivo[0])<=2.21 && Math.abs(c.objetivo[2]-control.objetivo[2])<=2.01);
  const detalle=limitarVistaCamino({azimut:0,elevacion:-19*Math.PI/180,zoom:.025,objetivo:[-5, .065, 0]},escena.camara,control);
  assert.equal(detalle.zoom,.025);assert(Math.abs(detalle.elevacion+19*Math.PI/180)<1e-12);
});

test('Camino: la niebla cubre el borde visible al girar, con profundidad de cámara correcta',()=>{
  const {control}=general(390,625),camera=new THREE.PerspectiveCamera();
  for(const angulo of [35,46,70])for(let az=0;az<360;az+=30){
    const c=limitarVistaCamino({...control,azimut:az*Math.PI/180,elevacion:(angulo-escena.camara.elevacionGrados)*Math.PI/180},escena.camara,control);
    motor.configurarCamara(camera,escena,390/625,c,mundo);motor.actualizarAtmosfera(mundo,escena,camera);
    const borde=motor.profundidadBordeVisible(mundo,camera);
    assert(mundo.niebla.near>=0 && mundo.niebla.near<mundo.niebla.far);
    if(Number.isFinite(borde))assert(mundo.niebla.far<borde,'el borde termina dentro de la niebla');
  }
});

test('Camino: océano continuo de dos triángulos y presupuesto de paisaje acotado',()=>{
  const mar=mundo.grupo.children[1].children.find(m=>m.geometry.type==='PlaneGeometry');
  assert(mar && mar.geometry.index.count===6 && mar.geometry.parameters.width===300);
  let tri=0;mundo.grupo.traverse(m=>{if(m.isMesh)tri+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;});
  assert(tri<480000,`paisaje: ${tri} triángulos`);
});
