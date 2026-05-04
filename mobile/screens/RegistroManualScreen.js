import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function RegistroManualScreen() {
  const [deporte, setDeporte] = useState('run');
  const [distancia, setDistancia] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [exito, setExito] = useState(false);
  const [userId, setUserId] = useState(null);

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
      const res = await fetch(`${BACKEND_URL}/actividades/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          sport_type: deporte,
          distance_km: parseFloat(distancia),
          recorded_at: new Date().toISOString()
        })
      });
      const data = await res.json();
      if (data.error) {
        setMensaje('Error al registrar. Intenta de nuevo.');
        setExito(false);
      } else {
        setMensaje(`${distancia} km de ${deporte === 'run' ? 'running' : deporte === 'ride' ? 'ciclismo' : 'natacion'} registrados!`);
        setExito(true);
        setDistancia('');
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
    { id: 'swim', label: 'Natacion', emoji: '🏊' },
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

      {/* Fecha */}
      <View style={styles.fechaCard}>
        <Text style={styles.fechaLabel}>📅 FECHA</Text>
        <Text style={styles.fechaText}>Hoy — {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
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
  distanciaCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 28, marginBottom: 14, alignItems: 'center' },
  distanciaLabel: { fontSize: 11, fontWeight: 'bold', color: '#4a6a8a', letterSpacing: 2, marginBottom: 16 },
  distanciaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  distanciaInput: { fontSize: 56, fontWeight: 'bold', color: '#FFFFFF', minWidth: 120, textAlign: 'center' },
  distanciaUnidad: { fontSize: 24, color: '#A8CFFF', fontWeight: 'bold' },
  fechaCard: { backgroundColor: '#1E3A5F', borderRadius: 14, padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fechaLabel: { fontSize: 11, fontWeight: 'bold', color: '#4a6a8a', letterSpacing: 1 },
  fechaText: { fontSize: 13, color: '#A8CFFF', flex: 1 },
  mensajeBox: { backgroundColor: '#2a1a1a', borderRadius: 12, padding: 14, marginBottom: 16 },
  mensajeExito: { backgroundColor: '#0a2a1a' },
  mensajeText: { color: '#FC4C02', fontSize: 14, textAlign: 'center' },
  mensajeTextoExito: { color: '#4CAF50' },
  button: { backgroundColor: '#1E6FD9', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#2a3a4a' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
});