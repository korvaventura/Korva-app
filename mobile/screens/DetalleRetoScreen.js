import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { Ionicons } from '@expo/vector-icons';
import { versionDeInscripcion, etiquetaDeInscripcion } from '../utils/versionDesafio';
import RutaGpsActividad from '../components/RutaGpsActividad';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme/korvaTheme';
import { nombreDeporteActividad, nombreFuenteActividad } from '../utils/actividadPresentacion';
import KorvaCompletedShare from '../components/KorvaCompletedShare';
import MapaRecorrido from './MapaRecorrido';

const iconoDeporte = (tipo) => ({ ride: 'bicycle-outline', run: 'fitness-outline', swim: 'water-outline', walk: 'walk-outline' }[tipo] || 'pulse-outline');
const deporteHistoria = (tipo) => tipo === 'manual' ? 'Actividad' : nombreDeporteActividad(tipo);

const aplicarMascaraFecha = (texto) => {
  const numeros = texto.replace(/[^0-9]/g, '');
  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 4) return `${numeros.slice(0,2)}/${numeros.slice(2)}`;
  return `${numeros.slice(0,2)}/${numeros.slice(2,4)}/${numeros.slice(4,8)}`;
};
const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const formatearFecha = (fecha) => {
  if (!fecha) return '';
  return new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const diasEntre = (fecha1, fecha2) => {
  const d1 = new Date(fecha1);
  const d2 = new Date(fecha2);
  return Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)));
};

const getHitoActividad = (actividad, index, totalKmAcumulado, distanciaTotal) => {
  const pct = (totalKmAcumulado / distanciaTotal) * 100;
  const acumuladoAnterior = totalKmAcumulado - (Number(actividad.distance_km) || 0);
  const cruzaMeta = acumuladoAnterior < distanciaTotal && totalKmAcumulado >= distanciaTotal;
  const actividadNormal = { icono: iconoDeporte(actividad.sport_type), texto: deporteHistoria(actividad.sport_type) };
  if (index === 0) return { icono: 'flag-outline', texto: 'Primer paso' };
  if (cruzaMeta) return { icono: 'checkmark-circle-outline', texto: 'Desafío completado' };
  if (pct >= 100) return actividadNormal;
  if (pct >= 75) return { icono: 'trending-up-outline', texto: 'En la recta final' };
  if (pct >= 50) return { icono: 'navigate-outline', texto: 'Mitad del camino' };
  if (pct >= 25) return { icono: 'trending-up-outline', texto: 'Arrancando fuerte' };
  return actividadNormal;
};

