import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Image, Dimensions, TextInput } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../supabase';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const BANDERAS = {"Argentina": "🇦🇷", "Colombia": "🇨🇴", "Uruguay": "🇺🇾", "España": "🇪🇸", "Ecuador": "🇪🇨", "México": "🇲🇽", "Mexico": "🇲🇽", "Costa Rica": "🇨🇷", "Chile": "🇨🇱", "Estados Unidos": "🇺🇸", "Perú": "🇵🇪", "Peru": "🇵🇪", "Puerto Rico": "🇵🇷", "Venezuela": "🇻🇪", "República Dominicana": "🇩🇴", "Republica Dominicana": "🇩🇴", "Panamá": "🇵🇦", "Panama": "🇵🇦", "Brasil": "🇧🇷", "Australia": "🇦🇺", "El Salvador": "🇸🇻", "Guatemala": "🇬🇹", "Paraguay": "🇵🇾", "Bolivia": "🇧🇴", "Cuba": "🇨🇺", "Honduras": "🇭🇳", "Nicaragua": "🇳🇮", "Alemania": "🇩🇪", "Italia": "🇮🇹", "Francia": "🇫🇷", "Aruba": "🇦🇼", "Curacao": "🇨🇼", "Corea del Sur": "🇰🇷"};
const TOP_VISIBLE = 10;
const SCREEN_WIDTH = Dimensions.get('window').width;

