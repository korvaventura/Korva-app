import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useState } from 'react';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const USER_ID = 'd7a14473-49bb-4afd-bcad-d0b27c15a39d';

export default function RegistroManualScreen({ navigation }) {
  const [deporte, setDeporte] = useState('run');
  const [distancia, setDistancia] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const registrar = async () => {
    if (!distancia || parseFloat(distancia) <= 0) {
      setMensaje('Ingresa una distancia valida');
      return;
    }

    setCargando(true);
    setMensaje('');

    try {
      const res = await fetch(`${BACKEND_URL}/actividades/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: USER_ID,
          sport_type: deporte,
          distance_km: parseFloat(distancia),
          recorded_at: new Date().toISOString()
        })
      });

      const data = await res.json();

      if (data.error) {
        setMensaje('Error al registrar. Intenta de nuevo.');
      } else {
        setMensaje(`Actividad registrada! ${distancia}km de ${deporte === 'run' ? 'running' : deporte === 'ride' ? 'ciclismo' : 'natacion'}`);
        setDistancia('');
      }
    } catch (error) {
      setMensaje('Error de conexion');
    } finally {
      setCargando(false);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>Registrar actividad</Text>
      <Text style={styles.subtitulo}>Carga tus km manualmente</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Deporte</Text>
        <View style={styles.deporteRow}>
          {['run', 'ride', 'swim'].map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.deporteBtn, deporte === d && styles.deporteBtnActivo]}
              onPress={() => setDeporte(d)}
            >
              <Text style={[styles.deporteBtnText, deporte === d && styles.deporteBtnTextActivo]}>
                {d === 'run' ? '🏃 Running' : d === 'ride' ? '🚴 Ciclismo' : '🏊 Natacion'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Distancia (km)</Text>
        <TextInput
          style={styles.input}
          value={distancia}
          onChangeText={setDistancia}
          keyboardType="decimal-pad"
          placeholder="Ej: 10.5"
          placeholderTextColor="#A8CFFF"
        />

        <Text style={styles.label}>Fecha</Text>
        <View style={styles.fechaBox}>
          <Text style={styles.fechaText}>Hoy — {new Date().toLocaleDateString('es-AR')}</Text>
        </View>
      </View>

      {mensaje ? (
        <View style={styles.mensajeBox}>
          <Text style={styles.mensajeText}>{mensaje}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.button, cargando && styles.buttonDisabled]}
        onPress={registrar}
        disabled={cargando}
      >
        <Text style={styles.buttonText}>
          {cargando ? 'Registrando...' : 'Registrar actividad'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  subtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 24 },
  card: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#A8CFFF', letterSpacing: 1, marginBottom: 10, marginTop: 8 },
  deporteRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  deporteBtn: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#1E6FD9', alignItems: 'center' },
  deporteBtnActivo: { backgroundColor: '#1E6FD9' },
  deporteBtnText: { color: '#A8CFFF', fontSize: 12, fontWeight: 'bold' },
  deporteBtnTextActivo: { color: '#FFFFFF' },
  input: {
    backgroundColor: '#0D1B2A', borderRadius: 10, padding: 14,
    color: '#FFFFFF', fontSize: 18, fontWeight: 'bold',
    borderWidth: 1, borderColor: '#1E6FD9', marginBottom: 8
  },
  fechaBox: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 14 },
  fechaText: { color: '#A8CFFF', fontSize: 14 },
  mensajeBox: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 16, marginBottom: 16 },
  mensajeText: { color: '#FFFFFF', fontSize: 14, textAlign: 'center' },
  button: { backgroundColor: '#1E6FD9', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#555' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
});