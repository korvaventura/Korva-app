import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

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
        ? data
            .filter(r => r.modalidad === modalidad)
            .map((r, i) => ({ ...r, posicion: i + 1 }))
        : [];
      setRanking(filtrado);
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

  const top3 = ranking.slice(0, 3);
  const resto = ranking.slice(3);

  const AvatarItem = ({ item, size = 44 }) => (
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

  const PodioItem = ({ item, pos }) => {
    const config = {
      1: { emoji: completado(item.porcentaje) ? '🏅' : '🥇', color: '#FFD700', height: 90, avatarSize: 60 },
      2: { emoji: completado(item.porcentaje) ? '🏅' : '🥈', color: '#C0C0C0', height: 70, avatarSize: 52 },
      3: { emoji: completado(item.porcentaje) ? '🏅' : '🥉', color: '#CD7F32', height: 55, avatarSize: 46 },
    }[pos];

    const propio = esPropio(item.nombre);

    return (
      <View style={styles.podioItem}>
        <AvatarItem item={item} size={config.avatarSize} />
        {propio && <View style={styles.tuIndicador}><Text style={styles.tuIndicadorText}>Tú</Text></View>}
        <Text style={styles.podioNombre} numberOfLines={1}>{item.nombre}</Text>
        <Text style={styles.podioKm}>{item.km_completados}km</Text>
        <View style={[styles.podioBase, { height: config.height, borderColor: config.color }]}>
          <Text style={styles.podioEmoji}>{config.emoji}</Text>
          <Text style={[styles.podioPct, { color: config.color }]}>{item.porcentaje}</Text>
        </View>
      </View>
    );
  };

  const modalidades = challengeSeleccionado?.modalidades || [];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>🏆 Ranking</Text>

      {/* Selector de challenge */}
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

      {/* Selector de modalidad dinámico */}
      <View style={styles.selectorRow}>
        {modalidades.map((m, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.selectorBtn, modalidad === m.tipo && styles.selectorBtnActivo]}
            onPress={() => setModalidad(m.tipo)}
          >
            <Text style={[styles.selectorText, modalidad === m.tipo && styles.selectorTextActivo]}>
              {m.tipo === 'run' ? '🏃' : '🚴'} {m.label} — {m.distancia_km}km
            </Text>
          </TouchableOpacity>
        ))}
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
        <>
          {top3.length > 0 && (
            <View style={styles.podioWrapper}>
              {top3.length >= 2 && <PodioItem item={top3[1]} pos={2} />}
              {top3.length >= 1 && <PodioItem item={top3[0]} pos={1} />}
              {top3.length >= 3 && <PodioItem item={top3[2]} pos={3} />}
            </View>
          )}

          {resto.length > 0 && (
            <View style={styles.restoWrapper}>
              {resto.map((item, index) => {
                const propio = esPropio(item.nombre);
                const hizo100 = completado(item.porcentaje);
                return (
                  <View key={index} style={[styles.card, propio && styles.cardPropio]}>
                    <Text style={styles.posicion}>
                      {hizo100 ? '🏅' : `${item.posicion}°`}
                    </Text>
                    <AvatarItem item={item} size={40} />
                    <View style={styles.info}>
                      <View style={styles.nombreRow}>
                        <Text style={styles.nombre} numberOfLines={1}>{item.nombre}</Text>
                        {propio && <Text style={styles.tuTag}>Tú</Text>}
                      </View>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${Math.min(parseFloat(item.porcentaje), 100)}%` },
                          hizo100 && styles.progressFillCompletado]} />
                      </View>
                      <Text style={styles.kmText}>{item.km_completados} km — {item.porcentaje}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
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
  selectorBtn: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  selectorBtnActivo: { borderColor: '#1E6FD9' },
  selectorText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 14 },
  selectorTextActivo: { color: '#FFFFFF' },
  podioWrapper: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginBottom: 28, gap: 8 },
  podioItem: { alignItems: 'center', flex: 1, position: 'relative' },
  podioNombre: { fontSize: 11, fontWeight: 'bold', color: '#FFFFFF', marginTop: 8, marginBottom: 2, textAlign: 'center' },
  podioKm: { fontSize: 10, color: '#A8CFFF', marginBottom: 6 },
  podioBase: { width: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 1, borderBottomWidth: 0, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
  podioEmoji: { fontSize: 22 },
  podioPct: { fontSize: 11, fontWeight: 'bold', marginTop: 4 },
  tuIndicador: { position: 'absolute', top: -8, right: 8, backgroundColor: '#FC4C02', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  tuIndicadorText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  restoWrapper: { gap: 8 },
  card: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardPropio: { borderWidth: 1, borderColor: '#FC4C02' },
  posicion: { fontSize: 14, fontWeight: 'bold', color: '#4a6a8a', width: 28, textAlign: 'center' },
  avatarPlaceholder: { backgroundColor: '#1E6FD9', alignItems: 'center', justifyContent: 'center' },
  avatarLetra: { fontWeight: 'bold', color: '#FFFFFF' },
  info: { flex: 1 },
  nombreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  nombre: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', flex: 1 },
  tuTag: { backgroundColor: '#FC4C02', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontSize: 10, color: '#FFFFFF', fontWeight: 'bold' },
  progressBar: { height: 6, backgroundColor: '#0D1B2A', borderRadius: 3, marginBottom: 4 },
  progressFill: { height: 6, backgroundColor: '#1E6FD9', borderRadius: 3 },
  progressFillCompletado: { backgroundColor: '#FC4C02' },
  kmText: { fontSize: 11, color: '#A8CFFF' },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 40, alignItems: 'center', marginTop: 20 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#A8CFFF' },
});