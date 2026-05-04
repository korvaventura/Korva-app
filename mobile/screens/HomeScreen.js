import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function HomeScreen() {
  const [challenges, setChallenges] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
      }
    });
  }, []);

  useEffect(() => {
    if (userId) cargarProgreso();
  }, [userId]);

  const cargarProgreso = async () => {
    try {
      setCargando(true);
      await fetch(`${BACKEND_URL}/strava/actividades/${userId}`);
      const res = await fetch(`${BACKEND_URL}/strava/progreso/${userId}`);
      const data = await res.json();
      setChallenges(Array.isArray(data) ? data : []);
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
      ) : challenges.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No tenes retos activos</Text>
          <Text style={styles.emptySubtext}>Inscribite en un challenge en el Catalogo</Text>
        </View>
      ) : (
        challenges.map((item, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.deporte}>{item.modalidad?.toUpperCase()}</Text>
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
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 60 },
  logo: { fontSize: 36, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  tagline: { fontSize: 14, color: '#A8CFFF', marginBottom: 40 },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, width: '100%', alignItems: 'center', marginBottom: 24 },
  emptyText: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  emptySubtext: { fontSize: 13, color: '#A8CFFF', textAlign: 'center' },
  card: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, width: '100%', marginBottom: 16 },
  cardHeader: { marginBottom: 8 },
  deporte: { fontSize: 11, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 1 },
  challengeTitle: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  challengeDistance: { fontSize: 14, color: '#A8CFFF', marginBottom: 16 },
  progressBar: { height: 10, backgroundColor: '#0D1B2A', borderRadius: 5, marginBottom: 8 },
  progressFill: { height: 10, backgroundColor: '#1E6FD9', borderRadius: 5 },
  progressText: { fontSize: 13, color: '#A8CFFF', marginBottom: 4 },
  estado: { fontSize: 13, color: '#FFFFFF', fontWeight: 'bold' },
  button: { backgroundColor: '#FC4C02', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12, marginTop: 8 },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  buttonSecundario: { borderWidth: 1, borderColor: '#1E6FD9', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center' },
  buttonSecundarioText: { color: '#1E6FD9', fontWeight: 'bold', fontSize: 16 },
});