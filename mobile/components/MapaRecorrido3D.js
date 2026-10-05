import { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { colors } from '../theme/korvaTheme';

// Diorama geográfico Fin del Mundo: Tolhuin -> Fagnano -> Garibaldi -> Olivia -> Ushuaia.
// La forma sigue el corredor real de RN3; no pretende ser cartografía de navegación.
const RUTA = [
  [2.62,-0.92],[2.50,-0.78],[2.40,-0.64],[2.28,-0.50],[2.08,-0.43],
  [1.88,-0.46],[1.70,-0.36],[1.52,-0.26],[1.34,-0.18],[1.16,-0.14],
  [0.98,-0.04],[0.80,0.08],[0.64,0.17],[0.48,0.13],[0.34,0.23],
  [0.22,0.39],[0.08,0.50],[-0.08,0.55],[-0.28,0.52],[-0.46,0.62],
  [-0.64,0.72],[-0.84,0.75],[-1.04,0.84],[-1.26,0.91],[-1.48,0.98],
  [-1.70,1.08],[-1.94,1.13],[-2.18,1.20],[-2.42,1.27],[-2.62,1.34],
];

const CHECKPOINT_T = {
  tolhuin: 0.00,
  lago_fagnano: 0.24,
  paso_garibaldi: 0.50,
  monte_olivia: 0.78,
  ushuaia: 1.00,
};

const gauss=(x,z,cx,cz,sx,sz,h)=>Math.exp(-(((x-cx)/sx)**2+((z-cz)/sz)**2))*h;
const altura=(x,z)=>{
  const cordillera =
    gauss(x,z,-0.55,0.45,1.55,0.58,0.78)+
    gauss(x,z,-1.55,0.85,1.05,0.52,0.62)+
    gauss(x,z,0.35,0.30,0.82,0.48,0.48);
  const ruido=Math.sin(x*3.2+z*2.1)*0.055+Math.cos(x*4.8-z*2.7)*0.035;
  const norte=gauss(x,z,2.0,-0.55,1.4,0.8,0.12);
  return Math.max(-0.08,cordillera+norte+ruido);
};
const puntos=()=>RUTA.map(([x,z])=>new THREE.Vector3(x,altura(x,z)+0.055,z));

function Terreno(){
  const g=useMemo(()=>{
    const geo=new THREE.PlaneGeometry(7.3,4.7,64,42);
    const p=geo.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,altura(x,y));}
    p.needsUpdate=true; geo.computeVertexNormals(); return geo;
  },[]);
  return <mesh geometry={g} rotation={[-Math.PI/2,0,0]} position={[0,-0.34,0]}>
    <meshStandardMaterial color="#183B34" roughness={0.96} metalness={0.01}/>
  </mesh>;
}

function Lago({position,scale,rotation=0,color='#123F63'}){
  return <mesh position={position} rotation={[-Math.PI/2,0,rotation]} scale={scale}>
    <circleGeometry args={[1,48]}/><meshStandardMaterial color={color} roughness={0.28} metalness={0.18}/>
  </mesh>;
}

function Pico({x,z,s=1}){
  const y=altura(x,z)-0.16;
  return <group position={[x,y,z]} scale={s}>
    <mesh><coneGeometry args={[0.34,0.72,7]}/><meshStandardMaterial color="#496257" roughness={0.92}/></mesh>
    <mesh position={[0,0.23,0]} scale={[0.58,0.48,0.58]}><coneGeometry args={[0.34,0.72,7]}/><meshStandardMaterial color="#DCE8E8" roughness={0.88}/></mesh>
  </group>;
}

function Ruta({progreso}){
  const curve=useMemo(()=>new THREE.CatmullRomCurve3(puntos(),false,'catmullrom',0.18),[]);
  const base=useMemo(()=>new THREE.TubeGeometry(curve,180,0.022,8,false),[curve]);
  const done=useMemo(()=>{
    const ps=curve.getPoints(180);
    const n=Math.max(2,Math.floor((ps.length-1)*Math.max(0.012,Math.min(1,progreso)))+1);
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ps.slice(0,n),false,'catmullrom',0.18),Math.max(12,n),0.043,8,false);
  },[curve,progreso]);
  return <group>
    <mesh geometry={base}><meshBasicMaterial color="#91A8B8" transparent opacity={0.56} toneMapped={false}/></mesh>
    {progreso>0&&<mesh geometry={done}><meshBasicMaterial color={colors.brandOrange} toneMapped={false}/></mesh>}
  </group>;
}

