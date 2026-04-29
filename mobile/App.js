import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';

const BACKEND_URL = 'http://localhost:3000';
const USER_ID = 'd7a14473-49bb-4afd-bcad-d0b27c15a39d';

export default function App() {
  const [progreso, setProgreso] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarProgreso();
  }, []);

  const cargarProgreso = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/strava/progreso/${USER_ID}`);
      const data = await res.json();
      setProgreso(data);
    } catch (error) {
      console.error('Error cargando progreso:', error);
    } finally {
      setCargando(false);
    }
  };

  const conectarStrava = () => {
    window.open(`${BACKEND_URL}/strava/auth`, '_blank');
  };

  const porcentaje = progreso ? parseFloat(progreso.porcentaje) : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>KORVA</Text>
      <Text style={styles.tagline}>Desafios virtuales. Medallas reales.</Text>

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" />
      ) : (
        <View style={styles.card}>
          <Text style={styles.challengeTitle}>{progreso?.challenge}</Text>
          <Text style={styles.challengeDistance}>{progreso?.distancia_total} km</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${porcentaje}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {progreso?.km_completados} km completados - {progreso?.porcentaje}
          </Text>
          <Text style={styles.estado}>{progreso?.estado}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={conectarStrava}>
        <Text style={styles.buttonText}>Conectar con Strava</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.buttonSecundario} onPress={cargarProgreso}>
        <Text style={styles.buttonSecundarioText}>Actualizar progreso</Text>
      </TouchableOpacity>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1B2A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: '#A8CFFF',
    marginBottom: 40,
  },
  card: {
    backgroundColor: '#1E3A5F',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    marginBottom: 24,
  },
  challengeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  challengeDistance: {
    fontSize: 14,
    color: '#A8CFFF',
    marginBottom: 16,
  },
  progressBar: {
    height: 10,
    backgroundColor: '#0D1B2A',
    borderRadius: 5,
    marginBottom: 8,
  },
  progressFill: {
    height: 10,
    backgroundColor: '#1E6FD9',
    borderRadius: 5,
  },
  progressText: {
    fontSize: 13,
    color: '#A8CFFF',
    marginBottom: 8,
  },
  estado: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#FC4C02',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  buttonSecundario: {
    borderWidth: 1,
    borderColor: '#1E6FD9',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonSecundarioText: {
    color: '#1E6FD9',
    fontWeight: 'bold',
    fontSize: 16,
  },
});