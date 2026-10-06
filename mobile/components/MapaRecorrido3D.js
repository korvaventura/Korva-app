import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop, Line } from 'react-native-svg';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { cargarTexturasMeshy } from './mapa3d/modeloMeshy';
import { colors } from '../theme/korvaTheme';
import { kmDeProgreso } from '../services/mapa3d/terrenoCore';
import { muestraGesto, avanzarGesto, seleccionarPin } from '../services/mapa3d/gestosCore';
import { estadoJourney } from '../services/mapa3d/journeyCore';
import { crearCorteRuta } from '../services/mapa3d/rutaPlaybackCore';
import { ubicarEtiquetas, seSuperponen } from '../services/mapa3d/etiquetasCore';
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
const cacheEscenas = new Map();
const textoKm = (n) => String(Math.round(Number(n) * 10) / 10).replace('.', ',');

function obtenerMundo(escena, horneado) {
  if (!cacheEscenas.has(escena.id)) {
    const mundo = construirMundo(escena, horneado);
    mundo.luces = crearLuces(escena);
    cacheEscenas.set(escena.id, mundo);
  }
  return cacheEscenas.get(escena.id);
}

function Montaje({ mundo, escena, controlRef, r3fRef, onModeloEstado }) {
  const { camera, size, scene, invalidate } = useThree();
  useEffect(() => {
    if (!mundo.modeloMeshy) return undefined;
    let activo = true;
    const cargar = () => {
      if (activo) onModeloEstado(mundo.modeloMeshy.texturasListas ? 'listo' : 'cargando');
      return cargarTexturasMeshy(mundo, invalidate)
        .then(() => { if (activo) onModeloEstado('listo'); })
        .catch(() => { if (activo) onModeloEstado('error'); });
    };
    cargar();
    const retry = setTimeout(() => { if (!mundo.modeloMeshy.texturasListas) cargar(); }, 3000);
    return () => { activo = false; clearTimeout(retry); };
  }, [mundo, invalidate, onModeloEstado]);
  useLayoutEffect(() => {
    r3fRef.current = { camera, size, scene, invalidate };
    configurarCamara(camera, escena, size.width / Math.max(1, size.height), controlRef?.current, mundo);
    scene.fog = mundo.niebla;
    actualizarAtmosfera(mundo, escena, camera);
    invalidate();
    return () => {
      scene.fog = null;
      if (r3fRef.current?.camera === camera) r3fRef.current = null;
    };
  }, [camera, size.width, size.height, scene, mundo, escena, invalidate, controlRef, r3fRef]);
  return (
    <>
      <primitive object={mundo.cielo} dispose={null} />
      <primitive object={mundo.grupo} dispose={null} />
      {mundo.luces.map((luz) => <primitive key={luz.uuid} object={luz} dispose={null} />)}
    </>
  );
}

function Ruta({ mundo, escena, progresoRef }) {
  const { datos, conv } = mundo;
  const total = escena.distanciaKm;
  const grosor = escena.grosorRuta ?? 1;
  const meshes = { pendiente: useRef(null), brillo: useRef(null), hecho: useRef(null) };
  const geosRef = useRef({});
  const ultimoRef = useRef({ km: null, tiempo: -Infinity });
  const vacia = useMemo(() => new THREE.BufferGeometry(), []);
  const mats = useMemo(() => ({
    pendiente: materialesRuta.pendiente(),
    hecho: materialesRuta.hecho(colors.brandOrange),
    brillo: materialesRuta.brillo(colors.brandOrange),
  }), []);
  const estaticos = useMemo(() => {
    if(!datos.visualModeloMeshy)return null;
    const pendiente=geometriaTramo(datos,conv,0,total,.013*grosor);
    const hecho=geometriaTramo(datos,conv,0,total,.019*grosor);
    return {pendiente,hecho,brillo:null,cortar:crearCorteRuta(datos.ruta,conv,hecho.parameters.tubularSegments)};
  },[datos,conv,total,grosor]);
  useFrame(({ clock }) => {
    const { km, animando } = progresoRef.current;
    const ultimo = ultimoRef.current;
    if (km === ultimo.km) return;
    if(estaticos) {
      const corte=estaticos.cortar(km),count=estaticos.hecho.index.count;
      estaticos.hecho.setDrawRange(0,corte);
      estaticos.pendiente.setDrawRange(corte,count-corte);
      for(const id of ['pendiente','hecho']) {
        const mesh=meshes[id].current;
        if(mesh){mesh.geometry=estaticos[id];mesh.visible=estaticos[id].drawRange.count>0;}
      }
      if(meshes.brillo.current)meshes.brillo.current.visible=false;
      geosRef.current=estaticos;
      ultimoRef.current={km,tiempo:clock.elapsedTime};
      return;
    }
    if (animando && clock.elapsedTime - ultimo.tiempo < 0.12) return;
    const siguientes = {
      pendiente: geometriaTramo(datos, conv, km, total, 0.013 * grosor),
      brillo: datos.visualModeloMeshy ? null : geometriaTramo(datos, conv, 0, km, 0.044 * grosor),
      hecho: geometriaTramo(datos, conv, 0, km, 0.019 * grosor),
    };
    for (const id of Object.keys(siguientes)) {
      const mesh = meshes[id].current;
      if (mesh) { mesh.geometry = siguientes[id] || vacia; mesh.visible = !!siguientes[id]; }
      geosRef.current[id]?.dispose();
    }
    geosRef.current = siguientes;
    ultimoRef.current = { km, tiempo: clock.elapsedTime };
  });
  useEffect(() => () => {
    Object.values(geosRef.current).forEach((g) => g?.dispose?.());
    geosRef.current = {};
    ultimoRef.current = { km: null, tiempo: -Infinity };
    Object.values(mats).forEach((m) => m.dispose());
    vacia.dispose();
  }, [mats, vacia]);
  return (
    <>
      <mesh ref={meshes.pendiente} geometry={vacia} material={mats.pendiente} renderOrder={5} />
      <mesh ref={meshes.brillo} geometry={vacia} material={mats.brillo} renderOrder={6} />
      <mesh ref={meshes.hecho} geometry={vacia} material={mats.hecho} renderOrder={7} />
    </>
  );
}

