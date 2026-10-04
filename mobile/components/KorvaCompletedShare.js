import { useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { colors } from '../theme/korvaTheme';

const { datosDesafioCompletado } = require('../services/desafioShareCore');

export default function KorvaCompletedShare({ reto, nombrePersona, onClose }) {
  const [variante, setVariante] = useState('story');
  const [preparando, setPreparando] = useState(false);
  const ocupado = useRef(false);
  const shot = useRef(null);
  const { width } = useWindowDimensions();
  const datos = datosDesafioCompletado(reto);
  const cardWidth = Math.min(360, Math.max(240, width - 36));
  const nombrePublico = typeof nombrePersona === 'string' ? nombrePersona.trim() : '';
  const story = variante === 'story';
  const altoBase = 640; // Mismo encuadre 9:16 para la foto y la historia.
  const alto = cardWidth * altoBase / 360;
  const escala = cardWidth / 360;

  const compartir = async () => {
    if (!datos || ocupado.current || !shot.current) return;
    ocupado.current = true;
    setPreparando(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Compartir no disponible', 'Este dispositivo no permite abrir la hoja de compartir.');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 120));
      const uri = await shot.current.capture();
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir desafío completado Korva' });
    } catch {
      Alert.alert('No se pudo compartir', 'Intentá nuevamente.');
    } finally {
      ocupado.current = false;
      setPreparando(false);
    }
  };

  if (!datos) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose} onDismiss={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>TU AVENTURA, COMPLETADA</Text>
              <Text style={styles.title}>Compartir desafío</Text>
            </View>
            <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar compartir desafío">
              <Ionicons name="close" size={24} color={colors.textSoft} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.variants}>
              {[['overlay', 'Transparente'], ['story', 'Historia']].map(([v, label]) => (
                <TouchableOpacity key={v} disabled={preparando} accessibilityRole="button" accessibilityState={{ selected: variante === v }}
                  onPress={() => setVariante(v)} style={[styles.variant, variante === v && styles.variantActive]}>
                  <Text style={styles.variantText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.preview}>
              <ViewShot ref={shot} options={{ format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: altoBase * 3 }}>
                <View collapsable={false} style={[styles.card, { width: cardWidth, height: alto, padding: 28 * escala }, story && styles.story]}>
                  {story && <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 640" width={cardWidth} height={alto}>
                    <Path d="M-40 220 C80 100 160 280 270 180 S420 150 440 190 M-40 252 C80 132 160 312 270 212 S420 182 440 222 M-40 285 C80 165 160 345 270 245 S420 215 440 255" stroke="rgba(168,207,255,0.1)" strokeWidth="1" fill="none" />
                    <Path d="M-20 540 C80 410 190 570 390 450" stroke="rgba(243,107,10,0.16)" strokeWidth="1" fill="none" />
                  </Svg>}
                  {story ? (
                    <View style={styles.storyAchievement}>
                      <Text style={styles.completed}>DESAFÍO COMPLETADO</Text>
                      {nombrePublico ? <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}
                        style={[styles.personName, { fontSize: 26 * escala, lineHeight: 32 * escala }]}>{nombrePublico}</Text> : null}
                      {datos.dorsal && <Text style={styles.dorsal}>DORSAL #{datos.dorsal}</Text>}
                      <View style={styles.personalRule} />
                      <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={2}
                        style={[styles.challengeName, styles.centerText, { fontSize: 22 * escala, lineHeight: 28 * escala }]}>{datos.nombre}</Text>
                      <Text style={[styles.storyDistance, { fontSize: 38 * escala }]}>{datos.distanciaTexto}<Text style={styles.storyUnit}> KM</Text></Text>
                      <Text style={styles.version}>{datos.version.toUpperCase()} · COMPLETADO AL 100%</Text>
                      {datos.dias && <Text style={styles.journey}>Un recorrido de {datos.dias} {datos.dias === 1 ? 'día' : 'días'}</Text>}
                      {datos.fecha && <Text style={styles.date}>{datos.fecha}</Text>}
                    </View>
                  ) : (
                    <>
                      <View style={{ paddingTop: 44 * escala }}>
                        <Text style={styles.completed}>DESAFÍO COMPLETADO</Text>
                        {nombrePublico ? <Text numberOfLines={2} style={styles.overlayName}>{nombrePublico}</Text> : null}
                        <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={2}
                          style={[styles.challengeName, { fontSize: 22 * escala, lineHeight: 28 * escala }]}>{datos.nombre}</Text>
                        {datos.dorsal && <Text style={styles.dorsal}>DORSAL #{datos.dorsal}</Text>}
                      </View>
                      <View style={styles.photoSpace} />
                      <View style={{ marginBottom: 48 * escala }}>
                      <View style={[styles.distanceRow, { alignItems: 'baseline' }]}>
                        <Text style={[styles.distance, { fontSize: 18 * escala, flex: 1 }]}>{datos.distanciaTexto} KM</Text>
                        <Text style={styles.percent}>100%</Text>
                      </View>
                      <Text style={styles.version}>{datos.version.toUpperCase()}</Text>
                      <View style={styles.overlayFooter}>
                        {datos.fecha ? <Text style={[styles.date, { marginTop: 0, flex: 1 }]}>{datos.fecha}</Text> : <View style={{ flex: 1 }} />}
                        <Text style={styles.website}>KORVA.RUN</Text>
                      </View>
                      </View>
                    </>
                  )}
                  {story && <View style={{ marginTop: 24 * escala, marginBottom: 48 * escala, alignItems: 'center' }}>
                    <Text style={styles.website}>KORVA.RUN</Text>
                  </View>}
                </View>
              </ViewShot>
            </View>
            <Text style={styles.hint}>{story ? 'Historia 9:16 · lista para publicar, sin agregar una foto.' : 'PNG transparente · centro libre para tu foto o medalla.'}</Text>
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.share} disabled={preparando} onPress={compartir} accessibilityRole="button">
              <Ionicons name="share-outline" size={18} color={colors.text} />
              <Text style={styles.shareText}>{preparando ? 'PREPARANDO…' : 'COMPARTIR'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.65)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 };
const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.backgroundDeep },
  handle: { width: 34, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, marginBottom: 14 },
  eyebrow: { fontSize: 8, letterSpacing: 1.5, fontWeight: '900', color: colors.brandOrangeSoft },
  title: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 18, paddingBottom: 18 },
  variants: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  variant: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.borderSoft },
  variantActive: { borderColor: colors.brandOrange, backgroundColor: colors.surfaceRaised },
  variantText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  dorsal: { color: colors.textSoft, fontSize: 10, letterSpacing: 1, marginTop: 12 },
  overlayFooter: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 14 },
  preview: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#26384A' },
  card: { backgroundColor: 'transparent', justifyContent: 'space-between' },
  story: { backgroundColor: colors.backgroundDeep },
  photoSpace: { flex: 1 },
  storyAchievement: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48, paddingBottom: 16 },
  personName: { color: colors.text, fontWeight: '800', textAlign: 'center', marginTop: 20 },
  overlayName: { color: colors.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  centerText: { textAlign: 'center' },
  personalRule: { width: 30, height: 2, backgroundColor: colors.brandOrangeSoft, marginVertical: 24 },
  storyDistance: { color: colors.text, fontWeight: '800', marginTop: 26 },
  storyUnit: { fontSize: 14, fontWeight: '600', color: colors.textSoft },
  journey: { color: colors.textSoft, fontSize: 12, marginTop: 22 },
  completed: { color: colors.brandOrangeSoft, fontWeight: '900', letterSpacing: 1.5, fontSize: 9, marginTop: 24, marginBottom: 8, ...shadow },
  challengeName: { color: colors.text, fontWeight: '900', ...shadow },
  completedSeal: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.brandOrangeSoft, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7 },
  percent: { color: colors.brandOrangeSoft, fontSize: 12, fontWeight: '800', ...shadow },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  distance: { color: colors.text, fontWeight: '800', letterSpacing: 0.5, ...shadow },
  version: { color: colors.textSoft, fontSize: 9, letterSpacing: 1.2, fontWeight: '800', marginTop: 4, ...shadow },
  date: { color: colors.textSoft, fontSize: 11, marginTop: 10, ...shadow },
  signatureRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 22 },
  signature: { color: colors.textSoft, fontSize: 8, fontWeight: '900', letterSpacing: 1.2, ...shadow },
  website: { color: colors.textSoft, fontSize: 8, fontWeight: '800', letterSpacing: 1, ...shadow },
  hint: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 12 },
  footer: { padding: 18, borderTopWidth: 1, borderColor: colors.borderSoft },
  share: { minHeight: 48, backgroundColor: colors.brandOrange, borderRadius: 24, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  shareText: { color: colors.text, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
});
