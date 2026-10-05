import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import { useRef } from 'react';

const landGeoJson = require('../assets/ne_110m_land.json');
const DEG = Math.PI / 180;

function latLonToPosition(lat, lon, radius = 1.018) {
  const phi = (90 - Number(lat)) * DEG;
  const theta = (Number(lon) + 180) * DEG;
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

function ringsFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates || [];
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates || []).flat();
  return [];
}

function LandLines() {
  const positions = useMemo(() => {
    const values = [];
    for (const feature of landGeoJson.features || []) {
      for (const ring of ringsFromGeometry(feature.geometry)) {
        for (let i = 1; i < ring.length; i += 1) {
          const [lonA, latA] = ring[i - 1];
          const [lonB, latB] = ring[i];
          if (Math.abs(lonA - lonB) > 180) continue;
          values.push(...latLonToPosition(latA, lonA), ...latLonToPosition(latB, lonB));
        }
      }
    }
    return new Float32Array(values);
  }, []);

  return (
    <lineSegments renderOrder={3}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#8ACBF1" transparent opacity={0.86} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

function Marker({ destino, onSelect, seleccionado }) {
  const haloRef = useRef(null);
  const conquistado = destino.estado === 'conquistado';
  const enCurso = destino.estado === 'en_curso';
  const color = conquistado ? '#FC4C02' : enCurso ? '#58A6E7' : '#6B8AA5';
  const position = useMemo(
    () => latLonToPosition(destino.latitude, destino.longitude, 1.055),
    [destino.latitude, destino.longitude],
  );

  useFrame(({ clock }) => {
    if (!haloRef.current) return;
    const pulse = conquistado ? 1 + Math.sin(clock.elapsedTime * 2.6) * 0.12 : 1;
    haloRef.current.scale.setScalar((conquistado ? 2.45 : 1.95) * pulse);
  });

  const select = (event) => {
    event?.stopPropagation?.();
    onSelect?.(destino);
  };

  return (
    <group position={position}>
      <mesh scale={3.6} onClick={select} onPointerUp={select}>
        <sphereGeometry args={[0.048, 18, 18]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[conquistado ? 0.038 : 0.034, 20, 20]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={haloRef} scale={conquistado ? 2.45 : 1.95}>
        <sphereGeometry args={[0.04, 18, 18]} />
        <meshBasicMaterial color={color} transparent opacity={conquistado ? 0.2 : 0.1} depthWrite={false} toneMapped={false} />
      </mesh>
      {seleccionado && (
        <mesh scale={1.65}>
          <ringGeometry args={[0.045, 0.057, 32]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.72} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function GlobeScene({ destinos, giroX, giroY, zoom, onSelect, seleccionadoId }) {
  const worldScale = 1.72 * Math.max(0.72, Math.min(2.35, zoom));

  return (
    <>
      <perspectiveCamera makeDefault position={[0, 0.02, 4.25]} fov={34} near={0.1} far={100} />
      <ambientLight color="#8BC7EF" intensity={0.58} />
      <directionalLight color="#C5EAFF" intensity={1.7} position={[-2.5, 2.2, 4.5]} />
      <pointLight color="#FF6B20" intensity={0.38} distance={8} position={[3, 1.5, 3]} />

      <group rotation={[giroX, giroY, 0]} scale={worldScale}>
        <mesh>
          <sphereGeometry args={[1, 96, 96]} />
          <meshStandardMaterial color="#061A29" emissive="#03111C" emissiveIntensity={0.5} roughness={0.8} metalness={0.04} />
        </mesh>

        <LandLines />

        <mesh scale={1.035} renderOrder={1}>
          <sphereGeometry args={[1, 72, 72]} />
          <meshBasicMaterial color="#55B5ED" transparent opacity={0.055} side={1} depthWrite={false} toneMapped={false} />
        </mesh>

        <mesh scale={1.085} renderOrder={0}>
          <sphereGeometry args={[1, 64, 64]} />
          <meshBasicMaterial color="#4CA6DF" transparent opacity={0.025} side={1} depthWrite={false} toneMapped={false} />
        </mesh>

        {destinos.map((destino) => (
          <Marker key={destino.id} destino={destino} onSelect={onSelect} seleccionado={destino.id === seleccionadoId} />
        ))}
      </group>
    </>
  );
}

export default function KorvaGlobe3D({ destinos = [], giroX = -0.08, giroY = 0, zoom = 1, onSelect, seleccionadoId }) {
  return (
    <View style={styles.wrap}>
      <Canvas
        style={styles.canvas}
        gl={{ alpha: true, antialias: true }}
        dpr={1.5}
        onCreated={({ gl }) => gl.setClearColor('#000000', 0)}
      >
        <GlobeScene destinos={destinos} giroX={giroX} giroY={giroY} zoom={zoom} onSelect={onSelect} seleccionadoId={seleccionadoId} />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: '100%' },
  canvas: { flex: 1 },
});
