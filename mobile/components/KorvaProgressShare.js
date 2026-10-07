import { useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { colors } from '../theme/korvaTheme';
export default function KorvaProgressShare({ reto, onClose }) {
  const shot = useRef(null), ocupado = useRef(false);
  const [preparando, setPreparando] = useState(false);
  if (!reto) return null;
  const km = Math.max(0, Number(reto.km) || 0), total = Math.max(1, Number(reto.total) || 1);
  const pct = Math.min(100, km / total * 100);
  const compartir = async () => {
    if (ocupado.current || !shot.current) return;
    ocupado.current = true; setPreparando(true);
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error('Compartir no disponible en este dispositivo.');
      const uri = await shot.current.capture();
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir mi progreso Korva' });
    } catch (e) { Alert.alert('No se pudo compartir', e.message || 'Intentá nuevamente.'); }
    finally { ocupado.current = false; setPreparando(false); }
  };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onClose} accessibilityRole="button"><Text style={styles.link}>Cerrar</Text></TouchableOpacity>
      <Text style={styles.title}>Compartir progreso</Text>
      <Text style={styles.copy}>Así se verá tu imagen. Elegí dónde compartirla cuando estés listo.</Text>
      <ViewShot ref={shot} options={{ format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 1920 }}>
        <View collapsable={false} style={[styles.card, reto.gratuita && { backgroundColor: '#122E32' }]}>
          <Text style={styles.brand}>KORVA</Text>
          <Text style={styles.tag}>{reto.gratuita ? 'RUTA GRATUITA · SIN MEDALLA' : 'MI AVENTURA'}</Text>
          <Text style={styles.name}>{reto.titulo}</Text>
          <Text style={styles.km}>{km.toLocaleString('es-AR', { maximumFractionDigits: 2 })}<Text style={styles.unit}> km</Text></Text>
          <Text style={styles.copy}>de {total.toLocaleString('es-AR')} km</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
          <Text style={styles.percent}>{Math.floor(pct)}% recorrido</Text>
          <Text style={styles.motto}>Cada paso cuenta</Text>
          <Text style={styles.copy}>korva.run</Text>
        </View>
      </ViewShot>
      <TouchableOpacity style={styles.button} onPress={compartir} disabled={preparando} accessibilityRole="button"><Text style={styles.buttonText}>{preparando ? 'Preparando imagen…' : 'Compartir esta imagen'}</Text></TouchableOpacity>
    </ScrollView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 24, paddingTop: 30, paddingBottom: 50 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', marginVertical: 16 },
  link: { color: colors.actionBlue, paddingVertical: 10, fontWeight: '700' },
  copy: { color: colors.textSoft, fontSize: 13, lineHeight: 20 },
  card: { aspectRatio: 9 / 16, padding: 24, backgroundColor: colors.surface, borderRadius: 20, justifyContent: 'center', marginTop: 20 },
  brand: { color: colors.brandOrange, fontSize: 25, fontWeight: '900', letterSpacing: 4 },
  tag: { color: '#78DEC5', fontSize: 10, fontWeight: '800', marginTop: 26 },
  name: { color: colors.text, fontSize: 27, fontWeight: '800', marginVertical: 16 },
  km: { color: colors.text, fontSize: 46, fontWeight: '900' }, unit: { fontSize: 20 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.borderSoft, marginTop: 24, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: '#78DEC5' }, percent: { color: '#78DEC5', fontSize: 16, marginTop: 12, fontWeight: '800' },
  motto: { color: colors.text, fontSize: 18, marginTop: 32, marginBottom: 5 },
  button: { padding: 16, marginTop: 20, backgroundColor: colors.brandOrange, borderRadius: 14, alignItems: 'center' }, buttonText: { color: '#FFF', fontWeight: '800' },
});
