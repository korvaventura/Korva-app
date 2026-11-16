import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapaRecorrido3D from './MapaRecorrido3D';
import KorvaGlobe3D from './KorvaGlobe3D';
import { colors } from '../theme/korvaTheme';
import { conUbicacion, destinosPrueba } from '../services/korvaMundiCore';
import { GLOBO_ZOOM_MAX, GLOBO_ZOOM_MIN, avanzarTope, destinosParaGlobo, giroHacia, resolverActual } from '../services/globoKorvaCore';
import { ISLANDIA_MUNDI } from '../services/rutaLibreMundiCore';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const ZOOM_VISTA_GLOBO = 1.05;
// Hay que seguir juntando los dedos ~50 % contra el tope del mapa para pasar al globo.
const UMBRAL_ALEJAR = 0.5;
// El mapa de la ruta queda montado debajo; memo evita volver a dibujarlo
// en cada cuadro mientras se gira el globo.
const MapaRuta = memo(MapaRecorrido3D);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Mapa de un desafío que se puede alejar hasta el globo Korva.
// Abre con zoom en la ruta; pellizcando para alejar (o con 🌍) pasa al planeta
// con todos los desafíos; "Volver a mi ruta" o pellizcar para acercar regresa.
export default function MapaConGlobo({ destinoActual, esAdmin = false, onAbrirDestino, ...propsMapa }) {
  const [vista, setVista] = useState('ruta');
  const [catalogo, setCatalogo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [recentrar, setRecentrar] = useState(null);
  // Mientras se ve el globo, el mapa 3D de la ruta se desmonta para liberar
  // la GPU (es la escena pesada). Al volver se monta otra vez desde la caché.
  const [rutaMontada, setRutaMontada] = useState(true);
  const rutaMontadaRef = useRef(true);
  // El desafío actual con coordenadas (locales o del catálogo, cuando llega).
  const actual = useMemo(() => resolverActual(destinoActual, catalogo || []), [destinoActual, catalogo]);
  const tieneUbicacion = actual?.latitude != null && actual?.longitude != null;
  const introPendienteRef = useRef(false);
  const inicial = useMemo(() => giroHacia(actual?.latitude ?? 0, actual?.longitude ?? 0), [actual?.latitude, actual?.longitude]);
  // Giro y zoom del globo viven en un ref que el globo lee en cada cuadro de GL.
  const controlRef = useRef({ x: inicial.giroX, y: inicial.giroY, zoom: GLOBO_ZOOM_MAX });
  const animRef = useRef(null);
  const opacidad = useRef(new Animated.Value(0)).current;
  const gesto = useRef({ giro: null, zoom: null, distancia: null, ultima: null, tope: 1 });

  const cargar = useCallback(async () => {
    setCargando(true); setError(false);
    try {
      const res = await fetch(`${BACKEND_URL}/challenges`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error('catalogo');
      setCatalogo(data);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  const destinos = useMemo(() => {
    const lista = catalogo || [];
    const prueba = destinosPrueba({ esAdmin, desarrollo: __DEV__, catalogo: lista });
    const islandia = lista.some((d) => d.id === ISLANDIA_MUNDI.id) ? [] : [ISLANDIA_MUNDI];
    const todos = [...conUbicacion(lista), ...prueba, ...islandia].map((d) => ({ ...d, estado: d.estado || 'por_conquistar' }));
    return destinosParaGlobo(todos, actual);
  }, [catalogo, esAdmin, actual]);

  const animar = useCallback((destino, duracion) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const desde = { ...controlRef.current };
    const inicio = Date.now();
    const paso = () => {
      const t = clamp((Date.now() - inicio) / duracion, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      const x = desde.x + (destino.x - desde.x) * e;
      const y = desde.y + (destino.y - desde.y) * e;
      const z = destino.zoom == null ? desde.zoom : desde.zoom + (destino.zoom - desde.zoom) * e;
      controlRef.current = { x, y, zoom: z };
      if (t < 1) animRef.current = requestAnimationFrame(paso);
    };
    animRef.current = requestAnimationFrame(paso);
  }, []);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const abrirGlobo = useCallback(() => {
    if (vista === 'globo') return;
    if (!catalogo && !cargando) cargar();
    // Arranca pegado a la ruta y se aleja hasta ver el planeta.
    const g = giroHacia(actual?.latitude ?? 0, actual?.longitude ?? 0, controlRef.current.y);
    controlRef.current = { x: g.giroX, y: g.giroY, zoom: GLOBO_ZOOM_MAX };
    setSeleccionado(null);
    setVista('globo');
    propsMapa.onInteraccionMapa?.(false);
    introPendienteRef.current = !tieneUbicacion;
    Animated.timing(opacidad, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      .start(({ finished }) => { if (finished) { rutaMontadaRef.current = false; setRutaMontada(false); } });
    if (tieneUbicacion) animar({ x: g.giroX, y: g.giroY, zoom: ZOOM_VISTA_GLOBO }, 1300);
    else animar({ x: controlRef.current.x, y: controlRef.current.y, zoom: ZOOM_VISTA_GLOBO }, 1300);
  }, [vista, catalogo, cargando, cargar, actual, tieneUbicacion, opacidad, animar, propsMapa.onInteraccionMapa]);

  // Si la ubicación del desafío llegó con el catálogo después de abrir el globo, girar hacia él.
  useEffect(() => {
    if (vista !== 'globo' || !introPendienteRef.current || !tieneUbicacion) return;
    introPendienteRef.current = false;
    const g = giroHacia(actual.latitude, actual.longitude, controlRef.current.y);
    animar({ x: g.giroX, y: g.giroY, zoom: ZOOM_VISTA_GLOBO }, 900);
  }, [vista, tieneUbicacion, actual, animar]);

  const volverARuta = useCallback(() => {
    if (vista !== 'globo') return;
    const g = giroHacia(actual?.latitude ?? 0, actual?.longitude ?? 0, controlRef.current.y);
    animar({ x: g.giroX, y: g.giroY, zoom: GLOBO_ZOOM_MAX }, 520);
    setSeleccionado(null);
    const remontar = !rutaMontadaRef.current;
    if (remontar) { rutaMontadaRef.current = true; setRecentrar(null); setRutaMontada(true); } else setRecentrar(Date.now());
    Animated.timing(opacidad, { toValue: 0, duration: 380, delay: remontar ? 650 : 360, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(() => setVista('ruta'));
  }, [vista, actual, opacidad, animar]);

  // La página que contiene el mapa deja de hacer scroll mientras se gira el globo.
  const bloquearRef = useRef(propsMapa.onInteraccionMapa);
  bloquearRef.current = propsMapa.onInteraccionMapa;
  const volverRef = useRef(volverARuta);
  volverRef.current = volverARuta;

  const seleccionar = useCallback((d) => {
    setSeleccionado(d);
    const g = giroHacia(d.latitude, d.longitude, controlRef.current.y);
    animar({ x: g.giroX, y: g.giroY }, 520);
  }, [animar]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (e, g) => (e.nativeEvent.touches || []).length >= 2 || Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
    onMoveShouldSetPanResponder: (e, g) => (e.nativeEvent.touches || []).length >= 2 || Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      bloquearRef.current?.(true);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      gesto.current = { giro: { ...controlRef.current }, zoom: controlRef.current.zoom, distancia: null, ultima: null, tope: 1 };
    },
    onPanResponderMove: (e, g) => {
      const t = e.nativeEvent.touches || [];
      if (t.length >= 2) {
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (!gesto.current.distancia) { gesto.current.distancia = d; gesto.current.zoom = controlRef.current.zoom; gesto.current.ultima = d; return; }
        const antes = controlRef.current.zoom;
        const z = clamp(gesto.current.zoom * (d / gesto.current.distancia), GLOBO_ZOOM_MIN, GLOBO_ZOOM_MAX);
        controlRef.current = { ...controlRef.current, zoom: z };
        const tope = avanzarTope(gesto.current.tope, {
          n: 2, distanciaAnterior: gesto.current.ultima, distanciaActual: d, zoomAntes: antes, zoomDespues: z,
          enTope: antes >= GLOBO_ZOOM_MAX - 1e-6 && z >= GLOBO_ZOOM_MAX - 1e-6,
        }, { direccion: 'acercar' });
        gesto.current.tope = tope.acumulado;
        gesto.current.ultima = d;
        if (tope.cambiar) volverRef.current();
        return;
      }
      if (gesto.current.distancia) { gesto.current.distancia = null; gesto.current.giro = { ...controlRef.current }; gesto.current.dx0 = g.dx; gesto.current.dy0 = g.dy; }
      const base = gesto.current.giro;
      const dx = g.dx - (gesto.current.dx0 || 0);
      const dy = g.dy - (gesto.current.dy0 || 0);
      const y = base.y - dx * 0.0044 / Math.max(0.8, controlRef.current.zoom);
      const x = clamp(base.x - dy * 0.0032 / Math.max(0.8, controlRef.current.zoom), -0.72, 0.72);
      controlRef.current = { ...controlRef.current, x, y };
    },
    onPanResponderRelease: () => { gesto.current.distancia = null; bloquearRef.current?.(false); },
    onPanResponderTerminate: () => { gesto.current.distancia = null; bloquearRef.current?.(false); },
  }), []);

  return (
    <View style={[styles.wrap, Number(propsMapa.altura) > 0 && { flex: 0, height: Number(propsMapa.altura) }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents={vista === 'globo' ? 'none' : 'auto'}>
        {rutaMontada && <MapaRuta {...propsMapa} onAlejarAlGlobo={abrirGlobo} umbralAlejar={UMBRAL_ALEJAR} recentrarSenal={recentrar} />}
      </View>
      {vista === 'globo' && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.globo, { opacity: opacidad }]}>
          <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
            <KorvaGlobe3D destinos={destinos} controlRef={controlRef} dpr={1.25}
              onSelect={seleccionar} seleccionadoId={seleccionado?.id || actual?.id} />
          </View>
          <View pointerEvents="none" style={styles.titulo}>
            <Text style={styles.eyebrow}>KORVA MUNDI</Text>
            <Text style={styles.tituloTxt}>Girá el planeta · pellizcá para volver</Text>
          </View>
          {cargando && <ActivityIndicator style={styles.cargando} color={colors.brandOrange} />}
          {error && (
            <TouchableOpacity style={styles.error} onPress={cargar}>
              <Text style={styles.errorTxt}>No pudimos cargar los desafíos · Reintentar</Text>
            </TouchableOpacity>
          )}
          {!!seleccionado && (
            <View style={styles.ficha}>
              <Text numberOfLines={1} style={styles.fichaTitulo}>{seleccionado.title}</Text>
              {!!seleccionado.lugar && <Text numberOfLines={1} style={styles.fichaLugar}>{seleccionado.lugar}</Text>}
              {seleccionado.esActual
                ? <Text style={styles.fichaLugar}>Estás acá</Text>
                : !!onAbrirDestino && (
                  <TouchableOpacity onPress={() => onAbrirDestino(seleccionado)}>
                    <Text style={styles.fichaLink}>Ver desafío ›</Text>
                  </TouchableOpacity>
                )}
            </View>
          )}
          <TouchableOpacity activeOpacity={0.85} onPress={volverARuta} accessibilityRole="button" style={styles.volver}>
            <Text style={styles.volverTxt}>Volver a mi ruta</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%', overflow: 'hidden', borderRadius: 18 },
  globo: { backgroundColor: '#04111C' },
  titulo: { position: 'absolute', left: 14, right: 14, top: 12 },
  eyebrow: { color: colors.brandOrange, fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  tituloTxt: { color: '#C6D3DB', fontSize: 11, marginTop: 4 },
  cargando: { position: 'absolute', alignSelf: 'center', top: '46%' },
  error: { position: 'absolute', left: 14, right: 14, top: 52, padding: 8, borderRadius: 8, backgroundColor: 'rgba(9,23,37,0.85)' },
  errorTxt: { color: '#FFFFFF', fontSize: 11, textAlign: 'center' },
  ficha: { position: 'absolute', left: 14, right: 14, bottom: 70, padding: 10, borderRadius: 12, backgroundColor: 'rgba(9,23,37,0.88)', borderWidth: 1, borderColor: 'rgba(168,207,255,0.22)' },
  fichaTitulo: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  fichaLugar: { color: '#C6D3DB', fontSize: 11, marginTop: 2 },
  fichaLink: { color: colors.brandOrange, fontSize: 12, fontWeight: '800', marginTop: 6 },
  volver: { position: 'absolute', alignSelf: 'center', bottom: 18, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(243,107,10,0.95)' },
  volverTxt: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
