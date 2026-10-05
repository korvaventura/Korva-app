import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, InteractionManager, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Canvas, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { colors } from '../theme/korvaTheme';
import escenaFinDelMundo from '../services/mapa3d/escenas/finDelMundo';
import horneadoFinDelMundo from '../services/mapa3d/escenas/finDelMundo.horneado';
import { kmDeProgreso } from '../services/mapa3d/terrenoCore';
import { ubicarEtiquetas } from '../services/mapa3d/etiquetasCore';
import {
  ajustarNiebla,
  configurarCamara,
  construirDiorama,
  crearLuces,
  crearNiebla,
  geometriaTramo,
  materialesRuta,
  posicionEnKm,
  posicionGeo,
} from './mapa3d/construirDiorama';

// Diorama 3D del desafío. Terreno continuo horneado (heightfield + sombras),
// agua tallada, ruta apoyada en el valle y pines nativos proyectados desde 3D.
// La escena es estática: se renderiza bajo demanda (frameloop="demand").

const ALTURA_PIN_M = 380; // altura del pin sobre la ruta (m reales)
const cacheEscenas = new Map();

function obtenerDiorama(escena, horneado) {
  if (!cacheEscenas.has(escena.id)) {
    const diorama = construirDiorama(escena, horneado);
    diorama.luces = crearLuces(escena);
    diorama.niebla = crearNiebla(escena);
    cacheEscenas.set(escena.id, diorama);
  }
  return cacheEscenas.get(escena.id);
}

function Montaje({ diorama, escena, controlRef }) {
  const { camera, size, scene, invalidate } = useThree();
  useLayoutEffect(() => {
    configurarCamara(camera, escena, size.width / Math.max(1, size.height), controlRef?.current);
    scene.fog = diorama.niebla;
    ajustarNiebla(diorama.niebla, escena, camera);
    invalidate();
    return () => { scene.fog = null; };
  }, [camera, size.width, size.height, scene, diorama, escena, invalidate, controlRef]);
  return (
    <>
      <primitive object={diorama.grupo} dispose={null} />
      {diorama.luces.map((luz) => <primitive key={luz.uuid} object={luz} dispose={null} />)}
    </>
  );
}

function Ruta({ diorama, escena, kmProgreso }) {
  const { datos, conv } = diorama;
  const total = escena.distanciaKm;
  const mats = useMemo(() => ({
    pendiente: materialesRuta.pendiente(),
    hecho: materialesRuta.hecho(colors.brandOrange),
    brillo: materialesRuta.brillo(colors.brandOrange),
  }), []);
  const geos = useMemo(() => ({
    pendiente: geometriaTramo(datos, conv, kmProgreso, total, 0.010),
    brillo: geometriaTramo(datos, conv, 0, kmProgreso, 0.044),
    hecho: geometriaTramo(datos, conv, 0, kmProgreso, 0.019),
  }), [datos, conv, kmProgreso, total]);

  useEffect(() => () => Object.values(geos).forEach((g) => g?.dispose()), [geos]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  return (
    <>
      {geos.pendiente && <mesh geometry={geos.pendiente} material={mats.pendiente} renderOrder={5} />}
      {geos.brillo && <mesh geometry={geos.brillo} material={mats.brillo} renderOrder={6} />}
      {geos.hecho && <mesh geometry={geos.hecho} material={mats.hecho} renderOrder={7} />}
    </>
  );
}

function Fondo() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="cielo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0D2032" />
          <Stop offset="0.3" stopColor="#14304A" />
          <Stop offset="0.7" stopColor="#0B1C2D" />
          <Stop offset="1" stopColor="#08131F" />
        </LinearGradient>
        <RadialGradient id="halo" cx="50%" cy="24%" rx="75%" ry="32%" fx="50%" fy="24%">
          <Stop offset="0" stopColor="#4C6684" stopOpacity="1" />
          <Stop offset="0.45" stopColor="#2A4462" stopOpacity="0.85" />
          <Stop offset="1" stopColor="#0D2032" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#cielo)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#halo)" />
    </Svg>
  );
}

function PosicionActual({ x, y }) {
  const pulso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.timing(pulso, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [pulso]);
  const escala = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const opacidad = pulso.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  return (
    <View pointerEvents="none" style={[styles.actual, { left: x - 7, top: y - 7 }]}>
      <Animated.View style={[styles.actualPulso, { transform: [{ scale: escala }], opacity: opacidad }]} />
      <View style={styles.actualPunto} />
    </View>
  );
}

