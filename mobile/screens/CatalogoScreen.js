import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';

const BACKEND_URL = 'http://localhost:3000';
const USER_ID = 'd7a14473-49bb-4afd-bcad-d0b27c15a39d';

export default function CatalogoScreen({ navigation }) {
  const [challenges, setChallenges] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarChallenges();
  }, []);

  const cargarChallenges = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/challenges`);
      const data = await res.json();
      setChallenges(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setCargando(false);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>Challenges disponibles</Text>
      <Text style={styles.subtitulo}>Elegí tu proximo desafio</Text>

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" />
      ) : (
        challenges.map((item, index) => (
          <View key={index} style={styles.card}>
            <Text style={styles.deporte}>
              {item.sport_type === 'run' ? 'RUNNING' : item.sport_type === 'ride' ? 'CICLISMO' : 'NATACION'}
            </Text>
            <Text style={styles.titulo2}>{item.title}</Text>
            <Text style={styles.descripcion}>{item.description}</Text>
            <View style={styles.row}>
              <Text style={styles.distancia}>{item.total_distance_km} km</Text>
              <Text style={styles.precio}>USD ${item.price_usd}</Text>
            </View>
            <TouchableOpacity style={styles.button}>
              <Text style={styles.buttonText}>Inscribirme</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#0D1B2A',
  },
  container: {
    padding: 24,
    paddingTop: 60,
  },
  titulo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitulo: {
    fontSize: 14,
    color: '#A8CFFF',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#1E3A5F',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    marginBottom: 16,
  },
  deporte: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1E6FD9',
    letterSpacing: 1,
    marginBottom: 6,
  },
  titulo2: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  descripcion: {
    fontSize: 13,
    color: '#A8CFFF',
    marginBottom: 16,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  distancia: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  precio: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FC4C02',
  },
  button: {
    backgroundColor: '#1E6FD9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
