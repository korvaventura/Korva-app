import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import { colors } from '../theme/korvaTheme';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const getFecha = (diasAtras) => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d;
};

const formatearFecha = (date) => {
  return date.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

export default function RegistroManualScreen({ navigation }) {
  const [modoRegistro, setModoRegistro] = useState('gps');
  const [detallesVisibles, setDetallesVisibles] = useState(false);
  const [descripcionActividad, setDescripcionActividad] = useState('');
  const [distancia, setDistancia] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [exito, setExito] = useState(false);
  const [userId, setUserId] = useState(null);
  const [diasAtras, setDiasAtras] = useState(0);
  const [desafios, setDesafios] = useState([]);
  const [desafiosVisibles, setDesafiosVisibles] = useState(false);
  const [estadoDesafios, setEstadoDesafios] = useState('cargando');
  const [cambiandoDesafio, setCambiandoDesafio] = useState(null);
  const generacion = useRef(0);
  const cambioPendiente = useRef(false);
  const activos = desafios.filter((reto) => !reto.pausado);
  const challengeId = activos[0]?.challenge_id || null;

  const [evidenciaUri, setEvidenciaUri] = useState(null);
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);
  const [evidenciaUrl, setEvidenciaUrl] = useState(null);
  const [horas, setHoras] = useState('');
  const [minutos, setMinutos] = useState('');
  const [segundos, setSegundos] = useState('');

  const cargarDesafios = useCallback(async (usuario, turno) => {
    const { data, error } = await supabase
      .from('user_challenges')
      .select('id, challenge_id, pausado, challenges(title)')
      .eq('user_id', usuario)
      .eq('status', 'active')
      .order('started_at', { ascending: true });
    if (turno !== generacion.current) return;
    if (error) throw error;
    setDesafios(data || []);
    setEstadoDesafios('listo');
  }, []);

  const consultarDesafios = useCallback(async () => {
    const turno = ++generacion.current;
    setEstadoDesafios('cargando');
    setDesafios([]);
    setUserId(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (turno !== generacion.current) return;
      if (!session?.user?.id) {
        setEstadoDesafios('sesion');
        return;
      }
      setUserId(session.user.id);
      await cargarDesafios(session.user.id, turno);
    } catch {
      if (turno === generacion.current) setEstadoDesafios('error');
    }
  }, [cargarDesafios]);

  useFocusEffect(useCallback(() => {
    consultarDesafios();
    return () => { generacion.current += 1; };
  }, [consultarDesafios]));

  const cambiarPausa = async (reto) => {
    if (cambioPendiente.current || cargando || !userId) return;
    const turno = generacion.current;
    cambioPendiente.current = true;
    setCambiandoDesafio(reto.id);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (turno !== generacion.current) return;
      if (session?.user?.id !== userId) throw new Error('Volvé a iniciar sesión para gestionar tus desafíos.');
      const res = await fetch(`${BACKEND_URL}/challenges/${reto.pausado ? 'reanudar' : 'pausar'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: userId, challenge_id: reto.challenge_id }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (turno !== generacion.current) return;
      if (!res.ok || data.error) throw new Error(data.error || 'No se pudo cambiar el estado del desafío.');
      // Releer también permite retirar un reto que se completó al reanudarlo.
      setEstadoDesafios('cargando');
      await cargarDesafios(userId, turno);
    } catch (error) {
      if (turno === generacion.current) {
        setEstadoDesafios('error');
        Alert.alert('Revisá tus desafíos', error.name === 'AbortError' ? 'La consulta tardó demasiado. Tocá Reintentar para confirmar el estado.' : 'No pudimos confirmar el estado. Tocá Reintentar.');
      }
    } finally {
      clearTimeout(timeout);
      cambioPendiente.current = false;
      setCambiandoDesafio(null);
    }
  };

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
      setEvidenciaUrl(null); // resetear URL anterior
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
      // Convertir imagen a base64
      const response = await fetch(uri);
      const blob = await response.blob();
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Subir via backend (sin exponer keys en el cliente)
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
    if (cambioPendiente.current || estadoDesafios !== 'listo') return;
    if (!distancia || parseFloat(distancia) <= 0) {
      setMensaje('Ingresa una distancia valida');
      setExito(false);
      return;
    }
    if (!userId) {
      setMensaje('Error de sesion, intenta de nuevo');
      return;
    }
    guardarActividad();
  };

  const guardarActividad = async () => {
    setCargando(true);
    setMensaje('');
    setExito(false);
    try {
      // Subir evidencia si hay una seleccionada
      let urlEvidencia = evidenciaUrl;
      if (evidenciaUri && !evidenciaUrl) {
        urlEvidencia = await subirEvidencia(evidenciaUri);
      }

      const fechaActividad = getFecha(diasAtras);
      const h = parseInt(horas) || 0;
      const m = parseInt(minutos) || 0;
      const s = parseInt(segundos) || 0;
      const duracionSegundos = (h * 3600 + m * 60 + s) || null;

      const res = await fetch(`${BACKEND_URL}/actividades/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          challenge_id: challengeId,
          sport_type: descripcionActividad.trim() || 'manual',
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
        const actividadLabel = descripcionActividad.trim();
        const msgModo = challengeId
          ? `${distancia} km${actividadLabel ? ` de ${actividadLabel}` : ''} registrados!`
          : `${distancia} km guardados en modo libre 🏃`;
        setMensaje(msgModo);
        setExito(true);
        // El guardado puede completar un desafío: actualizar la lista sin
        // convertir un fallo de consulta en un fallo de registro.
        const turno = generacion.current;
        try {
          await cargarDesafios(userId, turno);
        } catch {
          if (turno === generacion.current) setEstadoDesafios('error');
        }
        setDistancia('');
        setDiasAtras(0);
        setEvidenciaUri(null);
        setEvidenciaUrl(null);
        setHoras('');
        setMinutos('');
        setSegundos('');
        setTimeout(() => { setMensaje(''); setExito(false); }, 3000);
      }
    } catch (error) {
      setMensaje('Error de conexion');
      setExito(false);
    } finally {
      setCargando(false);
    }
  };

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
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.titulo}>Registrar actividad</Text>
      <Text style={styles.subtitulo}>Elegí cómo querés guardar tus kilómetros.</Text>
      <View style={styles.modeRow}>
        {[
          { id: 'gps', label: 'GPS', icon: 'navigate-outline' },
          { id: 'manual', label: 'Manual', icon: 'create-outline' },
        ].map((modo) => (
          <TouchableOpacity key={modo.id}
            style={[styles.modeButton, modoRegistro === modo.id && styles.modeButtonActive]}
            onPress={() => setModoRegistro(modo.id)}
            accessibilityRole="button" accessibilityState={{ selected: modoRegistro === modo.id }}>
            <Ionicons name={modo.icon} size={20} color={modoRegistro === modo.id ? colors.text : colors.textSoft} />
            <Text style={[styles.modeText, modoRegistro === modo.id && styles.modeTextActive]}>{modo.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {estadoDesafios === 'listo' && desafios.length === 0 && (
        <View style={styles.freeMode}>
          <Text style={styles.challengeTitle}>Modo libre</Text>
          <Text style={styles.challengeExplanation}>Tus kilómetros quedan guardados en tu historial personal. Podés empezar ahora y elegir un desafío cuando quieras.</Text>
          <TouchableOpacity style={styles.freeLink} onPress={() => navigation.navigate('Catalogo')} accessibilityRole="button">
            <Text style={styles.challengeActionText}>Explorar desafíos</Text>
            <Ionicons name="arrow-forward" size={15} color={colors.actionBlue} />
          </TouchableOpacity>
        </View>
      )}

      {modoRegistro === 'gps' ? (
        <View style={styles.gpsCard}>
          <Ionicons name="navigate-outline" size={32} color={colors.brandOrangeSoft} />
          <Text style={styles.gpsTitle}>Salí con Korva GPS</Text>
          <Text style={styles.gpsCopy}>Distancia y tiempo con el GPS del teléfono.</Text>
          <Text style={styles.gpsSports}>Correr · caminar · bici</Text>
          <Text style={styles.gpsExplanation}>Podés pausar durante la salida. Al finalizar, revisás y confirmás la actividad antes de guardarla.</Text>
          <TouchableOpacity style={[styles.button, cambiandoDesafio && styles.buttonDisabled]}
            disabled={!!cambiandoDesafio} onPress={() => navigation.navigate('GpsTracker')}>
            <View style={styles.btnRow}>
              <Ionicons name="arrow-forward" size={18} color={colors.text} />
              <Text style={styles.buttonText}>Abrir Korva GPS</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.gpsFootnote}>También podés registrar actividades sin un desafío.</Text>
        </View>
      ) : (
        <>
      <Text style={styles.manualNote}>
        Tu actividad queda en el historial y suma a los desafíos que correspondan a su fecha.
      </Text>

      <View style={styles.distanciaCard}>
        <Text style={styles.distanciaLabel}>DISTANCIA</Text>
        <View style={styles.distanciaRow}>
          <TextInput
            style={styles.distanciaInput}
            value={distancia}
            onChangeText={v => setDistancia(v.replace(',', '.'))}
            keyboardType="decimal-pad"
            placeholder="0.0"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.distanciaUnidad}>km</Text>
        </View>
      </View>

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Fecha de la actividad</Text>
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

      <TouchableOpacity style={styles.detailsToggle} onPress={() => setDetallesVisibles(!detallesVisibles)}
        accessibilityRole="button" accessibilityState={{ expanded: detallesVisibles }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailsTitle}>{detallesVisibles ? 'Ocultar detalles' : 'Agregar detalles'}</Text>
          <Text style={styles.detailsSubtitle}>Actividad, tiempo y evidencia · opcionales</Text>
        </View>
        <Ionicons name={detallesVisibles ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSoft} />
      </TouchableOpacity>
      {detallesVisibles && (
        <>
      <View style={{ marginBottom: 20 }}>
        <Text style={{ color: colors.textSoft, fontSize: 12, marginBottom: 8 }}>¿Qué actividad hiciste? <Text style={{ color: colors.textMuted }}>(opcional)</Text></Text>
        <TextInput
          style={{ backgroundColor: colors.surfaceSoft, borderRadius: 10, padding: 12, color: colors.text, fontSize: 14 }}
          value={descripcionActividad}
          onChangeText={setDescripcionActividad}
          placeholder="Ej: Caminata, Natación, Trekking, Running..."
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Sección de tiempo opcional */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Tiempo <Text style={styles.opcional}>(opcional)</Text></Text>
        <Text style={styles.evidenciaSubtitulo}>Para mostrar la duración y el ritmo de tu actividad</Text>
        <View style={styles.tiempoRow}>
          <View style={styles.tiempoInputWrapper}>
            <TextInput
              style={styles.tiempoInput}
              value={horas}
              onChangeText={setHoras}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
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
              placeholderTextColor={colors.textMuted}
              maxLength={2}
            />
            <Text style={styles.tiempoUnidad}>min</Text>
          </View>
          <View style={styles.tiempoInputWrapper}>
            <TextInput
              style={styles.tiempoInput}
              value={segundos}
              onChangeText={setSegundos}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              maxLength={2}
            />
            <Text style={styles.tiempoUnidad}>seg</Text>
          </View>
        </View>
      </View>

      {/* Sección de evidencia */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Evidencia <Text style={styles.opcional}>(opcional)</Text></Text>
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
              <Ionicons name="image-outline" size={20} color={colors.actionBlue} />
              <Text style={styles.evidenciaBtnText}>Galería</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.evidenciaBtn} onPress={sacarFoto}>
              <Ionicons name="camera-outline" size={20} color={colors.actionBlue} />
              <Text style={styles.evidenciaBtnText}>Cámara</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

        </>
      )}

      {mensaje ? (
        <View style={[styles.mensajeBox, exito && styles.mensajeExito]}>
          <Text style={[styles.mensajeText, exito && styles.mensajeTextoExito]}>
            {exito ? '✅ ' : '⚠️ '}{mensaje}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.button, (cargando || cambiandoDesafio || estadoDesafios !== 'listo') && styles.buttonDisabled]}
        onPress={registrar}
        disabled={cargando || !!cambiandoDesafio || estadoDesafios !== 'listo'}
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

        </>
      )}

      <View style={styles.challengeSection}>
        <TouchableOpacity style={styles.challengeHeading} onPress={() => setDesafiosVisibles(!desafiosVisibles)}
          accessibilityRole="button" accessibilityState={{ expanded: desafiosVisibles }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.challengeTitle}>Tus desafíos</Text>
            <Text style={styles.challengeHint}>
              {estadoDesafios === 'listo' ? (desafios.length ? `${activos.length} activos · Gestionar pausas` : 'Sin desafíos activos · Podés registrar igual')
                : estadoDesafios === 'cargando' ? 'Consultando desafíos…' : 'No pudimos consultar tus desafíos'}
            </Text>
          </View>
          <Ionicons name={desafiosVisibles ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSoft} />
        </TouchableOpacity>
        {(estadoDesafios === 'error' || estadoDesafios === 'sesion') && (
          <TouchableOpacity style={styles.retryChallenges} onPress={consultarDesafios} disabled={!!cambiandoDesafio}>
            <Text style={styles.challengeActionText}>Reintentar</Text>
          </TouchableOpacity>
        )}
        {desafiosVisibles && estadoDesafios === 'listo' && (
          <>
            {desafios.map((reto) => (
              <View key={reto.id} style={styles.challengeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.challengeName}>{reto.challenges?.title || 'Desafío'}</Text>
                  <Text style={styles.challengeHint}>{reto.pausado ? 'Pausado' : 'Activo'}</Text>
                </View>
                <TouchableOpacity style={styles.challengeAction} onPress={() => cambiarPausa(reto)}
                  disabled={!!cambiandoDesafio || cargando} accessibilityRole="button"
                  accessibilityLabel={`${reto.pausado ? 'Reanudar' : 'Pausar'} ${reto.challenges?.title || 'desafío'}`}>
                  {cambiandoDesafio === reto.id ? <ActivityIndicator size="small" color={colors.actionBlue} />
                    : <Text style={[styles.challengeActionText, (cambiandoDesafio || cargando) && { opacity: 0.4 }]}>{reto.pausado ? 'Reanudar' : 'Pausar'}</Text>}
                </TouchableOpacity>
              </View>
            ))}
            {desafios.length > 0 && <Text style={styles.challengeExplanation}>¿Querés hacer tus desafíos uno a la vez? Dejá activo el que estás haciendo y pausá los demás: tus nuevas actividades no sumarán en ellos. Conservás el progreso y podés reanudarlos cuando quieras. Si cargás una actividad de otro día, cuenta si el desafío estaba activo cuando la hiciste.</Text>}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  freeMode: { padding: 16, borderRadius: 16, backgroundColor: colors.surfaceSoft, marginBottom: 20 },
  freeLink: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 44, marginTop: 6 },
  challengeSection: { marginTop: 24, borderTopWidth: 1, borderColor: colors.borderSoft },
  challengeHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, minHeight: 60 },
  challengeTitle: { color: colors.textSoft, fontSize: 14, fontWeight: '700' },
  challengeHint: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  challengeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  challengeName: { color: colors.text, fontSize: 13, fontWeight: '600' },
  challengeAction: { minWidth: 82, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  challengeActionText: { color: colors.actionBlue, fontSize: 12, fontWeight: '700' },
  challengeExplanation: { color: colors.textMuted, fontSize: 11, lineHeight: 18, marginTop: 12 },
  retryChallenges: { alignSelf: 'flex-start', paddingVertical: 12, minHeight: 44 },
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  titulo: { fontSize: 28, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  subtitulo: { fontSize: 13, color: colors.textSoft, marginBottom: 18 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  modeButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft },
  modeButtonActive: { borderColor: colors.brandOrange, backgroundColor: colors.surfaceRaised },
  modeText: { color: colors.textSoft, fontSize: 16, fontWeight: '800' },
  modeTextActive: { color: colors.text },
  gpsCard: { backgroundColor: colors.surfaceSoft, padding: 22, borderRadius: 22, borderWidth: 1, borderColor: colors.borderSoft },
  gpsTitle: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 16 },
  gpsCopy: { color: colors.textSoft, fontSize: 14, lineHeight: 21, marginTop: 8 },
  gpsSports: { color: colors.brandOrangeSoft, fontSize: 12, fontWeight: '700', marginTop: 16 },
  gpsExplanation: { color: colors.textMuted, fontSize: 13, lineHeight: 21, marginTop: 18, marginBottom: 24 },
  gpsFootnote: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 14, textAlign: 'center' },
  manualNote: { color: colors.textSoft, fontSize: 12, lineHeight: 19, marginBottom: 18 },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderSoft, marginBottom: 20 },
  detailsTitle: { color: colors.textSoft, fontSize: 14, fontWeight: '700' },
  detailsSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  deporteContainer: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  deporteBtn: { flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  deporteBtnActivo: { borderColor: colors.actionBlue, backgroundColor: '#162d4a' },
  deporteEmoji: { fontSize: 28, marginBottom: 6 },
  deporteLabel: { fontSize: 12, fontWeight: 'bold', color: colors.textMuted },
  deporteLabelActivo: { color: colors.actionBlue },
  distanciaCard: { backgroundColor: colors.surfaceSoft, borderRadius: 20, padding: 20, marginBottom: 20, alignItems: 'center' },
  distanciaLabel: { fontSize: 11, fontWeight: 'bold', color: colors.textMuted, letterSpacing: 2, marginBottom: 16 },
  distanciaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  distanciaInput: { fontSize: 56, fontWeight: 'bold', color: colors.text, minWidth: 120, textAlign: 'center' },
  distanciaUnidad: { fontSize: 24, color: colors.textSoft, fontWeight: 'bold' },
  seccion: { marginBottom: 20 },
  seccionTitulo: { fontSize: 13, fontWeight: 'bold', color: colors.text, marginBottom: 4, letterSpacing: 0.5 },
  opcional: { fontSize: 12, color: colors.textMuted, fontWeight: 'normal' },
  evidenciaSubtitulo: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  tiempoRow: { flexDirection: 'row', gap: 12 },
  tiempoInputWrapper: { flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  tiempoInput: { fontSize: 22, fontWeight: 'bold', color: colors.text, minWidth: 40, textAlign: 'center' },
  tiempoUnidad: { fontSize: 13, color: colors.textSoft, fontWeight: 'bold' },
  evidenciaBotonesRow: { flexDirection: 'row', gap: 10 },
  evidenciaBtn: { flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.actionBlue, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  evidenciaBtnText: { color: colors.actionBlue, fontWeight: 'bold', fontSize: 14 },
  evidenciaPreviewWrapper: { position: 'relative', borderRadius: 14, overflow: 'hidden' },
  evidenciaPreview: { width: '100%', height: 200, borderRadius: 14 },
  evidenciaOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  evidenciaSubiendoText: { color: colors.text, marginTop: 8, fontWeight: 'bold' },
  evidenciaQuitarBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  evidenciaQuitarText: { color: colors.text, fontSize: 12, fontWeight: 'bold' },
  fechaScroll: { marginBottom: 12 },
  fechaBtn: { backgroundColor: colors.surfaceSoft, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginRight: 8, borderWidth: 2, borderColor: 'transparent' },
  fechaBtnActivo: { borderColor: colors.brandOrange, backgroundColor: '#162d4a' },
  fechaBtnText: { color: colors.textMuted, fontWeight: 'bold', fontSize: 13 },
  fechaBtnTextActivo: { color: colors.text },
  fechaSeleccionada: { fontSize: 13, color: colors.textSoft, marginTop: 4 },
  mensajeBox: { backgroundColor: '#2a1a1a', borderRadius: 12, padding: 14, marginBottom: 16 },
  mensajeExito: { backgroundColor: '#0a2a1a' },
  mensajeText: { color: colors.brandOrange, fontSize: 14, textAlign: 'center' },
  mensajeTextoExito: { color: colors.success },
  button: { backgroundColor: colors.brandOrange, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#2a3a4a' },
  buttonText: { color: colors.text, fontWeight: 'bold', fontSize: 16 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerSinReto: { backgroundColor: colors.surfaceSoft, borderRadius: 14, padding: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.actionBlue },
  bannerSinRetoEmoji: { fontSize: 28 },
  bannerSinRetoTitulo: { fontSize: 13, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  bannerSinRetoDesc: { fontSize: 12, color: colors.actionBlue, lineHeight: 18 },
});