function Brujula({ angulo }) {
  return (
    <View pointerEvents="none" style={styles.brujula}>
      <View style={[styles.brujulaAguja, { transform: [{ rotate: `${angulo}rad` }] }]}>
        <View style={styles.brujulaPunta} />
      </View>
      <Text style={styles.brujulaN}>N</Text>
    </View>
  );
}

export default function MapaRecorrido3D({
  checkpoints = [],
  progreso = 0,
  completado = false,
  seleccionadoId,
  onSelect,
  kmUsuario,
  kmTotalUsuario,
  altura = 400,
  escena = escenaFinDelMundo,
  horneado = horneadoFinDelMundo,
}) {
  const [listo, setListo] = useState(cacheEscenas.has(escena.id));
  const [tam, setTam] = useState(null);
  const aparicion = useRef(new Animated.Value(0)).current;
  const controlRef = useRef({ azimut: 0, elevacion: 0, zoom: 1 });
  const r3fRef = useRef(null);
  const gestoRef = useRef({ distancia: null, zoomInicial: 1 });

  const aplicarCamara = () => {
    const estado = r3fRef.current;
    if (!estado) return;
    configurarCamara(
      estado.camera,
      escena,
      estado.size.width / Math.max(1, estado.size.height),
      controlRef.current,
    );
    ajustarNiebla(estado.scene.fog, escena, estado.camera);
    estado.invalidate();
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (e) => e.nativeEvent.touches?.length >= 2,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
    onPanResponderGrant: (e) => {
      const ts = e.nativeEvent.touches || [];
      gestoRef.current.distancia = ts.length >= 2
        ? Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY)
        : null;
      gestoRef.current.zoomInicial = controlRef.current.zoom;
    },
    onPanResponderMove: (e, g) => {
      const ts = e.nativeEvent.touches || [];
      if (ts.length >= 2) {
        const d = Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY);
        const d0 = gestoRef.current.distancia || d;
        controlRef.current.zoom = THREE.MathUtils.clamp(gestoRef.current.zoomInicial * (d0 / Math.max(1, d)), 0.58, 1.7);
      } else {
        controlRef.current.azimut = THREE.MathUtils.clamp(controlRef.current.azimut + g.dx * 0.0035, -0.72, 0.72);
        controlRef.current.elevacion = THREE.MathUtils.clamp(controlRef.current.elevacion - g.dy * 0.0026, -0.24, 0.28);
      }
      aplicarCamara();
    },
    onPanResponderRelease: () => { gestoRef.current.distancia = null; },
    onPanResponderTerminate: () => { gestoRef.current.distancia = null; },
  }), [escena]);

  // Decodificar el horneado fuera de la transición de navegación.
  useEffect(() => {
    if (listo) return undefined;
    const tarea = InteractionManager.runAfterInteractions(() => {
      obtenerDiorama(escena, horneado);
      setListo(true);
    });
    return () => tarea.cancel?.();
  }, [listo, escena, horneado]);

  const diorama = listo ? obtenerDiorama(escena, horneado) : null;
  const kmProgreso = kmDeProgreso(progreso, escena.distanciaKm, completado);

  // Proyección de pines y etiquetas con la misma cámara que usa el Canvas.
  const overlay = useMemo(() => {
    if (!diorama || !tam) return null;
    const { datos, conv } = diorama;
    const cam = new THREE.PerspectiveCamera();
    configurarCamara(cam, escena, tam.w / tam.h);
    const aPx = (v) => {
      const p = v.clone().project(cam);
      return { x: ((p.x + 1) / 2) * tam.w, y: ((1 - p.y) / 2) * tam.h };
    };
    const pines = checkpoints.map((cp, i) => {
      const km = Number.isFinite(cp.kmFisico) ? cp.kmFisico : (escena.distanciaKm * i) / Math.max(1, checkpoints.length - 1);
      return {
        cp,
        km,
        cabeza: aPx(posicionEnKm(datos, conv, km, ALTURA_PIN_M)),
        base: aPx(posicionEnKm(datos, conv, km, 0)),
        desbloqueado: km <= kmProgreso + 0.01,
      };
    });
    const aguas = (escena.etiquetas || []).map((e) => {
      const agua = escena.aguas.find((a) => a.id === e.id);
      return { ...e, ...aPx(posicionGeo(datos, conv, e.lat, e.lon, agua ? agua.nivelM : undefined)) };
    });
    const actual = kmProgreso > 0.05 && kmProgreso < escena.distanciaKm - 0.05
      ? aPx(posicionEnKm(datos, conv, kmProgreso, 0))
      : null;
    // Norte en pantalla: proyectar un tramo hacia -z.
    const a = aPx(new THREE.Vector3(0, 0, 0));
    const b = aPx(new THREE.Vector3(0, 0, -1));
    const anguloNorte = Math.atan2(b.x - a.x, -(b.y - a.y));
    const ocupados = [
      ...aguas.map((e) => ({ x: e.x - e.texto.length * 3.8, y: e.y - 7, w: e.texto.length * 7.6, h: 14 })),
      ...(actual ? [{ x: actual.x - 12, y: actual.y - 12, w: 24, h: 24 }] : []),
      { x: 0, y: 0, w: 190, h: 56 },
      { x: tam.w - 120, y: 0, w: 120, h: 44 },
      { x: 0, y: tam.h - 48, w: 56, h: 48 },
    ];
    const etiquetas = ubicarEtiquetas(
      pines.map((p) => ({ id: p.cp.id, x: p.cabeza.x, y: p.cabeza.y, texto: p.cp.nombre?.toUpperCase(), prioridad: p.cp.id === seleccionadoId ? 2 : 1 })),
      tam.w,
      tam.h,
      { ocupados },
    );
    return { pines, aguas, actual, anguloNorte, etiquetas };
  }, [diorama, tam, checkpoints, escena, kmProgreso, seleccionadoId]);

  const alCrear = ({ gl, camera, size, scene, invalidate }) => {
    r3fRef.current = { camera, size, scene, invalidate };
    gl.setClearColor(0x000000, 0);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = escena.exposicion ?? 1.15;
    Animated.timing(aparicion, { toValue: 1, duration: 450, delay: 120, useNativeDriver: true }).start();
  };

  const totalTxt = Number(kmTotalUsuario) || escena.distanciaKm;
  const kmTxt = Math.min(Number(kmUsuario) || 0, totalTxt);

  return (
    <View
      {...panResponder.panHandlers}
      style={[styles.wrap, { height: Math.max(altura, 455) }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!tam || Math.abs(tam.w - width) > 0.5 || Math.abs(tam.h - height) > 0.5) setTam({ w: width, h: height });
      }}
    >
      <Fondo />
      {diorama && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: aparicion }]}>
          <Canvas
            style={styles.canvas}
            frameloop="demand"
            dpr={2}
            gl={{ alpha: true, antialias: true }}
            camera={{ fov: escena.camara.fov, near: 0.1, far: 120, position: [0, 6, -10] }}
            onCreated={alCrear}
          >
            <Montaje diorama={diorama} escena={escena} controlRef={controlRef} />
            <Ruta diorama={diorama} escena={escena} kmProgreso={kmProgreso} />
          </Canvas>
        </Animated.View>
      )}

      {!diorama && <Text style={styles.cargando}>Modelando el relieve…</Text>}

      {overlay && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: aparicion }]} pointerEvents="box-none">
          {overlay.aguas.map((e) => (
            <Text key={e.id} pointerEvents="none" style={[styles.etiquetaAgua, e.tipo === 'region' && styles.etiquetaRegion, { left: e.x - 80, top: e.y - 7 }]}>{e.texto}</Text>
          ))}

          {overlay.pines.map(({ cp, km, cabeza, base, desbloqueado }) => {
            const sel = cp.id === seleccionadoId;
            const caja = overlay.etiquetas[cp.id];
            const presionar = () => onSelect?.(cp);
            return (
              <View key={cp.id} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                <View pointerEvents="none" style={[styles.tallo, { left: cabeza.x - 0.5, top: cabeza.y, height: Math.max(0, base.y - cabeza.y) }, desbloqueado && styles.talloActivo]} />
                <View pointerEvents="none" style={[styles.pie, { left: base.x - 2.5, top: base.y - 1.5 }, desbloqueado && styles.pieActivo]} />
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={presionar}
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                  style={[styles.pin, sel && styles.pinSel, desbloqueado ? styles.pinActivo : styles.pinBloqueado, { left: cabeza.x - (sel ? 11 : 8), top: cabeza.y - (sel ? 11 : 8) }]}
                >
                  {sel && <View style={styles.pinNucleo} />}
                </TouchableOpacity>
                {caja && (
                  <TouchableOpacity activeOpacity={0.75} onPress={presionar} style={[styles.etiqueta, { left: caja.x, top: caja.y, width: caja.w }, caja.lado === 'izquierda' && styles.etiquetaIzq, (caja.lado === 'arriba' || caja.lado === 'abajo') && styles.etiquetaCentro]}>
                    <Text numberOfLines={1} style={[styles.etiquetaNombre, !desbloqueado && styles.etiquetaBloqueada, sel && styles.etiquetaSel]}>{cp.nombre?.toUpperCase()}</Text>
                    <Text numberOfLines={1} style={styles.etiquetaKm}>{desbloqueado ? `${Math.round(km)} km` : `🔒 ${Math.round(km)} km`}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {overlay.actual && !completado && <PosicionActual x={overlay.actual.x} y={overlay.actual.y} />}
          <Brujula angulo={overlay.anguloNorte} />
        </Animated.View>
      )}

      <View pointerEvents="none" style={styles.hud}>
        <Text style={styles.hudEyebrow}>TIERRA DEL FUEGO · RN3</Text>
        <Text style={styles.hudTitulo}>Tolhuin → Ushuaia</Text>
      </View>
      <View pointerEvents="none" style={[styles.chip, completado && styles.chipCompleto]}>
        <Text style={[styles.chipTxt, completado && styles.chipTxtCompleto]}>
          {completado ? '✓ CONQUISTADO' : `${kmTxt.toFixed(kmTxt < 10 ? 1 : 0)} / ${Math.round(totalTxt)} km`}
        </Text>
      </View>
      <Text pointerEvents="none" style={styles.pista}>Arrastrá para explorar · pellizcá para zoom</Text>
      <View pointerEvents="none" style={styles.borde} />
    </View>
  );
}

const sombraTexto = { textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 };

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden', borderRadius: 18, backgroundColor: colors.backgroundDeep },
  canvas: { flex: 1 },
  borde: { ...StyleSheet.absoluteFillObject, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 18 },
  cargando: { position: 'absolute', alignSelf: 'center', top: '48%', color: colors.textDim, fontSize: 11, letterSpacing: 0.6 },

  hud: { position: 'absolute', left: 14, top: 12 },
  hudEyebrow: { color: colors.brandOrange, fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  hudTitulo: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 2, ...sombraTexto },
  chip: { position: 'absolute', right: 12, top: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(9,23,37,0.72)', borderWidth: 1, borderColor: 'rgba(168,207,255,0.22)' },
  chipCompleto: { backgroundColor: 'rgba(243,107,10,0.18)', borderColor: 'rgba(255,176,120,0.55)' },
  chipTxt: { color: colors.textSoft, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  chipTxtCompleto: { color: colors.brandOrangeSoft, letterSpacing: 1.2 },
  pista: { position: 'absolute', right: 14, bottom: 12, color: 'rgba(168,207,255,0.6)', fontSize: 10 },

  tallo: { position: 'absolute', width: 1, backgroundColor: 'rgba(214,228,240,0.38)' },
  talloActivo: { backgroundColor: 'rgba(255,190,140,0.6)' },
  pie: { position: 'absolute', width: 5, height: 3, borderRadius: 3, backgroundColor: 'rgba(214,228,240,0.5)' },
  pieActivo: { backgroundColor: colors.brandOrangeSoft },
  pin: { position: 'absolute', width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  pinActivo: { backgroundColor: colors.brandOrange, borderWidth: 2, borderColor: '#FFFFFF' },
  pinBloqueado: { backgroundColor: '#13283D', borderWidth: 1.5, borderColor: '#8DA4B8' },
  pinSel: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: '#FFFFFF', shadowColor: colors.brandOrange, shadowOpacity: 0.9, shadowRadius: 8 },
  pinNucleo: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },

  etiqueta: { position: 'absolute', height: 26, justifyContent: 'center' },
  etiquetaIzq: { alignItems: 'flex-end' },
  etiquetaCentro: { alignItems: 'center' },
  etiquetaNombre: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, ...sombraTexto },
  etiquetaBloqueada: { color: '#C9D6E0' },
  etiquetaSel: { color: colors.brandOrangeSoft },
  etiquetaKm: { color: colors.textSoft, fontSize: 9, fontWeight: '600', ...sombraTexto },

  etiquetaAgua: { position: 'absolute', width: 160, textAlign: 'center', color: '#9FD3EC', fontSize: 8.5, fontStyle: 'italic', letterSpacing: 2.4, opacity: 0.85, ...sombraTexto },
  etiquetaRegion: { color: '#C9D6E0', opacity: 0.5 },

  actual: { position: 'absolute', width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  actualPulso: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: colors.brandOrange },
  actualPunto: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: colors.brandOrange },

  brujula: { position: 'absolute', left: 12, bottom: 12, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(9,23,37,0.72)', borderWidth: 1, borderColor: 'rgba(168,207,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  brujulaAguja: { position: 'absolute', width: 30, height: 30, alignItems: 'center' },
  brujulaPunta: { marginTop: 2, width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors.brandOrange },
  brujulaN: { color: colors.text, fontSize: 10, fontWeight: '900' },
});
