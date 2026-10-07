import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/korvaTheme';
import useRutaLibre from '../services/useRutaLibre';
export default function RutaLibreCard({ navigation, soloInscrita = false }) {
  const { estado } = useRutaLibre();
  return <RutaLibreCardVista navigation={navigation} soloInscrita={soloInscrita} estado={estado} />;
}
export function RutaLibreCardVista({ navigation, soloInscrita = false, estado, destacado = false, accion = 'Historia del desafío' }) {
  const p = estado.datos?.participacion;
  if (soloInscrita && (!p || p.abandonado)) return null;
  return <TouchableOpacity style={[styles.card, destacado && styles.destacada]} onPress={() => navigation.navigate('RutaLibre')} accessibilityRole="button" accessibilityLabel="Explorar Islandia, ruta gratuita">
    <View style={styles.row}><Text style={styles.tag}>{p && !p.abandonado ? 'GRATUITO · SIN MEDALLA' : 'RUTA GRATUITA'}</Text><Ionicons name="chevron-forward" size={20} color={colors.textSoft} /></View>
    <Text style={[styles.title, destacado && { fontSize: 23 }]}>Islandia · Ring Road</Text>
    <Text style={styles.copy}>1.400 km · Fuego, hielo y auroras</Text>
    {p && !p.abandonado ? <>
      <Text style={styles.value}>{p.km.toLocaleString('es-AR', { maximumFractionDigits: 2 })} / 1.400 km</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100,p.porcentaje)}%` }]} /></View>
      <Text style={styles.copy}>{p.estado === 'elegida' ? 'Esperando tu primera actividad' : p.estado === 'pausada' ? 'Ruta pausada' : p.estado === 'completada' ? 'Ruta completada' : 'En curso'}</Text>
    </> : <Text style={styles.link}>Explorar ruta</Text>}
    {destacado && <View style={styles.footer}><Ionicons name={accion === 'Ver ruta' ? 'map-outline' : 'book-outline'} size={17} color="#78DEC5" /><Text style={styles.footerText}>{accion}</Text><Ionicons name="arrow-forward" size={17} color="#78DEC5" /></View>}
  </TouchableOpacity>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.backgroundDeep, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft, padding: spacing.lg, marginBottom: spacing.lg },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderColor: '#32665C', paddingTop: 14, marginTop: 18 },
  footerText: { flex: 1, color: '#78DEC5', fontSize: 13, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  destacada: { backgroundColor: '#122E32', borderColor: '#32665C', padding: 22, minHeight: 220 },
  tag: { color: '#78DEC5', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', marginVertical: spacing.sm },
  copy: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  link: { color: colors.actionBlue, fontSize: 12, fontWeight: '700', marginTop: spacing.md },
  value: { color: colors.textSoft, fontSize: 15, marginTop: spacing.md },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.borderSoft, overflow: 'hidden', marginVertical: spacing.sm },
  fill: { height: 5, backgroundColor: '#78DEC5' },
});
