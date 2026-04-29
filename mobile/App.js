import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';

const BACKEND_URL = 'http://localhost:3000';
const USER_ID = 'd7a14473-49bb-4afd-bcad-d0b27c15a39d';

export default function App() {
  const [challenges, setChallenges] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarProgreso();
  }, []);

  const cargarProgreso = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/strava/progreso/${USER_ID}`);
      const data = await res.json();
      setChallenges(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setCargando(false);
    }
  };

  const conectarStrava = () => {
    window.open(`${BACKEND_URL}/strava/auth`, '_blank');
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.logo}>KORVA</Text>
      <Text style={styles.tagline}>Desafios virtuales. Medallas reales.</Text>

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" />
      ) : (
        challenges.map((item, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.deporte}>
                {item.deporte === 'run' ? 'RUNNING' : 'CICLISMO'}
              </Text>
            </View>
            <Text style={styles.challengeTitle}>{item.challenge}</Text>
            <Text style={styles.challengeDistance}>{item.distancia_total} km totales</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${parseFloat(item.porcentaje)}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {item.km_completados} km completados - {item.porcentaje}
            </Text>
            <Text style={styles.estado}>{item.estado}</Text>
          </View>
        ))
      )}

      <TouchableOpacity style={styles.button} onPress={conectarStrava}>
        <Text style={styles.buttonText}>Conectar con Strava</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.buttonSecundario} onPress={cargarProgreso}>
        <Text style={styles.buttonSecundarioText}>Actualizar progreso</Text>
      </TouchableOpacity>

      <StatusBar style="light" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#0D1B2A',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
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
    marginBottom: 16,
  },
  cardHeader: {
    marginBottom: 8,
  },
  deporte: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1E6FD9',
    letterSpacing: 1,
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
    marginBottom: 4,
  },
  estado: {
    fontSize: 13,
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
    marginTop: 8,
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