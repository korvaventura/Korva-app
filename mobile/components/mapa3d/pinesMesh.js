import * as THREE from 'three';

// Pines y recorrido comparten cámara y frame GL: no pasan por el bridge nativo.
export function crearPinesMesh(puntos, color) {
  const grupo=new THREE.Group();
  const disco=new THREE.CircleGeometry(1,16);
  const materiales=[],geometrias=[];
  const material=(tinte)=>{
    const m=new THREE.MeshBasicMaterial({color:tinte,depthTest:false,depthWrite:false,toneMapped:false,fog:false});
    materiales.push(m);return m;
  };
  const pines=[...puntos,{id:'__actual',actual:true,km:0,base:new THREE.Vector3(),cabeza:new THREE.Vector3()}].map(p=>{
    const borde=new THREE.Mesh(disco,material('#FFFFFF'));
    const centro=new THREE.Mesh(disco,material(color));
    borde.position.copy(p.cabeza);centro.position.copy(p.cabeza);
    borde.renderOrder=12;centro.renderOrder=13;
    const geo=new THREE.BufferGeometry().setFromPoints([p.base,p.cabeza]);geometrias.push(geo);
    const talloMaterial=new THREE.LineBasicMaterial({color:'#B8CFDF',depthTest:false,depthWrite:false,transparent:true,opacity:.7,toneMapped:false,fog:false});materiales.push(talloMaterial);
    const tallo=new THREE.Line(geo,talloMaterial);tallo.renderOrder=10;
    grupo.add(tallo,borde,centro);
    return {...p,borde,centro,tallo};
  });
  const local=new THREE.Vector3();
  return {
    grupo,
    actualizar(camera,alto,km,seleccionadoId,actual=null) {
      for(const p of pines) {
        if(p.actual && actual){p.cabeza.copy(actual);p.borde.position.copy(actual);p.centro.position.copy(actual);}
        const profundidad=local.copy(p.cabeza).applyMatrix4(camera.matrixWorldInverse).z;
        const visible=(!p.actual || !!actual) && profundidad < -camera.near && profundidad > -camera.far;
        p.borde.visible=p.centro.visible=visible;p.tallo.visible=visible && !p.actual;
        if(!visible)continue;
        const seleccionado=p.id===seleccionadoId;
        const radio=(p.actual?6:seleccionado?11:8)*2*(-profundidad)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(1,alto);
        p.borde.quaternion.copy(camera.quaternion);p.centro.quaternion.copy(camera.quaternion);
        p.borde.scale.setScalar(radio);p.centro.scale.setScalar(radio*(seleccionado?.65:.76));
        const conquistado=p.km<=km+.01;
        p.centro.material.color.set(p.actual?'#FFFFFF':conquistado?color:'#30485B');
        p.borde.material.color.set(p.actual?color:conquistado||seleccionado?'#FFFFFF':'#9FB4C6');
        p.tallo.material.color.set(conquistado?color:'#B8CFDF');
      }
    },
    dispose() {disco.dispose();geometrias.forEach(g=>g.dispose());materiales.forEach(m=>m.dispose());},
  };
}
