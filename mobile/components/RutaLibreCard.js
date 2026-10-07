import { useEffect, useRef, useState } from 'react';
import { consultarRutaLibre } from '../services/rutasLibresApi';
import KorvaProgressShare from './KorvaProgressShare';
import { Alert, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/korvaTheme';
import useRutaLibre from '../services/useRutaLibre';
export default function RutaLibreCard({ navigation, soloInscrita = false }) {
  const { estado } = useRutaLibre();
  return <RutaLibreCardVista navigation={navigation} soloInscrita={soloInscrita} estado={estado} />;
}
export function RutaLibreCardVista({ navigation, soloInscrita = false, estado, destacado = false, accion = 'Historia del desafío', onActualizar }) {
  const [compartiendo, setCompartiendo] = useState(false), [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false), vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  const p = estado.datos?.participacion;
  const pausar = async () => {
    if (ocupado.current || !estado.datos?.userId) return;
    ocupado.current = true; setGuardando(true);
    try {
      await consultarRutaLibre({ userId: estado.datos.userId, accion: p.pausado ? 'reanudar' : 'pausar' });
      if (vivo.current) await onActualizar?.();
    } catch (e) { if (vivo.current) Alert.alert('No pudimos cambiar la pausa', e.message); }
    finally { ocupado.current = false; if (vivo.current) setGuardando(false); }
  };
  if (soloInscrita && (!p || p.abandonado)) return null;
  return <View style={[styles.card, destacado && styles.destacada]}><TouchableOpacity onPress={() => navigation.navigate('RutaLibre')} accessibilityRole="button" accessibilityLabel="Explorar Islandia, ruta gratuita">
    <View style={styles.row}><Text style={styles.tag}>{p && !p.abandonado ? 'GRATUITO · SIN MEDALLA' : 'RUTA GRATUITA'}</Text><Ionicons name="chevron-forward" size={20} color={colors.textSoft} /></View>
    <Text style={[styles.title, destacado && { fontSize: 23 }]}>Islandia · Ring Road</Text>
    <Text style={styles.copy}>1.400 km · Fuego, hielo y auroras</Text>
    {p && !p.abandonado ? <>
      <Text style={styles.value}>{p.km.toLocaleString('es-AR', { maximumFractionDigits: 2 })} / 1.400 km</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100,p.porcentaje)}%` }]} /></View>
      <Text style={styles.copy}>{p.estado === 'elegida' ? 'Esperando tu primera actividad' : p.estado === 'pausada' ? 'Ruta pausada' : p.estado === 'completada' ? 'Ruta completada' : 'En curso'}</Text>
    </> : <Text style={styles.link}>Explorar ruta</Text>}
    </TouchableOpacity>
    {destacado && <View style={styles.footer}>
      <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('RutaLibre', { vista: 'historia' })}><Text style={styles.footerText}>Historia</Text></TouchableOpacity>
      {accion === 'Ver ruta' && <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('RutaLibre')}><Text style={styles.footerText}>Ver ruta</Text></TouchableOpacity>}
      {accion === 'Ver ruta' && p && p.estado !== 'completada' && <TouchableOpacity disabled={guardando} accessibilityRole="button" onPress={pausar}><Text style={styles.footerText}>{guardando ? 'Guardando…' : p.pausado ? 'Reanudar' : 'Pausar'}</Text></TouchableOpacity>}
      {p && !p.abandonado && <TouchableOpacity accessibilityRole="button" onPress={() => setCompartiendo(true)}><Text style={styles.footerText}>Compartir progreso</Text></TouchableOpacity>}
    </View>}
    {compartiendo && p && <KorvaProgressShare reto={{ titulo: 'Islandia · Ring Road', km: p.km, total: 1400, gratuita: true }} onClose={() => setCompartiendo(false)} />}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.backgroundDeep, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft, padding: spacing.lg, marginBottom: spacing.lg },
  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, borderTopWidth: 1, borderColor: '#32665C', paddingTop: 14, marginTop: 18 },
  footerText: { color: '#78DEC5', fontSize: 13, fontWeight: '800' },
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
