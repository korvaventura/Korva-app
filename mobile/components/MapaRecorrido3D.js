import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, InteractionManager, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Canvas, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { colors } from '../theme/korvaTheme';
import escenaFinDelMundo from '../services/mapa3d/escenas/finDelMundo';
import horneadoFinDelMundo from '../services/mapa3d/escenas/finDelMundo.horneado';
import { kmDeProgreso } from '../services/mapa3d/terrenoCore';
import { estadoJourney } from '../services/mapa3d/journeyCore';
import { ubicarEtiquetas } from '../services/mapa3d/etiquetasCore';
import {
  actualizarAtmosfera,
  configurarCamara,
  construirMundo,
  crearLuces,
  geometriaTramo,
  materialesRuta,
  posicionEnKm,
  posicionGeo,
} from './mapa3d/construirMundo';

// Mapa 3D del desafío: ventana sobre un territorio continuo (no un diorama).
// El terreno horneado se extiende cientos de km más allá del encuadre y se
// funde con el horizonte por atmósfera; la ruta se apoya en el valle y los
// pines son vistas nativas proyectadas desde 3D. Render bajo demanda.

const ALTURA_PIN_M = 380; // altura del pin sobre la ruta (m reales)
const ZOOM_MIN = 0.38;
const ZOOM_MAX = 1.7;
const cacheEscenas = new Map();

function obtenerMundo(escena, horneado) {
  if (!cacheEscenas.has(escena.id)) {
    const mundo = construirMundo(escena, horneado);
    mundo.luces = crearLuces(escena);
    cacheEscenas.set(escena.id, mundo);
  }
  return cacheEscenas.get(escena.id);
}

function Montaje({ mundo, escena, controlRef }) {
  const { camera, size, scene, invalidate } = useThree();
  useLayoutEffect(() => {
    configurarCamara(camera, escena, size.width / Math.max(1, size.height), controlRef?.current);
    scene.fog = mundo.niebla;
    actualizarAtmosfera(mundo, escena, camera);
    invalidate();
    return () => { scene.fog = null; };
  }, [camera, size.width, size.height, scene, mundo, escena, invalidate, controlRef]);
  return (
    <>
      <primitive object={mundo.cielo} dispose={null} />
      <primitive object={mundo.grupo} dispose={null} />
      {mundo.luces.map((luz) => <primitive key={luz.uuid} object={luz} dispose={null} />)}
    </>
  );
}