// El overlay nativo puede cambiar sin reconfigurar el contexto GL ni su árbol.
const EscenaCanvas = memo(function EscenaCanvas({ mundo, escena, controlRef, r3fRef, progresoRef, alCrear, onModeloEstado }) {
  const camaraInicial = useMemo(() => ({ fov: escena.camara.fov, near: 0.05, far: 200, position: [0, 6, -10] }), [escena]);
  const opcionesGL = useMemo(() => ({ alpha: true, antialias: true }), []);
  return (
    <Canvas style={styles.canvas} frameloop="demand" dpr={mundo.modeloMeshy ? 1.5 : 2} gl={opcionesGL} camera={camaraInicial} onCreated={alCrear}>
      <Montaje mundo={mundo} escena={escena} controlRef={controlRef} r3fRef={r3fRef} onModeloEstado={onModeloEstado} />
      <Ruta mundo={mundo} escena={escena} progresoRef={progresoRef} />
    </Canvas>
  );
});

function Fondo() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
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
    const anim = Animated.loop(Animated.timing(pulso, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), isInteraction: false, useNativeDriver: true }));
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
  actividades = [],
  altura = 400,
  escena,
  horneado,
  onInteraccionMapa,
}) {
  const [listo, setListo] = useState(cacheEscenas.has(escena.id));
  const [tam, setTam] = useState(null);
  const [estadoModelo, setEstadoModelo] = useState('cargando');
  const [revisionCamara, setRevisionCamara] = useState(0);
  const revisionPendienteRef = useRef(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [kmPlayback, setKmPlayback] = useState(null);
  const [cierreVisible, setCierreVisible] = useState(false);
  const cierreOpacity = useRef(new Animated.Value(0)).current;
  const aparicion = useRef(new Animated.Value(0)).current;
  const controlRef = useRef({ azimut: 0, elevacion: 0, zoom: 1 });
  const r3fRef = useRef(null);
  const gestoRef = useRef(null);
  const wrapRef = useRef(null);
  const overlayRef = useRef(null);
  const inicioToqueRef = useRef(null);
  const arrastrandoRef = useRef(false);
  const ultimoArrastreRef = useRef(0);
  const playbackRef = useRef(null);
  const progresoRef = useRef({ km: 0, animando: false });
  const ultimaPublicacionRef = useRef(0);
  const ultimaSeleccionRef = useRef({id:null,tiempo:0});
  const etiquetasPreviasRef = useRef({});
  const liberarGesto = useCallback(() => {
    if(arrastrandoRef.current)ultimoArrastreRef.current=Date.now();
    inicioToqueRef.current=null;gestoRef.current=null;arrastrandoRef.current=false;
    onInteraccionMapa?.(false);
  },[onInteraccionMapa]);
  const seleccionarCheckpoint = useCallback(cp => {
    const ahora=Date.now();
    if(arrastrandoRef.current || ahora-ultimoArrastreRef.current<180)return;
    liberarGesto();
    if(ahora-ultimaSeleccionRef.current.tiempo<350)return;
    ultimaSeleccionRef.current={id:cp.id,tiempo:ahora};
    if(playbackRef.current)cancelAnimationFrame(playbackRef.current);
    playbackRef.current=null;setKmPlayback(null);setReproduciendo(false);
    onSelect?.(cp);
  },[liberarGesto,onSelect]);

  const aplicarCamara = useCallback(() => {
    // Cámara, atmósfera y pines se actualizan juntos una vez por frame.
    if (revisionPendienteRef.current != null) return;
    revisionPendienteRef.current = requestAnimationFrame(() => {
      revisionPendienteRef.current = null;
      const estado = r3fRef.current;
      if (!estado) return;
      const ahora=Date.now();
      if(ahora-ultimaPublicacionRef.current<33)return;
      const mundoActual = cacheEscenas.get(escena.id);
      configurarCamara(estado.camera, escena, estado.size.width / Math.max(1, estado.size.height), controlRef.current, mundoActual);
      if (mundoActual) actualizarAtmosfera(mundoActual, escena, estado.camera);
      estado.invalidate();
      ultimaPublicacionRef.current=ahora;
      setRevisionCamara((v) => v + 1);
    });
  }, [escena]);

  const moverObjetivo = (dx, dy, baseObjetivo) => {
    const estado = r3fRef.current;
    if (!estado) return;
    const cam = estado.camera;
    const objetivo = new THREE.Vector3(...baseObjetivo);
    const frente = objetivo.clone().sub(cam.position).normalize();
    const derecha = new THREE.Vector3().crossVectors(frente, cam.up).normalize();
    const arribaPlano = new THREE.Vector3().crossVectors(derecha, frente);
    arribaPlano.y = 0;
    arribaPlano.normalize();
    // Escala con zoom: al alejarse, el mismo gesto recorre más territorio.
    const escala = 2 * cam.position.distanceTo(objetivo) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.max(1, estado.size.height);
    const delta = derecha.multiplyScalar(-dx * escala)
      .add(arribaPlano.multiplyScalar(dy * escala));
    controlRef.current.objetivo = [
      baseObjetivo[0] + delta.x,
      baseObjetivo[1],
      baseObjetivo[2] + delta.z,
    ];
  };

  const touchHandlers = useMemo(() => ({
    // El mapa es ANCESTRO de los pines, textos y HUD. Un tap llega al botón;
    // un arrastre iniciado encima de cualquiera de ellos pasa al mapa.
    onTouchStart: (e) => {
      const muestra = muestraGesto(e.nativeEvent.touches);
      inicioToqueRef.current = muestra;
      gestoRef.current = muestra;
      arrastrandoRef.current = false;
    },
    onTouchEnd: (e) => {
      const terminado = e.nativeEvent.changedTouches?.[0];
      const fueArrastre = arrastrandoRef.current || Date.now() - ultimoArrastreRef.current < 180;
      if (!(e.nativeEvent.touches?.length) && !fueArrastre && terminado) {
        // Pin hit test takes precedence over a neighboring label's native hitSlop.
        const { pageX, pageY } = terminado;
        wrapRef.current?.measureInWindow((left, top) => {
          const x=pageX-left, y=pageY-top;
          const cp = seleccionarPin(overlayRef.current, x, y);
          if (cp) seleccionarCheckpoint(cp);
        });
      }
      const muestra = muestraGesto(e.nativeEvent.touches);
      inicioToqueRef.current = muestra;
      gestoRef.current = muestra;
      if (!muestra) {
        if (arrastrandoRef.current) ultimoArrastreRef.current = Date.now();
        arrastrandoRef.current = false;
        ultimaPublicacionRef.current = 0; aplicarCamara();
        onInteraccionMapa?.(false);
      }
    },
    onTouchCancel: liberarGesto,
    onStartShouldSetResponder: () => false,
    onStartShouldSetResponderCapture: (e) => (e.nativeEvent.touches?.length || 0) >= 2,
    onMoveShouldSetResponder: () => false,
    onMoveShouldSetResponderCapture: (e) => {
      const actual = muestraGesto(e.nativeEvent.touches);
      const inicio = inicioToqueRef.current;
      return !!actual && (actual.n >= 2 || !!inicio && Math.hypot(actual.x - inicio.x, actual.y - inicio.y) >= 10);
    },
    onResponderGrant: (e) => {
      // Un gesto toma el control sin que el replay siga moviendo la cámara.
      if (playbackRef.current) {
        cancelAnimationFrame(playbackRef.current);
        playbackRef.current = null;
        setKmPlayback(null);
        setReproduciendo(false);
      }
      // Raw touch events own movement; responder negotiation only cancels child presses.
    },
    onTouchMove: (e) => {
      const actual = muestraGesto(e.nativeEvent.touches);
      const inicio = inicioToqueRef.current;
      if (!actual || !inicio) return;
      if (!arrastrandoRef.current && actual.n < 2 && Math.hypot(actual.x-inicio.x, actual.y-inicio.y) < 10) return;
      if (!arrastrandoRef.current) {
        arrastrandoRef.current = true;
        onInteraccionMapa?.(true);
        if (playbackRef.current) { cancelAnimationFrame(playbackRef.current); playbackRef.current = null; setKmPlayback(null); setReproduciendo(false); }
      }
      ultimoArrastreRef.current = Date.now();
      const estado = r3fRef.current;
      if (!estado) return;
      const siguiente = avanzarGesto(controlRef.current, gestoRef.current, actual, {
        ancho: estado.size.width, alto: estado.size.height,
        elevacionBase: THREE.MathUtils.degToRad(escena.camara.elevacionGrados),
      });
      controlRef.current = siguiente.control;
      if (siguiente.pan) moverObjetivo(siguiente.pan.dx, siguiente.pan.dy, controlRef.current.objetivo || escena.camara.objetivo);
      gestoRef.current = actual;
      aplicarCamara();
    },
    onResponderRelease: liberarGesto,
    onResponderTerminate: liberarGesto,
    // Un mapa embebido conserva el gesto mientras su página desactiva el
    // scroll. Las interrupciones del sistema siguen llegando a Terminate.
    onResponderTerminationRequest: () => true,

  }), [escena, onInteraccionMapa, aplicarCamara, seleccionarCheckpoint, liberarGesto]);

  // Decodificar el horneado fuera de la transición de navegación.
  useEffect(() => {
    if (listo) return undefined;
    // Las animaciones decorativas pueden durar indefinidamente. La carga no
    // espera sus handles de InteractionManager: deja pintar el placeholder.
    let tarea;
    const frame = requestAnimationFrame(() => {
      tarea = setTimeout(() => {
        obtenerMundo(escena, horneado);
        setListo(true);
      }, 0);
    });
    return () => { cancelAnimationFrame(frame); clearTimeout(tarea); };
  }, [listo, escena, horneado]);

  const mundo = listo ? obtenerMundo(escena, horneado) : null;
  const kmProgresoReal = kmDeProgreso(progreso, escena.distanciaKm, completado);
  const kmProgreso = kmPlayback == null ? kmProgresoReal : kmPlayback;
  if (!reproduciendo) progresoRef.current = { km: kmProgreso, animando: false };
  useEffect(() => {
    // También refresca una carga de actividad, sin esperar al siguiente gesto.
    r3fRef.current?.invalidate();
  }, [kmProgreso, reproduciendo]);
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
    configurarCamara(cam, escena, tam.w / tam.h, controlRef.current, mundo);
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
        cabeza: aPx(escena.alturaPinUnidades == null
          ? posicionEnKm(datos, conv, km, ALTURA_PIN_M)
          : posicionEnKm(datos, conv, km, 0).add(new THREE.Vector3(0, escena.alturaPinUnidades, 0))),
        base: aPx(posicionEnKm(datos, conv, km, 0)),
        desbloqueado: cp.estadoJourney === 'conquistado',
        estadoJourney: cp.estadoJourney,
      };
    });
    const pinesVisibles = pines.filter((p) => p.cabeza.visible && p.base.visible);
    const zonasHud = [
      { x: 0, y: 0, w: tam.w, h: 64 },
      { x: 0, y: 64, w: 205, h: 72 },
      { x: 0, y: tam.h - 124, w: 200, h: 124 },
      { x: tam.w - 56, y: tam.h - 92, w: 56, h: 92 },
      { x: 0, y: tam.h - 32, w: tam.w, h: 32 },
      ...(escena.mostrarRelacionRecorrido ? [{ x: tam.w - 150, y: tam.h - 142, w: 150, h: 64 }] : []),
      ...(reproduciendo && actividades.length ? [{ x: 0, y: 142, w: 110, h: 92 }] : []),
    ];
    const aguas = (escena.etiquetas || []).map((e) => {
      const agua = escena.aguas.find((a) => a.id === e.id);
      return { ...e, ...aPx(posicionGeo(datos, conv, e.lat, e.lon, agua ? agua.nivelM : (e.tipo === 'agua' ? escena.mar?.nivelM : undefined))) };
    }).filter((e) => {
      const caja = { x: e.x - 80, y: e.y - 7, w: 160, h: 16 };
      return e.visible && caja.x >= 6 && caja.x + caja.w <= tam.w - 6
        && !zonasHud.some((z) => seSuperponen(caja, z));
    });
    const actualPx = kmProgreso > 0.05 && kmProgreso < escena.distanciaKm - 0.05
      ? aPx(posicionEnKm(datos, conv, kmProgreso, 0))
      : null;
    const actual = actualPx?.visible ? actualPx : null;
    // Norte en pantalla: proyectar un tramo hacia -z.
    const a = aPx(new THREE.Vector3(0, 0, 0));
    const b = aPx(new THREE.Vector3(0, 0, -1));
    const anguloNorte = Math.atan2(b.x - a.x, -(b.y - a.y));
    const ocupados = [
      ...(actual ? [{ x: actual.x - 12, y: actual.y - 12, w: 24, h: 24 }] : []),
      ...zonasHud,
    ];
    // Durante el playback la cámara se mueve cada frame. Recalcular el
    // algoritmo de colisiones hace que una etiqueta salte entre dos posiciones
    // y visualmente "titile". En replay usamos un anclaje determinista.
    const etiquetas = ubicarEtiquetas(
          pinesVisibles.map((p) => ({ id: p.cp.id, x: p.cabeza.x, y: p.cabeza.y, texto: p.cp.nombre?.toUpperCase(), prioridad: p.cp.id === seleccionadoId ? 4 : p.estadoJourney === 'proximo' ? 3 : p.desbloqueado ? 2 : 1 })),
          tam.w,
          tam.h,
          { ocupados, ocultarSiNoCabe: true, preferidas:etiquetasPreviasRef.current },
        );
    const preferidas={};
    for(const p of pinesVisibles) {
      const caja=etiquetas[p.cp.id];
      if(caja)preferidas[p.cp.id]={lado:caja.lado,dx:caja.x-p.cabeza.x,dy:caja.y-p.cabeza.y};
    }
    etiquetasPreviasRef.current=preferidas;
    const tomadas = [
      ...Object.values(etiquetas),
      ...pinesVisibles.map((p) => ({ x: p.cabeza.x - 10, y: p.cabeza.y - 10, w: 20, h: 20 })),
      ...ocupados,
    ];
    const aguasVisibles = aguas.filter((e) => {
      const caja = { x: e.x - 80, y: e.y - 7, w: 160, h: 16 };
      if (tomadas.some((o) => seSuperponen(caja, o))) return false;
      tomadas.push(caja);
      return true;
    });
    return { pines: pinesVisibles, aguas: aguasVisibles, actual, anguloNorte, etiquetas, zonasHud };
  }, [mundo, tam, journey, escena, kmProgreso, seleccionadoId, revisionCamara, reproduciendo, actividades.length]);

  overlayRef.current = overlay;

  const alCrear = useCallback(({ gl, camera, size, scene, invalidate }) => {
    r3fRef.current = { camera, size, scene, invalidate };
    gl.setClearColor(0x000000, 0);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = escena.exposicion ?? 1.15;
    // La creación del Canvas es asíncrona respecto al layout nativo: publica
    // la cámara lista para que aparezcan los checkpoints sin un primer gesto.
    aplicarCamara();
    Animated.timing(aparicion, { toValue: 1, duration: 450, delay: 120, useNativeDriver: true }).start();
  }, [escena, aparicion, aplicarCamara]);

  useEffect(() => () => {
    onInteraccionMapa?.(false);
    if (playbackRef.current) cancelAnimationFrame(playbackRef.current);
    if (revisionPendienteRef.current != null) cancelAnimationFrame(revisionPendienteRef.current);
    revisionPendienteRef.current = null;
    gestoRef.current = null;
  }, []);

  const iniciarJourney = () => {
    if (!mundo || reproduciendo) return;
    if (playbackRef.current) cancelAnimationFrame(playbackRef.current);
    const metaKm = Math.max(0.1, kmProgresoReal);
    // El replay debe sentirse como un viaje, no como una barra de progreso.
    // Tiempo de lectura y cámara amortiguada en curvas cerradas.
    const duracion = THREE.MathUtils.clamp(52000 + metaKm * 140, 55000, 80000);
    let anterior = Date.now(); let transcurrido = 0; let ultimaFicha = -Infinity;
    const seguimiento = new THREE.Vector3(...(controlRef.current.objetivo || escena.camara.objetivo));
    setCierreVisible(false);
    cierreOpacity.setValue(0);
    setReproduciendo(true);
    controlRef.current = { ...controlRef.current, objetivo: seguimiento.toArray() };
    const zoomInicial = controlRef.current.zoom || 1;

    const tick = () => {
      const ahora = Date.now();
      const dt = Math.max(0, Math.min(80, ahora - anterior)); anterior = ahora;
      // Un frame tardío no produce un salto para recuperar tiempo perdido.
      transcurrido += dt;
      const t = THREE.MathUtils.clamp(transcurrido / duracion, 0, 1);
      const suave = t * t * (3 - 2 * t);
      const km = metaKm * suave;
      const p = posicionEnKm(mundo.datos, mundo.conv, km, 0);
      seguimiento.lerp(p, 1 - Math.exp(-dt / 380));
      controlRef.current.objetivo = seguimiento.toArray();
      controlRef.current.zoom = THREE.MathUtils.lerp(zoomInicial, 0.88, Math.min(1, transcurrido / 1800));
      progresoRef.current = { km, animando: true };
      if (ahora - ultimaFicha >= 100 || t === 1) { setKmPlayback(km); ultimaFicha = ahora; }
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

  useEffect(() => {
    if (seleccionadoId == null || !playbackRef.current) return;
    cancelAnimationFrame(playbackRef.current);
    playbackRef.current = null;
    setKmPlayback(null);
    setReproduciendo(false);
  }, [seleccionadoId]);

  const detenerJourney = () => {
    if (playbackRef.current) cancelAnimationFrame(playbackRef.current);
    playbackRef.current = null;
    setKmPlayback(null);
    setReproduciendo(false);
    recenter();
  };

  const enfocarPosicion = () => {
    if (!mundo) return;
    if (playbackRef.current) cancelAnimationFrame(playbackRef.current);
    playbackRef.current = null;
    setKmPlayback(null);
    setReproduciendo(false);
    const p = posicionEnKm(mundo.datos, mundo.conv, journey.kmActual, 0);
    controlRef.current = {
      ...controlRef.current,
      objetivo: [p.x, p.y, p.z],
      zoom: Math.min(controlRef.current.zoom, 0.72),
    };
    aplicarCamara();
  };

  const recenter = () => {
    if (playbackRef.current) cancelAnimationFrame(playbackRef.current);
    playbackRef.current = null;
    setKmPlayback(null);
    setReproduciendo(false);
    gestoRef.current = null;
    onInteraccionMapa?.(false);
    controlRef.current = { azimut: 0, elevacion: 0, zoom: 1 };
    aplicarCamara();
  };

  const totalTxt = Number(kmTotalUsuario) || escena.distanciaKm;
  const kmTxt = Math.min(Number(kmUsuario) || 0, totalTxt);

  const actividadesJourney = useMemo(() => {
    let acumulado = 0;
    return [...actividades]
      .filter((a) => Number(a?.distance_km) > 0)
      .sort((a, b) => new Date(a.recorded_at || 0) - new Date(b.recorded_at || 0))
      .map((a, i) => {
        acumulado += Number(a.distance_km) || 0;
        return {
          ...a,
          numero: i + 1,
          acumulado,
          kmMapa: Math.min(escena.distanciaKm, (acumulado / Math.max(0.1, totalTxt)) * escena.distanciaKm),
        };
      });
  }, [actividades, escena.distanciaKm, totalTxt]);

  const actividadesVisibles = useMemo(() => {
    if (!reproduciendo || kmPlayback == null) return [];
    return actividadesJourney
      .filter((a) => a.kmMapa <= kmPlayback + 0.05)
      .slice(-3);
  }, [actividadesJourney, reproduciendo, kmPlayback]);

  return (
    <View
      ref={wrapRef}
      collapsable={false}
      {...touchHandlers}
      style={[styles.wrap, { height: Math.max(altura, 455) }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!tam || Math.abs(tam.w - width) > 0.5 || Math.abs(tam.h - height) > 0.5) setTam({ w: width, h: height });
      }}
    >
      <Fondo />
      {mundo && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: aparicion }]}>
          <EscenaCanvas mundo={mundo} escena={escena} controlRef={controlRef} r3fRef={r3fRef} progresoRef={progresoRef} alCrear={alCrear} onModeloEstado={setEstadoModelo} />
        </Animated.View>
      )}


      {!mundo && <Text style={styles.cargando}>Modelando el relieve…</Text>}
      {mundo?.modeloMeshy && estadoModelo !== 'listo' && (
        <Text pointerEvents="none" style={styles.estadoModelo}>
          {estadoModelo === 'error' ? 'No se cargaron las texturas. Volvé a abrir el mapa.' : 'Cargando detalles…'}
        </Text>
      )}

      {overlay && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: aparicion }]} pointerEvents="box-none">
          {overlay.aguas.map((e) => (
            <Text key={e.id} pointerEvents="none" style={[styles.etiquetaAgua, e.tipo === 'region' && styles.etiquetaRegion, { left: e.x - 80, top: e.y - 7 }]}>{e.texto}</Text>
          ))}

          <Svg pointerEvents="none" width={tam.w} height={tam.h} style={StyleSheet.absoluteFill}>
            {overlay.pines.flatMap(({cp,cabeza,base,desbloqueado}) => {
              const caja=overlay.etiquetas[cp.id];
              const extremo=caja ? {x:Math.max(caja.x,Math.min(caja.x+caja.w,cabeza.x)),y:Math.max(caja.y,Math.min(caja.y+caja.h,cabeza.y))} : null;
              const lines=[<Line key={`stem-${cp.id}`} x1={cabeza.x} y1={cabeza.y} x2={base.x} y2={base.y} stroke={desbloqueado ? 'rgba(255,190,140,0.6)' : 'rgba(214,228,240,0.38)'} strokeWidth={1} />];
              if(extremo && Math.hypot(extremo.x-cabeza.x,extremo.y-cabeza.y)>24)lines.push(<Line key={`label-${cp.id}`} x1={cabeza.x} y1={cabeza.y} x2={extremo.x} y2={extremo.y} stroke="rgba(214,228,240,0.4)" strokeWidth={.8} />);
              return lines;
            })}
          </Svg>

          {overlay.pines.map(({ cp, km, cabeza, base, desbloqueado, estadoJourney }) => {
            const sel = cp.id === seleccionadoId;
            const caja = overlay.etiquetas[cp.id];
            const presionar = () => seleccionarCheckpoint(cp);
            return (
              <View key={cp.id} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                <View pointerEvents="none" style={[styles.pie, { left: base.x - 2.5, top: base.y - 1.5 }, desbloqueado && styles.pieActivo]} />
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={presionar}
                  accessibilityRole="button" accessibilityLabel={`Checkpoint ${cp.nombre}`}
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                  style={[styles.pin, sel && styles.pinSel, desbloqueado ? styles.pinActivo : styles.pinBloqueado, estadoJourney === 'proximo' && styles.pinProximo, { left: cabeza.x - (sel ? 11 : 8), top: cabeza.y - (sel ? 11 : 8) }]}
                >
                  {sel && <View style={styles.pinNucleo} />}
                </TouchableOpacity>
                {caja && !overlay.zonasHud.some((zona) => seSuperponen(caja, zona)) && (!reproduciendo || (caja.x >= 4 && caja.x + caja.w <= (tam?.w || 0) - 4)) && (
                  <TouchableOpacity activeOpacity={0.75} onPress={presionar} style={[styles.etiqueta, { left: caja.x, top: caja.y, width: caja.w, height: caja.h }, caja.lado === 'izquierda' && styles.etiquetaIzq, (caja.lado === 'arriba' || caja.lado === 'abajo') && styles.etiquetaCentro]}>
                    <Text allowFontScaling={false} numberOfLines={2} style={[styles.etiquetaNombre, !desbloqueado && styles.etiquetaBloqueada, sel && styles.etiquetaSel]}>{cp.nombre?.toUpperCase()}</Text>
                    <Text allowFontScaling={false} numberOfLines={1} style={styles.etiquetaKm}>{desbloqueado ? `${textoKm(km)} km` : estadoJourney === 'proximo' ? `PRÓXIMO · ${textoKm(km)} km` : `🔒 ${textoKm(km)} km`}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {overlay.actual && !completado && <PosicionActual x={overlay.actual.x} y={overlay.actual.y} />}
          <Brujula angulo={overlay.anguloNorte} />
        </Animated.View>
      )}

      {reproduciendo && actividadesVisibles.length > 0 && (
        <View pointerEvents="none" style={styles.actividadesJourney}>
          <Text style={styles.actividadesEyebrow}>ACTIVIDADES</Text>
          {actividadesVisibles.map((act, i) => {
            const actual = i === actividadesVisibles.length - 1;
            return (
              <View key={act.id || `${act.recorded_at || 'act'}-${act.numero}`} style={[styles.actividadFila, actual && styles.actividadFilaActual]}>
                <Text style={[styles.actividadNumero, actual && styles.actividadNumeroActual]}>{String(act.numero).padStart(2, '0')}</Text>
                <View style={styles.actividadTexto}>
                  <Text style={styles.actividadKm}>{Number(act.distance_km).toFixed(1)} km</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View pointerEvents="none" style={styles.hud}>
        <Text numberOfLines={1} style={[styles.hudEyebrow, { maxWidth: Math.max(100, (tam?.w || 320) - 150) }]}>{escena.presentacion?.eyebrow || 'KORVA JOURNEY'}</Text>
        <Text numberOfLines={1} style={styles.hudTitulo}>{escena.presentacion?.titulo || 'Tu recorrido'}</Text>
      </View>
      <View pointerEvents="none" style={[styles.chip, completado && styles.chipCompleto]}>
        <Text style={[styles.chipTxt, completado && styles.chipTxtCompleto]}>
          {completado ? '✓ CONQUISTADO' : `${kmTxt.toFixed(kmTxt < 10 ? 1 : 0)} / ${textoKm(totalTxt)} km`}
        </Text>
      </View>
      {escena.mostrarRelacionRecorrido && mundo && (
        <View pointerEvents="none" style={styles.relacionRecorrido}>
          <Text style={styles.relacionTitulo}>CIRCUITO VIRTUAL</Text>
          <Text style={styles.relacionDetalle}>{String(escena.distanciaKm).replace('.', ',')} km de desafío</Text>
          <Text style={styles.relacionDetalle}>{mundo.datos.largoKm.toFixed(1).replace('.', ',')} km de trazado</Text>
        </View>
      )}
      {cierreVisible && (
        <Animated.View pointerEvents="none" style={[styles.cierreLogro, { opacity: cierreOpacity }]}>
          <Text style={styles.cierreEyebrow}>RECORRIDO COMPLETADO</Text>
          <Text style={styles.cierreKm}>{textoKm(totalTxt)} KM</Text>
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
      <TouchableOpacity activeOpacity={0.82} onPress={recenter} accessibilityRole="button" accessibilityLabel="Recentrar mapa" style={styles.recentrar}>
        <Text style={styles.recentrarTxt}>⌖</Text>
      </TouchableOpacity>
      {!completado && journey.siguiente && (
        <View pointerEvents="none" style={styles.proximoHud}>
          <Text style={styles.proximoEyebrow}>PRÓXIMO DESTINO</Text>
          <Text numberOfLines={1} style={styles.proximoNombre}>{journey.siguiente.nombre}</Text>
          <Text style={styles.proximoKm}>a {journey.kmHastaSiguiente.toFixed(journey.kmHastaSiguiente < 10 ? 1 : 0)} km</Text>
        </View>
      )}
      <Text pointerEvents="none" style={styles.pista}>1 dedo gira e inclina · 2 dedos zoom y mover</Text>
      <View pointerEvents="none" style={styles.borde} />
    </View>
  );
}

const sombraTexto = { textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 };

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden', borderRadius: 18, backgroundColor: colors.backgroundDeep },
  canvas: { flex: 1 },
  borde: { ...StyleSheet.absoluteFillObject, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 18 },
  estadoModelo: { position: 'absolute', left: 14, right: 14, bottom: 48, color: '#FFFFFF', backgroundColor: '#102333CC', padding: 8, borderRadius: 8, fontSize: 11, textAlign: 'center' },
  cargando: { position: 'absolute', alignSelf: 'center', top: '48%', color: colors.textDim, fontSize: 11, letterSpacing: 0.6 },

  hud: { position: 'absolute', left: 14, right: 14, top: 12 },
  actividadesJourney: { position: 'absolute', left: 14, top: 142, width: 86, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(9,23,37,0.72)', borderWidth: 1, borderColor: 'rgba(168,207,255,0.16)' },
  actividadesEyebrow: { color: 'rgba(168,207,255,0.62)', fontSize: 7, fontWeight: '900', letterSpacing: 1.25, marginBottom: 5 },
  actividadFila: { flexDirection: 'row', alignItems: 'center', minHeight: 25, opacity: 0.48 },
  actividadFilaActual: { opacity: 1 },
  actividadNumero: { width: 24, color: colors.textMuted, fontSize: 9, fontWeight: '900' },
  actividadNumeroActual: { color: colors.brandOrangeSoft },
  actividadTexto: { flex: 1 },
  actividadKm: { color: colors.textMuted, fontSize: 8, marginTop: 1 },
  relacionRecorrido: { position: 'absolute', right: 12, bottom: 92, padding: 7, borderRadius: 8, backgroundColor: 'rgba(9,23,37,0.74)' },
  relacionTitulo: { color: colors.textMuted, fontSize: 7, fontWeight: '800', letterSpacing: 0.7 },
  relacionDetalle: { color: colors.textSoft, fontSize: 9, marginTop: 2 },
  hudEyebrow: { color: colors.brandOrange, fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  hudTitulo: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 14, ...sombraTexto },
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
  playJourney: { position: 'absolute', left: 14, top: 66, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(243,107,10,0.9)', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  playJourneyActivo: { backgroundColor: 'rgba(9,23,37,0.88)', borderWidth: 1, borderColor: 'rgba(255,176,120,0.65)' },
  playJourneyTxt: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  estoyAca: { position: 'absolute', left: 14, top: 100, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(9,23,37,0.82)', borderWidth: 1, borderColor: 'rgba(243,107,10,0.55)' },
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
  etiquetaNombre: { color: '#FFFFFF', fontSize: 10, lineHeight: 12, fontWeight: '800', letterSpacing: 1.1, ...sombraTexto },
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