function Punto({cp,index,total,progreso,seleccionado,onSelect}){
  const t=CHECKPOINT_T[cp.id] ?? (total<=1?0:index/(total-1));
  const p=useMemo(()=>new THREE.CatmullRomCurve3(puntos(),false,'catmullrom',0.18).getPointAt(t),[t]);
  const halo=useRef(null);
  useFrame(({clock})=>{if(halo.current&&seleccionado)halo.current.scale.setScalar(1+Math.sin(clock.elapsedTime*3.4)*0.18);});
  const press=e=>{e?.stopPropagation?.();onSelect?.(cp);};
  const desbloqueado=progreso+0.002>=t;
  return <group position={[p.x,p.y+0.075,p.z]}>
    <mesh scale={3.2} onClick={press} onPointerUp={press}><sphereGeometry args={[0.09,14,14]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>
    <mesh><sphereGeometry args={[0.082,18,18]}/><meshBasicMaterial color={desbloqueado?colors.brandOrange:'#647B8C'} toneMapped={false}/></mesh>
    <mesh ref={halo} rotation={[-Math.PI/2,0,0]} scale={seleccionado?1.25:1}><ringGeometry args={[0.115,0.145,30]}/><meshBasicMaterial color={seleccionado?'#FFFFFF':(desbloqueado?'#FFB078':'#8BA2B4')} transparent opacity={seleccionado?0.95:0.38} side={THREE.DoubleSide} toneMapped={false}/></mesh>
  </group>;
}

function Escena({checkpoints,progreso,seleccionadoId,onSelect}){
 return <>
   <perspectiveCamera makeDefault position={[0.1,4.45,4.85]} rotation={[-0.73,0,0]} fov={43} near={0.1} far={40}/>
   <ambientLight color="#A9D7E8" intensity={0.78}/>
   <directionalLight color="#FFF4DD" intensity={2.15} position={[-3.5,6,3]}/>
   <directionalLight color="#7EB7E0" intensity={0.5} position={[4,2,-3]}/>
   <fog attach="fog" args={['#091725',6.8,11]}/>
   <Terreno/>
   <Lago position={[1.45,-0.245,-0.78]} scale={[1.75,0.42,1]} rotation={-0.10}/>
   <Lago position={[0.36,-0.235,-0.06]} scale={[0.70,0.22,1]} rotation={-0.25} color="#174C70"/>
   <Lago position={[-2.05,-0.24,1.72]} scale={[1.75,0.38,1]} rotation={0.08} color="#0E4268"/>
   <Pico x={-1.85} z={0.72} s={1.08}/><Pico x={-1.30} z={0.56} s={0.86}/>
   <Pico x={-0.86} z={0.30} s={1.15}/><Pico x={-0.35} z={0.14} s={0.94}/>
   <Pico x={0.18} z={0.03} s={0.72}/>
   <Ruta progreso={progreso}/>
   {checkpoints.map((cp,i)=><Punto key={cp.id} cp={cp} index={i} total={checkpoints.length} progreso={progreso} seleccionado={cp.id===seleccionadoId} onSelect={onSelect}/>)}
 </>;
}

export default function MapaRecorrido3D({checkpoints=[],progreso=0,seleccionadoId,onSelect}){
 return <View style={styles.wrap}>
   <Canvas style={styles.canvas} gl={{alpha:true,antialias:true}} dpr={1.5} onCreated={({gl})=>gl.setClearColor('#091725',1)}>
     <Escena checkpoints={checkpoints} progreso={progreso} seleccionadoId={seleccionadoId} onSelect={onSelect}/>
   </Canvas>
   <View pointerEvents="none" style={styles.borde}/>
 </View>;
}
const styles=StyleSheet.create({
 wrap:{width:'100%',height:330,overflow:'hidden',borderRadius:18,backgroundColor:colors.backgroundDeep},
 canvas:{flex:1},
 borde:{...StyleSheet.absoluteFillObject,borderWidth:1,borderColor:colors.borderSoft,borderRadius:18},
});