export default function DetalleRetoScreen({ route, navigation }) {
  const { item, userId, nombrePersona, abrirRuta = false } = route.params;
  const scrollRef = useRef(null);
  const rutaY = useRef(0);
  const [actividades, setActividades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [metaFecha, setMetaFecha] = useState(item?.meta_fecha || '');
  const [editandoFecha, setEditandoFecha] = useState(false);
  const [inputFecha, setInputFecha] = useState('');
  const [guardandoMeta, setGuardandoMeta] = useState(false);
  const [desgloseProgreso, setDesgloseProgreso] = useState(null);
  const [compartirCompletado, setCompartirCompletado] = useState(false);



  const nombreReto = item?.challenge || item?.challenge_title || item?.challenges?.title || item?.challenges?.name || 'Desafío';
  const kmCompletados = Number(item?.km_completados ?? item?.km_completed ?? 0) || 0;
  const distanciaTotal = Number(item?.distancia_total ?? item?.distance_km ?? item?.challenges?.distance_km ?? item?.challenges?.distance ?? 0) || 0;
  const porcentajeCalculado = distanciaTotal > 0 ? (kmCompletados / distanciaTotal) * 100 : 0;
  const porcentajeRecibido = Number(item?.porcentaje);
  const pct = Math.min(Number.isFinite(porcentajeRecibido) ? porcentajeRecibido : porcentajeCalculado, 100);
  const estaCompletado = pct >= 100;
  // Versión Estándar/Extendida (solo distancia; cualquier deporte suma 1:1).
  const itemNormalizado = { ...item, challenge: nombreReto, km_completados: kmCompletados, distancia_total: distanciaTotal, porcentaje: pct };
  const version = versionDeInscripcion(itemNormalizado);
  const versionLabel = etiquetaDeInscripcion(itemNormalizado);

  useEffect(() => {
    cargarActividades();
    cargarMeta();
    cargarDesgloseProgreso();
  }, []);

  useEffect(() => {
    if (!abrirRuta) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, rutaY.current - 12), animated: true });
    }, 450);
    return () => clearTimeout(timer);
  }, [abrirRuta]);

  const cargarDesgloseProgreso = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${BACKEND_URL}/progreso-desglose`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const d = (data?.desafios || []).find(x => x.challenge_id === item.challenge_id);
      if (d) setDesgloseProgreso(d);
    } catch (error) {
      // El desglose es informativo: si falla, el progreso principal sigue funcionando.
    }
  };

  const cargarActividades = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setActividades([]);
        return;
      }
      const res = await fetch(`${BACKEND_URL}/progreso-desglose/${item.challenge_id}/actividades`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudo cargar la historia del desafío');
      const data = await res.json();
      setActividades(Array.isArray(data?.actividades) ? data.actividades : []);
    } catch (error) {
      console.error('Error cargando historia del desafío:', error);
      setActividades([]);
    } finally {
      setCargando(false);
    }
  };

  const cargarMeta = async () => {
    try {
      const { data } = await supabase
        .from('user_challenges')
        .select('meta_fecha')
        .eq('user_id', userId)
        .eq('challenge_id', item.challenge_id)
        .maybeSingle();
      setMetaFecha(data?.meta_fecha || item?.meta_fecha || '');
    } catch (error) {}
  };

  const guardarMeta = async () => {
    if (!inputFecha) {
      await supabase.from('user_challenges').update({ meta_fecha: null })
        .eq('user_id', userId).eq('challenge_id', item.challenge_id);
      setMetaFecha('');
      setEditandoFecha(false);
      return;
    }
    const partes = inputFecha.split('/');
    if (partes.length !== 3) { Alert.alert('Formato inválido', 'Usá DD/MM/AAAA'); return; }
    const [dia, mes, anio] = partes.map(Number);
    const fecha = new Date(anio, mes - 1, dia, 12, 0, 0);
    if (isNaN(fecha.getTime())) { Alert.alert('Fecha inválida'); return; }
    if (fecha <= new Date()) { Alert.alert('La fecha debe ser futura'); return; }

    // Sin límite diario: la versión no es un deporte y todos los km suman igual.
    saveFecha(fecha.toISOString());
  };

  const saveFecha = async (fechaISO) => {
    setGuardandoMeta(true);
    try {
      const { error } = await supabase.from('user_challenges').update({ meta_fecha: fechaISO })
        .eq('user_id', userId).eq('challenge_id', item.challenge_id);
      if (error) throw error;
      setMetaFecha(fechaISO);
      setEditandoFecha(false);
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar tu fecha objetivo.');
    } finally {
      setGuardandoMeta(false);
    }
  };

  const calcularStats = () => {
    if (actividades.length === 0) return null;
    const fechaInicio = new Date(item.started_at || actividades[actividades.length - 1]?.recorded_at);
    const fechaFin = estaCompletado ? new Date(item.completed_at || new Date()) : new Date();
    const diasTotales = diasEntre(fechaInicio, fechaFin);
    const sesiones = actividades.length;
    const kmActividades = desgloseProgreso?.km_actividades ?? actividades.reduce((sum, a) => sum + (Number(a.distance_km) || 0), 0);
    const kmPromedio = sesiones > 0 ? (kmActividades / sesiones).toFixed(1) : '0.0';
    const tiempoTotal = actividades.reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
    const horas = Math.floor(tiempoTotal / 3600);
    const minutos = Math.floor((tiempoTotal % 3600) / 60);

    // Solo contar actividades hasta la fecha de completado si el reto está terminado
    const fechaLimite = estaCompletado && item.completed_at ? new Date(item.completed_at) : null;
    const actividadesFiltradas = fechaLimite
      ? actividades.filter(a => new Date(a.recorded_at) <= fechaLimite)
      : actividades;

    const kmPorDia = actividadesFiltradas.reduce((acc, a) => {
      const dia = a.recorded_at?.split('T')[0];
      acc[dia] = (acc[dia] || 0) + a.distance_km;
      return acc;
    }, {});
    const mejorDia = Object.entries(kmPorDia).sort((a, b) => b[1] - a[1])[0];

    return { diasTotales, sesiones, kmPromedio, horas, minutos, mejorDia };
  };

  const stats = calcularStats();

  const kmRestantes = parseFloat(distanciaTotal) - parseFloat(kmCompletados);
  let acumulado = 0;
  const actividadesConHito = [...actividades].reverse().map((act, i) => {
    acumulado += act.distance_km;
    const hito = getHitoActividad(act, i, acumulado, parseFloat(distanciaTotal));
    return { ...act, hito, acumulado };
  });
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
    <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
        <View style={styles.backBtnRow}>
          <Ionicons name="arrow-back" size={20} color={colors.actionBlue} />
          <Text style={styles.backBtnText}>Volver</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.eyebrow}>HISTORIA DEL DESAFÍO</Text>
      <Text style={styles.titulo}>{nombreReto}</Text>
      <Text style={styles.subtitulo}>Versión {versionLabel} · {distanciaTotal} km</Text>
      <Text style={styles.subtituloVersion}>Cada actividad cuenta. Todos los kilómetros suman igual.</Text>

      <View style={styles.progresoCard}>
        <View style={styles.progresoHeader}>
          <Text style={styles.progresoKm}>{parseFloat(kmCompletados).toFixed(1)} km</Text>
          <View style={styles.progresoPill}>
            {estaCompletado && <Ionicons name="checkmark" size={16} color={colors.brandOrangeSoft} />}
            <Text style={styles.progresoPct}>{pct.toFixed(0)}%</Text>
          </View>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${pct}%` }, estaCompletado && styles.progressFillCompletado]} />
        </View>
        <Text style={styles.progresoSub}>de {distanciaTotal} km totales</Text>
        {desgloseProgreso && (
          <View style={styles.desgloseProgreso}>
            <Text style={styles.desgloseTitulo}>Cómo se forma tu progreso</Text>
            <View style={styles.desgloseFila}>
              <Text style={styles.desgloseLabel}>Actividades registradas</Text>
              <Text style={styles.desgloseValor}>{Number(desgloseProgreso.km_actividades || 0).toFixed(2)} km</Text>
            </View>
            {Number(desgloseProgreso.km_base || 0) > 0 && (
              <View style={styles.desgloseFila}>
                <Text style={styles.desgloseLabel}>Progreso anterior</Text>
                <Text style={styles.desgloseValor}>{Number(desgloseProgreso.km_base).toFixed(2)} km</Text>
              </View>
            )}
            {Number(desgloseProgreso.km_movimiento_diario || 0) > 0 && (
              <View style={styles.desgloseFila}>
                <Text style={styles.desgloseLabel}>Movimiento diario</Text>
                <Text style={styles.desgloseValor}>{Number(desgloseProgreso.km_movimiento_diario).toFixed(2)} km</Text>
              </View>
            )}
          </View>
        )}
        {item.started_at && (
          <Text style={styles.progresoFecha}>Comenzaste el {formatearFecha(item.started_at)}</Text>
        )}
      </View>

      <View onLayout={(e) => { rutaY.current = e.nativeEvent.layout.y; }} style={styles.rutaSection}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="map-outline" size={19} color={colors.actionBlue} />
          <Text style={styles.rutaTitulo}>Tu ruta</Text>
        </View>
        <Text style={styles.rutaSubtitulo}>{estaCompletado ? 'Recorré nuevamente los checkpoints de tu conquista.' : 'Explorá los checkpoints de tu aventura.'}</Text>
        <MapaRecorrido
          kmCompletados={kmCompletados}
          distanciaTotal={distanciaTotal}
          porcentaje={pct}
          challengeId={item.challenge_id}
          challengeTitle={nombreReto}
          fullscreen
        />
      </View>

      {estaCompletado && (
        <TouchableOpacity style={styles.completedShareBtn} accessibilityRole="button" onPress={() => setCompartirCompletado(true)}>
          <Ionicons name="share-outline" size={18} color={colors.brandOrangeSoft} />
          <Text style={styles.completedShareText}>Compartir desafío completado</Text>
        </TouchableOpacity>
      )}
      {estaCompletado && stats && (
        <View style={styles.statsCompletadoCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="medal-outline" size={20} color={colors.brandOrangeSoft} />
            <Text style={styles.statsCompletadoTitulo}>Desafío completado</Text>
          </View>
          <Text style={styles.statsCompletadoFrase}>
            Completaste {nombreReto} en {stats.diasTotales} días
          </Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumero}>{stats.diasTotales}</Text>
              <Text style={styles.statLabel}>Días</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumero}>{stats.sesiones}</Text>
              <Text style={styles.statLabel}>Sesiones</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumero}>{stats.kmPromedio}</Text>
              <Text style={styles.statLabel}>km/sesión</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumero}>{stats.horas}h {stats.minutos}m</Text>
              <Text style={styles.statLabel}>Tiempo total</Text>
            </View>
          </View>
          {stats.mejorDia && (
            <View style={styles.mejorDiaBox}>
              <Text style={styles.mejorDiaTexto}>
                Mejor día: {formatearFecha(stats.mejorDia[0])} · {stats.mejorDia[1].toFixed(1)} km
              </Text>
            </View>
          )}
        </View>
      )}


      {!estaCompletado && (
        <View style={styles.metaCard}>
          <View style={styles.metaHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="calendar-outline" size={18} color={colors.textSoft} />
              <Text style={styles.metaTitulo}>Tu meta personal</Text>
            </View>
            <TouchableOpacity style={styles.metaEditarTouch} accessibilityRole="button" onPress={() => {
              setInputFecha(metaFecha ? new Date(metaFecha).toLocaleDateString('es-AR') : '');
              setEditandoFecha(v => !v);
            }}>
              <Text style={styles.metaEditarBtn}>{editandoFecha ? 'Cancelar' : metaFecha ? 'Editar' : '+ Elegir fecha'}</Text>
            </TouchableOpacity>
          </View>

          {editandoFecha ? (
            <>
              <View style={styles.metaInputRow}>
                <TextInput
                  style={styles.metaInput}
                  value={inputFecha}
                  onChangeText={v => setInputFecha(aplicarMascaraFecha(v))}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  maxLength={10}
                />
                <TouchableOpacity style={styles.metaGuardarBtn} onPress={guardarMeta} disabled={guardandoMeta}>
                  <Text style={styles.metaGuardarBtnText}>{guardandoMeta ? '...' : 'Guardar'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.metaAclaracion}>Es una referencia personal. No modifica el desafío ni determina el envío de tu medalla.</Text>
            </>
          ) : metaFecha ? (
            <>
              <Text style={styles.metaFecha}>Objetivo: {formatearFecha(metaFecha)}</Text>
              <Text style={styles.metaDias}>
                {diasEntre(new Date(), new Date(metaFecha))} días · {Math.max(0, kmRestantes).toFixed(1)} km por recorrer
              </Text>
              <Text style={styles.metaRitmo}>
                Referencia matemática: ~{(Math.max(0, kmRestantes) / diasEntre(new Date(), new Date(metaFecha))).toFixed(1)} km/día
              </Text>
              <Text style={styles.metaAclaracion}>No es un plan de entrenamiento ni determina el envío de tu medalla.</Text>
            </>
          ) : (
            <Text style={styles.metaVacio}>Marcá una fecha objetivo para seguir tu progreso a tu ritmo. Es opcional y no afecta el envío de tu medalla.</Text>
          )}
        </View>
      )}

      <View style={styles.historialSection}>
        <View style={styles.historialHeader}>
          <Text style={styles.historialTitulo}>Actividades registradas</Text>
          {!cargando && <Text style={styles.historialCantidad}>{actividadesConHito.length}</Text>}
        </View>
        {cargando ? (
          <ActivityIndicator color={colors.brandOrange} />
        ) : actividadesConHito.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="flag-outline" size={28} color={colors.brandOrangeSoft} style={styles.emptyIcon} />
            <Text style={styles.emptyText}>Sin actividades todavía</Text>
            <Text style={styles.emptySubtext}>Registrá tu primer km — correr, caminar, bici o nadar, todo suma.</Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {actividadesConHito.map((act, index) => (
              <View key={index} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, index === 0 && styles.timelineDotActivo]}>
                    <Ionicons name={act.hito.icono} size={18} color={index === 0 ? colors.brandOrangeSoft : colors.textMuted} />
                  </View>
                  {index < actividadesConHito.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineHito}>{act.hito.texto}</Text>
                  <Text style={styles.timelineFecha}>{formatearFecha(act.recorded_at)}</Text>
                  <View style={styles.timelineActRow}>
                    <Text style={styles.timelineKm}>{parseFloat(act.distance_km).toFixed(2)} km</Text>
                  </View>
                  <Text style={styles.timelineTipo}>{deporteHistoria(act.sport_type)} · {nombreFuenteActividad(act.source)}</Text>
                  <Text style={styles.timelineAcumulado}>Acumulado en actividades: {act.acumulado.toFixed(2)} km</Text>
                  {act.source === 'korva_gps' && act.id && <RutaGpsActividad activityId={act.id} />}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

    </ScrollView>
    <KorvaCompletedShare nombrePersona={nombrePersona} reto={compartirCompletado ? itemNormalizado : null} onClose={() => setCompartirCompletado(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  rutaSection: { marginBottom: spacing.xl },
  rutaTitulo: { fontSize: 16, fontWeight: '800', color: colors.text },
  rutaSubtitulo: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  completedShareBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.pill, marginBottom: spacing.lg, paddingHorizontal: spacing.md },
  completedShareText: { fontSize: 13, fontWeight: '800', color: colors.brandOrangeSoft },
  safeArea: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  backBtn: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: spacing.lg, marginBottom: spacing.md },
  backBtnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backBtnText: { color: colors.actionBlue, fontSize: 14, fontWeight: '700' },
  eyebrow: { color: colors.brandOrangeSoft, fontSize: 9, fontWeight: '900', letterSpacing: 2, marginBottom: spacing.sm },
  titulo: { fontSize: 26, fontWeight: '900', color: colors.text, marginBottom: spacing.sm },
  subtitulo: { fontSize: 13, color: colors.textSoft, marginBottom: spacing.xs },
  subtituloVersion: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginBottom: spacing.xxl },
  progresoCard: { backgroundColor: colors.surfaceSoft, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.borderSoft },
  progresoHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  progresoKm: { fontSize: 38, fontWeight: '900', letterSpacing: -1, color: colors.text },
  progresoPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.backgroundDeep, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  progresoPct: { fontSize: 16, fontWeight: '900', color: colors.brandOrangeSoft },
  progressBar: { height: 4, backgroundColor: colors.borderSoft, borderRadius: radius.pill, marginBottom: spacing.sm, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.brandOrange, borderRadius: radius.pill },
  progressFillCompletado: { backgroundColor: colors.brandOrangeSoft },
  progresoSub: { fontSize: 12, color: colors.textMuted },
  desgloseProgreso: { marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: spacing.sm },
  desgloseTitulo: { fontSize: 12, fontWeight: '700', color: colors.textSoft, marginBottom: spacing.xs },
  desgloseFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  desgloseLabel: { flex: 1, fontSize: 12, color: colors.textMuted },
  desgloseValor: { fontSize: 12, fontWeight: '700', color: colors.text },
  progresoFecha: { fontSize: 11, lineHeight: 16, color: colors.textMuted, marginTop: spacing.md },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  statsCompletadoCard: { backgroundColor: colors.surfaceSoft, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.borderSoft },
  statsCompletadoTitulo: { fontSize: 16, fontWeight: '800', color: colors.brandOrangeSoft, flexShrink: 1 },
  statsCompletadoFrase: { fontSize: 13, lineHeight: 19, color: colors.textSoft, marginTop: spacing.sm, marginBottom: spacing.lg },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  statItem: { backgroundColor: colors.backgroundDeep, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', minWidth: '45%', flex: 1 },
  statNumero: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  statLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  mejorDiaBox: { paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSoft },
  mejorDiaTexto: { fontSize: 12, lineHeight: 18, color: colors.textSoft },
  metaCard: { padding: spacing.lg, borderRadius: radius.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.borderSoft },
  metaHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  metaTitulo: { fontSize: 14, fontWeight: '800', color: colors.text },
  metaEditarTouch: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  metaEditarBtn: { color: colors.actionBlue, fontWeight: '700', fontSize: 12 },
  metaInputRow: { flexDirection: 'row', gap: spacing.sm },
  metaInput: { flex: 1, minWidth: 0, backgroundColor: colors.surfaceSoft, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  metaGuardarBtn: { minHeight: 44, backgroundColor: colors.brandOrange, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', justifyContent: 'center' },
  metaGuardarBtnText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  metaFecha: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  metaDias: { fontSize: 12, lineHeight: 18, color: colors.brandOrangeSoft, fontWeight: '700', marginBottom: spacing.xs },
  metaRitmo: { fontSize: 12, lineHeight: 18, color: colors.textSoft, marginBottom: spacing.sm },
  metaAclaracion: { fontSize: 11, lineHeight: 17, color: colors.textMuted, marginTop: spacing.xs },
  metaVacio: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  historialSection: { marginTop: spacing.md },
  historialHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.lg },
  historialTitulo: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  historialCantidad: { color: colors.textMuted, fontSize: 12, fontWeight: '700', backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill },
  emptyCard: { backgroundColor: colors.surfaceSoft, borderRadius: radius.lg, padding: spacing.xxl, alignItems: 'center' },
  emptyIcon: { marginBottom: spacing.md },
  emptyText: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  emptySubtext: { fontSize: 12, lineHeight: 18, color: colors.textMuted, textAlign: 'center' },
  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: spacing.md },
  timelineLeft: { alignItems: 'center', width: 32 },
  timelineDot: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.backgroundDeep, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderSoft },
  timelineDotActivo: { borderColor: colors.brandOrangeSoft },
  timelineLine: { width: 1, flex: 1, backgroundColor: colors.borderSoft, marginVertical: spacing.xs },
  timelineContent: { flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  timelineHito: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  timelineFecha: { fontSize: 11, lineHeight: 16, color: colors.textMuted, marginBottom: spacing.md },
  timelineActRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  timelineKm: { fontSize: 24, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  timelineTipo: { fontSize: 11, lineHeight: 16, color: colors.textSoft },
  timelineAcumulado: { fontSize: 11, lineHeight: 16, color: colors.textMuted, marginTop: spacing.md },
});
