import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Image, Dimensions, TextInput, Modal, Linking, Share } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { solicitarGrupo } from '../services/gruposCore';
import { supabase } from '../supabase';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/korvaTheme';
import KorvaGroups from '../components/KorvaGroups';
import { ESTANDAR, versionDeInscripcion, versionesDelDesafio, iconoVersion } from '../utils/versionDesafio';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const BANDERAS = {"Argentina": "🇦🇷", "Colombia": "🇨🇴", "Uruguay": "🇺🇾", "España": "🇪🇸", "Ecuador": "🇪🇨", "México": "🇲🇽", "Mexico": "🇲🇽", "Costa Rica": "🇨🇷", "Chile": "🇨🇱", "Estados Unidos": "🇺🇸", "Perú": "🇵🇪", "Peru": "🇵🇪", "Puerto Rico": "🇵🇷", "Venezuela": "🇻🇪", "República Dominicana": "🇩🇴", "Republica Dominicana": "🇩🇴", "Panamá": "🇵🇦", "Panama": "🇵🇦", "Brasil": "🇧🇷", "Australia": "🇦🇺", "El Salvador": "🇸🇻", "Guatemala": "🇬🇹", "Paraguay": "🇵🇾", "Bolivia": "🇧🇴", "Cuba": "🇨🇺", "Honduras": "🇭🇳", "Nicaragua": "🇳🇮", "Alemania": "🇩🇪", "Italia": "🇮🇹", "Francia": "🇫🇷", "Aruba": "🇦🇼", "Curacao": "🇨🇼", "Corea del Sur": "🇰🇷"};
const TOP_VISIBLE = 10;
const SCREEN_WIDTH = Dimensions.get('window').width;

