import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import KorvaActivityShareCard from './KorvaActivityShareCard';
import { colors } from '../theme/korvaTheme';

const { urlsFondo } = require('../services/compartirCore');

// Compartir cuánto llevás de un desafío (Inicio, Perfil, Islandia). Misma imagen
// que al compartir una salida: foto del desafío, km y la línea con lo recorrido.
// reto: { titulo, km, total, challenge_id? }
export default function KorvaProgressShare({ reto, onClose }) {
  const { width } = useWindowDimensions();
  const ancho = Math.min(360, width - 36);
  const shot = useRef(null);
  const fondoRef = useRef('cargando');
  const [formato, setFormato] = useState('story');
  const [preparando, setPreparando] = useState(false);

  useEffect(() => { if (reto?.titulo) urlsFondo(reto.titulo).forEach((u) => Image.prefetch(u).catch(() => {})); }, [reto?.titulo]);
  if (!reto) return null;

  const challenge = {
    challenge_id: reto.challenge_id || null,
    challenge: reto.titulo,
    km_completados: Math.max(0, Number(reto.km) || 0),
    distancia_total: Math.max(1, Number(reto.total) || 1),
  };

  const compartir = async () => {
    if (preparando || !shot.current) return;
    setPreparando(true);
    try {
      for (let i = 0; i < 40 && formato === 'story' && fondoRef.current === 'cargando'; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      await new Promise((r) => setTimeout(r, 120));
      if (!(await Sharing.isAvailableAsync())) throw new Error('Este dispositivo no permite abrir la hoja de compartir.');
      const uri = await shot.current.capture();
      await Sharing.shareAsync(uri, { mimeType: formato === 'story' ? 'image/jpeg' : 'image/png', dialogTitle: 'Compartir mi progreso Korva' });
    } catch (e) {
      Alert.alert('No se pudo compartir', e.message || 'Intentá nuevamente.');
    } finally {
      setPreparando(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose} onDismiss={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={s.fondo} edges={['top', 'bottom']}>
          <View style={s.asa} />
          <View style={s.cabecera}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.eyebrow}>COMPARTÍ TU AVENTURA</Text>
              <Text style={s.titulo}>Compartir progreso</Text>
            </View>
            <TouchableOpacity style={s.cerrar} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar">
              <Text style={s.cerrarX}>×</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.contenido}>
            <View style={s.formatos}>
              {[['story', 'Historia'], ['overlay', 'Sin fondo']].map(([id, label]) => (
                <TouchableOpacity key={id} style={[s.formato, formato === id && s.formatoActivo]} onPress={() => setFormato(id)}
                  accessibilityRole="button" accessibilityState={{ selected: formato === id }}>
                  <Text style={s.formatoTexto}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.vista}>
              <ViewShot ref={shot} style={formato === 'overlay' ? { backgroundColor: 'transparent' } : null}
                options={formato === 'overlay' ? { format: 'png', quality: 1, result: 'tmpfile' } : { format: 'jpg', quality: 0.92, result: 'tmpfile' }}>
                <KorvaActivityShareCard modo="progreso" challenge={challenge} variante={formato} ancho={ancho}
                  onFondoListo={(e) => { fondoRef.current = e; }} />
              </ViewShot>
            </View>
            <Text style={s.ayuda}>{formato === 'overlay' ? 'Para pegar encima de una foto tuya.' : 'Lista para subir a tu historia.'}</Text>
          </ScrollView>
          <View style={s.pie}>
            <TouchableOpacity style={s.boton} onPress={compartir} disabled={preparando} accessibilityRole="button">
              <Text style={s.botonTexto}>{preparando ? 'PREPARANDO…' : 'COMPARTIR'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const s = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colors.backgroundDeep },
  asa: { width: 34, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  cabecera: { paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  eyebrow: { color: colors.brandOrange, fontSize: 8, fontWeight: '900', letterSpacing: 2 },
  titulo: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 },
  cerrar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  cerrarX: { color: colors.textMuted, fontSize: 30, lineHeight: 30 },
  contenido: { paddingHorizontal: 18, paddingBottom: 16, alignItems: 'center' },
  formatos: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  formato: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: colors.borderSoft },
  formatoActivo: { borderColor: colors.brandOrange, backgroundColor: colors.surfaceRaised },
  formatoTexto: { color: colors.text, fontSize: 10, fontWeight: '800' },
  vista: { width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 24, overflow: 'hidden', backgroundColor: '#26384A', paddingVertical: 8 },
  ayuda: { color: colors.textMuted, fontSize: 11, marginTop: 10, textAlign: 'center' },
  pie: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderColor: colors.borderSoft, alignItems: 'center' },
  boton: { width: '100%', maxWidth: 390, borderRadius: 16, paddingVertical: 15, alignItems: 'center', backgroundColor: colors.brandOrange },
  botonTexto: { color: colors.text, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
});
