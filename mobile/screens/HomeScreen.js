import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView, Linking, TextInput, Alert, Modal, Dimensions } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../supabase';
import CompletadoScreen from './CompletadoScreen';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import MapaRecorrido from './MapaRecorrido';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
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
  const [nombre, setNombre] = useState('');
  const [bannerVisible, setBannerVisible] = useState(false);
  const [metaInputs, setMetaInputs] = useState({});
  const [metaVisibles, setMetaVisibles] = useState({});
  const [guardandoMeta, setGuardandoMeta] = useState({});
  const [stravaConectado, setStravaConectado] = useState(false);
  const [stravaHabilitado, setStravaHabilitado] = useState(false);
  const [modalStravaVisible, setModalStravaVisible] = useState(false);
  const [modalStravaProximamente, setModalStravaProximamente] = useState(false);
  const [modalAyudaVisible, setModalAyudaVisible] = useState(false);
  const [faqAbierta, setFaqAbierta] = useState(null);
  const [retoActivoIndex, setRetoActivoIndex] = useState(0);
  const viewShotRefs = useRef([]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
        // Intentar nombre de user_metadata primero, si no de la tabla users
        const metaNombre = session.user.user_metadata?.name?.split(' ')[0] || 
                           session.user.user_metadata?.full_name?.split(' ')[0] || '';
        if (metaNombre) {
          setNombre(metaNombre);
        } else {
          // Fallback: buscar en tabla users
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
      await fetch(`${BACKEND_URL}/strava/actividades/${userId}`);
      const res = await fetch(`${BACKEND_URL}/strava/progreso/${userId}`);
      const data = await res.json();
      const lista = Array.isArray(data) ? data : [];
      setChallenges(lista);
      const activos = lista.filter(c => !c.pending);
      const sinKm = activos.some(c => parseFloat(c.km_completados) === 0);
      setBannerVisible(sinKm);
      const reto100 = lista.find(c => parseFloat(c.porcentaje) >= 100 && !c.pending);
      if (reto100) setCompletado(reto100.challenge);

      const visibles = {};
      for (const c of activos) {
        if (parseFloat(c.km_completados) === 0 && !c.meta_fecha) {
          const yaVisto = await AsyncStorage.getItem(`meta_preguntada_${c.challenge_id}`);
          if (!yaVisto) visibles[c.challenge_id] = true;
        }
      }
      setMetaVisibles(visibles);
    } catch (err) {
      setError(true);
    } finally {
      setCargando(false);
    }
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
    const fecha = new Date(`${partes[2]}-${partes[1]}-${partes[0]}`);
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

  const conectarStrava = async () => {
    if (stravaConectado) {
      setModalStravaVisible(true);
      return;
    }
    // Solo abrir OAuth si el usuario tiene Strava habilitado
    if (stravaHabilitado) {
      conectarStravaReal();
    } else {
      setModalStravaProximamente(true);
    }
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

  const compartirProgreso = async (index) => {
    try {
      const uri = await viewShotRefs.current[index].capture();
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir mi progreso en Korva' });
    } catch (err) {
      console.error('Error compartiendo:', err);
    }
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

  const challengesPending = challenges.filter(c => c.pending);
  const challengesActivos = challenges.filter(c => !c.pending);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

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
                {
                  q: '¿Cómo funciona Korva?',
                  a: 'Elegís un desafío en el Catálogo y lo comprás. Una vez confirmado el pago, el desafío se activa en la app. Registrás tus km corriendo o pedaleando en el mundo real, y cuando completás la distancia total se inicia automáticamente la orden de envío de tu medalla.'
                },
                {
                  q: '¿Necesito completar el desafío de una sola vez?',
                  a: 'No. Podés salir a correr o pedalear cuando quieras — salidas cortas, largas, a tu ritmo. Los km se van acumulando hasta completar la distancia total del desafío.'
                },
                {
                  q: '¿Puedo mezclar actividades?',
                  a: 'Sí. Si elegiste Running podés sumar km corriendo, caminando, trotando o incluso en bicicleta — todo se acumula hacia tu meta. La modalidad que elegís define la distancia del desafío, no el tipo de actividad que podés registrar.'
                },
                {
                  q: '¿Cómo registro mis kilómetros?',
                  a: 'Desde la pestaña "Registrar" cargás tus km manualmente en segundos. La integración con Strava para sincronización automática estará disponible próximamente.'
                },
                {
                  q: '¿Cómo cargo mi dirección de envío?',
                  a: 'Desde la pestaña "Perfil", sección "Dirección de envío". Asegurate de tenerla cargada antes de completar el desafío para que el envío salga sin demoras.'
                },
                {
                  q: '¿Cuándo llega mi medalla?',
                  a: 'Cuando completás el 100% del desafío se inicia la orden de envío automáticamente. Los tiempos varían según tu país — podés consultar los tiempos estimados en korva.run.'
                },
                {
                  q: '¿Qué son los logros?',
                  a: 'Los logros son badges gratuitos que ganás por tu actividad — km recorridos, rachas de días activos, cantidad de salidas y más. Se acumulan siempre, tengas o no un desafío activo.'
                },
                {
                  q: '¿Puedo usar la app sin comprar un desafío?',
                  a: 'Sí. Podés registrar actividades y acumular logros sin costo. Los desafíos son para quienes quieren una meta con medalla física incluida.'
                },
                {
                  q: '¿Puedo cambiar mi modalidad?',
                  a: 'Sí, desde "Mis retos activos" en el Perfil podés cambiar entre Running y Ciclismo cuando quieras.'
                },
                {
                  q: '¿Puedo tener varios desafíos a la vez?',
                  a: 'Sí. Podés inscribirte en más de un desafío al mismo tiempo — cada uno tiene su propio progreso y se completan de forma independiente. En la app vas a ver una pestaña para cada desafío activo.'
                },
                {
                  q: '¿Mis datos están seguros?',
                  a: 'Sí. Solo vos podés ver tu perfil, dirección y actividades. No compartimos tu información con terceros.'
                },
                {
                  q: '¿Necesito Strava?',
                  a: 'No. El registro manual es suficiente para sumar tus km. Strava estará disponible próximamente como opción de sincronización automática.'
                },
                {
                  q: '¿Tengo un problema o consulta?',
                  a: 'Escribinos a korvaventura@gmail.com o por Instagram @korva.aventuras. Te respondemos a la brevedad.'
                },
              ].map((item, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.faqItem}
                  onPress={() => setFaqAbierta(faqAbierta === i ? null : i)}
                >
                  <View style={styles.faqHeader}>
                    <Text style={styles.faqPregunta}>{item.q}</Text>
                    <Text style={styles.faqChevron}>{faqAbierta === i ? '▲' : '▼'}</Text>
                  </View>
                  {faqAbierta === i && (
                    <Text style={styles.faqRespuesta}>{item.a}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Próximamente Strava */}
      <Modal visible={modalStravaProximamente} transparent animationType="fade" onRequestClose={() => setModalStravaProximamente(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🔗</Text>
            <Text style={styles.modalTitulo}>Strava — Próximamente</Text>
            <Text style={styles.modalSubtitulo}>La sincronización automática con Strava estará disponible en los próximos días.</Text>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>📝</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Por ahora usá el registro manual</Text>
                <Text style={styles.modalPasoDesc}>Desde la pestaña "Registrar" podés cargar tus km en segundos. Es igual de fácil y tus km se suman igual.</Text>
              </View>
            </View>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>📲</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Te avisamos cuando esté listo</Text>
                <Text style={styles.modalPasoDesc}>Cuando la integración esté disponible para vos, vas a ver el botón activo acá.</Text>
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
              <Text style={styles.modalPasoEmoji}>📱</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Descargá Strava</Text>
                <Text style={styles.modalPasoDesc}>Si no lo tenés, bajalo de la App Store o Google Play</Text>
              </View>
            </View>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>🏃</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Salí a correr y registrá tu actividad</Text>
                <Text style={styles.modalPasoDesc}>Usá Strava normalmente para trackear tu entrenamiento</Text>
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
            <View style={styles.stravaConectadoBadge}>
              <Text style={styles.stravaConectadoBadgeText}>✓ Strava</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.stravaProximoBtn} onPress={conectarStrava}>
              <Text style={styles.stravaProximoBtnText}>🔗 Strava</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Banner pago */}
      {bannerVisible && !cargando && (
        <View style={styles.bannerCard}>
          <View style={styles.bannerHeader}>
            <Text style={styles.bannerTitulo}>🎉 Pago confirmado!</Text>
            <TouchableOpacity onPress={() => setBannerVisible(false)}>
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

      {/* Strava activo */}
      {stravaConectado && !cargando && (
        <TouchableOpacity style={styles.stravaActivoCard} onPress={() => setModalStravaVisible(true)}>
          <View style={styles.stravaActivoRow}>
            <Text style={styles.stravaActivoEmoji}>🟠</Text>
            <View style={styles.stravaActivoInfo}>
              <Text style={styles.stravaActivoTitulo}>Strava activo</Text>
              <Text style={styles.stravaActivoDesc}>Tus actividades se sincronizan automáticamente · Tocá para ver cómo</Text>
            </View>
            <Ionicons name="information-circle-outline" size={20} color="#A8CFFF" />
          </View>
        </TouchableOpacity>
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
                <Text style={styles.pendingTitulo}>{item.challenge}</Text>
                <Text style={styles.pendingModalidad}>{item.modalidad}</Text>
                <Text style={styles.pendingTexto}>Esperando confirmación de pago. Si ya pagaste, puede demorar unos minutos.</Text>
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
          ) : challengesActivos.length === 1 ? (
            // Un solo reto — sin selector
            <RetoCard
              item={challengesActivos[0]}
              index={0}
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
            />
          ) : (
            // Múltiples retos — selector tipo tabs, una pantalla por reto
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
                    {parseFloat(item.porcentaje) >= 100 && <Text style={styles.retoTabBadge}>🏅</Text>}
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
              />
            </>
          )}
        </>
      )}

      {!error && (
        <TouchableOpacity style={styles.actualizarBtn} onPress={cargarProgreso}>
          <Text style={styles.actualizarBtnText}>↻ Actualizar progreso</Text>
        </TouchableOpacity>
      )}

      <StatusBar style="light" />
    </ScrollView>
  );
}

// ─── Componente reto individual ──────────────────────────────────
function RetoCard({ item, index, nombre, userId, navigation, metaVisibles, metaInputs, setMetaInputs, guardandoMeta, guardarMeta, saltarMeta, compartirProgreso, viewShotRefs }) {
  if (!item) return null;
  const pct = Math.min(parseFloat(item.porcentaje), 100);
  const estaCompletado = pct >= 100;
  const frase = getFrase(pct);
  const mostrarCardMeta = metaVisibles[item.challenge_id];
  const metaFormateada = formatearFechaMeta(item.meta_fecha);
  const bordeCard = estaCompletado ? '#FC4C02' : pct >= 75 ? '#FC4C02' : '#1E3A5F';

  return (
    <View>
      <ViewShot
        ref={ref => viewShotRefs.current[index] = ref}
        options={{ format: 'png', quality: 1 }}
      >
        <View style={[styles.shareCard, { borderColor: bordeCard }]}>
          <View style={styles.shareHeader}>
            <Text style={styles.shareKorvaLogo}>🏅 KORVA</Text>
            <Text style={styles.shareDeporte}>
              {item.modalidad === 'Running' ? '🏃 RUNNING' : item.modalidad === 'Ciclismo' ? '🚴 CICLISMO' : '🏊 NATACIÓN'}
            </Text>
          </View>
          <View style={styles.sharePctWrapper}>
            <Text style={styles.sharePctNumero}>{pct.toFixed(0)}</Text>
            <Text style={styles.sharePctSymbol}>%</Text>
          </View>
          <Text style={styles.shareChallengeName}>{item.challenge}</Text>
          <Text style={styles.shareFrase}>{frase}</Text>
          <View style={styles.shareProgressBar}>
            <View style={[styles.shareProgressFill, { width: `${pct}%` }, estaCompletado && styles.shareProgressFillCompletado]} />
          </View>
          <View style={styles.shareKmRow}>
            <Text style={styles.shareKmText}>{item.km_completados} km</Text>
            <Text style={styles.shareKmTotal}>· {getSubtitulo(item.challenge)}</Text>
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
        challengeTitle={item.challenge}
      />

      {mostrarCardMeta && (
        <View style={styles.metaCard}>
          <Text style={styles.metaCardTitulo}>🎯 ¿Cuándo querés terminar?</Text>
          <Text style={styles.metaCardSubtitulo}>Opcional — te ayuda a planificar tu entrenamiento</Text>
          <View style={styles.metaInputRow}>
            <TextInput
              style={styles.metaInput}
              value={metaInputs[item.challenge_id] || ''}
              onChangeText={v => setMetaInputs(prev => ({ ...prev, [item.challenge_id]: v }))}
              placeholder="DD/MM/AAAA"
              placeholderTextColor="#4a6a8a"
              keyboardType="numeric"
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
  stravaProximoBtn: { backgroundColor: '#1E3A5F', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2a4a6a' },
  stravaProximoBtnText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 13 },
  stravaBtn: { backgroundColor: '#FC4C02', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  stravaBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  stravaConectadoBadge: { backgroundColor: '#1a3a1a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2a6a2a' },
  stravaConectadoBadgeText: { color: '#4CAF50', fontWeight: 'bold', fontSize: 13 },
  stravaActivoCard: { backgroundColor: '#1E3A5F', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#FC4C02' },
  stravaActivoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stravaActivoEmoji: { fontSize: 20 },
  stravaActivoInfo: { flex: 1 },
  stravaActivoTitulo: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  stravaActivoDesc: { fontSize: 11, color: '#A8CFFF' },
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
  bannerCerrar: { fontSize: 16, color: '#4a6a8a', paddingHorizontal: 4 },
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
  shareKorvaLogo: { fontSize: 13, fontWeight: 'bold', color: '#FC4C02', letterSpacing: 2 },
  shareDeporte: { fontSize: 11, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 1 },
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