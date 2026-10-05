import { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { colors } from '../theme/korvaTheme';

const RUTA = [[-2.55,-0.72],[-2.22,-0.60],[-1.86,-0.46],[-1.45,-0.34],[-1.02,-0.18],[-0.62,-0.04],[-0.28,0.16],[0.08,0.06],[0.43,0.29],[0.83,0.48],[1.28,0.62],[1.72,0.77],[2.18,0.88]];
const altura=(x,z)=>Math.max(-0.04,Math.exp(-Math.pow(x+0.35,2)*0.42)*0.42+Math.exp(-Math.pow(x-1.25,2)*0.9)*0.28+Math.sin(x*1.55+z*2.2)*0.08+Math.cos(x*2.5-z)*0.045);
const puntos=()=>RUTA.map(([x,z])=>new THREE.Vector3(x,altura(x,z)+0.04,z));

function Terreno(){
  const g=useMemo(()=>{const geo=new THREE.PlaneGeometry(6.8,4.2,46,30);const p=geo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,altura(x,y));}p.needsUpdate=true;geo.computeVertexNormals();return geo;},[]);
  return <mesh geometry={g} rotation={[-Math.PI/2,0,0]} position={[0,-0.45,0]}><meshStandardMaterial color="#17334A" roughness={0.94} metalness={0.02}/></mesh>;
}
function Ruta({progreso}){
  const curve=useMemo(()=>new THREE.CatmullRomCurve3(puntos()),[]);
  const base=useMemo(()=>new THREE.TubeGeometry(curve,96,0.025,8,false),[curve]);
  const done=useMemo(()=>{const ps=curve.getPoints(96);const n=Math.max(2,Math.floor((ps.length-1)*Math.max(0.015,Math.min(1,progreso)))+1);return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ps.slice(0,n)),64,0.038,8,false);},[curve,progreso]);
  return <><mesh geometry={base}><meshBasicMaterial color="#52708A" transparent opacity={0.58} toneMapped={false}/></mesh>{progreso>0&&<mesh geometry={done}><meshBasicMaterial color={colors.brandOrange} toneMapped={false}/></mesh>}</>;
}
function Punto({cp,index,total,progreso,seleccionado,onSelect}){
  const p=useMemo(()=>new THREE.CatmullRomCurve3(puntos()).getPointAt(total<=1?0:index/(total-1)),[index,total]);
  const halo=useRef(null);
  useFrame(({clock})=>{if(halo.current&&seleccionado)halo.current.scale.setScalar(1+Math.sin(clock.elapsedTime*3)*0.16);});
  const press=e=>{e?.stopPropagation?.();onSelect?.(cp);};
  const desbloqueado=progreso>=index/Math.max(1,total-1);
  return <group position={[p.x,p.y+0.07,p.z]}>
    <mesh scale={2.8} onClick={press} onPointerUp={press}><sphereGeometry args={[0.09,14,14]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>
    <mesh><sphereGeometry args={[0.075,18,18]}/><meshBasicMaterial color={desbloqueado?colors.brandOrange:'#637B91'} toneMapped={false}/></mesh>
    <mesh ref={halo} rotation={[-Math.PI/2,0,0]} scale={seleccionado?1.2:1}><ringGeometry args={[0.10,0.125,28]}/><meshBasicMaterial color={seleccionado?'#FFFFFF':'#8FB4D2'} transparent opacity={seleccionado?0.82:0.28} side={THREE.DoubleSide} toneMapped={false}/></mesh>
  </group>;
}
function Escena({checkpoints,progreso,seleccionadoId,onSelect}){
 return <><perspectiveCamera makeDefault position={[0.1,3.7,5.25]} rotation={[-0.57,0,0]} fov={42} near={0.1} far={40}/>
 <ambientLight color="#8CCAF0" intensity={0.82}/><directionalLight color="#E6F5FF" intensity={1.75} position={[-3,5,4]}/><pointLight color="#F36B0A" intensity={0.42} distance={9} position={[2.2,2,2]}/><fog attach="fog" args={['#091725',5.8,10]}/>
 <Terreno/><Ruta progreso={progreso}/>{checkpoints.map((cp,i)=><Punto key={cp.id} cp={cp} index={i} total={checkpoints.length} progreso={progreso} seleccionado={cp.id===seleccionadoId} onSelect={onSelect}/>)}</>;
}
export default function MapaRecorrido3D({checkpoints=[],progreso=0,seleccionadoId,onSelect}){
 return <View style={styles.wrap}><Canvas style={styles.canvas} gl={{alpha:true,antialias:true}} dpr={1.35} onCreated={({gl})=>gl.setClearColor('#091725',1)}><Escena checkpoints={checkpoints} progreso={progreso} seleccionadoId={seleccionadoId} onSelect={onSelect}/></Canvas><View pointerEvents="none" style={styles.borde}/></View>;
}
const styles=StyleSheet.create({wrap:{width:'100%',height:280,overflow:'hidden',borderRadius:18,backgroundColor:colors.backgroundDeep},canvas:{flex:1},borde:{...StyleSheet.absoluteFillObject,borderWidth:1,borderColor:colors.borderSoft,borderRadius:18}});
