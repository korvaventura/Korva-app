import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function RankingScreen() {
  const [challenges, setChallenges] = useState([]);
  const [challengeId, setChallengeId] = useState(null);
  const [challengeSeleccionado, setChallengeSeleccionado] = useState(null);
  const [modalidad, setModalidad] = useState('run');
  const [ranking, setRanking] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [miNombre, setMiNombre] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setMiNombre(session.user.user_metadata?.name?.split(' ')[0] || '');
      }
    });
    cargarChallenges();
  }, []);

  useEffect(() => {
    if (challengeId) cargarRanking();
  }, [challengeId, modalidad]);

  const cargarChallenges = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/challenges`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setChallenges(data);
        setChallengeId(data[0].id);
        setChallengeSeleccionado(data[0]);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const cargarRanking = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${BACKEND_URL}/ranking/${challengeId}`);
      const data = await res.json();
     const filtrado = Array.isArray(data)
  ? data.filter(r => r.modalidad === modalidad)
  : [];

const reordenado = filtrado.sort((a, b) => {
  const aEsPropio = a.nombre?.toLowerCase().startsWith(miNombre.toLowerCase());
  const bEsPropio = b.nombre?.toLowerCase().startsWith(miNombre.toLowerCase());
  const aCompletado = parseFloat(a.porcentaje) >= 100;
  const bCompletado = parseFloat(b.porcentaje) >= 100;

  if (aEsPropio && aCompletado) return -1;
  if (bEsPropio && bCompletado) return 1;
  return b.km_completados - a.km_completados;
}).map((r, i) => ({ ...r, posicion: i + 1 }));

setRanking(reordenado);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setCargando(false);
    }
  };

  const seleccionarChallenge = (challenge) => {
    setChallengeId(challenge.id);
    setChallengeSeleccionado(challenge);
    setModalidad('run');
  };

  const esPropio = (nombre) => {
    if (!miNombre) return false;
    return nombre?.toLowerCase().startsWith(miNombre.toLowerCase());
  };

  const completado = (porcentaje) => parseFloat(porcentaje) >= 100;

  const AvatarItem = ({ item, size = 40 }) => (
    item.avatar ? (
      <Image source={{ uri: item.avatar }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    ) : (
      <View style={[styles.avatarPlaceholder, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.avatarLetra, { fontSize: size * 0.4 }]}>
          {item.nombre?.charAt(0)?.toUpperCase() || '?'}
        </Text>
      </View>
    )
  );

  const medallaColor = (pos) => {
    if (pos === 1) return '#FFD700';
    if (pos === 2) return '#C0C0C0';
    if (pos === 3) return '#CD7F32';
    return '#4a6a8a';
  };

  const modalidades = challengeSeleccionado?.modalidades || [];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>🏆 Ranking</Text>

      {challenges.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.challengeScroll}>
          {challenges.map((c, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.challengeBtn, c.id === challengeId && styles.challengeBtnActivo]}
              onPress={() => seleccionarChallenge(c)}
            >
              <Text style={[styles.challengeBtnText, c.id === challengeId && styles.challengeBtnTextActivo]}>
                {c.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Text style={styles.subtitulo}>{challengeSeleccionado?.title}</Text>

      <View style={styles.selectorRow}>
        {modalidades.map((m, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.selectorBtn, modalidad === m.tipo && styles.selectorBtnActivo]}
            onPress={() => setModalidad(m.tipo)}
          >
            <Ionicons
              name={m.tipo === 'run' ? 'walk-outline' : 'bicycle-outline'}
              size={16}
              color={modalidad === m.tipo ? '#FFFFFF' : '#4a6a8a'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.selectorText, modalidad === m.tipo && styles.selectorTextActivo]}>
              {m.label} — {m.distancia_km}km
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" style={{ marginTop: 40 }} />
      ) : ranking.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="flag-outline" size={48} color="#4a6a8a" style={{ marginBottom: 16 }} />
          <Text style={styles.emptyText}>Sin participantes todavía</Text>
          <Text style={styles.emptySubtext}>¡Sé el primero en inscribirte!</Text>
        </View>
      ) : (
        <View style={styles.listaWrapper}>
          {ranking.map((item, index) => {
            const propio = esPropio(item.nombre);
            const hizo100 = completado(item.porcentaje);
            const pct = Math.min(parseFloat(item.porcentaje), 100);
            return (
              <View key={index} style={[styles.card, propio && styles.cardPropio]}>

                {/* Posición */}
                <View style={styles.posicionWrapper}>
                  {hizo100 ? (
                    <Ionicons name="medal" size={22} color="#FC4C02" />
                  ) : item.posicion <= 3 ? (
                    <Ionicons name="trophy" size={22} color={medallaColor(item.posicion)} />
                  ) : (
                    <Text style={styles.posicionText}>{item.posicion}°</Text>
                  )}
                </View>

                {/* Avatar */}
                <AvatarItem item={item} size={40} />

                {/* Info */}
                <View style={styles.info}>
                  <View style={styles.nombreRow}>
                    <Text style={styles.nombre} numberOfLines={1}>{item.nombre}</Text>
                    {propio && (
                      <View style={styles.tuTag}>
                        <Text style={styles.tuTagText}>Tú</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.progressBar}>
                    <View style={[
                      styles.progressFill,
                      { width: `${pct}%` },
                      hizo100 && styles.progressFillCompletado
                    ]} />
                  </View>
                  <Text style={styles.kmText}>{item.km_completados} km · {item.porcentaje}%</Text>
                </View>

              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12 },
  challengeScroll: { marginBottom: 12 },
  challengeBtn: { backgroundColor: '#1E3A5F', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginRight: 8, borderWidth: 2, borderColor: 'transparent' },
  challengeBtnActivo: { borderColor: '#FC4C02' },
  challengeBtnText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 13 },
  challengeBtnTextActivo: { color: '#FFFFFF' },
  subtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 20 },
  selectorRow: { gap: 10, marginBottom: 24 },
  selectorBtn: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: 'transparent', flexDirection: 'row', justifyContent: 'center' },
  selectorBtnActivo: { borderColor: '#1E6FD9' },
  selectorText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 14 },
  selectorTextActivo: { color: '#FFFFFF' },
  listaWrapper: { gap: 8 },
  card: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardPropio: { borderWidth: 1, borderColor: '#FC4C02' },
  posicionWrapper: { width: 32, alignItems: 'center' },
  posicionText: { fontSize: 14, fontWeight: 'bold', color: '#4a6a8a' },
  avatarPlaceholder: { backgroundColor: '#1E6FD9', alignItems: 'center', justifyContent: 'center' },
  avatarLetra: { fontWeight: 'bold', color: '#FFFFFF' },
  info: { flex: 1 },
  nombreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  nombre: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', flex: 1 },
  tuTag: { backgroundColor: '#FC4C02', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tuTagText: { fontSize: 10, color: '#FFFFFF', fontWeight: 'bold' },
  progressBar: { height: 5, backgroundColor: '#0D1B2A', borderRadius: 3, marginBottom: 4 },
  progressFill: { height: 5, backgroundColor: '#1E6FD9', borderRadius: 3 },
  progressFillCompletado: { backgroundColor: '#FC4C02' },
  kmText: { fontSize: 11, color: '#A8CFFF' },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 40, alignItems: 'center', marginTop: 20 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#A8CFFF' },
});