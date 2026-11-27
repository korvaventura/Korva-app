import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { normalizarCheckpoints } from '../../services/mapa3d/journeyCore';
import { estadoDemo, controlDemo } from '../../services/mapa3d/demoCore';
import { configurarCamara, actualizarAtmosfera, posicionEnKm } from './construirMundo';

// All motion stays in the GL frame: no per-frame React state or projected native marker.
export default function DemoRecorrido({ mundo, escena, demoRef, progresoRef, controlRef, onAvance }) {
  const marcador = useRef(null);
  const pines = useRef([]);
  const alcanzados = useRef(new Map());
  const ultimaPublicacion = useRef(-Infinity);
  const checkpoints = useMemo(() => normalizarCheckpoints(demoRef.current.checkpoints, escena.distanciaKm)
    .map(cp => ({ ...cp, punto: posicionEnKm(mundo.datos, mundo.conv, cp.kmJourney, 0) })), [mundo, escena, demoRef]);
  const radio = Math.max(.015, escena.camara.distancia * .004);
  useFrame(({ camera, size }, delta) => {
    const demo = demoRef.current;
    if (!demo?.activo || demo.terminado || demo.pausado) return;
    const dt = Math.min(.25, Math.max(0, delta));
    demo.tiempo += dt;
    const estado = estadoDemo(demo.tiempo, demo.duracion, escena.distanciaKm);
    const paso = Math.max(.01, escena.distanciaKm / 500);
    const punto = posicionEnKm(mundo.datos, mundo.conv, estado.km, 0);
    const anterior = posicionEnKm(mundo.datos, mundo.conv, Math.max(0, estado.km - paso), 0);
    const siguiente = posicionEnKm(mundo.datos, mundo.conv, Math.min(escena.distanciaKm, estado.km + paso), 0);
    const destino = controlDemo({ estado, punto: punto.toArray(), anterior: anterior.toArray(), siguiente: siguiente.toArray(), camara: escena.camara, general: demo.general, control: controlRef.current, dt });
    controlRef.current = destino;
    progresoRef.current = { km: estado.km, animando: true };
    configurarCamara(camera, escena, size.width / Math.max(1, size.height), destino, mundo);
    actualizarAtmosfera(mundo, escena, camera);
    if (marcador.current) {
      marcador.current.position.copy(punto);
      marcador.current.position.y += radio * 1.5;
    }
    checkpoints.forEach((cp, i) => {
      const pin = pines.current[i];
      if (!pin) return;
      const alcanzado = cp.kmJourney <= estado.km + .001;
      if (alcanzado && !alcanzados.current.has(i)) alcanzados.current.set(i, demo.tiempo);
      const desde = demo.tiempo - (alcanzados.current.get(i) ?? -Infinity);
      const pulso = desde < .8 ? Math.sin(Math.PI * desde / .8) : 0;
      pin.scale.setScalar(1 + pulso * .65);
      pin.material.color.set(alcanzado ? '#FFB56B' : '#8DABBF');
      pin.material.opacity = alcanzado ? .85 : .35;
    });
    demo.terminado = estado.terminado;
    if (demo.tiempo - ultimaPublicacion.current >= .1 || estado.terminado || (estado.enMeta && !demo.enMeta)) {
      ultimaPublicacion.current = demo.tiempo;
      onAvance(estado);
    }
    demo.enMeta = estado.enMeta;
  }, -1);
  return (
    <group>
      <mesh ref={marcador} renderOrder={10}>
        <sphereGeometry args={[radio * 1.3, 12, 8]} />
        <meshBasicMaterial color="#FFFFFF" toneMapped={false} depthTest={false} />
      </mesh>
      {checkpoints.map((cp, i) => (
        <mesh key={cp.id || i} ref={pin => { pines.current[i] = pin; }} position={[cp.punto.x, cp.punto.y + radio, cp.punto.z]} renderOrder={9}>
          <sphereGeometry args={[radio, 10, 6]} />
          <meshBasicMaterial color="#8DABBF" transparent opacity={.35} toneMapped={false} depthTest={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
