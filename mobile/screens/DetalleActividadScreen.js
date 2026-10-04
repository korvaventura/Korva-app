import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import RutaGpsActividad from '../components/RutaGpsActividad';
import KorvaActivityShareCard from '../components/KorvaActivityShareCard';
import { obtenerRutaGps } from '../services/gps/gpsApi';
import { supabase } from '../supabase';
import { colors } from '../theme/korvaTheme';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const deporte = (tipo) => ({ run: 'Running', walk: 'Caminata', ride: 'Ciclismo', swim: 'Natación' }[tipo] || tipo || 'Actividad');
const fuente = (source) => source === 'korva_gps' ? 'Korva GPS' : source === 'strava' ? 'Strava' : source === 'manual' ? 'Manual' : (source || 'Korva');

const duracion = (segundos) => {
  const s = Math.max(0, Number(segundos) || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, '0')}`;
};

export default function DetalleActividadScreen({ route, navigation }) {
  const a = route.params?.actividad || {};
  const userIdParam = route.params?.userId || null;
  const recienGuardada = route.params?.recienGuardada === true;
  const rutaGpsDisponible = route.params?.rutaGpsDisponible === true;
  const km = Number(a.distance_km || 0);
  const segundos = Number(a.duration_seconds || 0);
  const pace = km > 0 && segundos > 0 ? segundos / 60 / km : null;
  const paceTxt = pace ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')} /km` : '—';

  const [shareVisible, setShareVisible] = useState(false);
  const [shareVariant, setShareVariant] = useState('story');
  const [puntos, setPuntos] = useState([]);
  const [retosElegibles, setRetosElegibles] = useState([]);
  const [retoShare, setRetoShare] = useState(null);
  const [cargandoShare, setCargandoShare] = useState(false);
  const shareRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    const preparar = async () => {
      if (!a.id) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = userIdParam || session?.user?.id;
        const token = session?.access_token;

        if (a.source === 'korva_gps' || rutaGpsDisponible) {
          const ruta = await obtenerRutaGps(a.id);
          if (vivo) setPuntos(Array.isArray(ruta?.points) ? ruta.points : []);
        }

        if (!uid || !token) return;
        const progresoRes = await fetch(`${BACKEND_URL}/strava/progreso/${uid}`);
        const progreso = progresoRes.ok ? await progresoRes.json() : [];
        const candidatos = (Array.isArray(progreso) ? progreso : []).filter((r) => !r.pending && r.challenge_id);

        const chequeados = await Promise.all(candidatos.map(async (reto) => {
          try {
            const res = await fetch(`${BACKEND_URL}/progreso-desglose/${reto.challenge_id}/actividades`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return null;
            const data = await res.json();
            return (data.actividades || []).some((act) => act.id === a.id) ? reto : null;
          } catch {
            return null;
          }
        }));
        const validos = chequeados.filter(Boolean);
        if (vivo) {
          setRetosElegibles(validos);
          setRetoShare(validos.length === 1 ? validos[0] : null);
        }
      } catch {
        // Compartir sigue disponible como "Solo actividad" aunque falle el contexto del reto.
      }
    };
    preparar();
    return () => { vivo = false; };
  }, [a.id, a.source, userIdParam, rutaGpsDisponible]);

  const compartir = async () => {
    if (!shareRef.current || cargandoShare) return;
    setCargandoShare(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const uri = await shareRef.current.capture();
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Compartir no disponible', 'Este dispositivo no permite abrir la hoja de compartir.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir actividad Korva' });
    } catch (e) {
      Alert.alert('No se pudo compartir', 'Intentá nuevamente.');
    } finally {
      setCargandoShare(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.volver}>← Volver</Text></TouchableOpacity>
        {recienGuardada && (
          <View style={styles.savedBanner}>
            <Text style={styles.savedCheck}>✓</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.savedTitle}>Actividad guardada</Text>
              <Text style={styles.savedSub}>Ya sumó a los desafíos donde corresponde.</Text>
            </View>
          </View>
        )}
        <Text style={styles.titulo}>{deporte(a.sport_type)}</Text>
        <Text style={styles.fecha}>{a.recorded_at ? new Date(a.recorded_at).toLocaleString('es-AR') : ''} · {fuente(a.source)}</Text>

        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.valor}>{km.toFixed(2)}</Text><Text style={styles.label}>km</Text></View>
          <View style={styles.stat}><Text style={styles.valor}>{duracion(segundos)}</Text><Text style={styles.label}>tiempo</Text></View>
          <View style={styles.stat}><Text style={styles.valor}>{a.sport_type === 'ride' && segundos > 0 ? `${(km / (segundos / 3600)).toFixed(1)} km/h` : paceTxt}</Text><Text style={styles.label}>{a.sport_type === 'ride' ? 'velocidad' : 'ritmo'}</Text></View>
        </View>

        {(a.source === 'korva_gps' || rutaGpsDisponible) && a.id ? (
          <View style={styles.rutaCard}>
            <Text style={styles.rutaTitulo}>Tu recorrido</Text>
            <RutaGpsActividad activityId={a.id} modoDetalle />
          </View>
        ) : (
          <View style={styles.info}><Text style={styles.infoText}>Esta actividad fue registrada mediante {fuente(a.source)}.</Text></View>
        )}

        <TouchableOpacity style={styles.shareButton} onPress={() => setShareVisible(true)} activeOpacity={0.86}>
          <Text style={styles.shareButtonEyebrow}>{recienGuardada ? 'LISTA PARA COMPARTIR' : 'KORVA ACTIVITY'}</Text>
          <Text style={styles.shareButtonText}>Compartir actividad</Text>
          <Text style={styles.shareButtonSub}>Creá una placa para tu foto o historia</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={shareVisible} transparent animationType="fade" onRequestClose={() => setShareVisible(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>KORVA ACTIVITY SHARE</Text>
                <Text style={styles.modalTitle}>Tu actividad, lista para compartir</Text>
              </View>
              <TouchableOpacity onPress={() => setShareVisible(false)} hitSlop={12}>
                <Text style={styles.close}>×</Text>
              </TouchableOpacity>
            </View>

            {retosElegibles.length > 1 && (
              <Text style={styles.challengePrompt}>¿Qué aventura querés compartir?</Text>
            )}
            {retosElegibles.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.choices}>
                <TouchableOpacity style={[styles.choice, !retoShare && styles.choiceActive]} onPress={() => setRetoShare(null)}>
                  <Text style={[styles.choiceText, !retoShare && styles.choiceTextActive]}>Solo actividad</Text>
                </TouchableOpacity>
                {retosElegibles.map((reto) => (
                  <TouchableOpacity
                    key={reto.challenge_id}
                    style={[styles.choice, retoShare?.challenge_id === reto.challenge_id && styles.choiceActive]}
                    onPress={() => setRetoShare(reto)}
                  >
                    <Text style={[styles.choiceText, retoShare?.challenge_id === reto.challenge_id && styles.choiceTextActive]}>{reto.challenge}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.variantRow}>
              <TouchableOpacity style={[styles.variant, shareVariant === 'overlay' && styles.variantActive]} onPress={() => setShareVariant('overlay')}>
                <Text style={styles.variantText}>Overlay</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.variant, shareVariant === 'story' && styles.variantActive]} onPress={() => setShareVariant('story')}>
                <Text style={styles.variantText}>Story</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.previewArea}>
              <ViewShot
                ref={shareRef}
                options={{ format: 'png', quality: 1, result: 'tmpfile' }}
                style={shareVariant === 'overlay' ? styles.transparentShot : null}
              >
                <KorvaActivityShareCard actividad={a} puntos={puntos} challenge={retoShare} variante={shareVariant} />
              </ViewShot>
            </View>

            <Text style={styles.overlayHint}>
              {shareVariant === 'overlay'
                ? 'Fondo transparente · ideal para superponer sobre una foto.'
                : 'Historia 9:16 · lista para publicar directamente.'}
            </Text>

            <TouchableOpacity style={styles.sharePrimary} onPress={compartir} disabled={cargandoShare}>
              <Text style={styles.sharePrimaryText}>{cargandoShare ? 'PREPARANDO…' : 'COMPARTIR'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  volver: { color: colors.actionBlue, fontWeight: '700', marginBottom: 24 },
  savedBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 18, padding: 14, marginBottom: 18 },
  savedCheck: { width: 30, height: 30, borderRadius: 15, textAlign: 'center', lineHeight: 30, backgroundColor: colors.brandOrange, color: colors.text, fontWeight: '900' },
  savedTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  savedSub: { color: colors.textMuted, fontSize: 9, marginTop: 2 },
  titulo: { color: colors.text, fontSize: 30, fontWeight: '800' },
  fecha: { color: colors.textSoft, fontSize: 12, marginTop: 6, marginBottom: 22 },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  stat: { flex: 1, backgroundColor: colors.surfaceStrong, borderRadius: 14, padding: 12, alignItems: 'center' },
  valor: { color: colors.text, fontSize: 17, fontWeight: '800' },
  label: { color: colors.textSoft, fontSize: 10, marginTop: 4 },
  rutaCard: { backgroundColor: colors.surfaceStrong, borderRadius: 18, padding: 16 },
  rutaTitulo: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  info: { backgroundColor: colors.surfaceStrong, borderRadius: 16, padding: 18 },
  infoText: { color: colors.textSoft },
  shareButton: { marginTop: 18, borderRadius: 20, padding: 18, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderStrong },
  shareButtonEyebrow: { color: colors.brandOrange, fontSize: 8, fontWeight: '900', letterSpacing: 2, marginBottom: 5 },
  shareButtonText: { color: colors.text, fontSize: 18, fontWeight: '900' },
  shareButtonSub: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)' },
  modalContent: { minHeight: '100%', paddingHorizontal: 18, paddingTop: 58, paddingBottom: 36, alignItems: 'center' },
  modalHeader: { width: '100%', maxWidth: 390, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  modalEyebrow: { color: colors.brandOrange, fontSize: 8, fontWeight: '900', letterSpacing: 2 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 },
  close: { color: colors.textMuted, fontSize: 30, lineHeight: 30 },
  challengePrompt: { width: '100%', maxWidth: 390, color: colors.textSoft, fontSize: 11, fontWeight: '800', marginBottom: 8 },
  choices: { width: '100%', maxWidth: 390, marginBottom: 12, flexGrow: 0 },
  choice: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderSoft, marginRight: 8 },
  choiceActive: { borderColor: colors.brandOrange, backgroundColor: colors.surfaceRaised },
  choiceText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  choiceTextActive: { color: colors.text },
  variantRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  variant: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: colors.borderSoft },
  variantActive: { borderColor: colors.brandOrange, backgroundColor: colors.surfaceRaised },
  variantText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  previewArea: { width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 24, overflow: 'hidden', backgroundColor: '#26384A', paddingVertical: 8 },
  transparentShot: { backgroundColor: 'transparent' },
  overlayHint: { color: colors.textMuted, fontSize: 10, marginTop: 10, textAlign: 'center' },
  sharePrimary: { marginTop: 16, minWidth: 220, backgroundColor: colors.brandOrange, borderRadius: 22, paddingHorizontal: 28, paddingVertical: 13, alignItems: 'center' },
  sharePrimaryText: { color: colors.text, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
});
