import { useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from 'react-native-svg';
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
        {reto.gratuita ? <View collapsable={false} style={styles.icelandCard}>
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 360 640" preserveAspectRatio="xMidYMid slice">
            <Defs>
              <LinearGradient id="noche" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#06131F"/><Stop offset=".55" stopColor="#103641"/><Stop offset="1" stopColor="#071A26"/></LinearGradient>
              <LinearGradient id="aurora" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#ADFFDC" stopOpacity=".08"/><Stop offset=".4" stopColor="#65EFC2" stopOpacity=".7"/><Stop offset="1" stopColor="#65EFC2" stopOpacity="0"/></LinearGradient>
              <LinearGradient id="violeta" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#BAA2FF" stopOpacity=".48"/><Stop offset="1" stopColor="#8A86E8" stopOpacity="0"/></LinearGradient>
            </Defs>
            <Rect width="360" height="640" fill="url(#noche)"/>
            <Path d="M-40 230 C30 20 145 65 205 120 S340 205 410 15 L410 230 C310 290 265 160 195 205 S35 90-40 355Z" fill="url(#aurora)"/>
            <Path d="M-25 125 C90 235 175 30 260 100 S335 135 390 70 L390 215 C300 245 260 125 195 180 S45 310-25 190Z" fill="url(#violeta)"/>
            {[[28,54],[92,32],[163,63],[240,41],[318,83],[53,136],[286,157],[344,201],[122,181]].map(([x,y],i)=><Circle key={i} cx={x} cy={y} r={i%3===0?1.5:1} fill="#E1FAF7" opacity=".7"/>)}
            <Path d="M0 540 L66 436 99 471 170 395 234 478 277 432 360 523V640H0Z" fill="#21434F"/>
            <Path d="M134 439 L170 395 198 432 179 422 165 431 157 422Z M46 467 L66 436 82 454 65 452Z" fill="#B7D8DF" opacity=".65"/>
            <Path d="M0 575 L85 505 153 549 231 485 300 547 360 519V640H0Z" fill="#102B37"/>
            <Path d="M0 610 Q90 555 164 603T360 574V640H0Z" fill="#091D29"/>
          </Svg>
          <View style={styles.icelandHeader}><Text style={styles.icelandBrand}>KORVA</Text><Text style={styles.icelandEyebrow}>MI VIAJE</Text></View>
          <View style={styles.icelandHero}>
            <Text allowFontScaling={false} style={styles.icelandName}>ISLANDIA</Text>
            <Text style={styles.icelandRoute}>RING ROAD</Text>
            <Text style={styles.icelandDescription}>Entre fuego, hielo y auroras</Text>
          </View>
          <View style={styles.icelandProgress}>
            <Text allowFontScaling={false} style={styles.icelandKm}>{km.toLocaleString('es-AR', { maximumFractionDigits: 2 })}<Text style={styles.icelandUnit}> km</Text></Text>
            <Text style={styles.icelandTotal}>de {total.toLocaleString('es-AR')} km de aventura</Text>
            <View style={styles.icelandTrack}><View style={[styles.icelandFill,{width:`${pct}%`}]} /></View>
            <Text style={styles.icelandPercent}>{pct > 0 && pct < 1 ? 'Menos del 1%' : `${Math.floor(pct)}%`} recorrido</Text>
          </View>
          <View style={styles.icelandFooter}><Text style={styles.icelandMotto}>Cada paso cuenta.</Text><Text style={styles.icelandWeb}>korva.run</Text></View>
        </View> :         <View collapsable={false} style={[styles.card, null]}>
          <Text style={styles.brand}>KORVA</Text>
          <Text style={styles.tag}>MI AVENTURA</Text>
          <Text style={styles.name}>{reto.titulo}</Text>
          <Text style={styles.km}>{km.toLocaleString('es-AR', { maximumFractionDigits: 2 })}<Text style={styles.unit}> km</Text></Text>
          <Text style={styles.copy}>de {total.toLocaleString('es-AR')} km</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
          <Text style={styles.percent}>{Math.floor(pct)}% recorrido</Text>
          <Text style={styles.motto}>Cada paso cuenta</Text>
          <Text style={styles.copy}>korva.run</Text>
        </View>}
      </ViewShot>
      <TouchableOpacity style={styles.button} onPress={compartir} disabled={preparando} accessibilityRole="button"><Text style={styles.buttonText}>{preparando ? 'Preparando imagen…' : 'Compartir esta imagen'}</Text></TouchableOpacity>
    </ScrollView>
  </Modal>;
}
const styles = StyleSheet.create({
  icelandCard: { aspectRatio: 9/16, marginTop: 20, padding: 24, borderRadius: 20, overflow: 'hidden', backgroundColor: '#071A26', justifyContent: 'space-between' },
  icelandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  icelandBrand: { color: '#FFF', fontSize: 19, fontWeight: '900', letterSpacing: 3 },
  icelandEyebrow: { color: '#A9E9D5', fontSize: 9, fontWeight: '700', letterSpacing: 2 },
  icelandHero: { marginTop: 12 },
  icelandName: { color: '#FFF', fontSize: 38, fontWeight: '900', letterSpacing: 1 },
  icelandRoute: { color: '#9FF0D5', fontSize: 13, letterSpacing: 5, fontWeight: '700', marginTop: 6 },
  icelandDescription: { color: '#D0E7EA', fontSize: 13, marginTop: 14 },
  icelandProgress: { padding: 18, borderRadius: 16, backgroundColor: 'rgba(4,20,30,.82)', borderWidth: 1, borderColor: 'rgba(150,235,216,.2)' },
  icelandKm: { color: '#FFF', fontSize: 46, fontWeight: '800' },
  icelandUnit: { color: '#ACEDDA', fontSize: 19 },
  icelandTotal: { color: '#B3CCD4', fontSize: 12, marginTop: 3 },
  icelandTrack: { height: 4, backgroundColor: '#274851', borderRadius: 2, overflow: 'hidden', marginTop: 20 },
  icelandFill: { height: 4, backgroundColor: '#8CF2CE' },
  icelandPercent: { color: '#9FE9D3', fontSize: 11, marginTop: 10 },
  icelandFooter: { alignItems: 'center' },
  icelandMotto: { color: '#F1F8FA', fontSize: 14, fontWeight: '600' },
  icelandWeb: { color: '#95B9C5', fontSize: 11, letterSpacing: 1, marginTop: 7 },
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