export default function RankingScreen({ navigation, route }) {
  const [challenges, setChallenges] = useState([]);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [distanciasAbiertas, setDistanciasAbiertas] = useState({});
  const [modalidades, setModalidades] = useState({}); // challenge_id → versión elegida en el selector ('estandar' | 'extendida')
  const [rankings, setRankings] = useState({});
  const [cargando, setCargando] = useState({});
  const [erroresRanking, setErroresRanking] = useState({});
  const [estadoCatalogo, setEstadoCatalogo] = useState('cargando');
  const [estadoPaises, setEstadoPaises] = useState('cargando');
  const [estadoGrupo, setEstadoGrupo] = useState('cargando');
  const paisesPeticion = useRef(0);
  const grupoPeticion = useRef(0);
  const listaOffsets = useRef({});
  const filaPropiaOffsets = useRef({});
  const posicionSolicitada = useRef(null);
  const [mostrarTodos, setMostrarTodos] = useState({});
  const [miNombre, setMiNombre] = useState('');
  const [miUserId, setMiUserId] = useState('');  // FIX: guardar user_id para comparar exacto
  const [tabVista, setTabVista] = useState('ranking'); // 'ranking', 'paises' o 'grupo'
  const [modalInfoDistancia, setModalInfoDistancia] = useState(false);
  const [misGruposRanking, setMisGruposRanking] = useState([]);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState(null);
  const [estadoMisGrupos, setEstadoMisGrupos] = useState('cargando');
  const [errorMisGrupos, setErrorMisGrupos] = useState('');
  const [recargaGrupos, setRecargaGrupos] = useState(0);
  const [rankingGrupo, setRankingGrupo] = useState([]);
  const [resumenGrupo, setResumenGrupo] = useState([]);
  const [vistaGrupo, setVistaGrupo] = useState('desafios');
  const [personaExpandida, setPersonaExpandida] = useState(null);
  const [busquedaGrupo, setBusquedaGrupo] = useState('');
  const [rankingPaises, setRankingPaises] = useState([]);
  const [resumenPaises, setResumenPaises] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [tabActivo, setTabActivo] = useState('en_curso');
  const challengeScrollRef = useRef(null);
  const rankingScrollRefs = useRef({});
  const rankingCache = useRef(new Map());
  const rankingPendiente = useRef(new Map());
  const versionesPendientes = useRef(new Set());

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setMiNombre(session.user.user_metadata?.name?.split(' ')[0] || '');
        setMiUserId(session.user.id);

      }
    });
    cargarChallenges();
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Priorizar el desafío visible y anticipar solo el siguiente.
      challenges.slice(challengeIndex, challengeIndex + 2).forEach(c => {
        cargarRanking(c.id, modalidades[c.id] || ESTANDAR);
      });
    }, [challenges, challengeIndex, modalidades])
  );

  useFocusEffect(useCallback(() => {
    let vigente = true;
    setEstadoMisGrupos('cargando');
    setMisGruposRanking([]);
    setGrupoSeleccionado(null);
    if (route?.params?.tab === 'grupo') setTabVista('grupo');
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const grupos = await solicitarGrupo({ session, accion: 'listar' });
        if (!vigente) return;
        setMisGruposRanking(grupos);
        setGrupoSeleccionado(grupos.find(g => g.id === route?.params?.grupoId) || grupos[0] || null);
        setEstadoMisGrupos('listo');
      } catch (error) {
        if (vigente) { setEstadoMisGrupos('error'); setErrorMisGrupos(error.message); }
      }
    })();
    return () => { vigente = false; ++grupoPeticion.current; };
  }, [route?.params?.grupoId, route?.params?.tab, recargaGrupos]));

  const refrescarGrupos = () => setRecargaGrupos(n => n + 1);
  const participantesGrupo = [...resumenGrupo].sort((a, b) => {
    if (a.user_id === miUserId) return -1;
    if (b.user_id === miUserId) return 1;
    return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
  });
  const participantesGrupoVisibles = busquedaGrupo.trim()
    ? participantesGrupo.filter(p => (p.nombre || '').toLowerCase().includes(busquedaGrupo.trim().toLowerCase()))
    : participantesGrupo;

  useEffect(() => {
    if (tabVista === 'grupo' && grupoSeleccionado?.id) cargarResumenGrupo(grupoSeleccionado.id);
  }, [tabVista, grupoSeleccionado?.id]);

  const cargarChallenges = async () => {
    setEstadoCatalogo('cargando');
    try {
      const res = await fetch(`${BACKEND_URL}/challenges`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error('No se pudo cargar el catálogo');
      setEstadoCatalogo('listo');
      if (data.length > 0) {
        setChallenges(data);
        const mods = {};
        data.forEach(c => { mods[c.id] = ESTANDAR; });
        setModalidades(mods);
        cargarRankingPaises();
        // Cargar grupos del usuario

      }
    } catch (error) {
      setEstadoCatalogo('error');
      console.error('Error:', error);
    }
  };

  const cargarResumenGrupo = async (groupId) => {
    const turno = ++grupoPeticion.current;
    setEstadoGrupo('cargando');
    setResumenGrupo([]);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sesión inválida');
      const res = await fetch(`${BACKEND_URL}/grupos/resumen/${groupId}`, { signal: controller.signal, headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (!res.ok || data?.tipo !== 'grupo_resumen_v1' || !Array.isArray(data.participantes)) throw new Error('No se pudo consultar el grupo');
      if (turno !== grupoPeticion.current) return;
      setResumenGrupo(data.participantes);
      setEstadoGrupo('listo');
    } catch {
      if (turno === grupoPeticion.current) setEstadoGrupo('error');
    } finally { clearTimeout(timeout); }
  };

  const cargarRankingGrupo = async (groupId, challengeId) => {
    const turno = ++grupoPeticion.current;
    setEstadoGrupo('cargando');
    setRankingGrupo([]);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sesión inválida');
      const res = await fetch(`${BACKEND_URL}/grupos/ranking/${groupId}/${challengeId}`, { signal: controller.signal, headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error('No se pudo consultar el grupo');
      if (turno !== grupoPeticion.current) return;
      setRankingGrupo(data);
      setEstadoGrupo('listo');
    } catch {
      if (turno === grupoPeticion.current) setEstadoGrupo('error');
    } finally { clearTimeout(timeout); }
  };

  const cargarRankingPaises = async () => {
    const turno = ++paisesPeticion.current;
    setEstadoPaises('cargando');
    setRankingPaises([]);
    setResumenPaises(null);
    try {
      const res = await fetch(`${BACKEND_URL}/comunidad/paises`);
      if (res.status === 404) {
        if (turno === paisesPeticion.current) setEstadoPaises('no_disponible');
        return;
      }
      const data = await res.json();
      if (!res.ok || data.tipo !== 'comunidad_paises_v1' || !Array.isArray(data.paises)
        || !Number.isInteger(data.total_completados) || data.total_completados < 0
        || !Number.isInteger(data.sin_pais) || data.sin_pais < 0
        || !Number.isInteger(data.completados_con_pais) || data.completados_con_pais < 0
        || data.paises.some((p) => typeof p.pais !== 'string' || !Number.isInteger(p.cantidad) || p.cantidad < 1)
        || data.paises.reduce((s, p) => s + p.cantidad, 0) !== data.completados_con_pais
        || data.completados_con_pais + data.sin_pais !== data.total_completados) throw new Error('No se pudieron consultar los países');
      if (turno !== paisesPeticion.current) return;
      setRankingPaises(data.paises);
      setResumenPaises(data);
      setEstadoPaises('listo');
    } catch {
      if (turno === paisesPeticion.current) setEstadoPaises('error');
    }
  };

  const cargarRanking = async (cId, mod) => {
    const key = `${cId}_${mod}`;
    if (versionesPendientes.current.has(key)) return;
    versionesPendientes.current.add(key);
    // Mantener los participantes visibles durante una actualización.
    setCargando(prev => ({ ...prev, [key]: true }));
    setErroresRanking(prev => ({ ...prev, [key]: false }));
    try {
      let data;
      const guardado = rankingCache.current.get(cId);
      if (guardado && Date.now() - guardado.fecha < 30000) {
        data = guardado.data;
      } else {
        let peticion = rankingPendiente.current.get(cId);
        if (!peticion) {
          // La respuesta contiene ambas versiones: compartir una sola petición.
          peticion = fetch(`${BACKEND_URL}/ranking/${cId}`)
            .then(async (res) => {
              const lista = await res.json();
              if (!res.ok || !Array.isArray(lista)) throw new Error('No se pudo cargar el ranking');
              rankingCache.current.set(cId, { data: lista, fecha: Date.now() });
              return lista;
            })
            .finally(() => rankingPendiente.current.delete(cId));
          rankingPendiente.current.set(cId, peticion);
        }
        data = await peticion;
      }
      // Filtra por VERSIÓN (version del backend; fallback a modalidad legacy).
      const filtrado = Array.isArray(data) ? data.filter(r => versionDeInscripcion(r) === mod) : [];
      const reordenado = filtrado.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
      setRankings(prev => ({ ...prev, [key]: reordenado }));
    } catch (error) {
      setErroresRanking(prev => ({ ...prev, [key]: true }));
      console.error('Error ranking:', error);
    } finally {
      versionesPendientes.current.delete(key);
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
    if (challenges[index]) {
      if (tabVista === 'grupo' && grupoSeleccionado) cargarRankingGrupo(grupoSeleccionado.id, challenges[index].id);
    }
    // Cambiar tab según status del desafío del usuario
    // (se maneja en RankingPage según miPosicion)
  };

  // FIX: comparar por user_id si está disponible, fallback a nombre
  const esPropio = (item) => {
    if (miUserId && item.user_id) return item.user_id === miUserId;
    if (!miNombre) return false;
    return item.nombre?.toLowerCase().startsWith(miNombre.toLowerCase());
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

  const RankingItem = ({ item }) => {
    const propio = esPropio(item);  // FIX: pasar item completo, no solo nombre
    const hizo100 = completado(item.porcentaje);
    const pct = Math.max(0, Math.min(parseFloat(item.porcentaje) || 0, 100));
    return (
      <View style={[styles.card, propio && styles.cardPropio]}>
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

  // Función de render: mantiene el ScrollView y el buscador montados al escribir.
  const renderRankingPage = ({ challenge }) => {
    const mod = modalidades[challenge.id] || ESTANDAR;
    const key = `${challenge.id}_${mod}`;
    const lista = rankings[key] || [];
    const cargandoThis = !rankings[key] && !erroresRanking[key];
    const mostrar = mostrarTodos[key];
    const mods = versionesDelDesafio(challenge).filter(v => v.distancia_km !== null);

    const listaEnCurso = lista
      .filter(r => parseFloat(r.porcentaje) < 100)
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));

    const listaFinishers = (() => {
      const finishers = lista
        .filter(r => parseFloat(r.porcentaje) >= 100)
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
      const propio = finishers.find(r => esPropio(r));  // FIX: item completo
      const resto = finishers.filter(r => !esPropio(r));  // FIX: item completo
      return propio ? [propio, ...resto] : finishers;
    })();

    // Auto-seleccionar tab solo cuando el ranking acaba de cargar (lista cambió de 0 a >0)
    // No sobreescribir si el usuario ya cambió el tab manualmente
    // Tab auto-selección se maneja afuera, no acá

    const listaBase = tabActivo === 'finishers' ? listaFinishers : listaEnCurso;

    const listaFiltrada = busqueda.trim()
      ? listaBase.filter(r => r.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
      : listaBase;

    const listaVisible = mostrar ? listaFiltrada : listaFiltrada.slice(0, TOP_VISIBLE);

    const miPosicion = listaBase.findIndex(r => esPropio(r));  // FIX: item completo
    const irAMiPosicion = () => {
      if (miPosicion === -1) return;
      posicionSolicitada.current = key;
      setBusqueda('');
      setMostrarTodos(prev => ({ ...prev, [key]: true }));
      const y = filaPropiaOffsets.current[key];
      const inicio = listaOffsets.current[key];
      if (y !== undefined && inicio !== undefined && !busqueda) {
        rankingScrollRefs.current[challenge.id]?.scrollTo({ y: Math.max(0, inicio + y - 12), animated: true });
        posicionSolicitada.current = null;
      }
    };

    return (
      <ScrollView
        ref={ref => { rankingScrollRefs.current[challenge.id] = ref; }}
        style={{ width: SCREEN_WIDTH }}
        contentContainerStyle={styles.pageContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (posicionSolicitada.current !== key) return;
          requestAnimationFrame(() => {
            const inicio = listaOffsets.current[key];
            const fila = filaPropiaOffsets.current[key];
            if (posicionSolicitada.current === key && inicio !== undefined && fila !== undefined) {
              rankingScrollRefs.current[challenge.id]?.scrollTo({ y: Math.max(0, inicio + fila - 12), animated: true });
              posicionSolicitada.current = null;
            }
          });
        }}
      >
        <Text style={styles.challengeTitulo}>{challenge.title}</Text>

        {mods.length > 1 && (
          <View>
            <TouchableOpacity style={styles.distanciasToggle} onPress={() => setDistanciasAbiertas(prev => ({ ...prev, [challenge.id]: !prev[challenge.id] }))} accessibilityRole="button" accessibilityState={{ expanded: !!distanciasAbiertas[challenge.id] }}>
              <Text style={styles.distanciaActual}>{mods.find(m => m.version === mod)?.distancia_km} km</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.distanciasToggleText}>Cambiar distancia</Text>
                <Ionicons name={distanciasAbiertas[challenge.id] ? 'chevron-up' : 'chevron-down'} size={15} color={colors.actionBlue} />
              </View>
            </TouchableOpacity>
            {distanciasAbiertas[challenge.id] && <View>
            <View style={styles.selectorRow}>
              {mods.map((m) => (
                <TouchableOpacity
                  key={m.version}
                  style={[styles.selectorBtn, mod === m.version && styles.selectorBtnActivo]}
                  onPress={() => { cambiarModalidad(challenge.id, m.version); setDistanciasAbiertas(prev => ({ ...prev, [challenge.id]: false })); }}
                >
                  <Ionicons
                    name={iconoVersion(m.version)}
                    size={16}
                    color={mod === m.version ? colors.text : colors.textMuted}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.selectorText, mod === m.version && styles.selectorTextActivo]}>
                    {m.distancia_km}km · {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6, marginBottom: 4 }}
              onPress={() => setModalInfoDistancia(true)}
            >
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>¿Cuál elegir? </Text>
              <Text style={{ color: colors.actionBlue, fontSize: 13 }}>ℹ️</Text>
            </TouchableOpacity>
            </View>}
          </View>
        )}

        {!cargandoThis && lista.length > 0 && !lista.some(esPropio) && (
          <View style={styles.noInscriptoCard}>
            <Ionicons name="flag-outline" size={22} color={colors.brandOrangeSoft} />
            <View style={styles.noInscriptoInfo}>
              <Text style={styles.noInscriptoTitulo}>Explorá el desafío</Text>
              <Text style={styles.noInscriptoSubtitulo}>Conocé la ruta y cómo participar.</Text>
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
                En curso ({listaEnCurso.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabVista, tabActivo === 'finishers' && styles.tabVistaActivo]}
              onPress={() => { setTabActivo('finishers'); setBusqueda(''); }}
            >
              <Text style={[styles.tabVistaText, tabActivo === 'finishers' && styles.tabVistaTextActivo]}>
                Completados ({listaFinishers.length})
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!cargandoThis && lista.length > 0 && (
          <View style={styles.buscadorRow}>
            <View style={styles.buscadorWrapper}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.buscadorInput}
                value={busqueda}
                onChangeText={setBusqueda}
                placeholder="Buscar participante..."
                placeholderTextColor={colors.textMuted}
                blurOnSubmit={false}
                returnKeyType="search"
              />
              {busqueda.length > 0 && (
                <TouchableOpacity onPress={() => setBusqueda('')}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            {miPosicion !== -1 && (
              <TouchableOpacity style={styles.miPosicionBtn} onPress={irAMiPosicion}>
                <Text style={styles.miPosicionBtnText}>Verme</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.listHeading}>
          <Text style={styles.listLabel}>{tabActivo === 'finishers' ? 'Desafíos completados' : 'Participantes en curso'}</Text>
          <TouchableOpacity onPress={() => { rankingCache.current.delete(challenge.id); cargarRanking(challenge.id, mod); }}
            disabled={!!cargando[key]} accessibilityRole="button" accessibilityLabel="Actualizar participantes" style={styles.refreshButton}>
            <Text style={styles.refreshText}>{cargando[key] ? 'Actualizando…' : 'Actualizar'}</Text>
          </TouchableOpacity>
        </View>
        {erroresRanking[key] && <Text style={styles.statusNote}>No pudimos actualizar los participantes. Tocá Actualizar para reintentar.</Text>}
        {erroresRanking[key] && !rankings[key] ? null : cargandoThis ? (
          <ActivityIndicator size="large" color={colors.actionBlue} style={{ marginTop: 40 }} />
        ) : lista.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="flag-outline" size={48} color={colors.textMuted} style={{ marginBottom: 16 }} />
            <Text style={styles.emptyText}>Sin participantes todavía</Text>
            <Text style={styles.emptySubtext}>Cuando haya participantes, los vas a ver acá.</Text>
          </View>
        ) : listaFiltrada.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Sin resultados</Text>
            <Text style={styles.emptySubtext}>{busqueda ? 'Probá con otro nombre.' : tabActivo === 'finishers' ? 'Todavía no hay desafíos completados en esta versión.' : 'Todavía no hay participantes en curso en esta versión.'}</Text>
          </View>
        ) : (
          <>
            <View style={styles.listaWrapper} onLayout={(e) => { listaOffsets.current[key] = e.nativeEvent.layout.y; }}>
              {listaVisible.map((item, index) => (
                <View key={item.user_id || index} onLayout={(e) => {
                  if (!esPropio(item)) return;
                  filaPropiaOffsets.current[key] = e.nativeEvent.layout.y;
                  if (posicionSolicitada.current === key && listaOffsets.current[key] !== undefined) {
                    rankingScrollRefs.current[challenge.id]?.scrollTo({ y: Math.max(0, listaOffsets.current[key] + e.nativeEvent.layout.y - 12), animated: true });
                    posicionSolicitada.current = null;
                  }
                }}>{RankingItem({ item })}</View>
              ))}
            </View>

            {!mostrar && listaFiltrada.length > TOP_VISIBLE && (
              <TouchableOpacity
                style={styles.verMasBtn}
                onPress={() => setMostrarTodos(prev => ({ ...prev, [key]: true }))}
              >
                <Text style={styles.verMasBtnText}>Ver los {listaFiltrada.length - TOP_VISIBLE} restantes</Text>
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
                <Text style={styles.verMasBtnText}>Mostrar menos</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>COMUNIDAD KORVA</Text>
        <Text style={styles.titulo}>Comunidad</Text>
        <Text style={styles.subtitle}>Cada persona, su recorrido.</Text>

        {/* Tab Ranking / Países */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.background, borderRadius: 10, padding: 3, marginBottom: 12 }}>
          <TouchableOpacity
            style={{ flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: tabVista === 'ranking' ? colors.surfaceRaised : 'transparent', alignItems: 'center' }}
            onPress={() => setTabVista('ranking')}
          >
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 12 }}>Participantes</Text>
          </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: tabVista === 'grupo' ? colors.surfaceRaised : 'transparent', alignItems: 'center' }}
              onPress={() => {
                setTabVista('grupo');
                if (grupoSeleccionado) cargarResumenGrupo(grupoSeleccionado.id);
              }}
            >
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 12 }}>Grupos</Text>
            </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: tabVista === 'paises' ? colors.surfaceRaised : 'transparent', alignItems: 'center' }}
            onPress={() => { setTabVista('paises'); cargarRankingPaises(); }}
          >
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 12 }}>Países</Text>
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

        {tabVista === 'ranking' && challenges.length > 1 && (
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
          <View key={c.id} style={{ width: SCREEN_WIDTH }}>{renderRankingPage({ challenge: c })}</View>
        ))}
      </ScrollView>

      {estadoCatalogo === 'cargando' && <ActivityIndicator color={colors.actionBlue} style={{ marginVertical: 24 }} />}
      {estadoCatalogo === 'error' && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No pudimos cargar los desafíos</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={cargarChallenges}><Text style={styles.refreshText}>Reintentar</Text></TouchableOpacity>
        </View>
      )}

      {/* Modal info distancias */}
      <Modal visible={modalInfoDistancia} transparent animationType="fade" onRequestClose={() => setModalInfoDistancia(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }} activeOpacity={1} onPress={() => setModalInfoDistancia(false)}>
          <View style={{ backgroundColor: colors.background, borderRadius: 20, padding: 24, width: '100%', borderWidth: 1, borderColor: colors.surfaceSoft }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' }}>¿Qué versión elegir?</Text>
            <View style={{ backgroundColor: colors.surfaceSoft, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: colors.brandOrangeSoft, fontWeight: 'bold', fontSize: 13, marginBottom: 6 }}>Versión Estándar</Text>
              <Text style={{ color: colors.textSoft, fontSize: 13, lineHeight: 20 }}>La distancia normal del desafío. Podés completarla caminando, corriendo o en bici.</Text>
            </View>
            <View style={{ backgroundColor: colors.surfaceSoft, borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <Text style={{ color: colors.brandOrangeSoft, fontWeight: 'bold', fontSize: 13, marginBottom: 6 }}>Versión Extendida</Text>
              <Text style={{ color: colors.textSoft, fontSize: 13, lineHeight: 20 }}>Una distancia mayor, para quien quiere un reto más largo. También se completa caminando, corriendo o en bici: todos los km cuentan igual.</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>La medalla es la misma para las dos versiones.</Text>
            <TouchableOpacity style={{ backgroundColor: colors.brandOrangeSoft, borderRadius: 12, padding: 14, alignItems: 'center' }} onPress={() => setModalInfoDistancia(false)}>
              <Text style={{ color: colors.text, fontWeight: 'bold' }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {tabVista === 'grupo' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          {estadoMisGrupos === 'cargando' ? <ActivityIndicator color={colors.actionBlue} /> : estadoMisGrupos === 'error' ? (
            <View style={styles.emptyCard}><Text style={styles.statusNote}>{errorMisGrupos}</Text><TouchableOpacity style={styles.verMasBtn} onPress={() => setRecargaGrupos(n => n + 1)}><Text style={styles.refreshText}>Reintentar</Text></TouchableOpacity></View>
          ) : !grupoSeleccionado ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={34} color={colors.brandOrangeSoft} />
              <Text style={styles.emptyText}>Tu aventura también puede ser compartida</Text>
              <Text style={styles.statusNote}>Creá un grupo o unite con un código para acompañar a amigos, familia o equipo. Cada persona mantiene sus propios desafíos y progreso.</Text>
              <View style={{ marginTop:14, alignItems:'center' }}><KorvaGroups navigation={navigation} launcherOnly onGroupsChanged={refrescarGrupos} /></View>
            </View>
          ) : <>
            {misGruposRanking.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {misGruposRanking.map((g) => (
                  <TouchableOpacity key={g.id} style={{ backgroundColor: grupoSeleccionado?.id === g.id ? colors.surfaceRaised : colors.surfaceSoft, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, marginRight: 8 }} onPress={() => setGrupoSeleccionado(g)}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: 'bold' }}>{g.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <View style={{ backgroundColor: colors.surfaceSoft, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 }}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
                <View style={{ flex:1, minWidth:0 }}>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>{grupoSeleccionado.nombre}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>{resumenGrupo.length} {resumenGrupo.length === 1 ? 'participante' : 'participantes'} · Código {grupoSeleccionado.codigo}</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Compartir invitación" style={{ width:40, height:40, alignItems:'center', justifyContent:'center', borderRadius:12, borderWidth:1, borderColor:colors.borderSoft }} onPress={() => Share.share({ message: `Unite a ${grupoSeleccionado.nombre} en Korva con el código ${grupoSeleccionado.codigo}. En Comunidad, abrí Grupos y elegí Unirme con código. https://korva.run` })}>
                  <Ionicons name="share-outline" size={18} color={colors.actionBlue} />
                </TouchableOpacity>
                <KorvaGroups navigation={navigation} launcherOnly onGroupsChanged={refrescarGrupos} />
              </View>
            </View>
            <View style={{ flexDirection:'row', backgroundColor:colors.background, borderRadius:12, padding:3, marginBottom:16 }}>
              <TouchableOpacity style={{ flex:1, minHeight:42, alignItems:'center', justifyContent:'center', borderRadius:10, backgroundColor:vistaGrupo==='desafios'?colors.surfaceRaised:'transparent' }} onPress={()=>setVistaGrupo('desafios')}><Text style={{ color:colors.text, fontWeight:'700', fontSize:13 }}>Desafíos</Text></TouchableOpacity>
              <TouchableOpacity style={{ flex:1, minHeight:42, alignItems:'center', justifyContent:'center', borderRadius:10, backgroundColor:vistaGrupo==='actividad'?colors.surfaceRaised:'transparent' }} onPress={()=>setVistaGrupo('actividad')}><Text style={{ color:colors.text, fontWeight:'700', fontSize:13 }}>Actividad</Text></TouchableOpacity>
            </View>
            {vistaGrupo === 'actividad' ? (
              <View style={styles.emptyCard}>
                <Ionicons name="footsteps-outline" size={32} color={colors.brandOrangeSoft} />
                <Text style={styles.emptyText}>Movimiento del grupo</Text>
                <Text style={styles.statusNote}>Acá vas a poder comparar pasos y constancia por semana, mes y año. Los rankings se renovarán y tus logros quedarán guardados.</Text>
                <Text style={styles.statusNote}>Próximamente · no afecta los kilómetros de tus desafíos.</Text>
              </View>
            ) : estadoGrupo === 'cargando' ? <ActivityIndicator color={colors.actionBlue} /> : estadoGrupo === 'error' ? (
              <TouchableOpacity style={styles.verMasBtn} onPress={() => cargarResumenGrupo(grupoSeleccionado.id)}><Text style={styles.refreshText}>No pudimos cargar el grupo · Reintentar</Text></TouchableOpacity>
            ) : resumenGrupo.length === 0 ? (
              <Text style={styles.statusNote}>Todavía no hay participantes para mostrar.</Text>
            ) : <>
              {participantesGrupo.length > 10 && (
                <View style={{ flexDirection:'row', alignItems:'center', backgroundColor:colors.surfaceSoft, borderRadius:12, paddingHorizontal:12, marginBottom:10, borderWidth:1, borderColor:colors.borderSoft }}>
                  <Ionicons name="search-outline" size={17} color={colors.textMuted} />
                  <TextInput value={busquedaGrupo} onChangeText={setBusquedaGrupo} placeholder="Buscar participante..." placeholderTextColor={colors.textMuted} autoCorrect={false} style={{ flex:1, minHeight:44, color:colors.text, fontSize:14, paddingHorizontal:9 }} />
                </View>
              )}
              {participantesGrupoVisibles.length === 0 ? <Text style={styles.statusNote}>No encontramos participantes con ese nombre.</Text> : participantesGrupoVisibles.map((persona) => {
              const expandida = personaExpandida === persona.user_id;
              const completados = persona.desafios.filter(d => ['completed','shipped','cargado'].includes(d.status) || Number(d.porcentaje) >= 100).length;
              const enCurso = persona.desafios.filter(d => !['completed','shipped','cargado'].includes(d.status) && Number(d.porcentaje) < 100);
              const destacado = enCurso[0] || persona.desafios[0];
              return (
                <TouchableOpacity key={persona.user_id} activeOpacity={0.85} onPress={() => setPersonaExpandida(expandida ? null : persona.user_id)} style={{ backgroundColor: persona.user_id === miUserId ? colors.surfaceSoft : colors.background, borderRadius:16, padding:14, marginBottom:8, borderWidth: persona.user_id === miUserId ? 1 : 0, borderColor:colors.brandOrangeSoft }}>
                  <View style={{ flexDirection:'row', alignItems:'center' }}>
                    <AvatarItem item={persona} size={38} />
                    <View style={{ flex:1, marginLeft:11 }}>
                      <Text style={{ color:colors.text, fontWeight:'800', fontSize:14 }} numberOfLines={1}>{persona.nombre}{persona.user_id === miUserId ? ' (vos)' : ''}</Text>
                      <Text style={{ color:colors.textMuted, fontSize:11, marginTop:3 }}>{persona.total_desafios} {persona.total_desafios === 1 ? 'desafío' : 'desafíos'} · {completados} completados{enCurso.length ? ` · ${enCurso.length} en curso` : ''}</Text>
                    </View>
                    <Ionicons name={expandida ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                  </View>
                  {!expandida && destacado && (
                    <View style={{ flexDirection:'row', alignItems:'center', marginTop:10, paddingTop:9, borderTopWidth:1, borderTopColor:colors.borderSoft }}>
                      <Text style={{ color:colors.textSoft, fontSize:12, fontWeight:'700', flex:1 }} numberOfLines={1}>{destacado.titulo}</Text>
                      <Text style={{ color:colors.brandOrangeSoft, fontSize:12, fontWeight:'800' }}>{destacado.porcentaje === null ? '—' : `${destacado.porcentaje}%`}</Text>
                    </View>
                  )}
                  {expandida && (persona.desafios.length === 0 ? <Text style={[styles.statusNote,{marginTop:10}]}>Sin desafíos activos o completados para mostrar.</Text> : persona.desafios.map((d) => (
                    <View key={d.challenge_id} style={{ paddingTop:10, paddingBottom:7, borderTopWidth:1, borderTopColor:colors.borderSoft, marginTop:8 }}>
                      <View style={{ flexDirection:'row', alignItems:'center' }}><Text style={{ color:colors.textSoft, fontSize:12, fontWeight:'700', flex:1 }}>{d.titulo}</Text><Text style={{ color:colors.brandOrangeSoft, fontSize:12, fontWeight:'800' }}>{d.porcentaje === null ? '—' : `${d.porcentaje}%`}</Text></View>
                      <Text style={{ color:colors.textMuted, fontSize:11, marginTop:4 }}>{d.km_completados} / {d.distancia_total ?? '—'} km · {(['completed','shipped','cargado'].includes(d.status) || Number(d.porcentaje) >= 100) ? 'Completado' : d.pausado ? 'Pausado' : 'En curso'}</Text>
                    </View>
                  )))}
                </TouchableOpacity>
              );
            })}
            </>}

          </>}
        </ScrollView>
      )}

      {tabVista === 'paises' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          <Text style={{ color: colors.textSoft, fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
            Todas las rutas de Korva
          </Text>
          {resumenPaises && (
            <View style={styles.countrySummary}>
              <Text style={styles.countryTotal}>{resumenPaises.total_completados.toLocaleString('es-AR')}</Text>
              <Text style={styles.countrySummaryLabel}>desafíos completados</Text>
              <Text style={styles.statusNote}>{rankingPaises.length} países</Text>
              <Text style={styles.countryHint}>Cada persona puede haber completado varios desafíos. Cada país reúne las rutas completadas por su comunidad.</Text>
              {resumenPaises.sin_pais > 0 && <Text style={styles.countryHint}>{resumenPaises.sin_pais} completados sin país informado no aparecen en la lista.</Text>}
            </View>
          )}
          <TouchableOpacity style={styles.refreshButton} disabled={estadoPaises === 'cargando'} onPress={cargarRankingPaises}><Text style={styles.refreshText}>Actualizar países</Text></TouchableOpacity>
          {estadoPaises === 'no_disponible' ? <Text style={styles.statusNote}>El resumen general por país estará disponible próximamente.</Text> : estadoPaises === 'cargando' ? <ActivityIndicator color={colors.actionBlue} /> : estadoPaises === 'error' ? (
            <TouchableOpacity style={styles.verMasBtn} onPress={cargarRankingPaises}><Text style={styles.refreshText}>No pudimos cargar los países · Reintentar</Text></TouchableOpacity>
          ) : rankingPaises.length === 0 ? (
            <Text style={styles.statusNote}>Todavía no hay desafíos completados por país.</Text>
          ) : (
            rankingPaises.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSoft, borderRadius: 12, padding: 14, marginBottom: 8 }}>
                <Text style={{ fontSize: 28, marginRight: 12 }}>{BANDERAS[item.pais] || '🏳️'}</Text>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: 'bold' }}>{item.pais}</Text>
                <View style={{ backgroundColor: colors.backgroundDeep, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 14 }}>{item.cantidad}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  countrySummary: { backgroundColor: colors.surfaceSoft, borderRadius: 24, borderWidth: 1, borderColor: colors.borderSoft, padding: 24, alignItems: 'center', marginBottom: 16 },
  countryTotal: { color: colors.text, fontSize: 48, fontWeight: '900' },
  countrySummaryLabel: { color: colors.textSoft, fontSize: 14, marginTop: 4 },
  countryHint: { color: colors.textMuted, fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  eyebrow: { color: colors.brandOrangeSoft, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  subtitle: { color: colors.textMuted, fontSize: 12, marginBottom: 16 },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  listLabel: { color: colors.textSoft, fontSize: 12, fontWeight: '700', flex: 1 },
  refreshButton: { paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' },
  refreshText: { color: colors.actionBlue, fontSize: 11, fontWeight: '700' },
  statusNote: { color: colors.textMuted, fontSize: 12, lineHeight: 19, paddingVertical: 16, textAlign: 'center' },
  buscadorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  buscadorWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.borderSoft },
  buscadorInput: { flex: 1, color: colors.text, fontSize: 14 },
  miPosicionBtn: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: colors.brandOrangeSoft, backgroundColor: colors.backgroundDeep, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  miPosicionBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 13 },
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingTop: 16, paddingHorizontal: 24, paddingBottom: 8, backgroundColor: colors.background },
  titulo: { fontSize: 28, fontWeight: '900', color: colors.text, marginBottom: 4 },
  tabsScroll: { marginBottom: 10 },
  tab: { backgroundColor: colors.surfaceSoft, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginRight: 8, borderWidth: 1, borderColor: 'transparent' },
  tabActivo: { borderColor: colors.brandOrangeSoft },
  tabText: { color: colors.textMuted, fontWeight: 'bold', fontSize: 13 },
  tabTextActivo: { color: colors.text },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderSoft },
  dotActivo: { width: 18, backgroundColor: colors.brandOrangeSoft },
  pageContainer: { padding: 24, paddingTop: 12, paddingBottom: 40, minHeight: '100%' },
  challengeTitulo: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 16 },
  distanciasToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginBottom: 8 },
  distanciaActual: { fontSize: 13, color: colors.textSoft, fontWeight: '600' },
  distanciasToggleText: { fontSize: 12, color: colors.actionBlue, fontWeight: '600' },
  selectorRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  selectorBtn: { flex: 1, minHeight: 48, backgroundColor: colors.surfaceSoft, borderRadius: 16, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', justifyContent: 'center' },
  selectorBtnActivo: { borderColor: colors.brandOrangeSoft },
  selectorText: { color: colors.textSoft, fontWeight: '700', fontSize: 12, flexShrink: 1, textAlign: 'center' },
  selectorTextActivo: { color: colors.text },
  listaWrapper: { gap: 8 },
  card: { borderWidth: 1, borderColor: colors.borderSoft, minHeight: 84, backgroundColor: colors.surfaceSoft, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardPropio: { borderWidth: 1, borderColor: colors.brandOrangeSoft },
  avatarPlaceholder: { backgroundColor: colors.actionBlue, alignItems: 'center', justifyContent: 'center' },
  avatarLetra: { fontWeight: 'bold', color: colors.text },
  info: { flex: 1 },
  nombreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  nombre: { fontSize: 14, fontWeight: 'bold', color: colors.text, flex: 1 },
  tuTag: { backgroundColor: colors.surfaceRaised, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tuTagText: { fontSize: 10, color: colors.brandOrangeSoft, fontWeight: 'bold' },
  progressBar: { height: 5, backgroundColor: colors.background, borderRadius: 3, marginBottom: 4 },
  progressFill: { height: 5, backgroundColor: colors.actionBlue, borderRadius: 3 },
  progressFillCompletado: { backgroundColor: colors.brandOrangeSoft },
  kmText: { fontSize: 11, color: colors.textSoft },
  emptyCard: { backgroundColor: colors.surfaceSoft, borderRadius: 20, padding: 40, alignItems: 'center', marginTop: 20 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: colors.textSoft },
  verMasBtn: { backgroundColor: colors.surfaceSoft, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.borderSoft, marginTop: 8 },
  verMasBtnText: { color: colors.textSoft, fontWeight: 'bold', fontSize: 13 },
  noInscriptoCard: { backgroundColor: colors.backgroundDeep, borderRadius: 14, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.borderSoft },
  noInscriptoEmoji: { fontSize: 24 },
  noInscriptoInfo: { flex: 1 },
  noInscriptoTitulo: { fontSize: 13, fontWeight: 'bold', color: colors.text, marginBottom: 2 },
  noInscriptoSubtitulo: { fontSize: 11, color: colors.textSoft },
  noInscriptoBtn: { minHeight: 44, justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  noInscriptoBtnText: { color: colors.actionBlue, fontWeight: 'bold', fontSize: 12 },
  tabsVistaRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tabVista: { flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  tabVistaActivo: { borderColor: colors.brandOrangeSoft },
  tabVistaText: { color: colors.textMuted, fontWeight: 'bold', fontSize: 13 },
  tabVistaTextActivo: { color: colors.text },
  tabVistaSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});