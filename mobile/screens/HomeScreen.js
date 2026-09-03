import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView, Linking, TextInput, Alert, Modal, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../supabase';
import CompletadoScreen from './CompletadoScreen';
import TutorialScreen from './TutorialScreen';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import MapaRecorrido from './MapaRecorrido';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const aplicarMascaraFecha = (texto) => {
  const numeros = texto.replace(/[^0-9]/g, '');
  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 4) return `${numeros.slice(0,2)}/${numeros.slice(2)}`;
  return `${numeros.slice(0,2)}/${numeros.slice(2,4)}/${numeros.slice(4,8)}`;
};
const SCREEN_WIDTH = Dimensions.get('window').width;

const PASOS = [
  { emoji: '📝', titulo: 'Registrá tus km', desc: 'Usá la pestaña "Registrar" para cargar tus actividades manualmente.' },
  { emoji: '🏃', titulo: 'Empezá a correr', desc: 'Cada km cuenta hacia tu medalla.' },
  { emoji: '📦', titulo: 'Recibí tu medalla', desc: 'Al llegar al 100% te la enviamos a casa.' },
];

const getFrase = (pct) => {
  if (pct >= 100) return '¡Lo logré! 🏁';
  if (pct >= 75) return 'Ya casi llego... 💪';
  if (pct >= 50) return 'Mitad del camino recorrido 🔥';
  if (pct >= 25) return 'Arrancando fuerte ⚡';
  return 'El camino empieza con el primer paso 🌱';
};

