import { useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Path, Circle } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { colors } from '../theme/korvaTheme';
export default function KorvaProgressShare({ reto, onClose }) {
  const shot = useRef(null), ocupado = useRef(false);
  const [preparando, setPreparando] = useState(false);
  const [formato, setFormato] = useState('historia');
  const transparente = formato === 'transparente';
  if (!reto) return null;
  const km = Math.max(0, Number(reto.km) || 0), total = Math.max(1, Number(reto.total) || 1);
  const pct = Math.min(100, km / total * 100);
  const nombre = (reto.titulo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const paisaje = nombre.includes('fuji') ? 'fuji' : nombre.includes('san andres') ? 'costa' : nombre.includes('dubrovnik') ? 'ciudad' : 'montanas';
  const estado = pct >= 100 ? 'AVENTURA COMPLETADA' : 'MI AVENTURA EN MARCHA';
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
      <Text style={styles.copy}>Elegí el formato y revisá tu imagen antes de compartir.</Text>
      <View style={styles.formats}>
        {[['historia', 'Historia'], ['transparente', 'Transparente']].map(([id, label]) => <TouchableOpacity key={id} disabled={preparando} accessibilityRole="button" accessibilityState={{ selected: formato === id }} onPress={() => setFormato(id)} style={[styles.format, formato === id && styles.formatSelected]}><Text style={styles.formatLabel}>{label}</Text></TouchableOpacity>)}
      </View>
      <Text style={styles.copy}>{transparente ? 'PNG sin fondo para colocar sobre tu propia foto. El fondo gris es solo la vista previa.' : 'Imagen vertical lista para compartir en tus historias.'}</Text>
      <View style={[styles.preview, transparente && styles.transparentPreview]}>
      <ViewShot key={formato} ref={shot} style={{ backgroundColor: 'transparent' }} options={{ format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 1920 }}>
        {transparente ? <View collapsable={false} style={styles.overlayCard}>
          <Text style={styles.overlayBrand}>KORVA</Text>
          <View>
            <Text style={styles.overlayTag}>MI AVENTURA</Text>
            <Text style={styles.overlayName}>{reto.titulo}</Text>
            <Text style={styles.overlayKm}>{km.toLocaleString('es-AR', { maximumFractionDigits: 2 })}<Text style={styles.overlayUnit}> km</Text></Text>
            <Text style={styles.overlayDetail}>de {total.toLocaleString('es-AR')} km · {pct > 0 && pct < 1 ? 'Menos del 1%' : `${Math.floor(pct)}%`} recorrido</Text>
          </View>
          <View><Text style={styles.overlayMotto}>Cada paso cuenta.</Text><Text style={styles.overlayDetail}>korva.run</Text></View>
        </View> : reto.gratuita ? <View collapsable={false} style={styles.icelandCard}>
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
        </View> : <View collapsable={false} style={styles.card}>
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 360 640" preserveAspectRatio="xMidYMid slice">
            <Defs>
              <LinearGradient id="korvaNight" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#19354A"/><Stop offset=".5" stopColor="#152B3D"/><Stop offset="1" stopColor="#07121E"/></LinearGradient>
              <RadialGradient id="korvaLight" cx=".85" cy=".3" r=".65"><Stop offset="0" stopColor="#ED9C64" stopOpacity=".35"/><Stop offset="1" stopColor="#ED9C64" stopOpacity="0"/></RadialGradient>
              <LinearGradient id="korvaShade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#07121E" stopOpacity="0"/><Stop offset="1" stopColor="#07121E"/></LinearGradient>
            </Defs>
            <Rect width="360" height="640" fill="url(#korvaNight)"/>
            <Rect width="360" height="640" fill="url(#korvaLight)"/>
            <Circle cx="286" cy="177" r="49" fill="#F6BB8B" opacity=".1"/>
            <Circle cx="286" cy="177" r="31" fill="#FFD6AC" opacity=".55"/>
            {[0,1,2,3].map(i=><Path key={i} d={`M-30 ${240+i*28} Q60 ${180+i*28} 170 ${270+i*20} T400 ${220+i*25}`} fill="none" stroke="#B7CCD9" strokeWidth=".7" opacity=".12"/>)}
            {paisaje === 'fuji' ? <>
              <Path d="M-20 400 Q70 357 103 309 L176 210 192 210 268 312 Q309 354 385 392V560H-20Z" fill="#536575"/>
              <Path d="M137 262 L176 210 192 210 231 264 210 251 197 266 181 252 163 269 153 258Z" fill="#E4E9EC"/>
              <Path d="M-20 428 Q70 405 164 422 T385 388V560H-20Z" fill="#213E50"/>
            </> : paisaje === 'costa' ? <>
              <Path d="M0 300 Q100 265 190 302T360 284V540H0Z" fill="#456170"/>
              <Path d="M0 328 Q120 285 211 332T360 303 M0 354 Q130 317 228 360T360 331" stroke="#B9CFD9" opacity=".3" fill="none"/>
              <Path d="M-20 412 Q75 332 150 356T380 395V550H-20Z" fill="#8F8577"/>
            </> : paisaje === 'ciudad' ? <>
              <Path d="M0 350V304H36V276H58V306H104V271H126V246H147V300H200V267H234V303H267V254H285V305H330V280H360V540H0Z" fill="#637079"/>
              <Path d="M0 386V335H57V316H77V339H134V309H153V335H215V313H237V344H308V317H330V344H360V550H0Z" fill="#314A59"/>
            </> : <>
              <Path d="M-20 402 L75 277 123 330 201 229 275 332 325 292 385 391V540H-20Z" fill="#536575"/>
              <Path d="M164 275 L201 229 234 275 208 261 192 271 182 263Z" fill="#DCE3E8"/>
            </>}
            <Path d="M-10 470 Q85 395 170 465T370 442V640H-10Z" fill="#102536"/>
            <Path d="M85 475 Q260 412 239 342 T298 290" fill="none" stroke="#F59B59" strokeWidth="2" strokeDasharray="4 7" opacity=".65"/>
            <Circle cx="239" cy="342" r="8" fill="#FF8A36" opacity=".18"/><Circle cx="239" cy="342" r="3" fill="#FFAA66"/>
            <Rect y="370" width="360" height="270" fill="url(#korvaShade)"/>
          </Svg>
          <View style={styles.storyHeader}><Text style={styles.brand}>KORVA</Text><Text style={styles.storyEdition}>CADA PASO CUENTA</Text></View>
          <View style={styles.storyTitle}><Text style={styles.tag}>{estado}</Text><Text allowFontScaling={false} style={styles.name}>{reto.titulo}</Text></View>
          <View style={styles.storyStats}>
            <Text allowFontScaling={false} adjustsFontSizeToFit numberOfLines={1} style={styles.km}>{km.toLocaleString('es-AR', { maximumFractionDigits: 2 })}<Text style={styles.unit}> km</Text></Text>
            <View style={styles.storyMetricRow}><Text style={styles.storyTotal}>de {total.toLocaleString('es-AR')} km</Text><Text style={styles.percent}>{pct > 0 && pct < 1 ? 'Menos del 1%' : `${Math.floor(pct)}%`}</Text></View>
            <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
            <View style={styles.storyFooter}><Text style={styles.motto}>{pct >= 100 ? 'Una conquista más.' : 'Mi próxima conquista.'}</Text><Text style={styles.storyWeb}>korva.run</Text></View>
          </View>
        </View>}
      </ViewShot>
      </View>
      <TouchableOpacity style={styles.button} onPress={compartir} disabled={preparando} accessibilityRole="button"><Text style={styles.buttonText}>{preparando ? 'Preparando imagen…' : 'Compartir esta imagen'}</Text></TouchableOpacity>
    </ScrollView>
  </Modal>;
}
const shadow = { textShadowColor: 'rgba(0,0,0,.65)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 };
const styles = StyleSheet.create({
  formats: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  format: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center' },
  formatSelected: { backgroundColor: colors.surface, borderColor: colors.brandOrange },
  formatLabel: { color: '#FFF', fontWeight: '700' },
  preview: { marginTop: 20, borderRadius: 20, overflow: 'hidden' },
  transparentPreview: { backgroundColor: '#48515B' },
  overlayCard: { aspectRatio: 9/16, padding: 26, backgroundColor: 'transparent', justifyContent: 'space-between' },
  overlayBrand: { ...shadow, color: '#FFF', fontSize: 20, fontWeight: '900', letterSpacing: 4 },
  overlayTag: { ...shadow, color: '#FFF', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  overlayName: { ...shadow, color: '#FFF', fontSize: 29, fontWeight: '800', marginTop: 12, marginBottom: 24 },
  overlayKm: { ...shadow, color: '#FFF', fontSize: 52, fontWeight: '900' },
  overlayUnit: { fontSize: 22 },
  overlayDetail: { ...shadow, color: '#FFF', fontSize: 13, marginTop: 8 },
  overlayMotto: { ...shadow, color: '#FFF', fontSize: 18, fontWeight: '700' },
  icelandCard: { aspectRatio: 9/16, padding: 24, borderRadius: 20, overflow: 'hidden', backgroundColor: '#071A26', justifyContent: 'space-between' },
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
  card: { aspectRatio: 9/16, padding: 24, backgroundColor: '#07121E', overflow: 'hidden', justifyContent: 'space-between' },
  storyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#FFF', fontSize: 20, fontWeight: '900', letterSpacing: 4 },
  storyEdition: { color: '#B8C6D0', fontSize: 7, letterSpacing: 1.3, fontWeight: '700' },
  storyTitle: { flex: 1, paddingTop: 35 },
  tag: { color: '#FFAA6D', fontSize: 9, fontWeight: '800', letterSpacing: 1.6 },
  name: { ...shadow, color: '#FFF', fontSize: 32, lineHeight: 37, fontWeight: '900', marginTop: 12 },
  storyStats: { paddingTop: 24 },
  km: { color: '#FFF', fontSize: 58, fontWeight: '900', letterSpacing: -2 },
  unit: { color: '#CAD7DF', fontSize: 21, letterSpacing: 0 },
  storyMetricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  storyTotal: { color: '#B8C6D0', fontSize: 12 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#2B4050', marginTop: 18, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#FF8A36' },
  percent: { color: '#FFAA6D', fontSize: 13, fontWeight: '800' },
  storyFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28 },
  motto: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  storyWeb: { color: '#8EA6B7', fontSize: 10 },
  button: { padding: 16, marginTop: 20, backgroundColor: colors.brandOrange, borderRadius: 14, alignItems: 'center' }, buttonText: { color: '#FFF', fontWeight: '800' },
});
