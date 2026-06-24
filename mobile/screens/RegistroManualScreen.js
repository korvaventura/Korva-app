import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const getFecha = (diasAtras) => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d;
};

const formatearFecha = (date) => {
  return date.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

export default function RegistroManualScreen() {
  const [deporte, setDeporte] = useState('run');
  const [distancia, setDistancia] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [exito, setExito] = useState(false);
  const [userId, setUserId] = useState(null);
  const [diasAtras, setDiasAtras] = useState(0);
  const [challengeId, setChallengeId] = useState(null);
  const [evidenciaUri, setEvidenciaUri] = useState(null);
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);
  const [evidenciaUrl, setEvidenciaUrl] = useState(null);
  const [horas, setHoras] = useState('');
  const [minutos, setMinutos] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
        const { data } = await supabase
          .from('user_challenges')
          .select('challenge_id')
          .eq('user_id', session.user.id)
          .eq('status', 'active')
          .order('started_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (data?.challenge_id) setChallengeId(data.challenge_id);
      }
    });
  }, []);

  const seleccionarEvidencia = async () => {
    try {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para subir evidencia.');
        return;
      }
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
      });
      if (resultado.canceled) return;
      setEvidenciaUri(resultado.assets[0].uri);
      setEvidenciaUrl(null);
    } catch (error) {
      Alert.alert('Error', 'No se pudo seleccionar la imagen.');
    }
  };

  const sacarFoto = async () => {
    try {
      const permiso = await ImagePicker.requestCameraPermissionsAsync();
      if (!permiso.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara.');
        return;
      }
      const resultado = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
      });
      if (resultado.canceled) return;
      setEvidenciaUri(resultado.assets[0].uri);
      setEvidenciaUrl(null);
    } catch (error) {
      Alert.alert('Error', 'No se pudo tomar la foto.');
    }
  };

  const subirEvidencia = async (uri) => {
    setSubiendoEvidencia(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const res = await fetch(`${BACKEND_URL}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64,
          carpeta: 'evidencias',
          nombre: `evidencia_${userId}_${Date.now()}.jpg`,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data.url;
    } catch (error) {
      console.error('Error subiendo evidencia:', error);
      return null;
    } finally {
      setSubiendoEvidencia(false);
    }
  };

  const quitarEvidencia = () => {
    setEvidenciaUri(null);
    setEvidenciaUrl(null);
  };

  const registrar = async () => {
    if (!distancia || parseFloat(distancia) <= 0) {
      setMensaje('Ingresa una distancia valida');
      setExito(false);
      return;
    }
    if (!userId) {
      setMensaje('Error de sesion, intenta de nuevo');
      return;
    }
    if (!challengeId) {
      setMensaje('No tenés ningún desafío activo. Cerrá sesión y volvé a entrar, o inscribite a un desafío primero.');
      setExito(false);
      return;
    }
    setCargando(true);
    setMensaje('');
    setExito(false);
    try {
      let urlEvidencia = evidenciaUrl;
      if (evidenciaUri && !evidenciaUrl) {
        urlEvidencia = await subirEvidencia(evidenciaUri);
      }

      const fechaActividad = getFecha(diasAtras);
      const h = parseInt(horas) || 0;
      const m = parseInt(minutos) || 0;
      const duracionSegundos = (h * 3600 + m * 60) || null;

      const res = await fetch(`${BACKEND_URL}/actividades/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          challenge_id: challengeId,
          sport_type: deporte,
          distance_km: parseFloat(distancia),
          recorded_at: fechaActividad.toISOString(),
          evidencia_url: urlEvidencia || null,
          duration_seconds: duracionSegundos,
        })
      });
      const data = await res.json();
      if (data.error) {
        setMensaje(data.error);
        setExito(false);
      } else {
        setMensaje(`${distancia} km de ${deporte === 'run' ? 'running' : 'ciclismo'} registrados!`);
        setExito(true);
        setDistancia('');
        setDiasAtras(0);
        setEvidenciaUri(null);
        setEvidenciaUrl(null);
        setHoras('');
        setMinutos('');
        setTimeout(() => { setMensaje(''); setExito(false); }, 3000);
      }
    } catch (error) {
      setMensaje('Error de conexion');
      setExito(false);
    } finally {
      setCargando(false);
    }
  };

  const deportes = [
    { id: 'run', label: 'Running', emoji: '🏃' },
    { id: 'ride', label: 'Ciclismo', emoji: '🚴' },
  ];

  const opciones_fecha = [
    { label: 'Hoy', dias: 0 },
    { label: 'Ayer', dias: 1 },
    { label: 'Hace 2 días', dias: 2 },
    { label: 'Hace 3 días', dias: 3 },
    { label: 'Hace 4 días', dias: 4 },
    { label: 'Hace 5 días', dias: 5 },
    { label: 'Hace 6 días', dias: 6 },
    { label: 'Hace 7 días', dias: 7 },
  ];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>Registrar km</Text>
      <Text style={styles.subtitulo}>Carga tus actividades manualmente</Text>

      {/* Banner informativo — Korva no es app de tracking */}
      <View style={styles.trackingBanner}>
        <Text style={styles.trackingBannerEmoji}>💡</Text>
        <View style={styles.trackingBannerInfo}>
          <Text style={styles.trackingBannerTitulo}>Korva no trackea en tiempo real</Text>
          <Text style={styles.trackingBannerDesc}>
            Usá Garmin, Nike Run, Strava o cualquier app de tu preferencia para registrar tu actividad. Después volvé acá y cargá tus km.{'\n'}
            <Text style={styles.trackingBannerStrava}>🟠 Próximamente: sincronización automática con Strava</Text>
          </Text>
        </View>
      </View>

      <View style={styles.deporteContainer}>
        {deportes.map((d) => (
          <TouchableOpacity
            key={d.id}
            style={[styles.deporteBtn, deporte === d.id && styles.deporteBtnActivo]}
            onPress={() => setDeporte(d.id)}
          >
            <Text style={styles.deporteEmoji}>{d.emoji}</Text>
            <Text style={[styles.deporteLabel, deporte === d.id && styles.deporteLabelActivo]}>
              {d.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.distanciaCard}>
        <Text style={styles.distanciaLabel}>DISTANCIA</Text>
        <View style={styles.distanciaRow}>
          <TextInput
            style={styles.distanciaInput}
            value={distancia}
            onChangeText={setDistancia}
            keyboardType="decimal-pad"
            placeholder="0.0"
            placeholderTextColor="#2a4a6a"
          />
          <Text style={styles.distanciaUnidad}>km</Text>
        </View>
      </View>

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>📅 Fecha de la actividad</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fechaScroll}>
          {opciones_fecha.map((op) => (
            <TouchableOpacity
              key={op.dias}
              style={[styles.fechaBtn, diasAtras === op.dias && styles.fechaBtnActivo]}
              onPress={() => setDiasAtras(op.dias)}
            >
              <Text style={[styles.fechaBtnText, diasAtras === op.dias && styles.fechaBtnTextActivo]}>
                {op.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.fechaSeleccionada}>
          {formatearFecha(getFecha(diasAtras))}
        </Text>
      </View>

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>⏱️ Tiempo <Text style={styles.opcional}>(opcional)</Text></Text>
        <Text style={styles.evidenciaSubtitulo}>Para calcular tu ritmo promedio en el Perfil</Text>
        <View style={styles.tiempoRow}>
          <View style={styles.tiempoInputWrapper}>
            <TextInput
              style={styles.tiempoInput}
              value={horas}
              onChangeText={setHoras}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#2a4a6a"
              maxLength={2}
            />
            <Text style={styles.tiempoUnidad}>hs</Text>
          </View>
          <View style={styles.tiempoInputWrapper}>
            <TextInput
              style={styles.tiempoInput}
              value={minutos}
              onChangeText={setMinutos}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#2a4a6a"
              maxLength={2}
            />
            <Text style={styles.tiempoUnidad}>min</Text>
          </View>
        </View>
      </View>

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>📸 Evidencia <Text style={styles.opcional}>(opcional)</Text></Text>
        <Text style={styles.evidenciaSubtitulo}>Captura de Strava, Garmin u otra app de entrenamiento</Text>

        {evidenciaUri ? (
          <View style={styles.evidenciaPreviewWrapper}>
            <Image source={{ uri: evidenciaUri }} style={styles.evidenciaPreview} resizeMode="cover" />
            {subiendoEvidencia && (
              <View style={styles.evidenciaOverlay}>
                <ActivityIndicator color="#FFFFFF" size="large" />
                <Text style={styles.evidenciaSubiendoText}>Subiendo...</Text>
              </View>
            )}
            <TouchableOpacity style={styles.evidenciaQuitarBtn} onPress={quitarEvidencia}>
              <Text style={styles.evidenciaQuitarText}>✕ Quitar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.evidenciaBotonesRow}>
            <TouchableOpacity style={styles.evidenciaBtn} onPress={seleccionarEvidencia}>
              <Ionicons name="image-outline" size={20} color="#1E6FD9" />
              <Text style={styles.evidenciaBtnText}>Galería</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.evidenciaBtn} onPress={sacarFoto}>
              <Ionicons name="camera-outline" size={20} color="#1E6FD9" />
              <Text style={styles.evidenciaBtnText}>Cámara</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {mensaje ? (
        <View style={[styles.mensajeBox, exito && styles.mensajeExito]}>
          <Text style={[styles.mensajeText, exito && styles.mensajeTextoExito]}>
            {exito ? '✅ ' : '⚠️ '}{mensaje}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.button, cargando && styles.buttonDisabled]}
        onPress={registrar}
        disabled={cargando}
      >
        {cargando ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <View style={styles.btnRow}>
            <Text style={styles.buttonText}>Registrar actividad</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  subtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 20 },

  // Banner tracking
  trackingBanner: { backgroundColor: '#1E3A5F', borderRadius: 14, padding: 14, marginBottom: 20, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: '#2a4a6a' },
  trackingBannerEmoji: { fontSize: 20, marginTop: 2 },
  trackingBannerInfo: { flex: 1 },
  trackingBannerTitulo: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  trackingBannerDesc: { fontSize: 12, color: '#A8CFFF', lineHeight: 18 },
  trackingBannerStrava: { color: '#FC4C02', fontWeight: 'bold' },

  deporteContainer: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  deporteBtn: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  deporteBtnActivo: { borderColor: '#1E6FD9', backgroundColor: '#162d4a' },
  deporteEmoji: { fontSize: 28, marginBottom: 6 },
  deporteLabel: { fontSize: 12, fontWeight: 'bold', color: '#4a6a8a' },
  deporteLabelActivo: { color: '#1E6FD9' },
  distanciaCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 28, marginBottom: 20, alignItems: 'center' },
  distanciaLabel: { fontSize: 11, fontWeight: 'bold', color: '#4a6a8a', letterSpacing: 2, marginBottom: 16 },
  distanciaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  distanciaInput: { fontSize: 56, fontWeight: 'bold', color: '#FFFFFF', minWidth: 120, textAlign: 'center' },
  distanciaUnidad: { fontSize: 24, color: '#A8CFFF', fontWeight: 'bold' },
  seccion: { marginBottom: 20 },
  seccionTitulo: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4, letterSpacing: 0.5 },
  opcional: { fontSize: 12, color: '#4a6a8a', fontWeight: 'normal' },
  evidenciaSubtitulo: { fontSize: 12, color: '#4a6a8a', marginBottom: 12 },
  tiempoRow: { flexDirection: 'row', gap: 12 },
  tiempoInputWrapper: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  tiempoInput: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', minWidth: 40, textAlign: 'center' },
  tiempoUnidad: { fontSize: 13, color: '#A8CFFF', fontWeight: 'bold' },
  evidenciaBotonesRow: { flexDirection: 'row', gap: 10 },
  evidenciaBtn: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1E6FD9', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  evidenciaBtnText: { color: '#1E6FD9', fontWeight: 'bold', fontSize: 14 },
  evidenciaPreviewWrapper: { position: 'relative', borderRadius: 14, overflow: 'hidden' },
  evidenciaPreview: { width: '100%', height: 200, borderRadius: 14 },
  evidenciaOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  evidenciaSubiendoText: { color: '#FFFFFF', marginTop: 8, fontWeight: 'bold' },
  evidenciaQuitarBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  evidenciaQuitarText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  fechaScroll: { marginBottom: 12 },
  fechaBtn: { backgroundColor: '#1E3A5F', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginRight: 8, borderWidth: 2, borderColor: 'transparent' },
  fechaBtnActivo: { borderColor: '#1E6FD9', backgroundColor: '#162d4a' },
  fechaBtnText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 13 },
  fechaBtnTextActivo: { color: '#1E6FD9' },
  fechaSeleccionada: { fontSize: 13, color: '#A8CFFF', marginTop: 4 },
  mensajeBox: { backgroundColor: '#2a1a1a', borderRadius: 12, padding: 14, marginBottom: 16 },
  mensajeExito: { backgroundColor: '#0a2a1a' },
  mensajeText: { color: '#FC4C02', fontSize: 14, textAlign: 'center' },
  mensajeTextoExito: { color: '#4CAF50' },
  button: { backgroundColor: '#1E6FD9', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#2a3a4a' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});