const getSubtitulo = (challengeTitle) => {
  const t = (challengeTitle || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (t.includes('dubrovnik')) return 'Pile Gate → Ploče Gate';
  if (t.includes('andres') || t.includes('san andr')) return 'San Luis → Punta Sur';
  return 'Tolhuin → Ushuaia';
};

const formatearFechaMeta = (fecha) => {
  if (!fecha) return null;
  return new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

export default function HomeScreen({ navigation }) {
  const [challenges, setChallenges] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [userId, setUserId] = useState(null);
  const [completado, setCompletado] = useState(null);
  const [mostrarTutorial, setMostrarTutorial] = useState(false);
  const [nombre, setNombre] = useState('');
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerCerrado, setBannerCerrado] = useState(false); // FIX: estado separado para cerrar manualmente
  const [stravaBannerCerrado, setStravaBannerCerrado] = useState(false); // FIX: cerrar banner Strava
  const [metaInputs, setMetaInputs] = useState({});
  const [metaVisibles, setMetaVisibles] = useState({});
  const [guardandoMeta, setGuardandoMeta] = useState({});
  const [stravaConectado, setStravaConectado] = useState(false);
  const [stravaHabilitado, setStravaHabilitado] = useState(false);
  const [modalStravaVisible, setModalStravaVisible] = useState(false);
  const [modalStravaProximamente, setModalStravaProximamente] = useState(false);
  const [modalStravaInfoVisible, setModalStravaInfoVisible] = useState(false);
  const [bannerStravaVisible, setBannerStravaVisible] = useState(false);
  const [bannerDireccionVisible, setBannerDireccionVisible] = useState(false);
  const [actividadesLibres, setActividadesLibres] = useState([]);
  const [modoLibre, setModoLibre] = useState(false);
  const [cargandoBib, setCargandoBib] = useState(false);
  const [modalAyudaVisible, setModalAyudaVisible] = useState(false);
  const [faqAbierta, setFaqAbierta] = useState(null);
  const [retoActivoIndex, setRetoActivoIndex] = useState(0);
  const [modalModalidadVisible, setModalModalidadVisible] = useState(false);
  const viewShotRefs = useRef([]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
        try {
          // Tutorial temporalmente desactivado hasta fix
          // const tutorialVisto = await AsyncStorage.getItem('tutorial_visto');
          // if (!tutorialVisto) setMostrarTutorial(true);
        } catch (e) {}
        const metaNombre = session.user.user_metadata?.name?.split(' ')[0] || 
                           session.user.user_metadata?.full_name?.split(' ')[0] || '';
        if (metaNombre) {
          setNombre(metaNombre);
        } else {
          const { data } = await supabase.from('users').select('name').eq('id', session.user.id).single();
          setNombre(data?.name?.split(' ')[0] || '');
        }
      } else {
        setCargando(false);
      }
    });
  }, []);

  useEffect(() => {
    if (userId) {
      cargarProgreso();
      verificarStrava();
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        cargarProgreso();
        verificarStrava();
      }
    }, [userId])
  );

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('strava-connected')) {
        cargarProgreso();
        verificarStrava();
        setModalStravaVisible(true);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const checkBannerStrava = async () => {
      try {
        const visto = await AsyncStorage.getItem('banner_strava_visto');
        if (visto) return;
        const res = await fetch(`${BACKEND_URL}/strava-cupo?userId=${userId}`);
        const data = await res.json();
        if (data.disponible) setBannerStravaVisible(true);
      } catch (e) {}
    };
    if (userId) checkBannerStrava();
  }, [userId]);

  const cerrarBannerStrava = async () => {
    setBannerStravaVisible(false);
    await AsyncStorage.setItem('banner_strava_visto', 'true');
  };

  const abrirTutorialStrava = async () => {
    setBannerStravaVisible(false);
    await AsyncStorage.setItem('banner_strava_visto', 'true');
    setModalStravaInfoVisible(true);
  };

  const verificarStrava = async () => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from('users')
        .select('strava_token, strava_habilitado')
        .eq('id', userId)
        .single();
      setStravaConectado(!!data?.strava_token);
      setStravaHabilitado(!!data?.strava_habilitado);
    } catch (e) {}
  };

  const cargarProgreso = async () => {
    if (!userId) return;
    try {
      setCargando(true);
      setError(false);
      // Solo sincronizar Strava si está conectado
      if (stravaConectado) {
        await fetch(`${BACKEND_URL}/strava/actividades/${userId}`);
      }
      const res = await fetch(`${BACKEND_URL}/strava/progreso/${userId}`);
      const data = await res.json();
      const lista = Array.isArray(data) ? data : [];
      setChallenges(lista);
      const activos = lista.filter(c => !c.pending);
      const sinKm = activos.some(c => parseFloat(c.km_completados || 0) === 0);
      // FIX: solo mostrar si no fue cerrado manualmente
      if (sinKm && !bannerCerrado) setBannerVisible(true);
      const reto100 = lista.find(c => parseFloat(c.porcentaje || 0) >= 100 && !c.pending);
      if (reto100) {
        const visto = await AsyncStorage.getItem(`completado_visto_${reto100.challenge_id}`);
        if (!visto) {
          // Marcar como visto inmediatamente para evitar loops de crash
          await AsyncStorage.setItem(`completado_visto_${reto100.challenge_id}`, 'true');
          setCompletado(reto100.challenge || reto100.challenge_title || 'tu desafío');
        }
      }

      const visibles = {};
      for (const c of activos) {
        if (parseFloat(c.km_completados || 0) === 0 && !c.meta_fecha) {
          const yaVisto = await AsyncStorage.getItem(`meta_preguntada_${c.challenge_id}`);
          if (!yaVisto) visibles[c.challenge_id] = true;
        }
      }
      setMetaVisibles(visibles);

      // Mostrar banner si tiene un reto completado pero sin dirección
      const tieneCompletado = lista.some(c => parseFloat(c.porcentaje || 0) >= 100 && !c.pending);
      if (tieneCompletado && userId) {
        try {
          const resUser = await fetch(`${BACKEND_URL}/perfil/${userId}`);
          if (resUser.ok) {
            const dataUser = await resUser.json();
            if (!dataUser?.usuario?.shipping_address) {
              setBannerDireccionVisible(true);
            }
          }
        } catch (e) {} // Si falla, no mostramos el banner para no confundir
      }
    } catch (err) {
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  const cerrarBanner = () => {
    setBannerVisible(false);
    setBannerCerrado(true); // FIX: marcar como cerrado para que no vuelva
  };

  const saltarMeta = async (challengeId) => {
    await AsyncStorage.setItem(`meta_preguntada_${challengeId}`, 'true');
    setMetaVisibles(prev => ({ ...prev, [challengeId]: false }));
  };

  const guardarMeta = async (item) => {
    const input = metaInputs[item.challenge_id] || '';
    if (!input) { saltarMeta(item.challenge_id); return; }
    const partes = input.split('/');
    if (partes.length !== 3) { Alert.alert('Formato inválido', 'Usá DD/MM/AAAA'); return; }
    const [dia, mes, anio] = partes.map(Number);
    const fecha = new Date(anio, mes - 1, dia, 12, 0, 0);
    if (isNaN(fecha.getTime())) { Alert.alert('Fecha inválida'); return; }
    if (fecha <= new Date()) { Alert.alert('La fecha debe ser futura'); return; }
    setGuardandoMeta(prev => ({ ...prev, [item.challenge_id]: true }));
    try {
      await supabase.from('user_challenges').update({ meta_fecha: fecha.toISOString() })
        .eq('user_id', userId).eq('challenge_id', item.challenge_id);
      await AsyncStorage.setItem(`meta_preguntada_${item.challenge_id}`, 'true');
      setMetaVisibles(prev => ({ ...prev, [item.challenge_id]: false }));
      Alert.alert('✅ Meta guardada', `Tu objetivo es el ${input}.`);
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar la meta.');
    } finally {
      setGuardandoMeta(prev => ({ ...prev, [item.challenge_id]: false }));
    }
  };

  const togglePausar = async (challengeId, pausado) => {
    try {
      const endpoint = pausado ? 'reanudar' : 'pausar';
      await fetch(`${BACKEND_URL}/challenges/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, challenge_id: challengeId }),
      });
      cargarProgreso();
    } catch (e) {
      Alert.alert('Error', 'No se pudo cambiar el estado del desafío.');
    }
  };

  const descargarBib = async (tipo, challengeId) => {
    setCargandoBib(tipo);
    try {
      const fetchUrl = challengeId 
        ? `${BACKEND_URL}/usuarios/bib/${userId}?challenge_id=${challengeId}`
        : `${BACKEND_URL}/usuarios/bib/${userId}`;
      const res = await fetch(fetchUrl);
      const data = await res.json();
      if (data.error) { Alert.alert('Error', data.error); return; }
      const url = tipo === 'dorsal' ? data.dorsal_url : data.postal_url;
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir el archivo.');
    } finally {
      setCargandoBib(false);
    }
  };

  const conectarStrava = async () => {
    if (stravaConectado) {
      setModalStravaVisible(true);
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/strava-cupo?userId=${userId}`);
      const data = await res.json();
      if (data.disponible) {
        setModalStravaInfoVisible(true);
      } else if (data.motivo === 'sin_reto') {
        Alert.alert(
          '🔗 Strava disponible',
          'La sincronización con Strava está disponible para atletas con un desafío activo. ¡Inscribite en un desafío desde el Catálogo para conectarla! 🏅'
        );
      } else {
        setModalStravaProximamente(true);
      }
    } catch (e) {
      setModalStravaProximamente(true);
    }
  };

  const cancelarPending = async (challengeId) => {
    try {
      await supabase
        .from('user_challenges')
        .delete()
        .eq('user_id', userId)
        .eq('challenge_id', challengeId)
        .eq('status', 'pending');
      setChallenges(prev => prev.filter(c => !(c.challenge_id === challengeId && c.pending)));
    } catch (e) {
      console.error('Error cancelando pending:', e);
    }
  };

  const conectarStravaConfirmado = () => {
    setModalStravaInfoVisible(false);
    conectarStravaReal();
  };

  const conectarStravaReal = async () => {
    setModalStravaProximamente(false);
    const result = await WebBrowser.openAuthSessionAsync(
      `${BACKEND_URL}/strava/auth?userId=${userId}`,
      'korva://strava-connected'
    );
    if (result.type === 'success' || result.url?.includes('strava-connected')) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await verificarStrava();
      await cargarProgreso();
      await new Promise(resolve => setTimeout(resolve, 1500));
      await verificarStrava();
      setModalStravaVisible(true);
    }
  };

  const [modalCompartirItem, setModalCompartirItem] = useState(null);
  const shareCardRef = useRef(null);

  const compartirProgreso = async (index) => {
    setModalCompartirItem(challengesActivos[index]);
  };

  const ejecutarCompartir = async () => {
    try {
      const uri = await shareCardRef.current.capture();
      setModalCompartirItem(null);
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '¡Compartí tu progreso en Korva!' });
    } catch (err) {
      console.error('Error compartiendo:', err);
    }
  };

  if (mostrarTutorial) {
    return <TutorialScreen onTerminar={() => setMostrarTutorial(false)} />;
  }

  if (completado) {
    return (
      <CompletadoScreen
        challenge={completado}
        userId={userId}
        onVolver={async () => {
          const reto100 = challenges.find(c => parseFloat(c.porcentaje || 0) >= 100 && !c.pending);
          if (reto100) await AsyncStorage.setItem(`completado_visto_${reto100.challenge_id}`, 'true');
          setCompletado(null);
        }}
      />
    );
  }

  const challengesPending = challenges.filter(c => c.pending);
  const challengesEnCurso = challenges
    .filter(c => !c.pending && parseFloat(c.porcentaje || 0) < 100 && !['completed','shipped','cargado'].includes(c.status))
    .sort((a, b) => parseFloat(b.porcentaje || 0) - parseFloat(a.porcentaje || 0)); // Más cerca de completar primero
  const challengesCompletados = challenges.filter(c => !c.pending && (parseFloat(c.porcentaje || 0) >= 100 || ['completed','shipped','cargado'].includes(c.status)));
  const challengesActivos = challenges.filter(c => !c.pending);

  const scrollRef = useRef(null);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Banner dirección — para completados sin dirección */}
      {bannerDireccionVisible && (
        <View style={[styles.bannerStrava, { borderLeftColor: '#FC4C02', backgroundColor: '#1A0D00' }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerStravaTitulo}>📦 ¡Cargá tu dirección!</Text>
            <Text style={styles.bannerStravaDesc}>Completaste tu desafío pero falta tu dirección de envío. Cargala en el Perfil para que podamos enviarte tu medalla.</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Perfil')}>
              <Text style={styles.bannerStravaBtn}>Ir al Perfil →</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setBannerDireccionVisible(false)} style={{ padding: 4 }}>
            <Text style={{ color: '#4a6a8a', fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Banner Strava — aparece una sola vez para activos sin Strava */}
      {bannerStravaVisible && !stravaConectado && (
        <View style={styles.bannerStrava}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerStravaTitulo}>🔗 ¡Strava ya está disponible!</Text>
            <Text style={styles.bannerStravaDesc}>Conectá tu cuenta y cada actividad que registres en Strava se carga automáticamente a tu desafío.</Text>
            <TouchableOpacity onPress={abrirTutorialStrava}>
              <Text style={styles.bannerStravaBtn}>Ver cómo conectarla →</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={cerrarBannerStrava} style={{ padding: 4 }}>
            <Text style={{ color: '#4a6a8a', fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal FAQ / Ayuda */}
      <Modal visible={modalAyudaVisible} transparent animationType="slide" onRequestClose={() => setModalAyudaVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={styles.modalTitulo}>❓ Ayuda</Text>
              <TouchableOpacity onPress={() => setModalAyudaVisible(false)}>
                <Text style={{ color: '#4a6a8a', fontSize: 18, fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                { q: '¿Cómo funciona Korva?', a: 'Elegís un desafío en el Catálogo y lo comprás. Una vez confirmado el pago, el desafío se activa en la app. Registrás tus km corriendo o pedaleando en el mundo real, y cuando completás la distancia total se inicia automáticamente la orden de envío de tu medalla.' },
                { q: '¿Necesito completar el desafío de una sola vez?', a: 'No. Podés salir a correr o pedalear cuando quieras — salidas cortas, largas, a tu ritmo. Los km se van acumulando hasta completar la distancia total del desafío.' },
                { q: '¿Puedo mezclar actividades?', a: 'Sí. Si elegiste Running podés sumar km corriendo, caminando, trotando o incluso en bicicleta — todo se acumula hacia tu meta. La modalidad que elegís define la distancia del desafío, no el tipo de actividad que podés registrar.' },
                { q: '¿Cómo registro mis kilómetros?', a: 'Desde la pestaña "Registrar" cargás tus km manualmente en segundos. La integración con Strava para sincronización automática estará disponible próximamente.' },
                { q: '¿Cómo cargo mi dirección de envío?', a: 'Desde la pestaña "Perfil", sección "Dirección de envío". Asegurate de tenerla cargada antes de completar el desafío para que el envío salga sin demoras.' },
                { q: '¿Cuándo llega mi medalla?', a: 'Cuando completás el 100% del desafío se inicia la orden de envío automáticamente. Los tiempos varían según tu país — podés consultar los tiempos estimados en korva.run.' },
                { q: '¿Qué son los logros?', a: 'Los logros son badges gratuitos que ganás por tu actividad — km recorridos, rachas de días activos, cantidad de salidas y más. Se acumulan siempre, tengas o no un desafío activo.' },
                { q: '¿Puedo usar la app sin comprar un desafío?', a: 'Sí. Podés registrar actividades y acumular logros sin costo. Los desafíos son para quienes quieren una meta con medalla física incluida.' },
                { q: '¿Puedo cambiar mi modalidad?', a: 'Sí, desde "Mis retos activos" en el Perfil podés cambiar entre Running y Ciclismo cuando quieras.' },
                { q: '¿Puedo tener varios desafíos a la vez?', a: 'Sí. Podés inscribirte en más de un desafío al mismo tiempo — cada uno tiene su propio progreso y se completan de forma independiente. En la app vas a ver una pestaña para cada desafío activo.' },
                { q: '¿Mis datos están seguros?', a: 'Sí. Solo vos podés ver tu perfil, dirección y actividades. No compartimos tu información con terceros.' },
                { q: '¿Necesito Strava?', a: 'No. El registro manual es suficiente para sumar tus km. Strava estará disponible próximamente como opción de sincronización automática.' },
                { q: '¿Tengo un problema o consulta?', a: 'Escribinos a korvaventura@gmail.com o por Instagram @korva.aventuras. Te respondemos a la brevedad.' },
              ].map((item, i) => (
                <TouchableOpacity key={i} style={styles.faqItem} onPress={() => setFaqAbierta(faqAbierta === i ? null : i)}>
                  <View style={styles.faqHeader}>
                    <Text style={styles.faqPregunta}>{item.q}</Text>
                    <Text style={styles.faqChevron}>{faqAbierta === i ? '▲' : '▼'}</Text>
                  </View>
                  {faqAbierta === i && <Text style={styles.faqRespuesta}>{item.a}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Próximamente Strava */}
      {/* Modal Compartir Progreso */}
      <Modal visible={!!modalCompartirItem} transparent animationType="fade" onRequestClose={() => setModalCompartirItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={{ width: '100%', alignItems: 'center' }}>
            {modalCompartirItem && (
              <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1 }}>
                <View style={styles.storyCard}>
                  <View style={styles.storyHeader}>
                    <Text style={styles.storyLogo}>🏅 KORVA</Text>
                    <Text style={styles.storyTagline}>AVENTURAS</Text>
                  </View>
                  <View style={styles.storyPctWrapper}>
                    <Text style={styles.storyPctNumero}>{Math.min(parseFloat(modalCompartirItem.porcentaje || 0), 100).toFixed(0)}</Text>
                    <Text style={styles.storyPctSymbol}>%</Text>
                  </View>
                  <Text style={styles.storyChallenge}>{modalCompartirItem.challenge || '—'}</Text>
                  <View style={styles.storyBar}>
                    <View style={[styles.storyBarFill, { width: `${Math.min(parseFloat(modalCompartirItem.porcentaje || 0), 100)}%` }]} />
                  </View>
                  <Text style={styles.storyKm}>{modalCompartirItem.km_completados} km completados</Text>
                  <View style={styles.storyFooter}>
                    <Text style={styles.storyNombre}>{nombre}</Text>
                    <Text style={styles.storyUrl}>korva.run</Text>
                  </View>
                </View>
              </ViewShot>
            )}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity style={[styles.modalBtn, { flex: 1, backgroundColor: '#1E3A5F' }]} onPress={() => setModalCompartirItem(null)}>
                <Text style={[styles.modalBtnText, { color: '#A8CFFF' }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { flex: 1 }]} onPress={ejecutarCompartir}>
                <Text style={styles.modalBtnText}>📤 Compartir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Strava Info — Qué es Strava y cómo conectarlo */}
      <Modal visible={modalStravaInfoVisible} transparent animationType="fade" onRequestClose={() => setModalStravaInfoVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <View style={styles.modalCard}>
              <Text style={styles.modalEmoji}>🏃</Text>
              <Text style={styles.modalTitulo}>Conectá Strava con Korva</Text>
              <Text style={styles.modalSubtitulo}>Strava es una app gratuita para registrar entrenamientos. Cada actividad que registres en Strava se carga automáticamente a tu desafío Korva.</Text>
              <View style={styles.modalPaso}>
                <Text style={styles.modalPasoEmoji}>📱</Text>
                <View style={styles.modalPasoInfo}>
                  <Text style={styles.modalPasoTitulo}>¿No tenés Strava?</Text>
                  <Text style={styles.modalPasoDesc}>Descargala gratis en Google Play o App Store. Registrá tus salidas con el GPS del teléfono y listo.</Text>
                </View>
              </View>
              <View style={styles.modalPaso}>
                <Text style={styles.modalPasoEmoji}>🔗</Text>
                <View style={styles.modalPasoInfo}>
                  <Text style={styles.modalPasoTitulo}>¿Cómo funciona la sincronización?</Text>
                  <Text style={styles.modalPasoDesc}>Conectás tu cuenta de Strava una sola vez. Cada actividad que hagas en Strava se importa sola a Korva y suma al progreso de tu desafío.</Text>
                </View>
              </View>
              <View style={styles.modalPaso}>
                <Text style={styles.modalPasoEmoji}>✅</Text>
                <View style={styles.modalPasoInfo}>
                  <Text style={styles.modalPasoTitulo}>Solo para atletas activos</Text>
                  <Text style={styles.modalPasoDesc}>Necesitás tener un desafío activo para conectar Strava — que ya tenés 🎉</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.modalBtn} onPress={conectarStravaConfirmado}>
                <Text style={styles.modalBtnText}>Conectar Strava 🔗</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 12 }} onPress={() => setModalStravaInfoVisible(false)}>
                <Text style={{ color: '#4a6a8a', fontSize: 14 }}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={modalStravaProximamente} transparent animationType="fade" onRequestClose={() => setModalStravaProximamente(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🔗</Text>
            <Text style={styles.modalTitulo}>Strava — En proceso</Text>
            <Text style={styles.modalSubtitulo}>Ya solicitamos ampliar el acceso a Strava. Mientras tanto podés seguir sumando km normalmente.</Text>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>⚙️</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Límite temporal de Strava</Text>
                <Text style={styles.modalPasoDesc}>Strava limita la cantidad de usuarios por app en fase de revisión. Ya solicitamos ampliar el cupo — es un trámite de Strava, no un problema de Korva.</Text>
              </View>
            </View>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>📝</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Registrá tus km manualmente mientras tanto</Text>
                <Text style={styles.modalPasoDesc}>Desde la pestaña "Registrar" cargás tus km en segundos. Tus medallas y logros se acumulan igual.</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setModalStravaProximamente(false)}>
              <Text style={styles.modalBtnText}>Entendido 👍</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Strava conectado */}
      <Modal visible={modalStravaVisible} transparent animationType="fade" onRequestClose={() => setModalStravaVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🎉</Text>
            <Text style={styles.modalTitulo}>¡Strava conectado!</Text>
            <Text style={styles.modalSubtitulo}>Así funciona de ahora en adelante:</Text>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>🏃</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Salí a correr y registrá tu actividad en Strava</Text>
                <Text style={styles.modalPasoDesc}>Usá Strava normalmente para trackear tu entrenamiento — ya sabemos que lo tenés 😉</Text>
              </View>
            </View>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>✅</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Tus km aparecen solos acá</Text>
                <Text style={styles.modalPasoDesc}>Cada actividad que registres en Strava se suma automáticamente a tu desafío</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setModalStravaVisible(false)}>
              <Text style={styles.modalBtnText}>¡Entendido, a correr! 🚀</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.saludo}>Hola{nombre ? `, ${nombre}` : ''}! 👋</Text>
          <Text style={styles.subtitulo}>Tus retos activos</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity style={styles.ayudaBtn} onPress={() => setModalAyudaVisible(true)}>
            <Text style={styles.ayudaBtnText}>?</Text>
          </TouchableOpacity>
          {stravaConectado ? (
            <TouchableOpacity style={styles.stravaConectadoBadge} onPress={() => setModalStravaVisible(true)}>
              <Text style={styles.stravaConectadoBadgeText}>✓ Strava</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stravaProximoBtn} onPress={conectarStrava}>
              <Text style={styles.stravaProximoBtnText}>🔗 Strava</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Banner pago — FIX: usa cerrarBanner() */}
      {bannerVisible && !cargando && (
        <View style={styles.bannerCard}>
          <View style={styles.bannerHeader}>
            <Text style={styles.bannerTitulo}>🎉 Pago confirmado!</Text>
            <TouchableOpacity onPress={cerrarBanner} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.bannerCerrar}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.bannerSubtitulo}>Tu reto está activo. Seguí estos pasos:</Text>
          {PASOS.map((paso, i) => (
            <View key={i} style={styles.pasoRow}>
              <Text style={styles.pasoEmoji}>{paso.emoji}</Text>
              <View style={styles.pasoInfo}>
                <Text style={styles.pasoTitulo}>{paso.titulo}</Text>
                <Text style={styles.pasoDesc}>{paso.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Strava activo — FIX: con botón X para cerrar */}
      {stravaConectado && !cargando && !stravaBannerCerrado && (
        <View style={styles.stravaActivoCard}>
          <TouchableOpacity style={styles.stravaActivoRow} onPress={() => setModalStravaVisible(true)}>
            <Text style={styles.stravaActivoEmoji}>🟢</Text>
            <View style={styles.stravaActivoInfo}>
              <Text style={styles.stravaActivoTitulo}>Strava activo</Text>
              <Text style={styles.stravaActivoDesc}>Tus actividades se sincronizan automáticamente · Tocá para ver cómo</Text>
            </View>
            <Ionicons name="information-circle-outline" size={20} color="#A8CFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.stravaActivoCerrar}
            onPress={() => setStravaBannerCerrado(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.stravaActivoCerrarText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorEmoji}>📡</Text>
          <Text style={styles.errorTitulo}>Sin conexión</Text>
          <Text style={styles.errorSubtitulo}>No pudimos cargar tu progreso. Revisá tu conexión a internet.</Text>
          <TouchableOpacity style={styles.reintentarBtn} onPress={cargarProgreso}>
            <Text style={styles.reintentarText}>↻ Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Pending */}
          {challengesPending.map((item, index) => (
            <View key={`pending-${index}`} style={styles.pendingCard}>
              <Text style={styles.pendingEmoji}>⏳</Text>
              <View style={styles.pendingInfo}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={[styles.pendingTitulo, { flex: 1 }]}>{item.challenge || '—'}</Text>
                  <TouchableOpacity
                    onPress={() => cancelarPending(item.challenge_id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ backgroundColor: '#2a1a1a', borderRadius: 8, padding: 6, marginLeft: 8 }}
                  >
                    <Text style={{ color: '#FC4C02', fontWeight: 'bold', fontSize: 12 }}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.pendingModalidad}>{item.modalidad}</Text>
                <Text style={styles.pendingTexto}>Esperando confirmación de pago. Si ya pagaste, puede demorar unos minutos.</Text>
                {item.link_shopify && (
                  <TouchableOpacity style={styles.pendingBtn} onPress={() => Linking.openURL(item.link_shopify)}>
                    <Text style={styles.pendingBtnText}>¿Ya pagaste o no llegaste a pagar? Reintentar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}

          {challengesActivos.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🏃</Text>
              <Text style={styles.emptyText}>¡Empezá a moverte!</Text>
              <Text style={styles.emptySubtext}>Registrá tus km y acumulá logros gratis — no necesitás un challenge activo para empezar.</Text>
              <View style={styles.emptyLogrosRow}>
                <Text style={styles.emptyLogroItem}>👟 Distancia</Text>
                <Text style={styles.emptyLogroItem}>🔥 Rachas</Text>
                <Text style={styles.emptyLogroItem}>⚡ Actividades</Text>
              </View>
              {challengesPending.length === 0 && (
                <>
                  <Text style={styles.emptySubtext}>Cuando quieras una medalla real, encontrá tu challenge acá:</Text>
                  <TouchableOpacity style={styles.irCatalogoBtn} onPress={() => navigation.navigate('Catalogo')}>
                    <View style={styles.btnRow}>
                      <Text style={styles.irCatalogoBtnText}>Ver Catálogo</Text>
                      <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : (
            // FIX: selector siempre visible, aunque sea un solo reto
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.retoTabsScroll}>
                {challengesActivos.map((item, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.retoTab, i === retoActivoIndex && styles.retoTabActivo]}
                    onPress={() => setRetoActivoIndex(i)}
                  >
                    <Text style={[styles.retoTabText, i === retoActivoIndex && styles.retoTabTextActivo]}>
                      {item.challenge}
                    </Text>
                    {parseFloat(item.porcentaje || 0) >= 100 && <Text style={styles.retoTabBadge}>🏅</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <RetoCard
                item={challengesActivos[retoActivoIndex]}
                index={retoActivoIndex}
                nombre={nombre}
                userId={userId}
                navigation={navigation}
                metaVisibles={metaVisibles}
                metaInputs={metaInputs}
                setMetaInputs={setMetaInputs}
                guardandoMeta={guardandoMeta}
                guardarMeta={guardarMeta}
                saltarMeta={saltarMeta}
                compartirProgreso={compartirProgreso}
                viewShotRefs={viewShotRefs}
                onModalidadPress={() => setModalModalidadVisible(true)}
                scrollRef={scrollRef}
                descargarBib={descargarBib}
                togglePausar={togglePausar}
                cargandoBib={cargandoBib}
              />
            </>
          )}
        </>
      )}

      {/* Modo libre — sin reto activo */}
      {modoLibre && (
        <View style={{ margin: 20 }}>
          <View style={styles.modolLibreBanner}>
            <Text style={styles.modoLibreEmoji}>🏃</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.modoLibreTitulo}>Modo libre</Text>
              <Text style={styles.modoLibreDesc}>Estás registrando actividades sin un desafío activo. Los km se guardan en tu historial pero no cuentan para ningún reto.</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Catalogo')}>
                <Text style={styles.modoLibreBtn}>Inscribite en un desafío →</Text>
              </TouchableOpacity>
            </View>
          </View>
          {actividadesLibres.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={[styles.seccionTitulo, { marginBottom: 12 }]}>Actividades recientes</Text>
              {actividadesLibres.slice(0, 5).map((a, i) => (
                <View key={i} style={styles.actividadLibreCard}>
                  <Text style={{ color: '#A8CFFF', fontSize: 13 }}>{a.sport_type === 'run' ? '🏃' : '🚴'} {parseFloat(a.distance_km).toFixed(1)} km</Text>
                  <Text style={{ color: '#4a6a8a', fontSize: 12 }}>{new Date(a.recorded_at).toLocaleDateString('es-AR')}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Retos completados — solo lectura */}
      {!error && challengesCompletados.length > 0 && (
        <View style={{ marginTop: 8, marginBottom: 8 }}>
          <Text style={[styles.seccionTitulo, { marginHorizontal: 20, marginBottom: 12 }]}>🏅 Completados</Text>
          {challengesCompletados.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={styles.completadoCard}
              onPress={() => navigation.navigate('DetalleReto', { item, userId })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.completadoChallenge}>{item.challenge || item.challenge_title || '—'}</Text>
                <Text style={styles.completadoKm}>{parseFloat(item.km_completados || 0).toFixed(1)} km · {item.modalidad || 'run'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={styles.completadoBadge}>{item.status === 'shipped' || item.status === 'cargado' ? '📦 Enviado' : '🏅 Completado'}</Text>
                <Text style={{ color: '#1E6FD9', fontSize: 12 }}>Ver historia →</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!error && (
        <TouchableOpacity style={styles.actualizarBtn} onPress={cargarProgreso}>
          <Text style={styles.actualizarBtnText}>↻ Actualizar progreso</Text>
        </TouchableOpacity>
      )}

      {/* Modal info modalidad */}
      <Modal visible={modalModalidadVisible} transparent animationType="fade" onRequestClose={() => setModalModalidadVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🏃</Text>
            <Text style={styles.modalTitulo}>Tu modalidad activa</Text>
            <Text style={styles.modalSubtitulo}>Así funciona el sistema de modalidades en Korva:</Text>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>✅</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Todo suma hacia tu meta</Text>
                <Text style={styles.modalPasoDesc}>Dentro de tu modalidad podés registrar cualquier actividad — correr, caminar o andar en bici. Todo se acumula hacia tu distancia total.</Text>
              </View>
            </View>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>🔄</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>¿Querés cambiar de modalidad?</Text>
                <Text style={styles.modalPasoDesc}>Podés cambiar entre Running y Ciclismo desde la pestaña Perfil → Mis retos activos.</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setModalModalidadVisible(false)}>
              <Text style={styles.modalBtnText}>Entendido 👍</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <StatusBar style="light" />
    </ScrollView>
  );
}

// ─── Componente reto individual ──────────────────────────────────
function RetoCard({ item, index, nombre, userId, navigation, metaVisibles, metaInputs, setMetaInputs, guardandoMeta, guardarMeta, saltarMeta, compartirProgreso, viewShotRefs, onModalidadPress, scrollRef, descargarBib, cargandoBib, togglePausar }) {
  const challengeId = item.challenge_id;
  const estaPausado = item.pausado || false;
  if (!item) return null;
  const pct = Math.min(parseFloat(item.porcentaje || 0), 100);
  const estaCompletado = pct >= 100;
  const frase = getFrase(pct);
  const mostrarCardMeta = metaVisibles[item.challenge_id];
  const metaFormateada = formatearFechaMeta(item.meta_fecha);
  const bordeCard = estaCompletado ? '#FC4C02' : pct >= 75 ? '#FC4C02' : '#1E3A5F';
  const modalidadLabel = item.modalidad === 'Running' ? '🏃 RUNNING'
    : item.modalidad === 'Ciclismo' ? '🚴 CICLISMO'
    : '🏊 NATACIÓN';

  return (
    <View>
      <ViewShot
        ref={ref => viewShotRefs.current[index] = ref}
        options={{ format: 'png', quality: 1 }}
      >
        <View style={[styles.shareCard, { borderColor: bordeCard }]}>
          {/* FIX: header rediseñado — sin colores que parezcan botones */}
          <View style={styles.shareHeader}>
            <Text style={styles.shareKorvaLogo}>🏅 KORVA</Text>
            <TouchableOpacity onPress={onModalidadPress}>
              <Text style={[styles.shareDeporte, { opacity: 1, color: '#1E6FD9' }]}>{modalidadLabel}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.sharePctWrapper}>
            <Text style={styles.sharePctNumero}>{pct.toFixed(0)}</Text>
            <Text style={styles.sharePctSymbol}>%</Text>
          </View>
          <Text style={styles.shareChallengeName}>{item.challenge || '—'}</Text>
          <Text style={styles.shareFrase}>{frase}</Text>
          <View style={styles.shareProgressBar}>
            <View style={[styles.shareProgressFill, { width: `${pct}%` }, estaCompletado && styles.shareProgressFillCompletado]} />
          </View>
          <View style={styles.shareKmRow}>
            <Text style={styles.shareKmText}>{item.km_completados} km</Text>
            <Text style={styles.shareKmTotal}>· {getSubtitulo(item.challenge || '')}</Text>
            {estaCompletado && <Text style={styles.shareCompletadoBadge}>🏅</Text>}
          </View>
          {metaFormateada && <Text style={styles.shareMetaText}>🎯 Meta: {metaFormateada}</Text>}
          <View style={styles.shareFooter}>
            <Text style={styles.shareNombre}>{nombre}</Text>
            <Text style={styles.shareUrl}>korva.run</Text>
          </View>
        </View>
      </ViewShot>

      <MapaRecorrido
        kmCompletados={item.km_completados}
        distanciaTotal={item.distancia_total}
        porcentaje={item.porcentaje}
        checkpointsData={item.checkpoints}
        challengeId={item.challenge_id}
        challengeTitle={item.challenge || ''}
      />

      {mostrarCardMeta && (
        <View style={styles.metaCard}>
          <Text style={styles.metaCardTitulo}>🎯 ¿Cuándo querés terminar?</Text>
          <Text style={styles.metaCardSubtitulo}>Opcional — te ayuda a planificar tu entrenamiento</Text>
          <View style={styles.metaInputRow}>
            <TextInput
              style={styles.metaInput}
              value={metaInputs[item.challenge_id] || ''}
              onChangeText={v => setMetaInputs(prev => ({ ...prev, [item.challenge_id]: aplicarMascaraFecha(v) }))}
              placeholder="DD/MM/AAAA"
              placeholderTextColor="#4a6a8a"
              keyboardType="number-pad"
              maxLength={10}
              onFocus={() => {
                setTimeout(() => {
                  scrollRef?.current?.scrollToEnd({ animated: true });
                }, 500);
              }}
            />
            <TouchableOpacity
              style={styles.metaGuardarBtn}
              onPress={() => guardarMeta(item)}
              disabled={guardandoMeta[item.challenge_id]}
            >
              {guardandoMeta[item.challenge_id]
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.metaGuardarBtnText}>Guardar</Text>
              }
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => saltarMeta(item.challenge_id)} style={styles.metaSaltarBtn}>
            <Text style={styles.metaSaltarText}>Saltar por ahora</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.detalleBtn} onPress={() => navigation.navigate('DetalleReto', { item, userId })}>
        <View style={styles.btnRow}>
          <Text style={styles.detalleBtnText}>📖 Ver mi historia completa</Text>
          <Ionicons name="arrow-forward" size={14} color="#1E6FD9" />
        </View>
      </TouchableOpacity>

      <View style={styles.bibRow}>
        <TouchableOpacity
          style={[styles.bibBtn, { backgroundColor: estaPausado ? '#1a4a1a' : '#1E3A5F', borderColor: estaPausado ? '#22C55E' : '#2a5a8a' }]}
          onPress={() => togglePausar(challengeId, estaPausado)}
        >
          <Text style={styles.bibBtnText}>{estaPausado ? '▶️ Reanudar' : '⏸ Pausar'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bibBtn} onPress={() => descargarBib('dorsal', challengeId)} disabled={!!cargandoBib}>
          {cargandoBib === 'dorsal' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.bibBtnText}>📄 Mi dorsal</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.bibBtn, styles.bibBtnSecundario]} onPress={() => descargarBib('postal', challengeId)} disabled={!!cargandoBib}>
          {cargandoBib === 'postal' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={[styles.bibBtnText, { color: '#A8CFFF' }]}>🖼️ Mi postal</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.compartirBtn} onPress={() => compartirProgreso(index)}>
        <Text style={styles.compartirBtnText}>📤 Compartir progreso</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  saludo: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  subtitulo: { fontSize: 13, color: '#A8CFFF' },
  bannerStrava: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0D2A1A',
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#FC4C02',
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  bannerStravaTitulo: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  bannerStravaDesc: {
    color: '#A8CFFF',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  bannerStravaBtn: {
    color: '#FC4C02',
    fontSize: 13,
    fontWeight: 'bold',
  },
  stravaProximoBtn: { backgroundColor: '#1E3A5F', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2a4a6a' },
  stravaProximoBtnText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 13 },
  stravaBtn: { backgroundColor: '#FC4C02', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  stravaBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  stravaConectadoBadge: { backgroundColor: '#1a3a1a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2a6a2a' },
  stravaConectadoBadgeText: { color: '#4CAF50', fontWeight: 'bold', fontSize: 13 },
  // FIX: stravaActivoCard con posición relativa para el botón X
  stravaActivoCard: { backgroundColor: '#1E3A5F', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#4CAF50', position: 'relative' },
  stravaActivoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 24 },
  stravaActivoEmoji: { fontSize: 20 },
  stravaActivoInfo: { flex: 1 },
  stravaActivoTitulo: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  stravaActivoDesc: { fontSize: 11, color: '#A8CFFF' },
  stravaActivoCerrar: { position: 'absolute', top: 10, right: 12 },
  stravaActivoCerrarText: { color: '#4a6a8a', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#1E3A5F', borderRadius: 24, padding: 28, width: '100%', borderWidth: 1, borderColor: '#FC4C02' },
  modalEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center', marginBottom: 6 },
  modalSubtitulo: { fontSize: 13, color: '#A8CFFF', textAlign: 'center', marginBottom: 24 },
  modalPaso: { flexDirection: 'row', gap: 14, marginBottom: 18, alignItems: 'flex-start' },
  modalPasoEmoji: { fontSize: 24, width: 32 },
  modalPasoInfo: { flex: 1 },
  modalPasoTitulo: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 3 },
  modalPasoDesc: { fontSize: 12, color: '#A8CFFF', lineHeight: 18 },
  modalBtn: { backgroundColor: '#FC4C02', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  modalBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  bannerCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#1E6FD9' },
  bannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bannerTitulo: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  bannerCerrar: { fontSize: 18, color: '#A8CFFF', paddingHorizontal: 4, paddingVertical: 2 },
  bannerSubtitulo: { fontSize: 13, color: '#A8CFFF', marginBottom: 16 },
  pasoRow: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  pasoEmoji: { fontSize: 20, width: 28 },
  pasoInfo: { flex: 1 },
  pasoTitulo: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  pasoDesc: { fontSize: 12, color: '#A8CFFF' },
  bannerBtn: { backgroundColor: '#1E6FD9', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  bannerBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 40, alignItems: 'center', marginTop: 20, borderWidth: 1, borderColor: '#2a3a4a' },
  errorEmoji: { fontSize: 48, marginBottom: 16 },
  errorTitulo: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  errorSubtitulo: { fontSize: 14, color: '#A8CFFF', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  reintentarBtn: { backgroundColor: '#1E6FD9', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12 },
  reintentarText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  pendingCard: { backgroundColor: '#1E2A1A', borderRadius: 16, padding: 18, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 14, borderWidth: 1, borderColor: '#2a4a2a' },
  pendingEmoji: { fontSize: 28 },
  pendingInfo: { flex: 1 },
  pendingTitulo: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  pendingModalidad: { fontSize: 12, color: '#A8CFFF', marginBottom: 6 },
  pendingTexto: { fontSize: 12, color: '#6a8a6a', lineHeight: 18 },
  pendingBtn: { marginTop: 10, backgroundColor: '#1E6FD9', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  pendingBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  ayudaBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1E3A5F', borderWidth: 1, borderColor: '#2a4a6a', alignItems: 'center', justifyContent: 'center' },
  ayudaBtnText: { color: '#A8CFFF', fontWeight: 'bold', fontSize: 15 },
  faqItem: { borderBottomWidth: 1, borderBottomColor: '#2a4a6a', paddingVertical: 14 },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  faqPregunta: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', flex: 1, paddingRight: 12 },
  faqChevron: { color: '#4a6a8a', fontSize: 12 },
  faqRespuesta: { fontSize: 13, color: '#A8CFFF', lineHeight: 20, marginTop: 10 },
  emptyLogrosRow: { flexDirection: 'row', gap: 8, marginVertical: 16, flexWrap: 'wrap', justifyContent: 'center' },
  emptyLogroItem: { backgroundColor: '#1E3A5F', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, fontSize: 12, color: '#A8CFFF', fontWeight: 'bold' },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 32, alignItems: 'center', marginTop: 20, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#A8CFFF', textAlign: 'center', lineHeight: 20 },
  irCatalogoBtn: { backgroundColor: '#FC4C02', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 12 },
  irCatalogoBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  retoTabsScroll: { marginBottom: 16 },
  retoTab: { backgroundColor: '#1E3A5F', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginRight: 8, borderWidth: 2, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 },
  retoTabActivo: { borderColor: '#FC4C02' },
  retoTabText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 13 },
  retoTabTextActivo: { color: '#FFFFFF' },
  retoTabBadge: { fontSize: 13 },
  shareCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 24, marginBottom: 8, borderWidth: 2 },
  shareHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  // FIX: KORVA y modalidad como texto plano, sin colores de botón
  shareKorvaLogo: { fontSize: 12, fontWeight: 'bold', color: '#A8CFFF', letterSpacing: 2, opacity: 0.7 },
  shareDeporte: { fontSize: 11, fontWeight: '600', color: '#A8CFFF', letterSpacing: 1, opacity: 0.7 },
  sharePctWrapper: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  sharePctNumero: { fontSize: 72, fontWeight: 'bold', color: '#FFFFFF', lineHeight: 80 },
  sharePctSymbol: { fontSize: 32, fontWeight: 'bold', color: '#FC4C02', marginBottom: 12, marginLeft: 4 },
  shareChallengeName: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  shareFrase: { fontSize: 13, color: '#A8CFFF', marginBottom: 12, fontStyle: 'italic' },
  shareProgressBar: { height: 6, backgroundColor: '#0D1B2A', borderRadius: 3, marginBottom: 12 },
  shareProgressFill: { height: 6, backgroundColor: '#1E6FD9', borderRadius: 3 },
  shareProgressFillCompletado: { backgroundColor: '#FC4C02' },
  shareKmRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  shareKmText: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  shareKmTotal: { fontSize: 12, color: '#4a6a8a', flex: 1 },
  shareCompletadoBadge: { fontSize: 16 },
  shareMetaText: { fontSize: 12, color: '#A8CFFF', marginBottom: 16 },
  shareFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#0D1B2A', paddingTop: 12 },
  shareNombre: { fontSize: 12, color: '#4a6a8a', fontWeight: 'bold' },
  shareUrl: { fontSize: 12, color: '#4a6a8a' },
  detalleBtn: { backgroundColor: '#1E3A5F', borderWidth: 1, borderColor: '#1E6FD9', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  detalleBtnText: { color: '#1E6FD9', fontSize: 13, fontWeight: 'bold' },
  compartirBtn: { backgroundColor: '#0D1B2A', borderWidth: 1, borderColor: '#2a4a6a', paddingVertical: 10, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  compartirBtnText: { color: '#A8CFFF', fontSize: 13, fontWeight: 'bold' },
  bibRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bibBtn: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FC4C02' },
  bibBtnSecundario: { borderColor: '#1E6FD9' },
  bibBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  completadoCard: { backgroundColor: '#1E3A5F', borderRadius: 14, padding: 16, marginHorizontal: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: '#FC4C02' },
  completadoChallenge: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  completadoKm: { fontSize: 13, color: '#A8CFFF' },
  completadoBadge: { fontSize: 12, color: '#4CAF50', fontWeight: 'bold' },
  seccionTitulo: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  modolLibreBanner: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 16, flexDirection: 'row', gap: 12, borderLeftWidth: 4, borderLeftColor: '#1E6FD9' },
  modoLibreEmoji: { fontSize: 32 },
  modoLibreTitulo: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  modoLibreDesc: { fontSize: 13, color: '#A8CFFF', lineHeight: 18, marginBottom: 8 },
  modoLibreBtn: { fontSize: 13, color: '#FC4C02', fontWeight: 'bold' },
  actividadLibreCard: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1E3A5F' },
  storyCard: { backgroundColor: '#0D1B2A', borderRadius: 20, padding: 28, width: 300, borderWidth: 2, borderColor: '#FC4C02', alignItems: 'center' },
  storyHeader: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 24 },
  storyLogo: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  storyTagline: { fontSize: 12, color: '#FC4C02', fontWeight: 'bold', letterSpacing: 2 },
  storyPctWrapper: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  storyPctNumero: { fontSize: 72, fontWeight: 'bold', color: '#FFFFFF', lineHeight: 80 },
  storyPctSymbol: { fontSize: 28, fontWeight: 'bold', color: '#FC4C02', marginTop: 16 },
  storyChallenge: { fontSize: 16, fontWeight: 'bold', color: '#A8CFFF', marginBottom: 16, textAlign: 'center' },
  storyBar: { height: 6, backgroundColor: '#1E3A5F', borderRadius: 3, width: '100%', marginBottom: 8 },
  storyBarFill: { height: 6, backgroundColor: '#FC4C02', borderRadius: 3 },
  storyKm: { fontSize: 13, color: '#A8CFFF', marginBottom: 24 },
  storyFooter: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', borderTopWidth: 1, borderTopColor: '#1E3A5F', paddingTop: 12 },
  storyNombre: { fontSize: 13, color: '#FFFFFF', fontWeight: 'bold' },
  storyUrl: { fontSize: 13, color: '#FC4C02' },
  actualizarBtn: { marginTop: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2a4a6a', alignItems: 'center' },
  actualizarBtnText: { color: '#A8CFFF', fontSize: 14 },
  metaCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 18, marginBottom: 8, borderWidth: 1, borderColor: '#FC4C02' },
  metaCardTitulo: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  metaCardSubtitulo: { fontSize: 12, color: '#A8CFFF', marginBottom: 14 },
  metaInputRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  metaInput: { flex: 1, backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12, color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: '#2a4a6a' },
  metaGuardarBtn: { backgroundColor: '#FC4C02', borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  metaGuardarBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  metaSaltarBtn: { alignItems: 'center', paddingVertical: 4 },
  metaSaltarText: { color: '#4a6a8a', fontSize: 12 },
});