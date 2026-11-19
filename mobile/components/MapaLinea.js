import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import {
  rutaLinea, puntoEnRuta, direccionEnRuta, radioDeRuta, cintaRuta, lineasDeTerreno, proximoHito, camaraLinea, clamp,
  marcasKm, hitoCruzado,
} from '../services/mapa3d/lineaCore';

// Mapa "Línea": oscuro, sólo líneas y luz. La ruta pendiente en gris, lo hecho
// en naranja, el corredor siempre abajo al centro con la ruta yendo hacia
// arriba y la cámara detrás. Liviano para usarlo en movimiento.
const COLOR = {
  fondo: '#04101A', grilla: '#16354D', curvas: '#16405A', costa: '#2E6E95',
  pendiente: '#3A5568', hecho: '#FC4C02', hechoAntes: '#A8400F', marcas: '#4A6A82', hito: '#4F7590', proximo: '#8ACBF1',
};
const cacheLineas = new Map();

function datosLinea(escena, horneado, checkpoints) {
  if (!cacheLineas.has(escena.id)) {
    const ruta = rutaLinea(escena, horneado, checkpoints);
    const radio = radioDeRuta(ruta.puntos);
    cacheLineas.set(escena.id, { ...ruta, radio, terreno: null });
  }
  return cacheLineas.get(escena.id);
}

function Segmentos({ datos, color, opacidad }) {
  const geo = useMemo(() => {
    const pos = new Float32Array((datos.length / 4) * 6);
    for (let i = 0, k = 0; i < datos.length; i += 4) {
      pos[k++] = datos[i]; pos[k++] = 0; pos[k++] = datos[i + 1];
      pos[k++] = datos[i + 2]; pos[k++] = 0; pos[k++] = datos[i + 3];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [datos]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (!datos.length) return null;
  return (
    <lineSegments geometry={geo} renderOrder={1}>
      <lineBasicMaterial color={color} transparent opacity={opacidad} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

function Grilla({ base, radio, paso }) {
  const datos = useMemo(() => {
    const ext = radio * 1.8 + paso * 8;
    const x0 = Math.floor((base.x - ext) / paso) * paso; const x1 = base.x + ext;
    const z0 = Math.floor((base.z - ext) / paso) * paso; const z1 = base.z + ext;
    const out = [];
    for (let x = x0; x <= x1; x += paso) out.push(x, z0, x, z1);
    for (let z = z0; z <= z1; z += paso) out.push(x0, z, x1, z);
    return new Float32Array(out);
  }, [base.x, base.z, radio, paso]);
  return <Segmentos datos={datos} color={COLOR.grilla} opacidad={0.9} />;
}

function Cinta({ puntos, desde, hasta, ancho, color, opacidad = 1, orden = 2, aditivo = false }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cintaRuta(puntos, desde, hasta, ancho), 3));
    return g;
  }, [puntos, desde, hasta, ancho]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} renderOrder={orden} position={[0, 0.0005 * orden, 0]}>
      <meshBasicMaterial color={color} transparent={opacidad < 1 || aditivo} opacity={opacidad} depthWrite={false} toneMapped={false}
        side={THREE.DoubleSide} blending={aditivo ? THREE.AdditiveBlending : THREE.NormalBlending} />
    </mesh>
  );
}

