import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Image, Dimensions, TextInput } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../supabase';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const TOP_VISIBLE = 10;
const SCREEN_WIDTH = Dimensions.get('window').width;

export default function RankingScreen() {
  const [challenges, setChallenges] = useState([]);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [modalidades, setModalidades] = useState({});   // { challengeId: 'run' | 'ride' }
  const [rankings, setRankings] = useState({});         // { challengeId_modalidad: [...] }
  const [cargando, setCargando] = useState({});         // { challengeId_modalidad: bool }
  const [mostrarTodos, setMostrarTodos] = useState({});
  const [miNombre, setMiNombre] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const challengeScrollRef = useRef(null);
  const rankingScrollRefs = useRef({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setMiNombre(session.user.user_metadata?.name?.split(' ')[0] || '');
      }
    });
    cargarChallenges();
  }, []);

  useFocusEffect(
    useCallback(() => {
      challenges.forEach(c => {
        const mod = modalidades[c.id] || 'run';
        cargarRanking(c.id, mod);
      });
    }, [challenges])
  );

  const cargarChallenges = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/challenges/todos`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setChallenges(data);
        // Inicializar modalidad default run para cada challenge
        const mods = {};
        data.forEach(c => { mods[c.id] = 'run'; });
        setModalidades(mods);
        // Cargar ranking de todos
        data.forEach(c => cargarRanking(c.id, 'run'));
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const cargarRanking = async (cId, mod) => {
    const key = `${cId}_${mod}`;
    setCargando(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`${BACKEND_URL}/ranking/${cId}`);
      const data = await res.json();
      const filtrado = Array.isArray(data) ? data.filter(r => r.modalidad === mod) : [];
      const reordenado = filtrado.sort((a, b) => b.km_completados - a.km_completados)
        .map((r, i) => ({ ...r, posicion: i + 1 }));
      setRankings(prev => ({ ...prev, [key]: reordenado }));
    } catch (error) {
      console.error('Error ranking:', error);
    } finally {
      setCargando(prev => ({ ...prev, [key]: false }));
    }
  };

  const cambiarModalidad = (challengeId, mod) => {
    setModalidades(prev => ({ ...prev, [challengeId]: mod }));
    const key = `${challengeId}_${mod}`;
    if (!rankings[key]) cargarRanking(challengeId, mod);
  };

  const onChallengeScroll = (e) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setChallengeIndex(index);
  };

  const irAChallenge = (index) => {
    setChallengeIndex(index);
    challengeScrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  };

  const esPropio = (nombre) => {
    if (!miNombre) return false;
    return nombre?.toLowerCase().startsWith(miNombre.toLowerCase());
  };

  const completado = (porcentaje) => parseFloat(porcentaje) >= 100;

  const medallaColor = (pos) => {
    if (pos === 1) return '#FFD700';
    if (pos === 2) return '#C0C0C0';
    if (pos === 3) return '#CD7F32';
    return '#4a6a8a';
  };

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

  const RankingItem = ({ item }) => {
    const propio = esPropio(item.nombre);
    const hizo100 = completado(item.porcentaje);
    const pct = Math.min(parseFloat(item.porcentaje), 100);
    return (
      <View style={[styles.card, propio && styles.cardPropio]}>
        <View style={styles.posicionWrapper}>
          {hizo100 ? (
            <Ionicons name="medal" size={22} color="#FC4C02" />
          ) : item.posicion <= 3 ? (
            <Ionicons name="trophy" size={22} color={medallaColor(item.posicion)} />
          ) : (
            <Text style={styles.posicionText}>{item.posicion}°</Text>
          )}
        </View>
        <AvatarItem item={item} size={40} />
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
            <View style={[styles.progressFill, { width: `${pct}%` }, hizo100 && styles.progressFillCompletado]} />
          </View>
          <Text style={styles.kmText}>{item.km_completados} km · {item.porcentaje}%</Text>
        </View>
      </View>
    );
  };

  const RankingPage = ({ challenge }) => {
    const mod = modalidades[challenge.id] || 'run';
    const key = `${challenge.id}_${mod}`;
    const lista = rankings[key] || [];
    const cargandoThis = cargando[key];
    const mostrar = mostrarTodos[key];
    const mods = challenge.modalidades || [];

    // Filtrar por búsqueda
    const listaFiltrada = busqueda.trim()
      ? lista.filter(r => r.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
      : lista;

    const listaVisible = mostrar ? listaFiltrada : listaFiltrada.slice(0, TOP_VISIBLE);

    // Encontrar posición propia
    const miPosicion = lista.findIndex(r => esPropio(r.nombre));
    const scrollRef = rankingScrollRefs.current[challenge.id];

    const irAMiPosicion = () => {
      if (miPosicion === -1) return;
      // Cada card tiene ~72px de alto + gap
      const offset = miPosicion * 80;
      scrollRef?.scrollTo({ y: offset, animated: true });
      if (!mostrarTodos[key]) {
        setMostrarTodos(prev => ({ ...prev, [key]: true }));
      }
    };

    return (
      <ScrollView
        ref={ref => { rankingScrollRefs.current[challenge.id] = ref; }}
        style={{ width: SCREEN_WIDTH }}
        contentContainerStyle={styles.pageContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.challengeTitulo}>{challenge.title}</Text>

        {/* Selector modalidad */}
        {mods.length > 1 && (
          <View style={styles.selectorRow}>
            {mods.map((m, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.selectorBtn, mod === m.tipo && styles.selectorBtnActivo]}
                onPress={() => cambiarModalidad(challenge.id, m.tipo)}
              >
                <Ionicons
                  name={m.tipo === 'run' ? 'walk-outline' : 'bicycle-outline'}
                  size={16}
                  color={mod === m.tipo ? '#FFFFFF' : '#4a6a8a'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.selectorText, mod === m.tipo && styles.selectorTextActivo]}>
                  {m.tipo === 'run' ? '🏃 Running' : '🚴 Ciclismo'} — {m.distancia_km}km
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Buscador + botón ir a mi posición */}
        {!cargandoThis && lista.length > 0 && (
          <View style={styles.buscadorRow}>
            <View style={styles.buscadorWrapper}>
              <Ionicons name="search-outline" size={16} color="#4a6a8a" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.buscadorInput}
                value={busqueda}
                onChangeText={setBusqueda}
                placeholder="Buscar participante..."
                placeholderTextColor="#4a6a8a"
              />
              {busqueda.length > 0 && (
                <TouchableOpacity onPress={() => setBusqueda('')}>
                  <Ionicons name="close-circle" size={16} color="#4a6a8a" />
                </TouchableOpacity>
              )}
            </View>
            {miPosicion !== -1 && (
              <TouchableOpacity style={styles.miPosicionBtn} onPress={irAMiPosicion}>
                <Text style={styles.miPosicionBtnText}>#{miPosicion + 1} Yo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {cargandoThis ? (
          <ActivityIndicator size="large" color="#1E6FD9" style={{ marginTop: 40 }} />
        ) : lista.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="flag-outline" size={48} color="#4a6a8a" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyText}>Sin participantes todavía</Text>
            <Text style={styles.emptySubtext}>¡Sé el primero en inscribirte!</Text>
          </View>
        ) : listaFiltrada.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Sin resultados</Text>
            <Text style={styles.emptySubtext}>No hay participantes con ese nombre</Text>
          </View>
        ) : (
          <>
            <View style={styles.listaWrapper}>
              {listaVisible.map((item, index) => (
                <RankingItem key={index} item={item} />
              ))}
            </View>

            {!mostrar && listaFiltrada.length > TOP_VISIBLE && (
              <TouchableOpacity
                style={styles.verMasBtn}
                onPress={() => setMostrarTodos(prev => ({ ...prev, [key]: true }))}
              >
                <Text style={styles.verMasBtnText}>Ver los {listaFiltrada.length - TOP_VISIBLE} restantes ↓</Text>
              </TouchableOpacity>
            )}

            {mostrar && (
              <TouchableOpacity
                style={styles.verMasBtn}
                onPress={() => {
                  setMostrarTodos(prev => ({ ...prev, [key]: false }));
                  rankingScrollRefs.current[challenge.id]?.scrollTo({ y: 0, animated: true });
                }}
              >
                <Text style={styles.verMasBtnText}>↑ Volver al top</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.titulo}>🏆 Ranking</Text>

        {/* Tabs de challenges */}
        {challenges.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
            {challenges.map((c, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.tab, i === challengeIndex && styles.tabActivo]}
                onPress={() => irAChallenge(i)}
              >
                <Text style={[styles.tabText, i === challengeIndex && styles.tabTextActivo]}>
                  {c.title}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Indicador de puntos */}
        {challenges.length > 1 && (
          <View style={styles.dotsRow}>
            {challenges.map((_, i) => (
              <View key={i} style={[styles.dot, i === challengeIndex && styles.dotActivo]} />
            ))}
          </View>
        )}
      </View>

      {/* Páginas deslizables horizontalmente */}
      <ScrollView
        ref={challengeScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onChallengeScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {challenges.map((c, i) => (
          <RankingPage key={i} challenge={c} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  buscadorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  buscadorWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E3A5F', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#2a4a6a' },
  buscadorInput: { flex: 1, color: '#FFFFFF', fontSize: 14 },
  miPosicionBtn: { backgroundColor: '#FC4C02', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  miPosicionBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  screen: { flex: 1, backgroundColor: '#0D1B2A' },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 8, backgroundColor: '#0D1B2A' },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 16 },
  tabsScroll: { marginBottom: 10 },
  tab: { backgroundColor: '#1E3A5F', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginRight: 8, borderWidth: 2, borderColor: 'transparent' },
  tabActivo: { borderColor: '#FC4C02' },
  tabText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 13 },
  tabTextActivo: { color: '#FFFFFF' },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2a4a6a' },
  dotActivo: { width: 18, backgroundColor: '#FC4C02' },
  pageContainer: { padding: 24, paddingTop: 12, paddingBottom: 40, minHeight: '100%' },
  challengeTitulo: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 16 },
  selectorRow: { gap: 10, marginBottom: 20 },
  selectorBtn: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: 'transparent', flexDirection: 'row', justifyContent: 'center' },
  selectorBtnActivo: { borderColor: '#1E6FD9' },
  selectorText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 14 },
  selectorTextActivo: { color: '#FFFFFF' },
  listaWrapper: { gap: 8 },
  card: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardPropio: { borderWidth: 2, borderColor: '#FC4C02' },
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
  verMasBtn: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a4a6a', marginTop: 8 },
  verMasBtnText: { color: '#A8CFFF', fontWeight: 'bold', fontSize: 13 },
});