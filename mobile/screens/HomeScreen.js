import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import CompletadoScreen from './CompletadoScreen';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function HomeScreen() {
  const [challenges, setChallenges] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [userId, setUserId] = useState(null);
  const [completado, setCompletado] = useState(null);
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
        setNombre(session.user.user_metadata?.name?.split(' ')[0] || '');
      } else {
        setCargando(false);
      }
    });
  }, []);

  useEffect(() => {
    if (userId) cargarProgreso();
  }, [userId]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('strava-connected')) cargarProgreso();
    });
    return () => subscription.remove();
  }, []);

  const cargarProgreso = async () => {
    if (!userId) return;
    try {
      setCargando(true);
      await fetch(`${BACKEND_URL}/strava/actividades/${userId}`);
      const res = await fetch(`${BACKEND_URL}/strava/progreso/${userId}`);
      const data = await res.json();
      const lista = Array.isArray(data) ? data : [];
      setChallenges(lista);
      const reto100 = lista.find(c => parseFloat(c.porcentaje) >= 100);
      if (reto100) setCompletado(reto100.challenge);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setCargando(false);
    }
  };

  const conectarStrava = async () => {
    await Linking.openURL(`${BACKEND_URL}/strava/auth`);
  };

  if (completado) {
    return (
      <CompletadoScreen
        challenge={completado}
        userId={userId}
        onVolver={() => setCompletado(null)}
      />
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      
      <View style={styles.header}>
        <View>
          <Text style={styles.saludo}>Hola{nombre ? `, ${nombre}` : ''}! 👋</Text>
          <Text style={styles.subtitulo}>Tus retos activos</Text>
        </View>
        <TouchableOpacity style={styles.stravaBtn} onPress={conectarStrava}>
          <Text style={styles.stravaBtnText}>Strava</Text>
        </TouchableOpacity>
      </View>

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" style={{ marginTop: 40 }} />
      ) : challenges.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🏁</Text>
          <Text style={styles.emptyText}>Sin retos activos</Text>
          <Text style={styles.emptySubtext}>Inscribite en un challenge desde el Catalogo y empeza a correr</Text>
        </View>
      ) : (
        challenges.map((item, index) => {
          const pct = Math.min(parseFloat(item.porcentaje), 100);
          const completado = pct >= 100;
          return (
            <View key={index} style={[styles.card, completado && styles.cardCompletado]}>
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.deporte}>
                    {item.modalidad === 'run' ? '🏃 RUNNING' : item.modalidad === 'ride' ? '🚴 CICLISMO' : '🏊 NATACION'}
                  </Text>
                  <Text style={styles.challengeTitle}>{item.challenge}</Text>
                </View>
                <View style={styles.pctCircle}>
                  <Text style={styles.pctText}>{pct.toFixed(0)}%</Text>
                </View>
              </View>

              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${pct}%` }, completado && styles.progressFillCompletado]} />
              </View>

              <View style={styles.cardBottom}>
                <Text style={styles.kmText}>{item.km_completados} km</Text>
                <Text style={styles.kmTotal}>de {item.distancia_total} km</Text>
                <Text style={[styles.estado, completado && styles.estadoCompletado]}>
                  {completado ? '🏅 Completado!' : '⚡ En progreso'}
                </Text>
              </View>
            </View>
          );
        })
      )}

      <TouchableOpacity style={styles.actualizarBtn} onPress={cargarProgreso}>
        <Text style={styles.actualizarBtnText}>↻ Actualizar progreso</Text>
      </TouchableOpacity>

      <StatusBar style="light" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  saludo: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  subtitulo: { fontSize: 13, color: '#A8CFFF' },
  stravaBtn: { backgroundColor: '#FC4C02', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  stravaBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 40, alignItems: 'center', marginTop: 20 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#A8CFFF', textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 20, marginBottom: 16 },
  cardCompletado: { borderWidth: 1, borderColor: '#FC4C02' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  deporte: { fontSize: 11, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 1, marginBottom: 4 },
  challengeTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  pctCircle: { backgroundColor: '#0D1B2A', borderRadius: 30, width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  pctText: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' },
  progressBar: { height: 8, backgroundColor: '#0D1B2A', borderRadius: 4, marginBottom: 14 },
  progressFill: { height: 8, backgroundColor: '#1E6FD9', borderRadius: 4 },
  progressFillCompletado: { backgroundColor: '#FC4C02' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kmText: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  kmTotal: { fontSize: 13, color: '#A8CFFF', flex: 1 },
  estado: { fontSize: 12, color: '#A8CFFF', fontWeight: 'bold' },
  estadoCompletado: { color: '#FC4C02' },
  actualizarBtn: { marginTop: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2a4a6a', alignItems: 'center' },
  actualizarBtnText: { color: '#A8CFFF', fontSize: 14 },
});