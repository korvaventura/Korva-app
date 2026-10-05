import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { colors } from '../theme/korvaTheme';
import { distanciaDeInscripcion } from '../utils/versionDesafio';
import KorvaGlobe3D from '../components/KorvaGlobe3D';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const COMPLETADOS = new Set(['completed', 'shipped', 'cargado']);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const DEG = Math.PI / 180;
const DESTINO_EDITORIAL = [
  { match: 'san andr', lugar: 'San Andrés · Colombia', copy: 'Caribe, arrecifes y cultura raizal en una isla rodeada por el famoso mar de siete colores. Una conquista inspirada en uno de los destinos más emblemáticos del Caribe colombiano.' },
  { match: 'dubrov', lugar: 'Dubrovnik · Croacia', copy: 'Murallas medievales, piedra caliza y el Adriático como horizonte. Una conquista inspirada en una de las ciudades fortificadas más extraordinarias del Mediterráneo.' },
  { match: 'fuji', lugar: 'Monte Fuji · Japón', copy: 'Un recorrido inspirado en el símbolo natural de Japón: caminos, lagos y paisajes que rodean la silueta inconfundible del Fuji.' },
  { match: 'fin del mundo', lugar: 'Tierra del Fuego · Argentina', copy: 'Bosques, montañas y el extremo austral del continente. Una conquista inspirada en los paisajes que llevan hasta el Fin del Mundo.' },
];
const normalizar = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const editorialDe = (destino) => DESTINO_EDITORIAL.find((item) => normalizar(destino?.title).includes(item.match));
const formatKm = (value) => {
  const n = Number(value || 0);
  return `${n.toFixed(Number.isInteger(n) ? 0 : 1)} km`;
};
const formatFecha = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};


