import { Alert, Image, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import RutaGpsActividad from '../components/RutaGpsActividad';
import KorvaActivityShareCard from '../components/KorvaActivityShareCard';
import { obtenerRutaGps } from '../services/gps/gpsApi';
import { supabase } from '../supabase';
import { consultarRutaLibre } from '../services/rutasLibresApi';
const { retoIslandia, ordenarRetos, urlsFondo } = require('../services/compartirCore');

// Bajar la foto del desafío apenas sabemos cuál es: cuando abre compartir ya está.
const precargarFondo = (titulo) => { urlsFondo(titulo).forEach((u) => Image.prefetch(u).catch(() => {})); };
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/korvaTheme';
import { nombreDeporteActividad, nombreFuenteActividad } from '../utils/actividadPresentacion';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const deporte = nombreDeporteActividad;
const fuente = nombreFuenteActividad;

const duracion = (segundos) => {
  const s = Math.max(0, Number(segundos) || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, '0')}`;
};

export default function DetalleActividadScreen({ route, navigation }) {
  const { width } = useWindowDimensions();
  const anchoShare = Math.min(360, width - 36);
  const a = route.params?.actividad || {};
  const userIdParam = route.params?.userId || null;
  const recienGuardada = route.params?.recienGuardada === true;
  const abrirCompartir = recienGuardada || route.params?.abrirCompartir === true;
  // Desde la historia de un desafío llega ese desafío ya armado: se muestra al instante.
  const retoInicial = route.params?.retoInicial || null;
  const retoPreferido = route.params?.retoPreferido || retoInicial?.challenge_id || null;
  const rutaGpsDisponible = route.params?.rutaGpsDisponible === true;
  const km = Number(a.distance_km || 0);
  const segundos = Number(a.duration_seconds || 0);
  const pace = km > 0 && segundos > 0 ? segundos / 60 / km : null;
  const paceTxt = pace ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')} /km` : '—';

  const [shareVisible, setShareVisible] = useState(false);
  const [shareVariant, setShareVariant] = useState('story');
  const [puntos, setPuntos] = useState([]);
  const [retosElegibles, setRetosElegibles] = useState(retoInicial ? [retoInicial] : []);
  const [retoShare, setRetoShare] = useState(retoInicial);
  const [cargandoShare, setCargandoShare] = useState(false);
  const shareRef = useRef(null);
  const fondoRef = useRef('cargando');
  const [contextoListo, setContextoListo] = useState(false);
  const yaAbrio = useRef(false);
  useEffect(() => { if (retoInicial) precargarFondo(retoInicial.challenge); }, []);

  useEffect(() => {
    let vivo = true;
    const preparar = async () => {
      if (!a.id) return;
      // La traza GPS se pide en paralelo: no frena la elección de desafíos.
      if (a.source === 'korva_gps' || rutaGpsDisponible) {
        obtenerRutaGps(a.id)
          .then((ruta) => { if (vivo) setPuntos(Array.isArray(ruta?.points) ? ruta.points : []); })
          .catch(() => {});
      }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = userIdParam || session?.user?.id;
        const token = session?.access_token;
        if (!uid || !token) return;

        const [progreso, islandia] = await Promise.all([
          fetch(`${BACKEND_URL}/strava/progreso/${uid}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
          consultarRutaLibre()
            .then((libre) => (libre?.userId === uid ? retoIslandia(libre.participacion, a) : null))
            .catch(() => null),
        ]);
        const candidatos = (Array.isArray(progreso) ? progreso : []).filter((r) => !r.pending && r.challenge_id);
        candidatos.forEach((r) => precargarFondo(r.challenge));

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
        if (islandia) { validos.push(islandia); precargarFondo(islandia.challenge); }
        if (vivo && validos.length) {
          const ordenados = ordenarRetos(validos, retoPreferido);
          setRetosElegibles(ordenados);
          // Si ya se estaba mostrando un desafío (vino desde su historia), se queda en ese.
          setRetoShare((actual) => ordenados.find((r) => r.challenge_id === actual?.challenge_id) || ordenados[0]);
        }
      } catch {
        // Compartir sigue disponible como "Solo la salida" aunque falle el contexto del reto.
      }
    };
    preparar().finally(() => { if (vivo) setContextoListo(true); });
    return () => { vivo = false; };
  }, [a.id, a.source, userIdParam, rutaGpsDisponible]);

  // Recién guardada (GPS, manual) o desde el aviso de Strava: abrimos compartir
  // solo una vez y cuando ya sabemos a qué desafío sumó.
  useEffect(() => {
    if (!abrirCompartir || (!contextoListo && !retoInicial) || yaAbrio.current) return;
    yaAbrio.current = true;
    const t = setTimeout(() => setShareVisible(true), retoInicial ? 150 : 300);
    return () => clearTimeout(t);
  }, [abrirCompartir, contextoListo]);

  // Tarjetas: cada desafío al que sumó la salida y, al final, "Solo la salida".
  const opciones = retosElegibles.length ? [...retosElegibles, null] : [null];
  const indiceShare = Math.max(0, opciones.findIndex((r) => (r?.challenge_id || null) === (retoShare?.challenge_id || null)));
  const indiceRef = useRef(0);
  indiceRef.current = indiceShare;
  const opcionesRef = useRef(opciones);
  opcionesRef.current = opciones;
  const deslizar = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => {
      const lista = opcionesRef.current;
      if (lista.length < 2 || Math.abs(g.dx) < 40) return;
      const siguiente = (indiceRef.current + (g.dx < 0 ? 1 : -1) + lista.length) % lista.length;
      setRetoShare(lista[siguiente]);
    },
  })).current;

  const compartir = async () => {
    if (!shareRef.current || cargandoShare) return;
    setCargandoShare(true);
    try {
      // La foto del desafío tiene que estar cargada antes de sacar la imagen.
      for (let i = 0; i < 40 && shareVariant === 'story' && fondoRef.current === 'cargando'; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
      const uri = await shareRef.current.capture();
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Compartir no disponible', 'Este dispositivo no permite abrir la hoja de compartir.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: shareVariant === 'overlay' ? 'image/png' : 'image/jpeg', dialogTitle: 'Compartir actividad Korva' });
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
          <Text style={styles.shareButtonEyebrow}>{recienGuardada ? 'LISTA PARA COMPARTIR' : 'TU ACTIVIDAD'}</Text>
          <Text style={styles.shareButtonText}>Compartir actividad</Text>
          <Text style={styles.shareButtonSub}>Para tu historia o encima de tu foto</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={shareVisible} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal
        onRequestClose={() => setShareVisible(false)} onDismiss={() => setShareVisible(false)}>
        <SafeAreaProvider>
        <SafeAreaView style={styles.modalBackdrop} edges={['top', 'bottom']}>
          <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.modalEyebrow}>COMPARTÍ TU ACTIVIDAD</Text>
                <Text style={styles.modalTitle}>Compartir actividad</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setShareVisible(false)}
                accessibilityRole="button" accessibilityLabel="Cerrar compartir actividad">
                <Text style={styles.close}>×</Text>
              </TouchableOpacity>
            </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            {retosElegibles.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.choices} contentContainerStyle={styles.choicesContent}>
                {opciones.map((reto, i) => {
                  const activo = i === indiceShare;
                  return (
                    <TouchableOpacity key={reto?.challenge_id || 'solo'} style={[styles.choice, activo && styles.choiceActive]} onPress={() => setRetoShare(reto)}>
                      <Text style={[styles.choiceText, activo && styles.choiceTextActive]}>{reto ? String(reto.challenge).replace(/\s+\d+(?:[.,]\d+)?\s*K$/i, '') : 'Solo la salida'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.variantRow}>
              <TouchableOpacity style={[styles.variant, shareVariant === 'story' && styles.variantActive]} onPress={() => setShareVariant('story')}>
                <Text style={styles.variantText}>Historia</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.variant, shareVariant === 'overlay' && styles.variantActive]} onPress={() => setShareVariant('overlay')}>
                <Text style={styles.variantText}>Sin fondo</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.previewArea} {...deslizar.panHandlers}>
              <ViewShot
                ref={shareRef}
                options={shareVariant === 'overlay' ? { format: 'png', quality: 1, result: 'tmpfile' } : { format: 'jpg', quality: 0.92, result: 'tmpfile' }}
                style={shareVariant === 'overlay' ? styles.transparentShot : null}
              >
                <KorvaActivityShareCard actividad={a} puntos={puntos} challenge={retoShare} variante={shareVariant} ancho={anchoShare}
                  onFondoListo={(e) => { fondoRef.current = e; }} />
              </ViewShot>
            </View>

            {opciones.length > 1 && (
              <View style={styles.puntos}>
                {opciones.map((r, i) => <View key={r?.challenge_id || 'solo'} style={[styles.punto, i === indiceShare && styles.puntoActivo]} />)}
              </View>
            )}
            <Text style={styles.overlayHint}>
              {shareVariant === 'overlay'
                ? 'Para pegar encima de una foto tuya.'
                : 'Lista para subir a tu historia.'}
            </Text>

          </ScrollView>
          <View style={styles.shareFooter}>
            <TouchableOpacity style={styles.sharePrimary} onPress={compartir} disabled={cargandoShare}>
              <Text style={styles.sharePrimaryText}>{cargandoShare ? 'PREPARANDO…' : 'COMPARTIR'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        </SafeAreaProvider>
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
  modalBackdrop: { flex: 1, backgroundColor: colors.backgroundDeep },
  modalScroll: { flex: 1 },
  modalContent: { paddingHorizontal: 18, paddingBottom: 16, alignItems: 'center' },
  sheetHandle: { width: 34, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  closeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  shareFooter: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderColor: colors.borderSoft, alignItems: 'center' },
  modalHeader: { width: '100%', alignSelf: 'center', paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
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
  choicesContent: { paddingRight: 8 },
  puntos: { flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 10 },
  punto: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  puntoActivo: { width: 16, backgroundColor: colors.text },
  previewArea: { width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 24, overflow: 'hidden', backgroundColor: '#26384A', paddingVertical: 8 },
  transparentShot: { backgroundColor: 'transparent' },
  overlayHint: { color: colors.textMuted, fontSize: 10, marginTop: 10, textAlign: 'center' },
  sharePrimary: { width: '100%', maxWidth: 390, minHeight: 48, backgroundColor: colors.brandOrange, borderRadius: 22, paddingHorizontal: 28, paddingVertical: 13, alignItems: 'center' },
  sharePrimaryText: { color: colors.text, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
});