function Ruta({ mundo, escena, kmProgreso }) {
  const { datos, conv } = mundo;
  const total = escena.distanciaKm;
  const mats = useMemo(() => ({
    pendiente: materialesRuta.pendiente(),
    hecho: materialesRuta.hecho(colors.brandOrange),
    brillo: materialesRuta.brillo(colors.brandOrange),
  }), []);
  const geos = useMemo(() => ({
    pendiente: geometriaTramo(datos, conv, kmProgreso, total, 0.013),
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
  const [revisionCamara, setRevisionCamara] = useState(0);
  const revisionPendienteRef = useRef(false);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [kmPlayback, setKmPlayback] = useState(null);
  const [cierreVisible, setCierreVisible] = useState(false);
  const cierreOpacity = useRef(new Animated.Value(0)).current;
  const aparicion = useRef(new Animated.Value(0)).current;
  const controlRef = useRef({ azimut: 0, elevacion: 0, zoom: 1 });
  const r3fRef = useRef(null);
  const gestoRef = useRef({
    distancia: null,
    zoomInicial: 1,
    objetivoInicial: null,
    centroInicial: null,
    anguloInicial: null,
    azimutInicial: 0,
  });
  const playbackRef = useRef(null);

  const aplicarCamara = () => {
    const estado = r3fRef.current;
    if (!estado) return;
    configurarCamara(
      estado.camera,
      escena,
      estado.size.width / Math.max(1, estado.size.height),
      controlRef.current,
    );
    const mundoActual = cacheEscenas.get(escena.id);
    if (mundoActual) actualizarAtmosfera(mundoActual, escena, estado.camera);
    estado.invalidate();
    // Los eventos táctiles pueden llegar mucho más rápido que React puede
    // renderizar. Agrupamos la reproyección del overlay a un frame para evitar
    // tirones mientras la cámara sigue actualizándose inmediatamente.
    if (!revisionPendienteRef.current) {
      revisionPendienteRef.current = true;
      requestAnimationFrame(() => {
        revisionPendienteRef.current = false;
        setRevisionCamara((v) => v + 1);
      });
    }
  };

  const moverObjetivo = (dx, dy, baseObjetivo) => {
    const estado = r3fRef.current;
    if (!estado) return;
    const cam = estado.camera;
    const objetivo = new THREE.Vector3(...baseObjetivo);
    const frente = objetivo.clone().sub(cam.position).normalize();
    const derecha = new THREE.Vector3().crossVectors(frente, cam.up).normalize();
    const arribaPlano = new THREE.Vector3().crossVectors(derecha, frente).normalize();
    // Escala con zoom: al alejarse, el mismo gesto recorre más territorio.
    const escala = 0.0082 * (controlRef.current.zoom || 1);
    const delta = derecha.multiplyScalar(-dx * escala)
      .add(arribaPlano.multiplyScalar(dy * escala));
    controlRef.current.objetivo = [
      baseObjetivo[0] + delta.x,
      baseObjetivo[1] + delta.y * 0.18,
      baseObjetivo[2] + delta.z,
    ];
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (e) => e.nativeEvent.touches?.length >= 2,
    onStartShouldSetPanResponderCapture: (e) => e.nativeEvent.touches?.length >= 2,
    onMoveShouldSetPanResponder: (e, g) => {
      const dedos = e.nativeEvent.touches?.length || 0;
      if (dedos >= 2) return true;
      const ax = Math.abs(g.dx);
      const ay = Math.abs(g.dy);
      // Un dedo: el mapa sólo toma intención horizontal/diagonal clara.
      // El gesto vertical queda libre para el ScrollView padre.
      return ax > 7 && ax > ay * 0.72;
    },
    onMoveShouldSetPanResponderCapture: (e, g) => {
      const dedos = e.nativeEvent.touches?.length || 0;
      if (dedos >= 2) return true;
      const ax = Math.abs(g.dx);
      const ay = Math.abs(g.dy);
      return ax > 7 && ax > ay * 0.72;
    },
    onPanResponderGrant: (e) => {
      const ts = e.nativeEvent.touches || [];
      const objetivo = controlRef.current.objetivo || escena.camara.objetivo;
      gestoRef.current.objetivoInicial = [...objetivo];
      gestoRef.current.zoomInicial = controlRef.current.zoom;
      gestoRef.current.azimutInicial = controlRef.current.azimut || 0;
      if (ts.length >= 2) {
        gestoRef.current.distancia = Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY);
        gestoRef.current.centroInicial = {
          x: (ts[0].pageX + ts[1].pageX) / 2,
          y: (ts[0].pageY + ts[1].pageY) / 2,
        };
        gestoRef.current.anguloInicial = Math.atan2(
          ts[1].pageY - ts[0].pageY,
          ts[1].pageX - ts[0].pageX,
        );
      } else {
        gestoRef.current.distancia = null;
        gestoRef.current.centroInicial = null;
        gestoRef.current.anguloInicial = null;
      }
    },
    onPanResponderMove: (e, g) => {
      const ts = e.nativeEvent.touches || [];
      const base = gestoRef.current.objetivoInicial || escena.camara.objetivo;
      if (ts.length >= 2) {
        const d = Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY);
        if (!gestoRef.current.distancia) gestoRef.current.distancia = d;
        controlRef.current.zoom = THREE.MathUtils.clamp(
          gestoRef.current.zoomInicial * (gestoRef.current.distancia / Math.max(1, d)),
          ZOOM_MIN,
          ZOOM_MAX,
        );
        const centro = {
          x: (ts[0].pageX + ts[1].pageX) / 2,
          y: (ts[0].pageY + ts[1].pageY) / 2,
        };
        const c0 = gestoRef.current.centroInicial || centro;
        moverObjetivo(centro.x - c0.x, centro.y - c0.y, base);

        // Giro deliberado con dos dedos. Separado del pan de un dedo para que
        // explorar el mapa no haga orbitar la cámara accidentalmente.
        const angulo = Math.atan2(
          ts[1].pageY - ts[0].pageY,
          ts[1].pageX - ts[0].pageX,
        );
        const a0 = gestoRef.current.anguloInicial ?? angulo;
        let deltaAngulo = angulo - a0;
        if (deltaAngulo > Math.PI) deltaAngulo -= Math.PI * 2;
        if (deltaAngulo < -Math.PI) deltaAngulo += Math.PI * 2;
        controlRef.current.azimut = THREE.MathUtils.clamp(
          gestoRef.current.azimutInicial + deltaAngulo * 0.52,
          -1.15,
          1.15,
        );
      } else {
        // Un dedo desplaza el territorio como un mapa. No rota la cámara.
        moverObjetivo(g.dx, g.dy, base);
      }
      aplicarCamara();
    },
    onPanResponderRelease: () => {
      gestoRef.current.distancia = null;
      gestoRef.current.centroInicial = null;
      gestoRef.current.anguloInicial = null;
    },
    onPanResponderTerminate: () => {
      gestoRef.current.distancia = null;
      gestoRef.current.centroInicial = null;
      gestoRef.current.anguloInicial = null;
    },
  }), [escena]);

  // Decodificar el horneado fuera de la transición de navegación.
  useEffect(() => {
    if (listo) return undefined;
    const tarea = InteractionManager.runAfterInteractions(() => {
      obtenerMundo(escena, horneado);
      setListo(true);
    });
    return () => tarea.cancel?.();
  }, [listo, escena, horneado]);

  const mundo = listo ? obtenerMundo(escena, horneado) : null;
  const kmProgresoReal = kmDeProgreso(progreso, escena.distanciaKm, completado);
  const kmProgreso = kmPlayback == null ? kmProgresoReal : kmPlayback;
  const journey = useMemo(() => estadoJourney({
    checkpoints,
    kmProgreso,
    distanciaKm: escena.distanciaKm,
    completado,
  }), [checkpoints, kmProgreso, escena.distanciaKm, completado]);

  // Proyección de pines y etiquetas con la misma cámara que usa el Canvas.
  const overlay = useMemo(() => {
    if (!mundo || !tam) return null;
    const { datos, conv } = mundo;
    const cam = new THREE.PerspectiveCamera();
    configurarCamara(cam, escena, tam.w / tam.h, controlRef.current);
    const aPx = (v) => {
      const p = v.clone().project(cam);
      const x = ((p.x + 1) / 2) * tam.w;
      const y = ((1 - p.y) / 2) * tam.h;
      // Detrás de cámara o fuera del cuadro: no se dibuja.
      const visible = p.z > -1 && p.z < 1 && x > -20 && x < tam.w + 20 && y > -20 && y < tam.h + 20;
      return { x, y, visible };
    };
    const pines = journey.checkpoints.map((cp, i) => {
      const km = cp.kmJourney;
      return {
        cp,
        km,
        cabeza: aPx(posicionEnKm(datos, conv, km, ALTURA_PIN_M)),
        base: aPx(posicionEnKm(datos, conv, km, 0)),
        desbloqueado: cp.estadoJourney === 'conquistado',
        estadoJourney: cp.estadoJourney,
      };
    });
    const pinesVisibles = pines.filter((p) => p.cabeza.visible && p.base.visible);
    const aguas = (escena.etiquetas || []).map((e) => {
      const agua = escena.aguas.find((a) => a.id === e.id);
      return { ...e, ...aPx(posicionGeo(datos, conv, e.lat, e.lon, agua ? agua.nivelM : undefined)) };
    }).filter((e) => e.visible && e.x > 40 && e.x < tam.w - 40);
    const actualPx = kmProgreso > 0.05 && kmProgreso < escena.distanciaKm - 0.05
      ? aPx(posicionEnKm(datos, conv, kmProgreso, 0))
      : null;
    const actual = actualPx?.visible ? actualPx : null;
    // Norte en pantalla: proyectar un tramo hacia -z.
    const a = aPx(new THREE.Vector3(0, 0, 0));
    const b = aPx(new THREE.Vector3(0, 0, -1));
    const anguloNorte = Math.atan2(b.x - a.x, -(b.y - a.y));
    const ocupados = [
      ...aguas.map((e) => ({ x: e.x - e.texto.length * 3.8, y: e.y - 7, w: e.texto.length * 7.6, h: 14 })),
      ...(actual ? [{ x: actual.x - 12, y: actual.y - 12, w: 24, h: 24 }] : []),
      { x: 0, y: 0, w: 190, h: 118 },
      { x: tam.w - 120, y: 0, w: 120, h: 44 },
      { x: 0, y: tam.h - 48, w: 56, h: 48 },
    ];
    const etiquetas = ubicarEtiquetas(
      pinesVisibles.map((p) => ({ id: p.cp.id, x: p.cabeza.x, y: p.cabeza.y, texto: p.cp.nombre?.toUpperCase(), prioridad: p.cp.id === seleccionadoId ? 2 : 1 })),
      tam.w,
      tam.h,
      { ocupados },
    );
    return { pines: pinesVisibles, aguas, actual, anguloNorte, etiquetas };
  }, [mundo, tam, journey, escena, kmProgreso, seleccionadoId, revisionCamara]);

  const alCrear = ({ gl, camera, size, scene, invalidate }) => {
    r3fRef.current = { camera, size, scene, invalidate };
    gl.setClearColor(0x000000, 0);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = escena.exposicion ?? 1.15;
    Animated.timing(aparicion, { toValue: 1, duration: 450, delay: 120, useNativeDriver: true }).start();
  };

  useEffect(() => () => {
    if (playbackRef.current) cancelAnimationFrame(playbackRef.current);
  }, []);

  const iniciarJourney = () => {
    if (!mundo || reproduciendo) return;
    if (playbackRef.current) cancelAnimationFrame(playbackRef.current);
    const metaKm = Math.max(0.1, kmProgresoReal);
    // El replay debe sentirse como un viaje, no como una barra de progreso.
    // Fin del Mundo completo (~103 km) queda cerca de 16 s.
    const duracion = THREE.MathUtils.clamp(9000 + metaKm * 70, 10000, 18000);
    const inicio = Date.now();
    setCierreVisible(false);
    cierreOpacity.setValue(0);
    setReproduciendo(true);
    controlRef.current = { azimut: 0, elevacion: 0.08, zoom: 0.66 };

    const tick = () => {
      const t = THREE.MathUtils.clamp((Date.now() - inicio) / duracion, 0, 1);
      const suave = t * t * (3 - 2 * t);
      const km = metaKm * suave;
      const p = posicionEnKm(mundo.datos, mundo.conv, km, 0);
      controlRef.current.objetivo = [p.x, p.y, p.z];
      setKmPlayback(km);
      aplicarCamara();
      if (t < 1) {
        playbackRef.current = requestAnimationFrame(tick);
      } else {
        playbackRef.current = null;
        setKmPlayback(null);
        setReproduciendo(false);
        if (completado) {
          setCierreVisible(true);
          Animated.sequence([
            Animated.timing(cierreOpacity, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.delay(2200),
            Animated.timing(cierreOpacity, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]).start(({ finished }) => {
            if (finished) setCierreVisible(false);
          });
        }
        const fin = posicionEnKm(mundo.datos, mundo.conv, kmProgresoReal, 0);
        controlRef.current.objetivo = [fin.x, fin.y, fin.z];
        aplicarCamara();
      }
    };
    playbackRef.current = requestAnimationFrame(tick);
  };

  const detenerJourney = () => {
    if (playbackRef.current) cancelAnimationFrame(playbackRef.current);
    playbackRef.current = null;
    setKmPlayback(null);
    setReproduciendo(false);
    recenter();
  };

  const enfocarPosicion = () => {
    if (!mundo) return;
    const p = posicionEnKm(mundo.datos, mundo.conv, journey.kmActual, 0);
    controlRef.current = {
      ...controlRef.current,
      objetivo: [p.x, p.y, p.z],
      zoom: Math.min(controlRef.current.zoom, 0.72),
    };
    aplicarCamara();
  };

  const recenter = () => {
    controlRef.current = { azimut: 0, elevacion: 0, zoom: 1 };
    aplicarCamara();
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
      {mundo && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: aparicion }]}>
          <Canvas
            style={styles.canvas}
            frameloop="demand"
            dpr={2}
            gl={{ alpha: true, antialias: true }}
            camera={{ fov: escena.camara.fov, near: 0.05, far: 200, position: [0, 6, -10] }}
            onCreated={alCrear}
          >
            <Montaje mundo={mundo} escena={escena} controlRef={controlRef} />
            <Ruta mundo={mundo} escena={escena} kmProgreso={kmProgreso} />
          </Canvas>
        </Animated.View>
      )}

      {!mundo && <Text style={styles.cargando}>Modelando el relieve…</Text>}

      {overlay && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: aparicion }]} pointerEvents="box-none">
          {overlay.aguas.map((e) => (
            <Text key={e.id} pointerEvents="none" style={[styles.etiquetaAgua, e.tipo === 'region' && styles.etiquetaRegion, { left: e.x - 80, top: e.y - 7 }]}>{e.texto}</Text>
          ))}

          {overlay.pines.map(({ cp, km, cabeza, base, desbloqueado, estadoJourney }) => {
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
                  style={[styles.pin, sel && styles.pinSel, desbloqueado ? styles.pinActivo : styles.pinBloqueado, estadoJourney === 'proximo' && styles.pinProximo, { left: cabeza.x - (sel ? 11 : 8), top: cabeza.y - (sel ? 11 : 8) }]}
                >
                  {sel && <View style={styles.pinNucleo} />}
                </TouchableOpacity>
                {caja && (
                  <TouchableOpacity activeOpacity={0.75} onPress={presionar} style={[styles.etiqueta, { left: caja.x, top: caja.y, width: caja.w }, caja.lado === 'izquierda' && styles.etiquetaIzq, (caja.lado === 'arriba' || caja.lado === 'abajo') && styles.etiquetaCentro]}>
                    <Text numberOfLines={1} style={[styles.etiquetaNombre, !desbloqueado && styles.etiquetaBloqueada, sel && styles.etiquetaSel]}>{cp.nombre?.toUpperCase()}</Text>
                    <Text numberOfLines={1} style={styles.etiquetaKm}>{desbloqueado ? `${Math.round(km)} km` : estadoJourney === 'proximo' ? `PRÓXIMO · ${Math.round(km)} km` : `🔒 ${Math.round(km)} km`}</Text>
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
        <Text style={styles.hudEyebrow}>{escena.presentacion?.eyebrow || 'KORVA JOURNEY'}</Text>
        <Text style={styles.hudTitulo}>{escena.presentacion?.titulo || 'Tu recorrido'}</Text>
      </View>
      <View pointerEvents="none" style={[styles.chip, completado && styles.chipCompleto]}>
        <Text style={[styles.chipTxt, completado && styles.chipTxtCompleto]}>
          {completado ? '✓ CONQUISTADO' : `${kmTxt.toFixed(kmTxt < 10 ? 1 : 0)} / ${Math.round(totalTxt)} km`}
        </Text>
      </View>
      {cierreVisible && (
        <Animated.View pointerEvents="none" style={[styles.cierreLogro, { opacity: cierreOpacity }]}>
          <Text style={styles.cierreEyebrow}>RECORRIDO COMPLETADO</Text>
          <Text style={styles.cierreKm}>{Math.round(totalTxt)} KM</Text>
          <View style={styles.cierreLinea} />
          <Text style={styles.cierreTitulo}>{escena.presentacion?.titulo || 'Tu conquista'}</Text>
        </Animated.View>
      )}
      <TouchableOpacity
        activeOpacity={0.86}
        onPress={reproduciendo ? detenerJourney : iniciarJourney}
        style={[styles.playJourney, reproduciendo && styles.playJourneyActivo]}
      >
        <Text style={styles.playJourneyTxt}>
          {reproduciendo ? 'Ⅱ DETENER' : completado ? '▶ REVIVIR CONQUISTA' : '▶ VER MI VIAJE'}
        </Text>
      </TouchableOpacity>
      {!completado && overlay?.actual && (
        <TouchableOpacity activeOpacity={0.82} onPress={enfocarPosicion} style={styles.estoyAca}>
          <Text style={styles.estoyAcaTxt}>◎ ESTÁS ACÁ · {journey.kmActual.toFixed(journey.kmActual < 10 ? 1 : 0)} KM</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity activeOpacity={0.82} onPress={recenter} style={styles.recentrar}>
        <Text style={styles.recentrarTxt}>⌖</Text>
      </TouchableOpacity>
      {!completado && journey.siguiente && (
        <View pointerEvents="none" style={styles.proximoHud}>
          <Text style={styles.proximoEyebrow}>PRÓXIMO DESTINO</Text>
          <Text numberOfLines={1} style={styles.proximoNombre}>{journey.siguiente.nombre}</Text>
          <Text style={styles.proximoKm}>a {journey.kmHastaSiguiente.toFixed(journey.kmHastaSiguiente < 10 ? 1 : 0)} km</Text>
        </View>
      )}
      <Text pointerEvents="none" style={styles.pista}>1 dedo mueve · 2 dedos zoom y rotación</Text>
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
  cierreLogro: { position: 'absolute', left: 0, right: 0, top: '36%', alignItems: 'center', paddingVertical: 18, backgroundColor: 'rgba(9,23,37,0.76)' },
  cierreEyebrow: { color: colors.brandOrangeSoft, fontSize: 9, fontWeight: '900', letterSpacing: 2.4, ...sombraTexto },
  cierreKm: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: 1.2, marginTop: 3, ...sombraTexto },
  cierreLinea: { width: 34, height: 2, borderRadius: 1, backgroundColor: colors.brandOrange, marginVertical: 7 },
  cierreTitulo: { color: colors.textSoft, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, ...sombraTexto },
  playJourney: { position: 'absolute', left: 14, top: 54, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(243,107,10,0.9)', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  playJourneyActivo: { backgroundColor: 'rgba(9,23,37,0.88)', borderWidth: 1, borderColor: 'rgba(255,176,120,0.65)' },
  playJourneyTxt: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  estoyAca: { position: 'absolute', left: 14, top: 88, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(9,23,37,0.82)', borderWidth: 1, borderColor: 'rgba(243,107,10,0.55)' },
  estoyAcaTxt: { color: colors.brandOrangeSoft, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  recentrar: { position: 'absolute', right: 12, bottom: 42, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(9,23,37,0.82)', borderWidth: 1, borderColor: 'rgba(168,207,255,0.28)' },
  recentrarTxt: { color: colors.text, fontSize: 18, fontWeight: '700' },
  proximoHud: { position: 'absolute', left: 14, bottom: 46, maxWidth: 170, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(9,23,37,0.78)', borderWidth: 1, borderColor: 'rgba(255,176,120,0.3)' },
  proximoEyebrow: { color: colors.brandOrangeSoft, fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  proximoNombre: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: 2 },
  proximoKm: { color: colors.textSoft, fontSize: 10, fontWeight: '600', marginTop: 1 },

  tallo: { position: 'absolute', width: 1, backgroundColor: 'rgba(214,228,240,0.38)' },
  talloActivo: { backgroundColor: 'rgba(255,190,140,0.6)' },
  pie: { position: 'absolute', width: 5, height: 3, borderRadius: 3, backgroundColor: 'rgba(214,228,240,0.5)' },
  pieActivo: { backgroundColor: colors.brandOrangeSoft },
  pin: { position: 'absolute', width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  pinActivo: { backgroundColor: colors.brandOrange, borderWidth: 2, borderColor: '#FFFFFF' },
  pinBloqueado: { backgroundColor: '#13283D', borderWidth: 1.5, borderColor: '#8DA4B8' },
  pinProximo: { borderColor: colors.brandOrangeSoft, borderWidth: 2, shadowColor: colors.brandOrange, shadowOpacity: 0.8, shadowRadius: 7 },
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