function Disco({ x, z, radio, color, opacidad = 1, orden = 5, anillo = false }) {
  return (
    <mesh position={[x, 0.002 * orden, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={orden}>
      {anillo ? <ringGeometry args={[radio * 0.72, radio, 40]} /> : <circleGeometry args={[radio, 32]} />}
      <meshBasicMaterial color={color} transparent opacity={opacidad} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

// Cámara y marcador se mueven en cada cuadro, sin re-render de React.
function Escena({ datos, kmObjetivoRef, zoomRef, giroRef, distanciaBase, etiquetasRef, hitos, siguiente, focoRef, ondaRef, kmHoyRef }) {
  const { camera, size } = useThree();
  const estado = useRef({ km: kmObjetivoRef.current, pos: null, mira: null, ultimaEtiqueta: 0 });
  const marcador = useRef(null);
  const halo = useRef(null);
  const onda = useRef(null);
  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, dt) => {
    const e = estado.current;
    const a = 1 - Math.exp(-Math.min(0.1, dt) * 2.5);
    e.km += (kmObjetivoRef.current - e.km) * a;
    const corredor = puntoEnRuta(datos.puntos, e.km);
    // Al tocar "Próximo hito" la cámara mira ese hito unos segundos y vuelve.
    const foco = focoRef.current && Date.now() < focoRef.current.hasta ? focoRef.current : null;
    const p = foco ? { x: foco.x, z: foco.z } : corredor;
    const dir0 = direccionEnRuta(datos.puntos, e.km, Math.max(0.05, datos.puntos[datos.puntos.length - 1].km * 0.02));
    const g = giroRef.current;
    const dir = { dx: dir0.dx * Math.cos(g) - dir0.dz * Math.sin(g), dz: dir0.dx * Math.sin(g) + dir0.dz * Math.cos(g) };
    const d = distanciaBase * zoomRef.current;
    const cam = camaraLinea(p, dir, d);
    if (!e.pos) { e.pos = new THREE.Vector3(...cam.posicion); e.mira = new THREE.Vector3(...cam.mira); }
    e.pos.lerp(v.set(...cam.posicion), a);
    e.mira.lerp(v.set(...cam.mira), a);
    camera.position.copy(e.pos);
    camera.lookAt(e.mira);
    camera.near = d * 0.02; camera.far = d * 40; camera.updateProjectionMatrix();
    if (marcador.current) { marcador.current.position.set(corredor.x, 0.02, corredor.z); marcador.current.scale.setScalar(d * 0.022); }
    // Onda al alcanzar un hito.
    if (onda.current) {
      const o = ondaRef.current;
      const t = o ? (Date.now() - o.t0) / 1400 : 1;
      onda.current.visible = t < 1;
      if (t < 1) {
        onda.current.position.set(o.x, 0.03, o.z);
        onda.current.scale.setScalar(d * (0.03 + t * 0.22));
        onda.current.material.opacity = 0.9 * (1 - t);
      }
    }
    if (halo.current) {
      const s = 1 + ((clock.elapsedTime * 0.8) % 1) * 1.6;
      halo.current.scale.setScalar(s); halo.current.material.opacity = 0.35 * (1 - (s - 1) / 1.6);
    }
    // Etiquetas de hitos proyectadas a pantalla, ~8 veces por segundo.
    if (clock.elapsedTime - e.ultimaEtiqueta > 0.12) {
      e.ultimaEtiqueta = clock.elapsedTime;
      const candidatas = [];
      for (const h of hitos) {
        v.set(h.x, 0, h.z).project(camera);
        if (v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1) {
          candidatas.push({ id: h.id, nombre: h.nombre, x: (v.x + 1) / 2 * size.width, y: (1 - v.y) / 2 * size.height, proximo: h.id === siguiente?.id });
        }
      }
      if (kmHoyRef.current > 0.005) {
        v.set(corredor.x, 0, corredor.z).project(camera);
        const hoy = kmHoyRef.current;
        candidatas.push({ id: 'hoy', hoy: true, nombre: `+${(hoy < 10 ? hoy.toFixed(1) : Math.round(hoy)).toString().replace('.', ',')} km hoy`,
          x: (v.x + 1) / 2 * size.width, y: (1 - v.y) / 2 * size.height + 6 });
      }
      etiquetasRef.current = elegirEtiquetas(candidatas, size.height);
    }
  });

  return (
    <>
    <mesh ref={onda} rotation={[-Math.PI / 2, 0, 0]} renderOrder={11} visible={false}>
      <ringGeometry args={[0.85, 1, 48]} />
      <meshBasicMaterial color={COLOR.hecho} transparent opacity={0} depthWrite={false} depthTest={false} toneMapped={false} fog={false} />
    </mesh>
    <group ref={marcador}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={9}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#FFFFFF" depthWrite={false} depthTest={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} renderOrder={10}>
        <circleGeometry args={[0.72, 32]} />
        <meshBasicMaterial color={COLOR.hecho} depthWrite={false} depthTest={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} renderOrder={8}>
        <ringGeometry args={[1.1, 1.6, 40]} />
        <meshBasicMaterial color={COLOR.hecho} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
    </>
  );
}

// Etiquetas sin amontonarse: el próximo hito siempre; el resto sólo si no
// está pegado al horizonte y no se pisa con otra ya puesta.
function elegirEtiquetas(candidatas, alto) {
  const prioridad = (c) => (c.hoy ? 2 : c.proximo ? 1 : 0);
  const orden = [...candidatas].sort((a, b) => (prioridad(b) - prioridad(a)) || (b.y - a.y));
  const puestas = [];
  for (const c of orden) {
    if (!c.proximo && !c.hoy && c.y < alto * 0.24) continue;
    const ancho = Math.min(150, c.nombre.length * (c.proximo || c.hoy ? 7.5 : 6.5));
    const caja = { x0: c.x + 10, x1: c.x + 10 + ancho, y0: c.y - 10, y1: c.y + 8 };
    if (puestas.some((p) => caja.x0 < p.caja.x1 + 6 && caja.x1 + 6 > p.caja.x0 && caja.y0 < p.caja.y1 + 4 && caja.y1 + 4 > p.caja.y0)) continue;
    puestas.push({ ...c, caja });
  }
  return puestas;
}

// Las etiquetas se re-renderizan solas (~8 por segundo) sin tocar el Canvas.
function CapaEtiquetas({ fuenteRef }) {
  const [lista, setLista] = useState([]);
  useEffect(() => {
    const id = setInterval(() => setLista(fuenteRef.current || []), 120);
    return () => clearInterval(id);
  }, [fuenteRef]);
  return lista.map((e) => (
    <Text key={e.id} pointerEvents="none" numberOfLines={1}
      style={[styles.etiqueta, e.proximo && styles.etiquetaProxima, e.hoy && styles.etiquetaHoy, { left: e.x + 10, top: e.y - 9 }]}>{e.nombre}</Text>
  ));
}

export default function MapaLinea({ escena, horneado, checkpoints = [], km = 0, kmInicio = null, kmHoy = 0, factorKm = 1, onInteraccionMapa }) {
  const datos = useMemo(() => datosLinea(escena, horneado, checkpoints), [escena, horneado]);
  const [terreno, setTerreno] = useState(datos.terreno);
  const [zoom, setZoom] = useState(1);
  const etiquetasRef = useRef([]);
  const focoRef = useRef(null);
  const ondaRef = useRef(null);
  const kmHoyRef = useRef(0); kmHoyRef.current = Math.max(0, Number(kmHoy) || 0);
  const [celebracion, setCelebracion] = useState(null);
  const [focoInfo, setFocoInfo] = useState(null);
  const kmAnteriorRef = useRef(null);
  const kmRef = useRef(km); kmRef.current = clamp(km, 0, escena.distanciaKm);
  const zoomRef = useRef(1);
  const giroRef = useRef(0);
  const gesto = useRef(null);

  // Curvas de nivel y costa: después del primer cuadro, una vez por escena.
  useEffect(() => {
    if (datos.terreno) return undefined;
    const t = setTimeout(() => { datos.terreno = lineasDeTerreno(datos.campo, datos.puntos); setTerreno(datos.terreno); }, 60);
    return () => clearTimeout(t);
  }, [datos]);

  const distanciaBase = clamp(datos.radio * 0.09, 0.08, 40);
  const d = distanciaBase * zoom;
  const ancho = d * 0.016;
  const paso = useMemo(() => { const bruto = d / 2.2; const e = 10 ** Math.floor(Math.log10(bruto)); return [1, 2, 5, 10].map((m) => m * e).find((s) => s >= bruto) || bruto; }, [d]);
  const kmVista = clamp(km, 0, escena.distanciaKm);
  const kmPintado = Math.round(kmVista * 200) / 200;
  const hitos = useMemo(() => checkpoints.filter((c) => Number.isFinite(c.kmFisico))
    .map((c) => ({ ...c, ...puntoEnRuta(datos.puntos, c.kmFisico) })), [checkpoints, datos]);
  const siguiente = proximoHito(checkpoints, kmVista);
  // Lo que ya traías (apagado) vs. lo de esta salida (brillante). Sin salida en curso, todo brillante.
  const kmBase = kmInicio == null || !(kmHoy > 0) ? 0 : clamp(Math.round(kmInicio * 200) / 200, 0, kmPintado);
  const marcas = useMemo(() => marcasKm(datos.puntos, escena.distanciaKm, 1 / Math.max(1e-6, factorKm), ancho * 2.6).segmentos,
    [datos, escena.distanciaKm, factorKm, ancho]);

  // Celebrar un hito alcanzado durante la salida: onda, vibración y cartel.
  useEffect(() => {
    const antes = kmAnteriorRef.current;
    kmAnteriorRef.current = kmVista;
    const hito = hitoCruzado(checkpoints, antes, kmVista);
    if (!hito) return undefined;
    const pos = puntoEnRuta(datos.puntos, hito.kmFisico);
    ondaRef.current = { x: pos.x, z: pos.z, t0: Date.now() };
    const orden = [...checkpoints].filter((c) => Number.isFinite(c.kmFisico)).sort((a, b) => a.kmFisico - b.kmFisico);
    setCelebracion({ hito, n: orden.findIndex((c) => c.id === hito.id) + 1, total: orden.length });
    Vibration.vibrate([0, 60, 80, 60]);
    const t = setTimeout(() => setCelebracion(null), 5000);
    return () => clearTimeout(t);
  }, [kmVista]);

  const mirarProximo = () => {
    if (!siguiente) return;
    const pos = puntoEnRuta(datos.puntos, siguiente.kmFisico);
    focoRef.current = { x: pos.x, z: pos.z, hasta: Date.now() + 3500 };
    setFocoInfo(siguiente);
    setTimeout(() => setFocoInfo(null), 3500);
  };
  const base = useMemo(() => {
    const p = puntoEnRuta(datos.puntos, kmPintado); const s = paso * 4;
    return { x: Math.round(p.x / s) * s, z: Math.round(p.z / s) * s };
  }, [kmPintado, paso, datos]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { gesto.current = { zoom: zoomRef.current, giro: giroRef.current, dist: null }; onInteraccionMapa?.(true); },
    onPanResponderMove: (e, g) => {
      const t = e.nativeEvent.touches || [];
      if (t.length >= 2) {
        const dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (!gesto.current.dist) { gesto.current.dist = dist; gesto.current.zoom = zoomRef.current; return; }
        zoomRef.current = clamp(gesto.current.zoom * gesto.current.dist / Math.max(1, dist), 0.3, 6);
        return;
      }
      giroRef.current = gesto.current.giro - g.dx * 0.006;
    },
    onPanResponderRelease: () => {
      setZoom(zoomRef.current); onInteraccionMapa?.(false);
      // Después de mirar alrededor, la cámara vuelve detrás del corredor.
      const desde = giroRef.current; const t0 = Date.now();
      const volver = () => { const t = Math.min(1, (Date.now() - t0) / 900); giroRef.current = desde * (1 - t * t * (3 - 2 * t)); if (t < 1) requestAnimationFrame(volver); };
      setTimeout(() => requestAnimationFrame(volver), 2500);
    },
    onPanResponderTerminate: () => { setZoom(zoomRef.current); onInteraccionMapa?.(false); },
  }), [onInteraccionMapa]);

  const faltaKm = siguiente ? Math.max(0, (siguiente.kmFisico - kmVista) * factorKm) : 0;
  const faltaTxt = String(faltaKm < 10 ? faltaKm.toFixed(1) : Math.round(faltaKm)).replace('.', ',');

  return (
    <View style={styles.wrap} {...pan.panHandlers}>
      <Canvas style={styles.canvas} dpr={1.5} gl={{ antialias: true }} camera={{ fov: 50, position: [0, 5, -5] }}
        onCreated={({ gl }) => gl.setClearColor(COLOR.fondo, 1)}>
        <fog attach="fog" args={[COLOR.fondo, d * 2.5, d * 9]} />
        <Grilla base={base} radio={d * 6} paso={paso} />
        {!!terreno && <Segmentos datos={terreno.curvas} color={COLOR.curvas} opacidad={0.55} />}
        {!!terreno && <Segmentos datos={terreno.costa} color={COLOR.costa} opacidad={0.95} />}
        <Cinta puntos={datos.puntos} desde={0} hasta={escena.distanciaKm} ancho={ancho * 0.6} color={COLOR.pendiente} opacidad={0.9} orden={2} />
        <Segmentos datos={marcas} color={COLOR.marcas} opacidad={0.7} />
        {kmBase > 0 && <Cinta puntos={datos.puntos} desde={0} hasta={kmBase} ancho={ancho} color={COLOR.hechoAntes} opacidad={0.85} orden={3} />}
        {kmPintado > kmBase && <Cinta puntos={datos.puntos} desde={kmBase} hasta={kmPintado} ancho={ancho * 2.2} color={COLOR.hecho} opacidad={0.16} orden={4} aditivo />}
        {kmPintado > kmBase && <Cinta puntos={datos.puntos} desde={kmBase} hasta={kmPintado} ancho={ancho * 1.15} color={COLOR.hecho} orden={5} />}
        {hitos.map((h) => (
          h.id === siguiente?.id
            ? <Disco key={h.id} x={h.x} z={h.z} radio={d * 0.04} color={COLOR.proximo} anillo orden={6} />
            : <Disco key={h.id} x={h.x} z={h.z} radio={d * 0.014} color={h.kmFisico <= kmVista ? COLOR.hecho : COLOR.hito} orden={5} />
        ))}
        {siguiente && <Disco x={hitos.find((h) => h.id === siguiente.id)?.x ?? 0} z={hitos.find((h) => h.id === siguiente.id)?.z ?? 0} radio={d * 0.012} color={COLOR.proximo} orden={7} />}
        <Escena datos={datos} kmObjetivoRef={kmRef} zoomRef={zoomRef} giroRef={giroRef} distanciaBase={distanciaBase}
          etiquetasRef={etiquetasRef} hitos={hitos} siguiente={siguiente} focoRef={focoRef} ondaRef={ondaRef} kmHoyRef={kmHoyRef} />
      </Canvas>

      <CapaEtiquetas fuenteRef={etiquetasRef} />

      {!!celebracion && (
        <View pointerEvents="none" style={styles.celebracion}>
          <Text style={styles.celebracionEyebrow}>HITO {celebracion.n} DE {celebracion.total}</Text>
          <Text style={styles.celebracionTitulo}>¡Llegaste a {celebracion.hito.nombre}!</Text>
          {!!(celebracion.hito.datoRaro || celebracion.hito.desc) && <Text numberOfLines={3} style={styles.celebracionTexto}>{celebracion.hito.datoRaro || celebracion.hito.desc}</Text>}
        </View>
      )}
      {!!focoInfo && !celebracion && !!(focoInfo.desc || focoInfo.datoRaro) && (
        <View pointerEvents="none" style={styles.foco}>
          <Text numberOfLines={3} style={styles.celebracionTexto}>{focoInfo.desc || focoInfo.datoRaro}</Text>
        </View>
      )}
      <TouchableOpacity activeOpacity={0.85} onPress={mirarProximo} style={styles.cartel} accessibilityRole="button"
        accessibilityLabel={siguiente ? `Próximo hito ${siguiente.nombre}. Tocá para verlo` : 'Ruta completa'}>
        {siguiente ? (
          <>
            <Text style={styles.cartelEyebrow}>PRÓXIMO HITO</Text>
            <Text numberOfLines={1} style={styles.cartelTxt}>{siguiente.nombre} · {faltaTxt} km</Text>
          </>
        ) : (
          <>
            <Text style={styles.cartelEyebrow}>LLEGADA</Text>
            <Text style={styles.cartelTxt}>Ruta completa</Text>
          </>
        )}
      </TouchableOpacity>
      {datos.aproximada && <Text pointerEvents="none" style={styles.aproximada}>Trazado aproximado entre hitos</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLOR.fondo, overflow: 'hidden' },
  canvas: { flex: 1 },
  etiqueta: { position: 'absolute', maxWidth: 150, color: '#4F7590', fontSize: 11, fontWeight: '600' },
  etiquetaHoy: { color: '#FFB48A', fontSize: 12, fontWeight: '900' },
  celebracion: { position: 'absolute', left: 16, right: 16, top: 16, padding: 14, borderRadius: 16, backgroundColor: 'rgba(13,34,50,0.95)', borderWidth: 1, borderColor: '#FC4C02' },
  celebracionEyebrow: { color: '#FC8A50', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  celebracionTitulo: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginTop: 2 },
  celebracionTexto: { color: '#C6D3DB', fontSize: 12, lineHeight: 17, marginTop: 6 },
  foco: { position: 'absolute', left: 16, right: 16, top: 16, padding: 12, borderRadius: 14, backgroundColor: 'rgba(13,34,50,0.92)', borderWidth: 1, borderColor: 'rgba(138,203,241,0.5)' },
  etiquetaProxima: { color: '#DCEBF5', fontSize: 13, fontWeight: '800' },
  cartel: { position: 'absolute', left: 12, bottom: 12, maxWidth: '78%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(13,34,50,0.92)', borderWidth: 1, borderColor: 'rgba(252,76,2,0.7)' },
  cartelEyebrow: { color: '#FC8A50', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  cartelTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 2 },
  aproximada: { position: 'absolute', right: 10, top: 8, color: '#4F7590', fontSize: 9 },
});