export default function RankingScreen({ navigation }) {
  const [challenges, setChallenges] = useState([]);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [modalidades, setModalidades] = useState({});
  const [rankings, setRankings] = useState({});
  const [cargando, setCargando] = useState({});
  const [mostrarTodos, setMostrarTodos] = useState({});
  const [miNombre, setMiNombre] = useState('');
  const [miUserId, setMiUserId] = useState('');  // FIX: guardar user_id para comparar exacto
  const [tabVista, setTabVista] = useState('ranking'); // 'ranking' o 'paises'
  const [rankingPaises, setRankingPaises] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [tabActivo, setTabActivo] = useState('en_curso');
  const challengeScrollRef = useRef(null);
  const rankingScrollRefs = useRef({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setMiNombre(session.user.user_metadata?.name?.split(' ')[0] || '');
        setMiUserId(session.user.id);  // FIX: guardar el user_id real
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
      const res = await fetch(`${BACKEND_URL}/challenges`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setChallenges(data);
        const mods = {};
        data.forEach(c => { mods[c.id] = 'run'; });
        setModalidades(mods);
        data.forEach(c => cargarRanking(c.id, 'run'));
        if (data[0]) cargarRankingPaises(data[0].id);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const cargarRankingPaises = async (cId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/ranking/paises/${cId}`);
      const data = await res.json();
      setRankingPaises(Array.isArray(data) ? data : []);
    } catch (e) {}
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
    // Actualizar ranking de países al cambiar desafío
    if (challenges[index]) cargarRankingPaises(challenges[index].id);
  };

  // FIX: comparar por user_id si está disponible, fallback a nombre
  const esPropio = (item) => {
    if (miUserId && item.user_id) return item.user_id === miUserId;
    if (!miNombre) return false;
    return item.nombre?.toLowerCase().startsWith(miNombre.toLowerCase());
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
    const propio = esPropio(item);  // FIX: pasar item completo, no solo nombre
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

    const listaEnCurso = lista
      .filter(r => parseFloat(r.porcentaje) < 100)
      .sort((a, b) => parseFloat(b.km_completados) - parseFloat(a.km_completados));

    const listaFinishers = (() => {
      const finishers = lista
        .filter(r => parseFloat(r.porcentaje) >= 100)
        .sort((a, b) => parseFloat(b.km_completados) - parseFloat(a.km_completados));
      const propio = finishers.find(r => esPropio(r));  // FIX: item completo
      const resto = finishers.filter(r => !esPropio(r));  // FIX: item completo
      return propio ? [propio, ...resto] : finishers;
    })();

    const listaBase = (tabActivo === 'finishers' ? listaFinishers : listaEnCurso)
      .map((r, i) => ({ ...r, posicion: i + 1 }));

    const listaFiltrada = busqueda.trim()
      ? listaBase.filter(r => r.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
      : listaBase;

    const listaVisible = mostrar ? listaFiltrada : listaFiltrada.slice(0, TOP_VISIBLE);

    const miPosicion = listaBase.findIndex(r => esPropio(r));  // FIX: item completo
    const scrollRef = rankingScrollRefs.current[challenge.id];

    const irAMiPosicion = () => {
      if (miPosicion === -1) return;
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
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.challengeTitulo}>{challenge.title}</Text>

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
                  {m.tipo === 'run' ? 'Running' : 'Ciclismo'} — {m.distancia_km}km
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!cargandoThis && lista.length > 0 && miPosicion === -1 && (
          <View style={styles.noInscriptoCard}>
            <Text style={styles.noInscriptoEmoji}>🏅</Text>
            <View style={styles.noInscriptoInfo}>
              <Text style={styles.noInscriptoTitulo}>¿Querés aparecer acá?</Text>
              <Text style={styles.noInscriptoSubtitulo}>Inscribite al desafío y empezá a acumular km</Text>
            </View>
            <TouchableOpacity style={styles.noInscriptoBtn} onPress={() => navigation?.navigate('Catalogo')}>
              <Text style={styles.noInscriptoBtnText}>Ver desafíos</Text>
            </TouchableOpacity>
          </View>
        )}

        {!cargandoThis && lista.length > 0 && (
          <View style={styles.tabsVistaRow}>
            <TouchableOpacity
              style={[styles.tabVista, tabActivo === 'en_curso' && styles.tabVistaActivo]}
              onPress={() => { setTabActivo('en_curso'); setBusqueda(''); }}
            >
              <Text style={[styles.tabVistaText, tabActivo === 'en_curso' && styles.tabVistaTextActivo]}>
                🏃 En curso ({listaEnCurso.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabVista, tabActivo === 'finishers' && styles.tabVistaActivo]}
              onPress={() => { setTabActivo('finishers'); setBusqueda(''); }}
            >
              <Text style={[styles.tabVistaText, tabActivo === 'finishers' && styles.tabVistaTextActivo]}>
                🏅 Finishers ({listaFinishers.length})
              </Text>
            </TouchableOpacity>
          </View>
        )}

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
                blurOnSubmit={false}
                returnKeyType="search"
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

        {/* Tab Ranking / Países */}
        <View style={{ flexDirection: 'row', backgroundColor: '#0D1B2A', borderRadius: 10, padding: 3, marginBottom: 12 }}>
          <TouchableOpacity
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: tabVista === 'ranking' ? '#FC4C02' : 'transparent', alignItems: 'center' }}
            onPress={() => setTabVista('ranking')}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 }}>🏅 Ranking</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: tabVista === 'paises' ? '#FC4C02' : 'transparent', alignItems: 'center' }}
            onPress={() => setTabVista('paises')}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 }}>🌍 Países</Text>
          </TouchableOpacity>
        </View>

        {tabVista === 'ranking' && challenges.length > 1 && (
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

        {challenges.length > 1 && (
          <View style={styles.dotsRow}>
            {challenges.map((_, i) => (
              <View key={i} style={[styles.dot, i === challengeIndex && styles.dotActivo]} />
            ))}
          </View>
        )}
      </View>

      <ScrollView
        ref={challengeScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onChallengeScroll}
        scrollEventThrottle={16}
        style={{ flex: 1, display: tabVista === 'ranking' ? 'flex' : 'none' }}
      >
        {challenges.map((c, i) => (
          <RankingPage key={i} challenge={c} />
        ))}
      </ScrollView>

      {tabVista === 'paises' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          <Text style={{ color: '#A8CFFF', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
            Finishers por país 🌍
          </Text>
          {rankingPaises.length === 0 ? (
            <Text style={{ color: '#4a6a8a', textAlign: 'center' }}>Cargando...</Text>
          ) : (
            rankingPaises.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E3A5F', borderRadius: 12, padding: 14, marginBottom: 8 }}>
                <Text style={{ fontSize: 28, marginRight: 12 }}>{BANDERAS[item.pais] || '🏳️'}</Text>
                <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' }}>{item.pais}</Text>
                <View style={{ backgroundColor: '#FC4C02', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 }}>{item.cantidad}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
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
  noInscriptoCard: { backgroundColor: '#1E3A5F', borderRadius: 14, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#FC4C02' },
  noInscriptoEmoji: { fontSize: 24 },
  noInscriptoInfo: { flex: 1 },
  noInscriptoTitulo: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  noInscriptoSubtitulo: { fontSize: 11, color: '#A8CFFF' },
  noInscriptoBtn: { backgroundColor: '#FC4C02', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  noInscriptoBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  tabsVistaRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tabVista: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  tabVistaActivo: { borderColor: '#FC4C02' },
  tabVistaText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 13 },
  tabVistaTextActivo: { color: '#FFFFFF' },
  tabVistaSub: { fontSize: 11, color: '#4a6a8a', marginTop: 2 },
});