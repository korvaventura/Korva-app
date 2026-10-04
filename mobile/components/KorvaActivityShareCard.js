import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { colors } from '../theme/korvaTheme';

const { proyectarRuta } = require('../services/gps/rutaVisualCore');

const W = 300;
const H = 150;

const duracion = (segundos) => {
  const s = Math.max(0, Number(segundos) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

const ritmo = (km, segundos, sportType) => {
  if (!(km > 0) || !(segundos > 0)) return '—';
  if (sportType === 'ride') return `${(km / (segundos / 3600)).toFixed(1)} KM/H`;
  const total = Math.round(segundos / km);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} /KM`;
};

export default function KorvaActivityShareCard({
  actividad = {},
  puntos = [],
  challenge = null,
  variante = 'overlay',
  backgroundImageUrl = null,
  ancho = null,
}) {
  const km = Number(actividad.distance_km || 0);
  const segundos = Number(actividad.duration_seconds || 0);
  const escalaRuta = km > 0 && km < 0.5 ? 0.62 : 0.9;
  const trazado = proyectarRuta(puntos, W, H, { visualScale: escalaRuta, padding: 18 });
  const points = trazado.map((p) => `${p.x},${p.y}`).join(' ');
  const challengeKm = Number(challenge?.km_completados || 0);
  const totalKm = Number(challenge?.distancia_total || 0);
  const pct = totalKm > 0 ? Math.min(100, Math.max(0, challengeKm / totalKm * 100)) : null;
  const challengeName = challenge?.challenge || challenge?.challenge_title;
  const story = variante === 'story';
  const tieneRuta = trazado.length >= 2;
  const anchoCard = ancho || (story ? 360 : 340);
  const tipo = ({ ride: 'RIDE', walk: 'WALK', run: 'RUN', swim: 'SWIM' })[actividad.sport_type] || 'ACTIVITY';
  const fondoDesafio = backgroundImageUrl || challenge?.share_background_url || null;

  return (
    <View collapsable={false} style={[styles.card, story ? styles.story : styles.overlay,
      { width: anchoCard }, story && { height: anchoCard * 16 / 9 }, !story && !tieneRuta && styles.overlayCompact]}>
      {story && fondoDesafio && (
        <>
          <Image pointerEvents="none" source={{ uri: fondoDesafio }} style={styles.storyBackground} resizeMode="cover" />
          <View pointerEvents="none" style={styles.storyShade} />
        </>
      )}
      {story && !fondoDesafio && (
        <View pointerEvents="none" style={styles.topography}>
          <Svg width="100%" height="100%" viewBox="0 0 360 640">
            <Path d="M-30 115 C55 45 120 170 205 92 S330 42 405 112" fill="none" stroke="rgba(168,207,255,0.08)" strokeWidth="1" />
            <Path d="M-35 145 C50 75 125 198 210 122 S335 72 410 142" fill="none" stroke="rgba(168,207,255,0.07)" strokeWidth="1" />
            <Path d="M-40 176 C45 106 130 228 215 153 S340 103 415 173" fill="none" stroke="rgba(168,207,255,0.06)" strokeWidth="1" />
            <Path d="M-55 455 C45 385 110 515 205 442 S330 392 420 462" fill="none" stroke="rgba(243,107,10,0.08)" strokeWidth="1" />
            <Path d="M-60 486 C40 416 115 545 210 473 S335 423 425 493" fill="none" stroke="rgba(243,107,10,0.07)" strokeWidth="1" />
          </Svg>
        </View>
      )}
      <View style={styles.brandRow}>
        <Text style={styles.korva}>KORVA</Text>
        <View style={styles.brandLine} />
        <Text style={styles.activityType}>{tipo}</Text>
      </View>

      {challengeName ? (
        <Text style={styles.roadTo}>ROAD TO {String(challengeName).toUpperCase()}</Text>
      ) : (
        <Text style={styles.roadTo}>KORVA ACTIVITY</Text>
      )}

      <View style={styles.metricRow}>
        <Text style={[styles.distance, km.toFixed(2).length > 6 && styles.distanceSmall]}>{km.toFixed(2)}</Text>
        <Text style={styles.unit}>KM</Text>
      </View>

      {segundos > 0 && <View style={styles.sessionRow}>
        <Text style={styles.session}>{duracion(segundos)}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.session}>{ritmo(km, segundos, actividad.sport_type)}</Text>
      </View>}

      <View style={[styles.route, story && styles.routeStory, !story && !tieneRuta && styles.routeCompact]}>
        {tieneRuta ? (
          <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
            <Polyline points={points} fill="none" stroke={colors.text} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={trazado[0].x} cy={trazado[0].y} r="4" fill={colors.text} />
            <Circle cx={trazado[trazado.length - 1].x} cy={trazado[trazado.length - 1].y} r="5" fill={colors.brandOrange} />
          </Svg>
        ) : (
          <View style={styles.routeFallback}><View style={styles.fallbackLine} /><Text style={styles.routeFallbackText}>CADA PASO CUENTA</Text></View>
        )}
      </View>

      {challengeName && totalKm > 0 && (
        <View style={styles.challengeBlock}>
          <View style={styles.challengeNumbers}>
            <Text style={styles.challengeProgress}>{challengeKm.toFixed(1)} / {String(Number(totalKm.toFixed(2)))} KM</Text>
            <Text style={styles.challengePct}>{pct.toFixed(0)}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        </View>
      )}

      <Text style={styles.signature}>KORVA</Text>
    </View>
  );
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.72)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 5,
};

const styles = StyleSheet.create({
  card: { width: 340, minHeight: 470, paddingHorizontal: 22, paddingVertical: 24, justifyContent: 'flex-start' },
  overlay: { backgroundColor: 'transparent' },
  overlayCompact: { minHeight: 300 },
  story: { width: 360, height: 640, backgroundColor: colors.backgroundDeep, paddingHorizontal: 28, paddingVertical: 34, overflow: 'hidden' },
  topography: { ...StyleSheet.absoluteFillObject },
  storyBackground: { ...StyleSheet.absoluteFillObject, opacity: 0.42 },
  storyShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9,23,37,0.56)' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  korva: { color: colors.text, fontSize: 11, fontWeight: '900', letterSpacing: 3, ...shadow },
  brandLine: { width: 22, height: 2, backgroundColor: colors.brandOrange },
  activityType: { color: colors.textSoft, fontSize: 8, fontWeight: '900', letterSpacing: 2, ...shadow },
  roadTo: { color: colors.brandOrangeSoft, fontSize: 10, fontWeight: '900', letterSpacing: 1.8, marginTop: 26, ...shadow },
  metricRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  distance: { color: colors.text, fontSize: 64, lineHeight: 70, fontWeight: '900', letterSpacing: -3, ...shadow },
  distanceSmall: { fontSize: 46, lineHeight: 56, letterSpacing: -2 },
  unit: { color: colors.text, fontSize: 18, fontWeight: '900', marginLeft: 6, marginBottom: 10, ...shadow },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  session: { color: colors.text, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, ...shadow },
  dot: { color: colors.brandOrange, fontSize: 15, fontWeight: '900', ...shadow },
  route: { height: H, marginTop: 18, justifyContent: 'center' },
  routeStory: { flex: 1, minHeight: H },
  routeCompact: { height: 70 },
  routeFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  routeFallbackText: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  fallbackLine: { width: 28, height: 2, backgroundColor: colors.brandOrange, marginBottom: 12 },
  challengeBlock: { marginTop: 12 },
  challengeNumbers: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  challengeProgress: { color: colors.text, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, ...shadow },
  challengePct: { color: colors.brandOrange, fontSize: 12, fontWeight: '900', ...shadow },
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 3, marginTop: 9, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: colors.brandOrange, borderRadius: 3 },
  signature: { color: colors.textSoft, fontSize: 8, fontWeight: '800', letterSpacing: 1.5, marginTop: 24, ...shadow },
});
