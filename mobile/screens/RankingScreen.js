import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const CHALLENGE_ID = 'ae54af78-dc6f-4cf5-af31-2c077ba58048';

export default function RankingScreen() {
  const [modalidad, setModalidad] = useState('run');
  const [ranking, setRanking] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id);
    });
  }, []);

  useEffect(() => {
    cargarRanking();
  }, [modalidad]);

  const cargarRanking = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${BACKEND_URL}/ranking/${CHALLENGE_ID}`);
      const data = await res.json();
      const filtrado = Array.isArray(data)
        ? data.filter(r => r.modalidad === modalidad)
        : [];
      setRanking(filtrado);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setCargando(false);
    }
  };

  const getMedalla = (pos) => {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return `${pos}°`;
  };

  const getCardStyle = (pos) => {
    if (pos === 1) return [styles.card, styles.card1];
    if (pos === 2) return [styles.card, styles.card2];
    if (pos === 3) return [styles.card, styles.card3];
    return [styles.card];
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>🏆 Ranking</Text>
      <Text style={styles.subtitulo}>Fin del Mundo</Text>

      {/* Selector modalidad */}
      <View style={styles.selectorRow}>
        <TouchableOpacity
          style={[styles.selectorBtn, modalidad === 'run' && styles.selectorBtnActivo]}
          onPress={() => setModalidad('run')}
        >
          <Text style={[styles.selectorText, modalidad === 'run' && styles.selectorTextActivo]}>
            🏃 Running — 103km
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectorBtn, modalidad === 'ride' && styles.selectorBtnActivo]}
          onPress={() => setModalidad('ride')}
        >
          <Text style={[styles.selectorText, modalidad === 'ride' && styles.selectorTextActivo]}>
            🚴 Ciclismo — 309km
          </Text>
        </TouchableOpacity>
      </View>

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" style={{ marginTop: 40 }} />
      ) : ranking.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🏁</Text>
          <Text style={styles.emptyText}>Sin participantes todavia</Text>
          <Text style={styles.emptySubtext}>Se el primero en inscribirte!</Text>
        </View>
      ) : (
        ranking.map((item, index) => (
          <View key={index} style={getCardStyle(item.posicion)}>
            <View style={styles.posicionContainer}>
              <Text style={styles.posicion}>{getMedalla(item.posicion)}</Text>
            </View>

            <View style={styles.avatarContainer}>
              {item.avatar ? (
                <Image source={{ uri: item.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarLetra}>
                    {item.nombre?.charAt(0)?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.info}>
              <Text style={styles.nombre} numberOfLines={1}>{item.nombre}</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${item.porcentaje}%` }]} />
              </View>
              <Text style={styles.kmText}>{item.km_completados} km — {item.porcentaje}%</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  subtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 24 },
  selectorRow: { gap: 10, marginBottom: 24 },
  selectorBtn: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  selectorBtnActivo: { borderColor: '#1E6FD9' },
  selectorText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 14 },
  selectorTextActivo: { color: '#FFFFFF' },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 40, alignItems: 'center', marginTop: 20 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#A8CFFF' },
  card: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  card1: { backgroundColor: '#2a2a1a', borderWidth: 1, borderColor: '#FFD700' },
  card2: { backgroundColor: '#1a2a2a', borderWidth: 1, borderColor: '#C0C0C0' },
  card3: { backgroundColor: '#2a1a0a', borderWidth: 1, borderColor: '#CD7F32' },
  posicionContainer: { width: 40, alignItems: 'center' },
  posicion: { fontSize: 22 },
  avatarContainer: { width: 44, height: 44 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1E6FD9', alignItems: 'center', justifyContent: 'center' },
  avatarLetra: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  info: { flex: 1 },
  nombre: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 6 },
  progressBar: { height: 6, backgroundColor: '#0D1B2A', borderRadius: 3, marginBottom: 4 },
  progressFill: { height: 6, backgroundColor: '#1E6FD9', borderRadius: 3 },
  kmText: { fontSize: 12, color: '#A8CFFF' },
});