export default function KorvaMundiScreen({ navigation }) {
  const [catalogo, setCatalogo] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [giroY, setGiroY] = useState(-25 * Math.PI / 180);
  const [giroX, setGiroX] = useState(-0.08);
  const [zoom, setZoom] = useState(1);
  const [arrastrando, setArrastrando] = useState(false);
  const giroYRef = useRef(giroY);
  const giroXRef = useRef(giroX);
  const giroYInicio = useRef(giroY);
  const giroXInicio = useRef(giroX);
  const zoomRef = useRef(1);
  const pinchInicio = useRef(null);
  const zoomInicio = useRef(1);
  const focusAnimation = useRef(null);

  const cargar = async () => {
    setCargando(true);
    setError(false);
    try {
      const [{ data: { session } }, resCatalogo] = await Promise.all([
        supabase.auth.getSession(),
        fetch(`${BACKEND_URL}/challenges`),
      ]);
      const dataCatalogo = await resCatalogo.json();
      if (!resCatalogo.ok || !Array.isArray(dataCatalogo)) throw new Error('catalogo');
      let dataInscripciones = [];
      if (session?.user?.id) {
        const { data, error: dbError } = await supabase
          .from('user_challenges')
          .select('challenge_id,status,completed_at,pausado,km_completed,version,modalidad')
          .eq('user_id', session.user.id);
        if (dbError) throw dbError;
        dataInscripciones = data || [];
      }
      setCatalogo(dataCatalogo);
      setInscripciones(dataInscripciones);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const destinos = useMemo(() => {
    const porChallenge = new Map(inscripciones.map((x) => [x.challenge_id, x]));
    return catalogo
      .filter((c) => Number.isFinite(Number(c.latitude)) && Number.isFinite(Number(c.longitude)))
      .map((challenge) => {
        const uc = porChallenge.get(challenge.id);
        const objetivo = distanciaDeInscripcion(uc || {}, challenge) || Number(challenge.total_distance_km) || 0;
        const km = Number(uc?.km_completed || 0);
        const porcentaje = objetivo > 0 ? clamp((km / objetivo) * 100, 0, 100) : 0;
        let estado = 'por_conquistar';
        if (uc) estado = 'adquirido';
        if (uc && (km > 0 || uc.status === 'active')) estado = 'en_curso';
        if (uc && (COMPLETADOS.has(uc.status) || porcentaje >= 100)) estado = 'conquistado';
        return { ...challenge, ...uc, objetivo, km, porcentaje, estado };
      });
  }, [catalogo, inscripciones]);

  const resumen = useMemo(() => ({
    conquistados: destinos.filter((d) => d.estado === 'conquistado').length,
    enCurso: destinos.filter((d) => d.estado === 'en_curso').length,
    porConquistar: destinos.filter((d) => d.estado === 'por_conquistar').length,
  }), [destinos]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponderCapture: (evt, g) => {
      const touches = evt.nativeEvent.touches || [];
      return touches.length >= 2 || Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5;
    },
    onMoveShouldSetPanResponder: (evt, g) => {
      const touches = evt.nativeEvent.touches || [];
      return touches.length >= 2 || Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4;
    },
    onPanResponderGrant: (evt) => {
      giroYInicio.current = giroYRef.current;
      giroXInicio.current = giroXRef.current;
      zoomInicio.current = zoomRef.current;
      const touches = evt.nativeEvent.touches || [];
      if (touches.length >= 2) {
        const [a, b] = touches;
        pinchInicio.current = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
      } else {
        pinchInicio.current = null;
      }
      setArrastrando(true);
    },
    onPanResponderMove: (evt, g) => {
      const touches = evt.nativeEvent.touches || [];
      if (touches.length >= 2) {
        const [a, b] = touches;
        const distancia = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
        if (!pinchInicio.current) pinchInicio.current = distancia;
        const siguienteZoom = clamp(zoomInicio.current * (distancia / Math.max(1, pinchInicio.current)), 0.72, 2.35);
        zoomRef.current = siguienteZoom;
        setZoom(siguienteZoom);
        return;
      }
      const siguienteY = giroYInicio.current - g.dx * 0.0044;
      const siguienteX = clamp(giroXInicio.current - g.dy * 0.0032, -0.72, 0.72);
      giroYRef.current = siguienteY;
      giroXRef.current = siguienteX;
      setGiroY(siguienteY);
      setGiroX(siguienteX);
    },
    onPanResponderRelease: () => { pinchInicio.current = null; setArrastrando(false); },
    onPanResponderTerminate: () => { pinchInicio.current = null; setArrastrando(false); },
  }), []);

  const seleccionarDestino = (destino) => {
    setSeleccionado(destino);
    if (focusAnimation.current) cancelAnimationFrame(focusAnimation.current);

    const startY = giroYRef.current;
    const startX = giroXRef.current;
    const targetYRaw = -Number(destino.longitude) * DEG - Math.PI / 2;
    let deltaY = targetYRaw - startY;
    while (deltaY > Math.PI) deltaY -= Math.PI * 2;
    while (deltaY < -Math.PI) deltaY += Math.PI * 2;
    const targetY = startY + deltaY;
    const targetX = clamp(Number(destino.latitude) * DEG * 0.72, -0.62, 0.62);
    const started = Date.now();
    const duration = 520;

    const animate = () => {
      const t = clamp((Date.now() - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const nextY = startY + (targetY - startY) * eased;
      const nextX = startX + (targetX - startX) * eased;
      giroYRef.current = nextY;
      giroXRef.current = nextX;
      setGiroY(nextY);
      setGiroX(nextX);
      if (t < 1) focusAnimation.current = requestAnimationFrame(animate);
    };
    focusAnimation.current = requestAnimationFrame(animate);
  };

  const estadoTexto = (d) => {
    if (d.estado === 'conquistado') return 'Conquistado';
    if (d.estado === 'en_curso') return `${Math.round(d.porcentaje)}% conquistado`;
    if (d.estado === 'adquirido') return 'Listo para comenzar';
    return 'Aventura por conquistar';
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} scrollEnabled={!arrastrando}>
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Volver">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.brand}>KORVAMUNDI</Text>
        <View style={styles.back} />
      </View>

      <Text style={styles.title}>Tu mundo por conquistar</Text>
      <Text style={styles.subtitle}>{resumen.conquistados} conquistados · {resumen.enCurso} en curso · {resumen.porConquistar} por descubrir</Text>

      {cargando ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.brandOrange} /></View>
      ) : error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No pudimos cargar tu mundo.</Text>
          <TouchableOpacity onPress={cargar}><Text style={styles.retry}>Reintentar</Text></TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.globeWrap} {...panResponder.panHandlers}>
            <KorvaGlobe3D
              destinos={destinos}
              giroX={giroX}
              giroY={giroY}
              zoom={zoom}
              onSelect={seleccionarDestino}
              seleccionadoId={seleccionado?.id}
            />
          </View>

          <View style={styles.zoomRow}>
            <TouchableOpacity style={styles.zoomButton} onPress={() => { const z = clamp(zoomRef.current - 0.18, 0.72, 2.35); zoomRef.current = z; setZoom(z); }}><Text style={styles.zoomText}>−</Text></TouchableOpacity>
            <TouchableOpacity style={styles.zoomButton} onPress={() => { const z = clamp(zoomRef.current + 0.18, 0.72, 2.35); zoomRef.current = z; setZoom(z); }}><Text style={styles.zoomText}>+</Text></TouchableOpacity>
          </View>

          <View style={styles.legend}>
            <LegendDot color={colors.brandOrange} label="Conquistado" />
            <LegendDot color="#58A6E7" label="En curso" />
            <LegendDot color="#5E7F9C" label="Por descubrir" />
          </View>

          {destinos.length === 0 && (
            <Text style={styles.noDestinos}>Los destinos aparecerán cuando el catálogo tenga su ubicación geográfica.</Text>
          )}

          {!seleccionado && <View style={styles.invite}><Text style={styles.inviteText}>Giralo y tocá un destino.</Text></View>}

          <Modal visible={!!seleccionado} transparent animationType="slide" onRequestClose={() => setSeleccionado(null)}>
            <View style={styles.sheetLayer} pointerEvents="box-none">
              <TouchableOpacity style={styles.sheetDismissArea} activeOpacity={1} onPress={() => setSeleccionado(null)} />
              {seleccionado && (() => {
                const editorial = editorialDe(seleccionado);
                const fecha = formatFecha(seleccionado.completed_at);
                const conquistado = seleccionado.estado === 'conquistado';
                const enCurso = seleccionado.estado === 'en_curso';
                return (
                <View style={styles.destinationCard}>
                  <View style={styles.sheetHandle} />
                  <View style={styles.destinationTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.destinationState}>{estadoTexto(seleccionado).toUpperCase()}</Text>
                      <Text style={styles.destinationTitle}>{seleccionado.title}</Text>
                      {!!editorial?.lugar && <Text style={styles.destinationPlace}>{editorial.lugar}</Text>}
                    </View>
                    <TouchableOpacity style={styles.closeSheet} onPress={() => setSeleccionado(null)} accessibilityLabel="Cerrar">
                      <Ionicons name="close" size={20} color={colors.textSoft} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.statsRow}>
                    <View style={styles.stat}><Text style={styles.statValue}>{formatKm(seleccionado.objetivo)}</Text><Text style={styles.statLabel}>OBJETIVO</Text></View>
                    <View style={styles.statDivider} />
                    <View style={styles.stat}><Text style={styles.statValue}>{Math.round(seleccionado.porcentaje || 0)}%</Text><Text style={styles.statLabel}>PROGRESO</Text></View>
                    <View style={styles.statDivider} />
                    <View style={styles.stat}><Text style={styles.statValue}>{formatKm(seleccionado.km)}</Text><Text style={styles.statLabel}>REGISTRADOS</Text></View>
                  </View>
                  <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${seleccionado.porcentaje}%` }]} /></View>
                  <View style={styles.progressMeta}>
                    <Text style={styles.progressText}>{conquistado ? 'Objetivo alcanzado' : `${formatKm(Math.min(seleccionado.km, seleccionado.objetivo))} de ${formatKm(seleccionado.objetivo)}`}</Text>
                    <Text style={styles.progressText}>{conquistado ? (fecha ? `Conquistado · ${fecha}` : 'Desafío completado') : `${formatKm(Math.max(0, seleccionado.objetivo - seleccionado.km))} restantes`}</Text>
                  </View>
                  <Text style={styles.destinationCopy} numberOfLines={4}>{editorial?.copy || seleccionado.historia || seleccionado.description}</Text>
                  {seleccionado.estado === 'por_conquistar' ? (
                    <TouchableOpacity style={styles.cta} onPress={() => { setSeleccionado(null); navigation.navigate('HomeTabs', { screen: 'Catalogo' }); }}>
                      <Text style={styles.ctaText}>Descubrir desafío</Text><Ionicons name="arrow-forward" size={16} color={colors.text} />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.conquestFooter}>
                      <Ionicons name={conquistado ? "flag" : "navigate"} size={16} color={conquistado ? colors.brandOrangeSoft : '#58A6E7'} />
                      <Text style={styles.conquestFooterText}>{conquistado ? 'Esta conquista ya forma parte de tu mundo.' : enCurso ? 'Tu próxima conquista está en marcha.' : 'Este desafío ya es parte de tu aventura.'}</Text>
                    </View>
                  )}
                </View>
                );
              })()}
            </View>
          </Modal>
        </>
      )}
    </ScrollView>
  );
}

function LegendDot({ color, label }) {
  return <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: 22, paddingTop: 48, paddingBottom: 34 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  brand: { color: colors.brandOrangeSoft, fontSize: 11, fontWeight: '900', letterSpacing: 3 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 7, marginBottom: 0 },
  loading: { minHeight: 390, alignItems: 'center', justifyContent: 'center' },
  globeWrap: { height: 575, marginHorizontal: -22, marginTop: -8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: -42, marginBottom: 12, zIndex: 5 },
  zoomButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderStrong },
  zoomText: { color: colors.textSoft, fontSize: 20, fontWeight: '700', lineHeight: 22 },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 16, marginTop: 0, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: colors.textMuted, fontSize: 10 },
  sheetLayer: { flex: 1, justifyContent: 'flex-end' },
  sheetDismissArea: { flex: 1, backgroundColor: 'rgba(3,14,24,0.08)' },
  destinationCard: { backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderStrong, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 34 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: 16 },
  closeSheet: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundDeep },
  destinationTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  destinationState: { color: colors.brandOrangeSoft, fontSize: 9, fontWeight: '900', letterSpacing: 1.7, marginBottom: 6 },
  destinationTitle: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.5 },
  destinationPlace: { color: '#8ACBF1', fontSize: 11, fontWeight: '700', marginTop: 5, letterSpacing: 0.2 },
  destinationCopy: { color: colors.textSoft, fontSize: 12.5, lineHeight: 20, marginTop: 18 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderStrong },
  stat: { flex: 1 },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 8, fontWeight: '800', letterSpacing: 1.2, marginTop: 4 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.borderStrong, marginHorizontal: 8 },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: colors.backgroundDeep, overflow: 'hidden', marginTop: 18 },
  progressFill: { height: 7, borderRadius: 4, backgroundColor: colors.brandOrange },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  progressText: { color: colors.textMuted, fontSize: 10 },
  cta: { minHeight: 48, borderRadius: 14, backgroundColor: colors.brandOrange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
  ctaText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  conquestFooter: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16, paddingHorizontal: 2 },
  conquestFooterText: { flex: 1, color: colors.textMuted, fontSize: 10.5, lineHeight: 16, fontWeight: '700' },
  invite: { alignItems: 'center', paddingTop: 8, paddingBottom: 12 },
  inviteText: { color: colors.textMuted, fontSize: 11 },
  noDestinos: { color: colors.textMuted, textAlign: 'center', fontSize: 11, lineHeight: 17, marginBottom: 16 },
  errorCard: { padding: 28, borderRadius: 20, backgroundColor: colors.surfaceSoft, alignItems: 'center', marginTop: 30 },
  errorTitle: { color: colors.textSoft, fontSize: 13, marginBottom: 12 },
  retry: { color: colors.brandOrangeSoft, fontSize: 13, fontWeight: '800' },
});

