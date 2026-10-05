import { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { colors } from '../theme/korvaTheme';

// Diorama premium del corredor RN3 Tolhuin -> Ushuaia.
// Coordenadas visuales relativas: orientadas a reproducir el corredor y sus hitos,
// no a reemplazar un mapa de navegación.
const RUTA=[
 [2.78,-1.02],[2.67,-0.88],[2.54,-0.76],[2.42,-0.61],[2.28,-0.50],
 [2.10,-0.44],[1.92,-0.42],[1.74,-0.33],[1.56,-0.24],[1.38,-0.17],
 [1.20,-0.10],[1.03,0.00],[0.88,0.13],[0.72,0.24],[0.56,0.31],
 [0.39,0.37],[0.22,0.50],[0.04,0.58],[-0.15,0.61],[-0.35,0.66],
 [-0.56,0.75],[-0.78,0.84],[-1.01,0.90],[-1.24,0.98],[-1.48,1.04],
 [-1.72,1.12],[-1.96,1.20],[-2.20,1.29],[-2.45,1.38],[-2.70,1.47]
];
const CP_T={tolhuin:0,lago_fagnano:.24,paso_garibaldi:.50,monte_olivia:.79,ushuaia:1};
const gauss=(x,z,cx,cz,sx,sz,h)=>Math.exp(-(((x-cx)/sx)**2+((z-cz)/sz)**2))*h;
const elev=(x,z)=>{
 const spine=gauss(x,z,-.45,.48,2.15,.54,.78)+gauss(x,z,-1.75,.98,1.18,.48,.52)+gauss(x,z,.72,.06,1.05,.48,.42);
 const cuts=-gauss(x,z,.95,-.42,1.8,.35,.18)-gauss(x,z,-2.1,1.55,1.5,.28,.13);
 const micro=Math.sin(x*3.1+z*4.2)*.045+Math.cos(x*5.2-z*2.8)*.026;
 return Math.max(-.12,spine+cuts+micro);
};
const routePoints=()=>RUTA.map(([x,z])=>new THREE.Vector3(x,elev(x,z)+.055,z));

function Terrain(){
 const g=useMemo(()=>{const geo=new THREE.PlaneGeometry(7.6,5.1,76,50),p=geo.attributes.position;
   for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,elev(x,y));}
   p.needsUpdate=true;geo.computeVertexNormals();return geo;},[]);
 return <mesh geometry={g} rotation={[-Math.PI/2,0,0]} position={[0,-.34,0]} receiveShadow>
   <meshStandardMaterial color="#29483D" roughness={.96} metalness={.01}/>
 </mesh>;
}
function Water({position,scale,rotation=0}){
 return <mesh position={position} rotation={[-Math.PI/2,0,rotation]} scale={scale}>
   <circleGeometry args={[1,64]}/><meshStandardMaterial color="#0E456B" roughness={.2} metalness={.28}/>
 </mesh>;
}
function Ridge({x,z,s=1,rot=0}){
 return <group position={[x,elev(x,z)-.18,z]} rotation={[0,rot,0]} scale={s}>
   <mesh castShadow><coneGeometry args={[.42,.88,9]}/><meshStandardMaterial color="#4A6259" roughness={.9}/></mesh>
   <mesh position={[0,.28,0]} scale={[.58,.48,.58]}><coneGeometry args={[.42,.88,9]}/><meshStandardMaterial color="#DCE8E6" roughness={.82}/></mesh>
 </group>;
}
function Route({progress}){
 const curve=useMemo(()=>new THREE.CatmullRomCurve3(routePoints(),false,'catmullrom',.16),[]);
 const shadow=useMemo(()=>new THREE.TubeGeometry(curve,220,.052,8,false),[curve]);
 const base=useMemo(()=>new THREE.TubeGeometry(curve,220,.027,8,false),[curve]);
 const done=useMemo(()=>{const ps=curve.getPoints(220),n=Math.max(2,Math.floor((ps.length-1)*Math.max(.01,Math.min(1,progress)))+1);
   return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ps.slice(0,n),false,'catmullrom',.16),Math.max(16,n),.041,8,false);},[curve,progress]);
 return <><mesh geometry={shadow} position={[0,-.012,0]}><meshBasicMaterial color="#02070C" transparent opacity={.6}/></mesh>
   <mesh geometry={base}><meshBasicMaterial color="#7D95A6" transparent opacity={.68} toneMapped={false}/></mesh>
   {progress>0&&<mesh geometry={done}><meshBasicMaterial color={colors.brandOrange} toneMapped={false}/></mesh>}</>;
}
function Marker({cp,index,total,progress,selected,onSelect}){
 const t=CP_T[cp.id]??(total<=1?0:index/(total-1));
 const p=useMemo(()=>new THREE.CatmullRomCurve3(routePoints(),false,'catmullrom',.16).getPointAt(t),[t]);
 const ring=useRef(null);
 useFrame(({clock})=>{if(ring.current&&selected)ring.current.scale.setScalar(1+Math.sin(clock.elapsedTime*3.5)*.15);});
 const unlocked=progress+.003>=t;
 const press=e=>{e?.stopPropagation?.();onSelect?.(cp);};
 return <group position={[p.x,p.y+.08,p.z]}>
   <mesh scale={3.5} onClick={press} onPointerUp={press}><sphereGeometry args={[.09,12,12]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>
   <mesh><sphereGeometry args={[.085,20,20]}/><meshBasicMaterial color={unlocked?colors.brandOrange:'#73899A'} toneMapped={false}/></mesh>
   <mesh ref={ring} rotation={[-Math.PI/2,0,0]} scale={selected?1.3:1}><ringGeometry args={[.12,.155,32]}/><meshBasicMaterial color={selected?'#FFF':unlocked?'#FFB078':'#9DB1C0'} transparent opacity={selected?.95:.38} side={THREE.DoubleSide} toneMapped={false}/></mesh>
 </group>;
}
function Scene({checkpoints,progress,selectedId,onSelect}){
 return <>
   <perspectiveCamera makeDefault position={[.25,5.15,5.35]} rotation={[-.77,0,0]} fov={40} near={.1} far={45}/>
   <hemisphereLight args={['#BCE4F5','#10251F',1.25]}/>
   <directionalLight castShadow color="#FFF0D2" intensity={2.25} position={[-4,7,4]}/>
   <directionalLight color="#77B9E7" intensity={.55} position={[5,2,-4]}/>
   <fog attach="fog" args={['#091725',7.8,12]}/>
   <Terrain/>
   <Water position={[1.55,-.255,-.77]} scale={[1.72,.38,1]} rotation={-.12}/>
   <Water position={[.42,-.245,-.14]} scale={[.74,.19,1]} rotation={-.26}/>
   <Water position={[-2.12,-.25,1.77]} scale={[1.85,.34,1]} rotation={.10}/>
   <Ridge x={-2.10} z={.93} s={1.04}/><Ridge x={-1.67} z={.74} s={.82} rot={.2}/>
   <Ridge x={-1.24} z={.60} s={1.13}/><Ridge x={-.78} z={.39} s={.93} rot={-.18}/>
   <Ridge x={-.32} z={.25} s={.78}/><Ridge x={.10} z={.12} s={.62}/>
   <Route progress={progress}/>
   {checkpoints.map((cp,i)=><Marker key={cp.id} cp={cp} index={i} total={checkpoints.length} progress={progress} selected={cp.id===selectedId} onSelect={onSelect}/>)}
 </>;
}
export default function MapaRecorrido3D({checkpoints=[],progreso=0,seleccionadoId,onSelect}){
 return <View style={styles.wrap}><Canvas shadows style={styles.canvas} gl={{alpha:true,antialias:true}} dpr={1.6} onCreated={({gl})=>{gl.setClearColor('#091725',1);gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.15;}}>
   <Scene checkpoints={checkpoints} progress={progreso} selectedId={seleccionadoId} onSelect={onSelect}/>
 </Canvas><View pointerEvents="none" style={styles.border}/></View>;
}
const styles=StyleSheet.create({wrap:{width:'100%',height:360,overflow:'hidden',borderRadius:18,backgroundColor:colors.backgroundDeep},canvas:{flex:1},border:{...StyleSheet.absoluteFillObject,borderWidth:1,borderColor:colors.borderSoft,borderRadius:18}});
