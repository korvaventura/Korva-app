import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapaRecorrido from './MapaRecorrido';
import KorvaProgressShare from '../components/KorvaProgressShare';
import HistorialActividades from '../components/HistorialActividades';
import useRutaLibre from '../services/useRutaLibre';
import { consultarRutaLibre } from '../services/rutasLibresApi';
import { supabase } from '../supabase';
import { colors, radius, spacing } from '../theme/korvaTheme';
import { TEXTO_ACEPTAR } from '../services/islandiaInvitacionCore';

const { formatoKm, urlsFondo, ISLANDIA } = require('../services/compartirCore');
const islandiaHistoria = require('../services/desafios/islandia');

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const VERDE = '#78DEC5';
const formatearFecha = (f) => (f ? new Date(f).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

// Islandia con el mismo formato que la historia de cualquier desafío:
// progreso, tu ruta, actividades registradas (con compartir). Verde = ruta libre.
export default function RutaLibreScreen({ navigation, route }) {
  const abrirRuta = route?.params?.abrirRuta === true;
  const { estado, actualizar } = useRutaLibre();
  const [compartiendo, setCompartiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [actividades, setActividades] = useState([]);
  const [cargandoAct, setCargandoAct] = useState(true);
  const [mapaActivo, setMapaActivo] = useState(false);
  const scroll = useRef(null), scrollY = useRef(0), pendiente = useRef(false), vivo = useRef(false);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  useEffect(() => { urlsFondo(ISLANDIA.titulo).forEach((u) => Image.prefetch(u).catch(() => {})); }, []);

  const p = estado.datos?.participacion;
  const activa = !!p && !p.abandonado;
  const km = Number(p?.km) || 0;
  const pct = Math.min(100, Number(p?.porcentaje) || 0);
  const reto = { challenge_id: ISLANDIA.id, challenge: ISLANDIA.titulo, km_completados: km, distancia_total: ISLANDIA.km, libre: true };

  // Salidas que cuentan para Islandia: las posteriores a su inicio.
  useEffect(() => {
    if (!activa || !p?.started_at) { setCargandoAct(false); setActividades([]); return; }
    let vigente = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`${BACKEND_URL}/actividades`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const lista = res.ok ? await res.json() : [];
        const desde = new Date(p.started_at);
        if (vigente) setActividades((Array.isArray(lista) ? lista : []).filter((a) => a && !a.excluida && new Date(a.recorded_at) >= desde));
      } catch {
        if (vigente) setActividades([]);
      } finally {
        if (vigente) setCargandoAct(false);
      }
    })();
    return () => { vigente = false; };
  }, [activa, p?.started_at, p?.km]);

  const actuar = async (accion) => {
    if (pendiente.current || !estado.datos) return;
    pendiente.current = true; setGuardando(true); setError('');
    try {
      await consultarRutaLibre({ userId: estado.datos.userId, accion,
        body: accion === 'aceptar' ? { acepto: true, version: estado.datos.ruta.aceptacion_version } : {} });
      if (vivo.current) await actualizar();
    } catch (e) { if (vivo.current) setError(e.message); }
    finally { pendiente.current = false; if (vivo.current) setGuardando(false); }
  };
  const aceptar = () => Alert.alert('Empezar Islandia', TEXTO_ACEPTAR,
    [{ text: 'Cancelar', style: 'cancel' }, { text: 'Aceptar y empezar', onPress: () => actuar('aceptar') }]);
  const dejar = () => Alert.alert('Dejar la ruta', 'Se conserva tu avance. Si volvés a aceptarla, el movimiento realizado mientras estuvo abandonada no cuenta.',
    [{ text: 'Cancelar', style: 'cancel' }, { text: 'Dejar ruta', onPress: () => actuar('dejar') }]);

  const bloquearMapa = useCallback((on) => { setMapaActivo(on); scroll.current?.setNativeProps?.({ scrollEnabled: !on }); }, []);
  const mostrarHistoria = useCallback((historia) => {
    bloquearMapa(false);
    const nativo = scroll.current?.getNativeScrollRef?.() || scroll.current;
    nativo?.measureInWindow?.((_x, top) => historia?.measureInWindow?.((_hx, y) => {
      scroll.current?.scrollTo({ y: Math.max(0, scrollY.current + y - top - 16), animated: true });
    }));
  }, [bloquearMapa]);

  const textoEstado = p?.estado === 'elegida' ? 'Esperando tu primera actividad.'
    : p?.estado === 'pausada' ? 'Ruta pausada: conserva tu avance y no cuenta actividades durante la pausa.'
    : p?.estado === 'completada' ? '¡Completaste la vuelta a Islandia!' : null;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView ref={scroll} style={s.scroll} contentContainerStyle={s.contenido} scrollEnabled={!mapaActivo}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
        canCancelContentTouches onTouchEnd={() => bloquearMapa(false)} onTouchCancel={() => bloquearMapa(false)}>
        <TouchableOpacity style={s.volver} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={20} color={colors.actionBlue} />
          <Text style={s.volverTexto}>Volver</Text>
        </TouchableOpacity>

        <Text style={s.eyebrow}>{activa ? 'HISTORIA DEL DESAFÍO' : 'RUTA LIBRE · SIN COSTO'}</Text>
        <Text style={s.titulo}>Islandia · Ring Road</Text>
        <Text style={s.subtitulo}>Ruta libre · 1.400 km · sin medalla</Text>
        <Text style={s.subtituloSuave}>Cascadas, glaciares, fiordos, volcanes y sagas. Todos los kilómetros suman igual.</Text>

        {estado.cargando ? <ActivityIndicator color={VERDE} style={{ marginVertical: spacing.xl }} />
          : estado.error ? (
            <View style={s.tarjeta}>
              <Text style={s.error}>{estado.error}</Text>
              <TouchableOpacity onPress={actualizar}><Text style={s.link}>Reintentar</Text></TouchableOpacity>
            </View>
          ) : activa ? (
            <View style={s.tarjeta}>
              <View style={s.filaKm}>
                <Text style={s.km}>{formatoKm(km)} km</Text>
                <View style={s.pill}>
                  {pct >= 100 && <Ionicons name="checkmark" size={16} color={VERDE} />}
                  <Text style={s.pct}>{pct > 0 && pct < 1 ? '<1' : Math.floor(pct)}%</Text>
                </View>
              </View>
              <View style={s.barra}><View style={[s.relleno, { width: `${pct}%` }]} /></View>
              <Text style={s.total}>de 1.400 km totales</Text>
              {Number(p.km_movimiento_diario) > 0 && (
                <View style={s.desglose}>
                  <Text style={s.desgloseTitulo}>Cómo se forma tu progreso</Text>
                  <View style={s.desgloseFila}><Text style={s.desgloseLabel}>Actividades registradas</Text><Text style={s.desgloseValor}>{formatoKm(km - Number(p.km_movimiento_diario))} km</Text></View>
                  <View style={s.desgloseFila}><Text style={s.desgloseLabel}>Movimiento diario</Text><Text style={s.desgloseValor}>{formatoKm(p.km_movimiento_diario)} km</Text></View>
                </View>
              )}
              {!!textoEstado && <Text style={s.estado}>{textoEstado}</Text>}
              {p.started_at && <Text style={s.fecha}>Comenzaste el {formatearFecha(p.started_at)}</Text>}
              <View style={s.acciones}>
                <TouchableOpacity onPress={() => setCompartiendo(true)} accessibilityRole="button" style={s.accion}>
                  <Ionicons name="share-outline" size={16} color={VERDE} /><Text style={s.accionTexto}>Compartir progreso</Text>
                </TouchableOpacity>
                {p.estado !== 'completada' && (
                  <View style={s.accionesSec}>
                    <TouchableOpacity disabled={guardando} onPress={() => actuar(p.pausado ? 'reanudar' : 'pausar')}><Text style={s.accionSec}>{p.pausado ? 'Reanudar' : 'Pausar'}</Text></TouchableOpacity>
                    <TouchableOpacity disabled={guardando} onPress={dejar}><Text style={s.accionSec}>Dejar ruta</Text></TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.boton} disabled={guardando} onPress={aceptar}>
              <Text style={s.botonTexto}>{p?.abandonado ? 'Retomar la ruta' : 'Empezar la ruta'}</Text>
            </TouchableOpacity>
          )}
        {guardando && <ActivityIndicator color={VERDE} />}
        {!!error && <Text style={s.error}>{error}</Text>}

        <View style={s.seccion}>
          <View style={s.seccionFila}>
            <Ionicons name="map-outline" size={19} color={colors.actionBlue} />
            <Text style={s.seccionTitulo}>Tu ruta</Text>
          </View>
          <Text style={s.seccionSub}>Explorá los checkpoints de tu aventura.</Text>
          {abrirRuta ? (
            <MapaRecorrido challengeId={ISLANDIA.id} challengeTitle={ISLANDIA.titulo} kmCompletados={km}
              distanciaTotal={1400} porcentaje={pct} integrado alturaMapa={500} onInteraccionMapa={bloquearMapa} onHistoriaAbierta={mostrarHistoria} />
          ) : (
            <TouchableOpacity style={s.abrirMapa} accessibilityRole="button" onPress={() => navigation.push('RutaLibre', { abrirRuta: true })}>
              <Ionicons name="map-outline" size={18} color={colors.actionBlue} />
              <Text style={s.abrirMapaTexto}>Abrir mapa del recorrido</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.actionBlue} />
            </TouchableOpacity>
          )}
          {abrirRuta && <Text style={s.nota}>Mapa artístico del desafío virtual; no sirve para navegación GPS.</Text>}
        </View>

        {!abrirRuta && (
          <View style={s.capitulos}>
            <Text style={s.capitulosTitulo}>La vuelta en cinco capítulos</Text>
            {islandiaHistoria.capitulos.map((c) => (
              <Text key={c.id} style={s.capitulo}><Text style={s.capituloNum}>{c.numero}  </Text>{c.nombre}</Text>
            ))}
          </View>
        )}

        {!abrirRuta && activa && (
          <HistorialActividades actividades={actividades} cargando={cargandoAct} distanciaTotal={1400} reto={reto} navigation={navigation} />
        )}
      </ScrollView>
      {compartiendo && <KorvaProgressShare reto={{ titulo: ISLANDIA.titulo, km, total: 1400, challenge_id: ISLANDIA.id }} onClose={() => setCompartiendo(false)} />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1, backgroundColor: colors.background },
  contenido: { paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  volver: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.lg, marginBottom: spacing.md },
  volverTexto: { color: colors.actionBlue, fontSize: 14, fontWeight: '700' },
  eyebrow: { color: VERDE, fontSize: 9, fontWeight: '900', letterSpacing: 2, marginBottom: spacing.sm },
  titulo: { fontSize: 26, fontWeight: '900', color: colors.text, marginBottom: spacing.sm },
  subtitulo: { fontSize: 13, color: colors.textSoft, marginBottom: spacing.xs },
  subtituloSuave: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginBottom: spacing.xxl },
  tarjeta: { backgroundColor: colors.surfaceSoft, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, borderWidth: 1, borderColor: '#32665C' },
  filaKm: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  km: { fontSize: 38, fontWeight: '900', letterSpacing: -1, color: colors.text },
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.backgroundDeep, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  pct: { fontSize: 16, fontWeight: '900', color: VERDE },
  barra: { height: 4, backgroundColor: colors.borderSoft, borderRadius: radius.pill, marginBottom: spacing.sm, overflow: 'hidden' },
  relleno: { height: 4, backgroundColor: VERDE, borderRadius: radius.pill },
  total: { fontSize: 12, color: colors.textMuted },
  desglose: { borderTopWidth: 1, borderColor: colors.borderSoft, marginTop: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  desgloseTitulo: { color: colors.actionBlue, fontSize: 13, fontWeight: '800' },
  desgloseFila: { flexDirection: 'row', justifyContent: 'space-between' },
  desgloseLabel: { color: colors.textMuted, fontSize: 12 },
  desgloseValor: { color: colors.text, fontSize: 12, fontWeight: '700' },
  estado: { fontSize: 12, lineHeight: 18, color: colors.textSoft, marginTop: spacing.md },
  fecha: { fontSize: 11, lineHeight: 16, color: colors.textMuted, marginTop: spacing.md },
  acciones: { borderTopWidth: 1, borderColor: colors.borderSoft, marginTop: spacing.lg, paddingTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.md },
  accion: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  accionTexto: { color: VERDE, fontSize: 13, fontWeight: '800' },
  accionesSec: { flexDirection: 'row', gap: spacing.lg },
  accionSec: { color: colors.textMuted, fontSize: 12, fontWeight: '700', paddingVertical: 6 },
  boton: { backgroundColor: colors.brandOrange, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: spacing.lg },
  botonTexto: { color: colors.text, fontWeight: '800' },
  error: { color: colors.brandOrangeSoft, fontSize: 13, marginVertical: spacing.sm },
  link: { color: colors.actionBlue, fontSize: 14, paddingVertical: spacing.md },
  seccion: { marginBottom: spacing.xl },
  seccionFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  seccionTitulo: { fontSize: 16, fontWeight: '800', color: colors.text },
  seccionSub: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  abrirMapa: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderSoft },
  abrirMapaTexto: { flex: 1, color: colors.actionBlue, fontSize: 14, fontWeight: '800' },
  nota: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: spacing.md },
  capitulos: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderSoft, padding: spacing.xl, marginBottom: spacing.xl, gap: 6 },
  capitulosTitulo: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  capitulo: { color: colors.textSoft, fontSize: 13, lineHeight: 20 },
  capituloNum: { color: VERDE, fontWeight: '900' },
});
