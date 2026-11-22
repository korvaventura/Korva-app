import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { listarMisActividades } from '../services/actividadesApi';
import { nombreDeporteActividad, nombreFuenteActividad, iconoDeporteActividad } from '../utils/actividadPresentacion';
import { colors, radius, spacing } from '../theme/korvaTheme';

const fecha = (valor) => valor ? new Date(valor).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function MisActividadesScreen({ navigation }) {
  const [actividades, setActividades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try { setActividades(await listarMisActividades()); }
    catch { setError(true); }
    finally { setCargando(false); }
  }, []);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  return (
    <SafeAreaView style={styles.scroll} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={20} color={colors.actionBlue} /><Text style={styles.volver}>Volver</Text>
        </TouchableOpacity>
        <Text style={styles.eyebrow}>CADA PASO CUENTA</Text>
        <Text style={styles.titulo}>Mis actividades</Text>
        <Text style={styles.subtitulo}>Cada salida tiene su historia.</Text>
        <View style={styles.guide}>
          <Ionicons name="share-outline" size={16} color={colors.brandOrangeSoft} />
          <Text style={styles.guideText}>Abrí una actividad para ver el detalle y compartirla.</Text>
        </View>
        {cargando ? <ActivityIndicator color={colors.brandOrange} style={{ marginTop: 32 }} /> : error ? (
          <View style={styles.vacia}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
            <Text style={styles.vaciaTitulo}>No pudimos cargar tus actividades</Text>
            <TouchableOpacity style={styles.retry} onPress={cargar} accessibilityRole="button"><Text style={styles.retryText}>Reintentar</Text></TouchableOpacity>
          </View>
        ) : actividades.length === 0 ? (
          <View style={styles.vacia}>
            <Ionicons name="navigate-outline" size={28} color={colors.brandOrangeSoft} />
            <Text style={styles.vaciaTitulo}>Tu próxima salida empieza acá</Text>
            <Text style={styles.vaciaSub}>Guardá una actividad con GPS o Manual desde Registrar.</Text>
          </View>
        ) : (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Tu historial</Text>
              <Text style={styles.count}>{actividades.length} {actividades.length === 1 ? 'actividad' : 'actividades'}</Text>
            </View>
            {actividades.map((a) => (
              <TouchableOpacity key={a.id} style={styles.card} activeOpacity={0.8} accessibilityRole="button"
                accessibilityLabel={`${nombreDeporteActividad(a.sport_type)}, ${Number(a.distance_km || 0).toFixed(2)} kilómetros. Ver detalle y compartir`}
                onPress={() => navigation.navigate('DetalleActividad', { actividad: a })}>
                <View style={styles.fila}>
                  <View style={styles.icon}><Ionicons name={iconoDeporteActividad(a.sport_type)} size={22} color={colors.brandOrangeSoft} /></View>
                  <View style={styles.activityMain}>
                    <Text style={styles.deporte}>{nombreDeporteActividad(a.sport_type)}</Text>
                    <Text style={styles.meta}>{fecha(a.recorded_at)}</Text>
                  </View>
                  <View style={styles.distance}><Text style={styles.km}>{Number(a.distance_km || 0).toFixed(2)}</Text><Text style={styles.unit}>km</Text></View>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={[styles.source, a.source === 'korva_gps' && styles.sourceGps]}>{nombreFuenteActividad(a.source)}</Text>
                  <View style={styles.openRow}><Text style={styles.ver}>Detalle y compartir</Text><Ionicons name="chevron-forward" size={16} color={colors.actionBlue} /></View>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, paddingBottom: 40 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'flex-start', paddingRight: 16, marginBottom: 20 },
  volver: { color: colors.actionBlue, fontWeight: '700' },
  eyebrow: { color: colors.brandOrangeSoft, fontSize: 9, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
  titulo: { color: colors.text, fontSize: 28, fontWeight: '900' },
  subtitulo: { color: colors.textSoft, marginTop: 6, fontSize: 13 },
  guide: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 24 },
  guideText: { flex: 1, color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  listTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
  count: { color: colors.textMuted, fontSize: 11 },
  card: { backgroundColor: colors.surfaceSoft, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderSoft },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.backgroundDeep, alignItems: 'center', justifyContent: 'center' },
  activityMain: { flex: 1, minWidth: 0 },
  deporte: { color: colors.text, fontSize: 15, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  distance: { alignItems: 'flex-end' },
  km: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  unit: { color: colors.textMuted, fontSize: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSoft },
  source: { color: colors.textSoft, fontSize: 10, fontWeight: '700' },
  sourceGps: { color: colors.brandOrangeSoft },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ver: { color: colors.actionBlue, fontSize: 10, fontWeight: '700' },
  vacia: { backgroundColor: colors.surfaceSoft, borderRadius: radius.lg, padding: 24, alignItems: 'center' },
  vaciaTitulo: { color: colors.text, textAlign: 'center', fontWeight: '700', marginTop: 14 },
  vaciaSub: { color: colors.textMuted, textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 8 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, marginTop: 8 },
  retryText: { color: colors.actionBlue, fontWeight: '700' },
});
