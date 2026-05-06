import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id);
    });
  }, []);

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
    setCargando(true);
    setMensaje('');
    setExito(false);
    try {
      const fechaActividad = getFecha(diasAtras);
      const res = await fetch(`${BACKEND_URL}/actividades/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          sport_type: deporte,
          distance_km: parseFloat(distancia),
          recorded_at: fechaActividad.toISOString()
        })
      });
      const data = await res.json();
      if (data.error) {
        setMensaje('Error al registrar. Intenta de nuevo.');
        setExito(false);
      } else {
        setMensaje(`${distancia} km de ${deporte === 'run' ? 'running' : 'ciclismo'} registrados!`);
        setExito(true);
        setDistancia('');
        setDiasAtras(0);
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

      {/* Selector deporte */}
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

      {/* Input distancia */}
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

      {/* Selector de fecha */}
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

      {/* Mensaje */}
      {mensaje ? (
        <View style={[styles.mensajeBox, exito && styles.mensajeExito]}>
          <Text style={[styles.mensajeText, exito && styles.mensajeTextoExito]}>
            {exito ? '✅ ' : '⚠️ '}{mensaje}
          </Text>
        </View>
      ) : null}

      {/* Boton */}
      <TouchableOpacity
        style={[styles.button, cargando && styles.buttonDisabled]}
        onPress={registrar}
        disabled={cargando}
      >
        {cargando ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Registrar actividad →</Text>
        )}
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  subtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 28 },
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
  seccionTitulo: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12, letterSpacing: 0.5 },
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
});