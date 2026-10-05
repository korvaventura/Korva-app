import KorvaHelpSheet from '../components/KorvaHelpSheet';
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
import Svg, { Circle, Path } from 'react-native-svg';
import { distanciaDeInscripcion } from '../utils/versionDesafio';
import { listarMisActividades } from '../services/actividadesApi';
import { nombreDeporteActividad, nombreFuenteActividad } from '../utils/actividadPresentacion';
import { colors } from '../theme/korvaTheme';
import MovimientoPersonalCard from '../components/MovimientoPersonalCard';
import useMovimientoPersonal from '../services/useMovimientoPersonal';
import KorvaCompletedShare from '../components/KorvaCompletedShare';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const aplicarMascaraFecha = (texto) => {
  const numeros = texto.replace(/[^0-9]/g, '');
  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 4) return `${numeros.slice(0,2)}/${numeros.slice(2)}`;
  return `${numeros.slice(0,2)}/${numeros.slice(2,4)}/${numeros.slice(4,8)}`;
};
const SCREEN_WIDTH = Dimensions.get('window').width;

const PASOS = [
  { emoji: '📝', titulo: 'Registrá tus km', desc: 'Abrí Registrar y elegí GPS o Manual para guardar tu actividad.' },
  { emoji: '🏃', titulo: 'Empezá a correr', desc: 'Cada km cuenta hacia tu medalla.' },
  { emoji: '🏅', titulo: 'Completá el desafío', desc: 'Tu progreso en la app y el envío físico de tu medalla se gestionan por separado.' },
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
  if (t.includes('fuji') || t.includes('monte fuji')) return 'Fujiyoshida → Descenso Meta Final';
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
  const [retoCompartir, setRetoCompartir] = useState(null);
  const [mostrarTutorial, setMostrarTutorial] = useState(false);
  const [modalInfoVisible, setModalInfoVisible] = useState(false);
  const [modalInfoChallenge, setModalInfoChallenge] = useState('');
  const [nombre, setNombre] = useState('');
  const [nombreCompartir, setNombreCompartir] = useState('');
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerCerrado, setBannerCerrado] = useState(false); // FIX: estado separado para cerrar manualmente
  const [metaInputs, setMetaInputs] = useState({});
  const [metaVisibles, setMetaVisibles] = useState({});
  const [guardandoMeta, setGuardandoMeta] = useState({});
  const [stravaConectado, setStravaConectado] = useState(false);
  const [stravaHabilitado, setStravaHabilitado] = useState(false);
  const [modalStravaVisible, setModalStravaVisible] = useState(false);
  const [modalStravaProximamente, setModalStravaProximamente] = useState(false);
  const [modalStravaInfoVisible, setModalStravaInfoVisible] = useState(false);
  const [bannerDireccionVisible, setBannerDireccionVisible] = useState(false);
  const [cargandoBib, setCargandoBib] = useState(false);
  const [modalAyudaVisible, setModalAyudaVisible] = useState(false);
  const [retoActivoIndex, setRetoActivoIndex] = useState(0);
  const [modalModalidadVisible, setModalModalidadVisible] = useState(false);
  const [actividadReciente, setActividadReciente] = useState(null);
  const viewShotRefs = useRef([]);
  const progresoLeido = useRef(false);
  const completadosConocidos = useRef(null);
  const { estado: movimientoPersonal, actualizar: actualizarMovimiento } = useMovimientoPersonal(userId);

  const detectarNuevaFinalizacion = (lista) => {
    const terminales = new Set(['completed', 'shipped', 'cargado']);
    const completadosAhora = new Set(
      lista
        .filter(c => !c.pending && (terminales.has(c.status) || parseFloat(c.porcentaje || 0) >= 100))
        .map(c => c.challenge_id)
        .filter(Boolean)
    );

    // La primera lectura solo establece el estado real del servidor. Así una
    // reinstalación, un logout o un cambio de dispositivo no revive logros históricos.
    if (completadosConocidos.current === null) {
      completadosConocidos.current = completadosAhora;
      return;
    }

    const nuevo = lista.find(c =>
      c.challenge_id &&
      completadosAhora.has(c.challenge_id) &&
      !completadosConocidos.current.has(c.challenge_id)
    );
    completadosConocidos.current = completadosAhora;
    if (nuevo) setCompletado(nuevo);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
        try {
          await AsyncStorage.setItem('tutorial_visto', 'true');
        } catch (e) {}
        setNombreCompartir(session.user.user_metadata?.name || session.user.user_metadata?.full_name || '');
        const metaNombre = session.user.user_metadata?.name?.split(' ')[0] || 
                           session.user.user_metadata?.full_name?.split(' ')[0] || '';
        if (metaNombre) {
          setNombre(metaNombre);
        } else {
          const { data } = await supabase.from('users').select('name').eq('id', session.user.id).single();
          setNombre(data?.name?.split(' ')[0] || '');
          setNombreCompartir(data?.name || '');
        }
      } else {
        setCargando(false);
      }
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        cargarProgreso();
        verificarStrava();
        listarMisActividades().then((lista) => setActividadReciente(lista[0] || null)).catch(() => {});
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

  const leerEstados = () => supabase
    .from('user_challenges')
    .select('challenge_id,status,completed_at,pausado,numero_bib')
    .eq('user_id', userId);

  const enriquecerEstados = async (lista, lectura = null) => {
    try {
      const { data } = await (lectura || leerEstados());
      const porChallenge = new Map((data || []).map((x) => [x.challenge_id, x]));
      return lista.map((item) => ({ ...item, ...(porChallenge.get(item.challenge_id) || {}) }));
    } catch {
      return lista;
    }
  };

  const cargarProgreso = async () => {
    if (!userId) return;
    try {
      // Al volver a Inicio, conservar las tarjetas mientras se actualizan.
      setCargando(!progresoLeido.current);
      setError(false);
      const lecturaEstados = Promise.resolve(leerEstados()).catch(() => ({ data: null }));
      // La Home nunca espera a Strava para mostrar las cards.
      // Primero lee el progreso ya materializado por el motor; si Strava está conectado,
      // sincroniza después y refresca silenciosamente solo si llegaron datos nuevos.
      const res = await fetch(`${BACKEND_URL}/strava/progreso/${userId}`);
      const data = await res.json();
      const listaBase = Array.isArray(data) ? data : [];
      if (!res.ok || !Array.isArray(data)) throw new Error('No se pudo leer el progreso');
      const lista = await enriquecerEstados(listaBase, lecturaEstados);
      setChallenges(lista);
      detectarNuevaFinalizacion(lista);
      progresoLeido.current = true;
      // Mostrar las tarjetas antes de consultar banners y dirección de envío.
      setCargando(false);

      if (stravaConectado) {
        fetch(`${BACKEND_URL}/strava/actividades/${userId}`)
          .then(r => r.json())
          .then(sync => {
            if (Number(sync?.importadas || 0) > 0) {
              actualizarMovimiento();
              return fetch(`${BACKEND_URL}/strava/progreso/${userId}`)
                .then(r => r.json())
                .then(actualizado => {
                  if (Array.isArray(actualizado)) {
                    return enriquecerEstados(actualizado).then((listaActualizada) => {
                      setChallenges(listaActualizada);
                      detectarNuevaFinalizacion(listaActualizada);
                    });
                  }
                });
            }
          })
          .catch(() => {});
      }

      const activos = lista.filter(c => !c.pending);
      const sinKm = activos.some(c => parseFloat(c.km_completados || 0) === 0);
      // FIX: solo mostrar si no fue cerrado manualmente
      if (sinKm && !bannerCerrado) setBannerVisible(true);
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
      // Un fallo al refrescar no oculta el último progreso disponible.
      if (!progresoLeido.current) setError(true);
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
  const scrollRef = useRef(null);
  const actividadesInicioY = useRef(0);
  const movimientoInicioY = useRef(0);
  const shareCardRef = useRef(null);

  const compartirProgreso = async (index) => {
    setModalCompartirItem(challengesActivos[index]);
  };

  const ejecutarCompartir = async () => {
    try {
      if (!shareCardRef?.current) {
        Alert.alert('Error', 'No se pudo capturar la imagen. Cerrá y volvé a intentar.');
        return;
      }
      // Esperar un frame para asegurar que el ViewShot está renderizado
      await new Promise(resolve => setTimeout(resolve, 200));
      const uri = await shareCardRef.current.capture();
      setModalCompartirItem(null);
      await new Promise(resolve => setTimeout(resolve, 400));
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '¡Compartí tu progreso en Korva!' });
    } catch (err) {
      console.error('Error compartiendo:', err);
      Alert.alert('Error', 'No se pudo compartir. Intentá de nuevo.');
    }
  };

  if (mostrarTutorial) {
    try {
      return <TutorialScreen onTerminar={() => setMostrarTutorial(false)} />;
    } catch (e) {
      // Si crashea el tutorial, lo marcamos como visto y continuamos
      AsyncStorage.setItem('tutorial_visto', 'true').catch(() => {});
      setMostrarTutorial(false);
    }
  }

  if (completado) {
    return (
      <CompletadoScreen
        challenge={completado}
        nombrePersona={nombreCompartir}
        onVolver={() => setCompletado(null)}
        onCargarDireccion={() => {
          setCompletado(null);
          navigation.navigate('Perfil');
        }}
      />
    );
  }

  const estadosTerminales = ['completed', 'shipped', 'cargado'];
  const esTerminado = (c) =>
    !c.pending && (parseFloat(c.porcentaje || 0) >= 100 || estadosTerminales.includes(c.status));
  const fechaOrden = (valor) => {
    const ms = valor ? new Date(valor).getTime() : 0;
    return Number.isFinite(ms) ? ms : 0;
  };

  const challengesPending = challenges.filter(c => c.pending);
  const challengesEnCurso = challenges
    .filter(c => !c.pending && !esTerminado(c))
    .sort((a, b) => {
      // Home: activos primero, luego pausados. Dentro de cada grupo, el más avanzado primero.
      if (!!a.pausado !== !!b.pausado) return a.pausado ? 1 : -1;
      return parseFloat(b.porcentaje || 0) - parseFloat(a.porcentaje || 0);
    });
  const challengesCompletados = challenges
    .filter(esTerminado)
    // Último completado arriba; el primero que terminó va quedando al fondo.
    .sort((a, b) => fechaOrden(b.completed_at) - fechaOrden(a.completed_at));
  const challengesActivos = challengesEnCurso;
  const retoVisibleIndex = Math.min(retoActivoIndex, Math.max(0, challengesActivos.length - 1));
  const movimientoPrimero = !challengesEnCurso.some(c => !c.pausado);


  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Banner dirección — para completados sin dirección */}
      {bannerDireccionVisible && (
        <View style={[styles.bannerStrava, { borderLeftColor: colors.brandOrange, backgroundColor: '#1A0D00' }]}>
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

      {/* Modal FAQ / Ayuda */}
      <KorvaHelpSheet visible={modalAyudaVisible} onClose={() => setModalAyudaVisible(false)} />

      {/* Modal Próximamente Strava */}
      {/* Modal Compartir Progreso */}
      <Modal visible={!!modalCompartirItem} transparent animationType="fade" onRequestClose={() => setModalCompartirItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={{ width: '100%', alignItems: 'center' }}>
            {modalCompartirItem && (
              <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1 }}>
                {(() => {
                  const pct = Math.min(parseFloat(modalCompartirItem.porcentaje || 0), 100);
                  const kmComp = parseFloat(modalCompartirItem.km_completados || 0).toFixed(1);
                  const distTotal = parseFloat(modalCompartirItem.distancia_total || 0).toFixed(0);
                  const mensaje = pct >= 100 ? 'META ALCANZADA'
                    : pct >= 75 ? 'CASI EN LA META'
                    : pct >= 50 ? 'MITAD DEL CAMINO'
                    : pct >= 25 ? 'EN MOVIMIENTO'
                    : 'EN RUTA';
                  return (
                    <View style={{ backgroundColor: colors.background, borderRadius: 20, width: 320, overflow: 'hidden' }}>
                      <View style={{ padding: 28, alignItems: 'center' }}>
                        {/* Logo */}
                        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 4, fontWeight: 'bold', marginBottom: 24 }}>KORVA AVENTURAS</Text>
                        {/* Medalla */}
                        {modalCompartirItem.medal_image_url ? (
                          <Image source={{ uri: modalCompartirItem.medal_image_url }} style={{ width: 72, height: 72, marginBottom: 16 }} resizeMode="contain" />
                        ) : (
                          <Text style={{ fontSize: 44, marginBottom: 16 }}>🏅</Text>
                        )}
                        {/* Nombre desafío */}
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', textAlign: 'center', marginBottom: 20 }}>
                          {modalCompartirItem.challenge || '—'}
                        </Text>
                        {/* Porcentaje grande */}
                        <Text style={{ color: colors.text, fontSize: 80, fontWeight: 'bold', letterSpacing: -3, lineHeight: 84 }}>
                          {pct.toFixed(0)}<Text style={{ fontSize: 28, color: 'rgba(255,255,255,0.4)', fontWeight: '300' }}>%</Text>
                        </Text>
                        {/* Mensaje estado */}
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 3, marginTop: 6, marginBottom: 24 }}>{mensaje}</Text>
                        {/* Barra progreso */}
                        <View style={{ width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, marginBottom: 8 }}>
                          <View style={{ width: `${pct}%`, height: 3, backgroundColor: colors.text, borderRadius: 2 }} />
                        </View>
                        {/* km */}
                        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, letterSpacing: 1, marginBottom: 28 }}>
                          {kmComp} / {distTotal} KM
                        </Text>
                        {/* Footer */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{nombre?.toUpperCase()}</Text>
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, letterSpacing: 1 }}>KORVA.RUN</Text>
                        </View>
                      </View>
                    </View>
                  );
                })()}
              </ViewShot>
            )}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity style={[styles.modalBtn, { flex: 1, backgroundColor: colors.surfaceStrong }]} onPress={() => setModalCompartirItem(null)}>
                <Text style={[styles.modalBtnText, { color: colors.textSoft }]}>Cancelar</Text>
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
          <Text style={styles.subtitulo}>{movimientoPrimero ? 'Tu movimiento' : 'Tus aventuras'}</Text>
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

      {userId && (
        <View>
          <MovimientoPersonalCard compacto estado={movimientoPersonal} onActualizar={actualizarMovimiento} />
        </View>
      )}

      <KorvaMundiTeaser
        conquistados={challengesCompletados.length}
        enCurso={challengesEnCurso.filter((c) => !c.pausado).length}
        onPress={() => navigation.navigate('KorvaMundi')}
      />

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
                    <Text style={{ color: colors.brandOrange, fontWeight: 'bold', fontSize: 12 }}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.pendingModalidad}>{distanciaDeInscripcion(item)} km</Text>
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
              <Text style={styles.emptyEmoji}>🏅</Text>
              <Text style={styles.emptyText}>Tu próxima aventura</Text>
              <Text style={styles.emptySubtext}>Podés seguir registrando actividades y elegir un desafío cuando quieras.</Text>
              {challengesPending.length === 0 && (
                <TouchableOpacity style={styles.irCatalogoBtn} onPress={() => navigation.navigate('Catalogo')}>
                  <Text style={styles.irCatalogoBtnText}>Explorar desafíos →</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={{ marginTop: 16 }}
                onPress={() => Alert.alert('¿Ya compraste un desafío?', 'Usá el mismo email con el que compraste en korva.run. Si el pago está confirmado, tu desafío debería aparecer en esta cuenta.')}>
                <Text style={{ color: colors.actionBlue, fontSize: 12 }}>¿Ya compraste un desafío?</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // FIX: selector siempre visible, aunque sea un solo reto
            <>
              {challengesActivos.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.retoTabsScroll}>
                  {challengesActivos.map((item, i) => (
                    <TouchableOpacity
                      key={item.id || item.challenge_id || i}
                      style={[styles.retoTab, i === retoVisibleIndex && styles.retoTabActivo]}
                      onPress={() => setRetoActivoIndex(i)}
                    >
                      <Text style={[styles.retoTabText, i === retoVisibleIndex && styles.retoTabTextActivo]}>
                        {item.challenge}
                      </Text>
                      {parseFloat(item.porcentaje || 0) >= 100 && <Text style={styles.retoTabBadge}>🏅</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <RetoCard
                item={challengesActivos[retoVisibleIndex]}
                index={retoVisibleIndex}
                nombre={nombre}
                nombrePersona={nombreCompartir}
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

              {!movimientoPrimero && <GpsHomeAction navigation={navigation} />}


            </>
          )}
        </>
      )}

      {userId && (
        <View style={styles.movimientoSection} onLayout={(e) => { movimientoInicioY.current = e.nativeEvent.layout.y; }}>
          {movimientoPrimero && <GpsHomeAction navigation={navigation} />}
          <TouchableOpacity style={styles.scrollCue}
            accessibilityRole="button" accessibilityLabel="Ver actividades y desafíos completados"
            onPress={() => scrollRef.current?.scrollTo({ y: Math.max(0, movimientoInicioY.current + actividadesInicioY.current - 16), animated: true })}>
            <Text style={styles.scrollCueText}>Seguí explorando</Text>
            <Ionicons name="chevron-down" size={20} color={colors.textSoft} />
          </TouchableOpacity>
          <View onLayout={(e) => { actividadesInicioY.current = e.nativeEvent.layout.y; }}>
            <Text style={styles.movimientoTitulo}>Tus actividades</Text>
      {actividadReciente && (
        <TouchableOpacity
          style={styles.actividadRecienteCard}
          onPress={() => navigation.navigate('DetalleActividad', { actividad: actividadReciente })}
        >
          <View style={styles.actividadRecienteHeader}>
            <Text style={styles.actividadRecienteEyebrow}>ACTIVIDAD RECIENTE</Text>
            <Text style={styles.actividadRecienteFecha}>
              {actividadReciente.recorded_at ? new Date(actividadReciente.recorded_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : ''}
            </Text>
          </View>
          <View style={styles.actividadRecienteFila}>
            <View style={{ flex: 1 }}>
              <Text style={styles.actividadRecienteDeporte}>
                {nombreDeporteActividad(actividadReciente.sport_type)}
              </Text>
              <Text style={styles.actividadRecienteFuente}>
                {nombreFuenteActividad(actividadReciente.source)}
              </Text>
            </View>
            <Text style={styles.actividadRecienteKm}>{Number(actividadReciente.distance_km || 0).toFixed(2)} km</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.actionBlue} />
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.actividadesInicioCard} onPress={() => navigation.navigate('MisActividades')}>
        <View style={{ flex: 1 }}>
          <Text style={styles.actividadesInicioTitulo}>Mis actividades</Text>
          <Text style={styles.actividadesInicioDesc}>Ver historial completo, estadísticas y recorridos GPS</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.actionBlue} />
      </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Retos completados — solo lectura */}
      {!error && challengesCompletados.length > 0 && (
        <View style={{ marginTop: 8, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 12 }}>
            <Text style={[styles.seccionTitulo, { flex: 1 }]}><Ionicons name="checkmark-circle-outline" size={18} color={colors.brandOrangeSoft} /> Completados</Text>
          </View>
          {challengesCompletados.map((item, i) => (
            <View key={i} style={styles.completadoCard}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => navigation.navigate('DetalleReto', { item, userId, nombrePersona: nombreCompartir })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.completadoChallenge}>{item.challenge || item.challenge_title || '—'}</Text>
                  <Text style={styles.completadoKm}>{parseFloat(item.km_completados || 0).toFixed(1)} km</Text>
                </View>
                <View style={styles.completedSeal}>
                  <Ionicons name="checkmark" size={18} color={colors.brandOrangeSoft} />
                  <Text style={styles.completedSealText}>100%</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.completedActions}>
                <TouchableOpacity style={styles.completedAction}
                  onPress={() => navigation.navigate('DetalleReto', { item, userId, nombrePersona: nombreCompartir })}>
                  <Ionicons name="book-outline" size={15} color={colors.textSoft} />
                  <Text style={styles.completedActionText}>Ver historia</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.completedAction}
                  onPress={() => { setModalInfoChallenge(item.challenge || ''); setModalInfoVisible(true); }}>
                  <Ionicons name="medal-outline" size={15} color={colors.brandOrangeSoft} />
                  <Text style={styles.completedActionText}>Medalla y envío</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.completedShareBtn} accessibilityRole="button" onPress={() => setRetoCompartir(item)}>
                <Ionicons name="share-outline" size={16} color={colors.brandOrangeSoft} />
                <Text style={styles.completedShareText}>Compartir desafío completado</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {!error && (
        <TouchableOpacity style={styles.actualizarBtn} onPress={cargarProgreso}>
          <Text style={styles.actualizarBtnText}>↻ Actualizar progreso</Text>
        </TouchableOpacity>
      )}

      {/* Modal info completado */}
      <Modal visible={modalInfoVisible} transparent animationType="fade" onRequestClose={() => setModalInfoVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalInfoVisible(false)}>
          <View style={[styles.modalCard, { padding: 24 }]}>
            <Text style={{ fontSize: 30, marginBottom: 10, textAlign: 'center' }}>🎁</Text>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 }}>Sobre tu medalla</Text>
            <Text style={{ color: '#6F91B5', fontSize: 12, textAlign: 'center', marginBottom: 16 }}>{modalInfoChallenge}</Text>
            <Text style={{ color: colors.textSoft, fontSize: 13, lineHeight: 20, marginBottom: 12 }}>
              Nuestro equipo está preparando y gestionando tu pedido. Cuando el envío tenga información de seguimiento disponible, la recibirás por correo electrónico.
            </Text>
            <Text style={{ color: colors.textSoft, fontSize: 13, lineHeight: 20, marginBottom: 12 }}>
              Si compraste varias medallas en una misma compra, pueden prepararse y enviarse juntas. En ese caso recibirás un único enlace de seguimiento para el pedido, no un correo por cada medalla.
            </Text>
            <Text style={{ color: '#7F96AD', fontSize: 12, lineHeight: 18, marginBottom: 18 }}>
              El estado del desafío dentro de la app no confirma por sí solo que una medalla haya sido despachada individualmente. No necesitás realizar ninguna acción por el momento.
            </Text>
            <TouchableOpacity
              style={{ borderWidth: 1, borderColor: '#2A5A8A', borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 12 }}
              onPress={() => Linking.openURL('https://korva.run/pages/envios')}
            >
              <Text style={{ color: colors.actionBlue, fontWeight: 'bold', fontSize: 13 }}>Ver información completa sobre envíos →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalInfoVisible(false)}>
              <Text style={{ color: '#4a6a8a', textAlign: 'center', fontSize: 13 }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal info modalidad */}
      <Modal visible={modalModalidadVisible} transparent animationType="fade" onRequestClose={() => setModalModalidadVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🎯</Text>
            <Text style={styles.modalTitulo}>La versión de tu desafío</Text>
            <Text style={styles.modalSubtitulo}>Cada desafío tiene una versión Estándar y una Extendida (más larga). La versión solo define la distancia.</Text>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>✅</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>Todo suma hacia tu meta</Text>
                <Text style={styles.modalPasoDesc}>En cualquier versión podés caminar, correr o andar en bici. Todos los km cuentan igual hacia tu distancia total.</Text>
              </View>
            </View>
            <View style={styles.modalPaso}>
              <Text style={styles.modalPasoEmoji}>🔄</Text>
              <View style={styles.modalPasoInfo}>
                <Text style={styles.modalPasoTitulo}>¿Querés cambiar de versión?</Text>
                <Text style={styles.modalPasoDesc}>Podés cambiar entre Estándar y Extendida desde la pestaña Perfil → Mis retos activos. Tus km no cambian.</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setModalModalidadVisible(false)}>
              <Text style={styles.modalBtnText}>Entendido 👍</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <StatusBar style="light" />
      <KorvaCompletedShare nombrePersona={nombreCompartir} reto={retoCompartir} onClose={() => setRetoCompartir(null)} />
    </ScrollView>
  );
}

// ─── Componente reto individual ──────────────────────────────────
function KorvaMundiTeaser({ conquistados, enCurso, onPress }) {
  const resumen = conquistados === 0 && enCurso === 0
    ? 'El mundo te espera'
    : `${conquistados} conquistado${conquistados === 1 ? '' : 's'} · ${enCurso} en curso`;
  return (
    <TouchableOpacity style={styles.korvaMundiCard} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.korvaMundiCopy}>
        <Text style={styles.korvaMundiEyebrow}>KORVAMUNDI</Text>
        <Text style={styles.korvaMundiTitle}>Tu mundo por conquistar</Text>
        <Text style={styles.korvaMundiMeta}>{resumen}</Text>
        <View style={styles.korvaMundiLink}>
          <Text style={styles.korvaMundiLinkText}>Explorar mundo</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.brandOrangeSoft} />
        </View>
      </View>
      <View style={styles.korvaMundiGlobe} pointerEvents="none">
        <Svg width="158" height="158" viewBox="0 0 158 158">
          <Circle cx="82" cy="79" r="61" fill="#091E30" stroke="#2C5B7E" strokeWidth="1.2" />
          <Path d="M23 79 C48 58 112 58 141 79 M23 79 C49 101 112 101 141 79 M82 18 C57 43 57 116 82 140 M82 18 C108 44 108 115 82 140" fill="none" stroke="rgba(91,153,202,0.28)" strokeWidth="1" />
          <Path d="M52 43 C60 35 70 35 75 43 C79 49 72 55 66 57 C60 59 60 67 54 68 C47 66 44 57 47 50 Z M92 71 C101 64 114 66 119 76 C123 86 116 96 108 101 C99 105 92 99 89 91 C86 84 86 76 92 71 Z" fill="rgba(76,139,187,0.20)" />
          <Circle cx="111" cy="54" r="4" fill="#FC4C02" />
          <Circle cx="111" cy="54" r="9" fill="none" stroke="rgba(252,76,2,0.22)" strokeWidth="3" />
        </Svg>
        <View style={styles.korvaMundiPlane}><Ionicons name="airplane" size={17} color={colors.textSoft} /></View>
      </View>
    </TouchableOpacity>
  );
}

function GpsHomeAction({ navigation }) {
  return (
    <TouchableOpacity style={styles.gpsHeroAction} onPress={() => navigation.navigate('GpsTracker')} activeOpacity={0.88}>
      <View style={styles.gpsHeroTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.gpsHeroEyebrow}>KORVA GPS</Text>
          <Text style={styles.gpsHeroTitulo}>Iniciar actividad</Text>
        </View>
        <View style={styles.gpsHeroStart}>
          <Ionicons name="play" size={14} color={colors.text} />
          <Text style={styles.gpsHeroStartText}>INICIAR</Text>
        </View>
      </View>

    </TouchableOpacity>
  );
}

function RetoCard({ item, index, nombre, nombrePersona, userId, navigation, metaVisibles, metaInputs, setMetaInputs, guardandoMeta, guardarMeta, saltarMeta, compartirProgreso, viewShotRefs, onModalidadPress, scrollRef, descargarBib, cargandoBib, togglePausar }) {
  const challengeId = item.challenge_id;
  const estaPausado = item.pausado || false;
  const estaActivo = item.status === 'active';
  if (!item) return null;
  const pct = Math.min(parseFloat(item.porcentaje || 0), 100);
  const estaCompletado = pct >= 100;
  const frase = getFrase(pct);
  const mostrarCardMeta = metaVisibles[item.challenge_id];
  const metaFormateada = formatearFechaMeta(item.meta_fecha);
  const bordeCard = estaCompletado ? colors.brandOrange : colors.borderSoft;
  const tituloNormalizado = (item.challenge || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const tieneExpedicion = ['fuji', 'dubrovnik', 'san andres', 'fin del mundo'].some(nombre => tituloNormalizado.includes(nombre));

  return (
    <View>
      <ViewShot
        ref={ref => viewShotRefs.current[index] = ref}
        options={{ format: 'png', quality: 1 }}
      >
        <View style={[styles.shareCard, { borderColor: bordeCard }]}>
          {/* FIX: header rediseñado — sin colores que parezcan botones */}
          <View style={styles.shareHeader}>
            <Text style={styles.shareKorvaLogo}>TU AVENTURA</Text>
          </View>
          <Text style={styles.shareChallengeName}>{item.challenge || '—'}</Text>
          <View style={styles.heroMetricRow}>
            <Text style={styles.heroKmNumero}>{Number(item.km_completados || 0).toFixed(1)}</Text>
            <Text style={styles.heroKmUnidad}>km</Text>
            <View style={styles.heroPctPill}>
              <Text style={styles.heroPctText}>{pct.toFixed(0)}%</Text>
            </View>
          </View>
          <Text style={styles.heroTotal}>de {Number(item.distancia_total || 0).toFixed(0)} km</Text>
          {!tieneExpedicion && (
            <>
              <View style={styles.shareProgressBar}>
                <View style={[styles.shareProgressFill, { width: `${pct}%` }, estaCompletado && styles.shareProgressFillCompletado]} />
              </View>
              <Text style={styles.shareFrase}>{frase}</Text>
            </>
          )}
          <View style={styles.heroFooter}>
            {metaFormateada
              ? <Text style={styles.shareMetaText}>🎯 Objetivo · {metaFormateada}</Text>
              : <Text style={styles.heroFooterMuted}>Completalo a tu ritmo</Text>}
            {estaCompletado && <Text style={styles.shareCompletadoBadge}>🏅 Completado</Text>}
          </View>
          <TouchableOpacity
            style={styles.heroHistoria}
            onPress={() => navigation.navigate('DetalleReto', { item, userId, nombrePersona })}
            activeOpacity={0.72}
          >
            <Text style={styles.heroHistoriaText}>Historia del desafío</Text>
            <Ionicons name="arrow-forward" size={13} color={colors.actionBlue} />
          </TouchableOpacity>
        </View>
      </ViewShot>

      {tieneExpedicion && (
        <MapaRecorrido
          kmCompletados={item.km_completados}
          distanciaTotal={item.distancia_total}
          porcentaje={pct}
          challengeId={item.challenge_id}
          challengeTitle={item.challenge}
          integrado
        />
      )}

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
                ? <ActivityIndicator color={colors.text} size="small" />
                : <Text style={styles.metaGuardarBtnText}>Guardar</Text>
              }
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => saltarMeta(item.challenge_id)} style={styles.metaSaltarBtn}>
            <Text style={styles.metaSaltarText}>Saltar por ahora</Text>
          </TouchableOpacity>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  completedShareBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  completedShareText: { fontSize: 12, fontWeight: '800', color: colors.brandOrangeSoft },
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  saludo: { fontSize: 22, fontWeight: 'bold', color: colors.text, marginBottom: 2 },
  subtitulo: { fontSize: 12, color: colors.textMuted },
  korvaMundiCard: { minHeight: 146, marginTop: 14, marginBottom: 20, borderRadius: 22, overflow: 'hidden', backgroundColor: '#0B2134', borderWidth: 1, borderColor: '#234766', flexDirection: 'row', alignItems: 'stretch' },
  korvaMundiCopy: { flex: 1, zIndex: 2, paddingLeft: 18, paddingVertical: 18, paddingRight: 4, justifyContent: 'center' },
  korvaMundiEyebrow: { color: colors.brandOrangeSoft, fontSize: 9, fontWeight: '900', letterSpacing: 2.3, marginBottom: 7 },
  korvaMundiTitle: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900', maxWidth: 180 },
  korvaMundiMeta: { color: colors.textMuted, fontSize: 10, marginTop: 6 },
  korvaMundiLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 13 },
  korvaMundiLinkText: { color: colors.brandOrangeSoft, fontSize: 11, fontWeight: '800' },
  korvaMundiGlobe: { position: 'absolute', width: 158, height: 158, right: -35, top: -7, opacity: 0.96 },
  korvaMundiPlane: { position: 'absolute', left: 12, top: 23, transform: [{ rotate: '-18deg' }] },
  bannerStrava: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0D2A1A',
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.brandOrange,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  bannerStravaTitulo: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  bannerStravaDesc: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  bannerStravaBtn: {
    color: colors.brandOrange,
    fontSize: 13,
    fontWeight: 'bold',
  },
  stravaProximoBtn: { backgroundColor: colors.surfaceStrong, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2a4a6a' },
  stravaProximoBtnText: { color: '#4a6a8a', fontWeight: 'bold', fontSize: 13 },
  stravaBtn: { backgroundColor: colors.brandOrange, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  stravaBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 13 },
  stravaConectadoBadge: { backgroundColor: '#1a3a1a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2a6a2a' },
  stravaConectadoBadgeText: { color: colors.success, fontWeight: 'bold', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.surfaceStrong, borderRadius: 24, padding: 28, width: '100%', borderWidth: 1, borderColor: colors.brandOrange },
  modalEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: 6 },
  modalSubtitulo: { fontSize: 13, color: colors.textSoft, textAlign: 'center', marginBottom: 24 },
  modalPaso: { flexDirection: 'row', gap: 14, marginBottom: 18, alignItems: 'flex-start' },
  modalPasoEmoji: { fontSize: 24, width: 32 },
  modalPasoInfo: { flex: 1 },
  modalPasoTitulo: { fontSize: 14, fontWeight: 'bold', color: colors.text, marginBottom: 3 },
  modalPasoDesc: { fontSize: 12, color: colors.textSoft, lineHeight: 18 },
  modalBtn: { backgroundColor: colors.brandOrange, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  modalBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 15 },
  bannerCard: { backgroundColor: colors.surfaceStrong, borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: colors.actionBlueStrong },
  bannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bannerTitulo: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  bannerCerrar: { fontSize: 18, color: colors.textSoft, paddingHorizontal: 4, paddingVertical: 2 },
  bannerSubtitulo: { fontSize: 13, color: colors.textSoft, marginBottom: 16 },
  pasoRow: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  pasoEmoji: { fontSize: 20, width: 28 },
  pasoInfo: { flex: 1 },
  pasoTitulo: { fontSize: 14, fontWeight: 'bold', color: colors.text, marginBottom: 2 },
  pasoDesc: { fontSize: 12, color: colors.textSoft },
  bannerBtn: { backgroundColor: colors.actionBlueStrong, paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  bannerBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 14 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorCard: { backgroundColor: colors.surfaceStrong, borderRadius: 20, padding: 40, alignItems: 'center', marginTop: 20, borderWidth: 1, borderColor: '#2a3a4a' },
  errorEmoji: { fontSize: 48, marginBottom: 16 },
  errorTitulo: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
  errorSubtitulo: { fontSize: 14, color: colors.textSoft, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  reintentarBtn: { backgroundColor: colors.actionBlueStrong, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12 },
  reintentarText: { color: colors.text, fontWeight: 'bold', fontSize: 15 },
  pendingCard: { backgroundColor: '#1E2A1A', borderRadius: 16, padding: 18, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 14, borderWidth: 1, borderColor: '#2a4a2a' },
  pendingEmoji: { fontSize: 28 },
  pendingInfo: { flex: 1 },
  pendingTitulo: { fontSize: 15, fontWeight: 'bold', color: colors.text, marginBottom: 2 },
  pendingModalidad: { fontSize: 12, color: colors.textSoft, marginBottom: 6 },
  pendingTexto: { fontSize: 12, color: '#6a8a6a', lineHeight: 18 },
  pendingBtn: { marginTop: 10, backgroundColor: colors.actionBlueStrong, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  pendingBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 12 },
  ayudaBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: '#2a4a6a', alignItems: 'center', justifyContent: 'center' },
  ayudaBtnText: { color: colors.textSoft, fontWeight: 'bold', fontSize: 15 },
  faqItem: { borderBottomWidth: 1, borderBottomColor: '#2a4a6a', paddingVertical: 14 },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  faqPregunta: { fontSize: 14, fontWeight: 'bold', color: colors.text, flex: 1, paddingRight: 12 },
  faqChevron: { color: '#4a6a8a', fontSize: 12 },
  faqRespuesta: { fontSize: 13, color: colors.textSoft, lineHeight: 20, marginTop: 10 },
  emptyLogrosRow: { flexDirection: 'row', gap: 8, marginVertical: 16, flexWrap: 'wrap', justifyContent: 'center' },
  emptyLogroItem: { backgroundColor: colors.surfaceStrong, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, fontSize: 12, color: colors.textSoft, fontWeight: 'bold' },
  emptyCard: { backgroundColor: colors.surfaceStrong, borderRadius: 20, padding: 32, alignItems: 'center', marginTop: 20, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: colors.textSoft, textAlign: 'center', lineHeight: 20 },
  irCatalogoBtn: { backgroundColor: colors.brandOrange, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 12 },
  irCatalogoBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 15 },
  retoTabsScroll: { marginBottom: 10 },
  retoTab: { backgroundColor: '#132A42', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: '#234766', flexDirection: 'row', alignItems: 'center', gap: 6 },
  retoTabActivo: { backgroundColor: '#183553', borderColor: '#B94A1A' },
  retoTabText: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  retoTabTextActivo: { color: '#F8FAFC' },
  retoTabBadge: { fontSize: 13 },
  shareCard: { backgroundColor: '#152F4A', borderRadius: 24, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 18, marginBottom: 0, borderWidth: 1 },
  shareHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  // FIX: KORVA y modalidad como texto plano, sin colores de botón
  shareKorvaLogo: { fontSize: 9, fontWeight: '900', color: '#6888A7', letterSpacing: 2.4 },
  shareDeporte: { fontSize: 9, fontWeight: '800', color: colors.actionBlue, letterSpacing: 1.1 },
  sharePctWrapper: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 1 },
  sharePctNumero: { fontSize: 58, fontWeight: '800', color: colors.text, lineHeight: 64 },
  sharePctSymbol: { fontSize: 26, fontWeight: '800', color: colors.brandOrange, marginBottom: 9, marginLeft: 3 },
  shareChallengeName: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: 10 },
  shareFrase: { fontSize: 13, color: colors.textSoft, marginBottom: 12, fontStyle: 'italic' },
  shareProgressBar: { height: 7, backgroundColor: '#091725', borderRadius: 4, marginTop: 12, marginBottom: 12, overflow: 'hidden' },
  shareProgressFill: { height: 7, backgroundColor: colors.brandOrange, borderRadius: 4 },
  shareProgressFillCompletado: { backgroundColor: colors.brandOrange },
  shareKmRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  shareKmText: { fontSize: 17, fontWeight: '800', color: colors.text },
  shareKmTotal: { fontSize: 11, color: colors.textMuted, flex: 1 },
  shareCompletadoBadge: { fontSize: 16 },
  shareMetaText: { fontSize: 11, color: colors.textSoft },
  heroMetricRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  heroKmNumero: { color: colors.text, fontSize: 62, lineHeight: 66, fontWeight: '900', letterSpacing: -2.5 },
  heroKmUnidad: { color: colors.textSoft, fontSize: 18, fontWeight: '800', marginLeft: 6, marginBottom: 9 },
  heroPctPill: { marginLeft: 'auto', marginBottom: 8, backgroundColor: '#0D2236', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#284C6E' },
  heroPctText: { color: colors.brandOrange, fontSize: 17, fontWeight: '900' },
  heroTotal: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 1 },
  heroFooter: { minHeight: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroFooterMuted: { color: '#6888A7', fontSize: 11 },
  gpsHeroAction: { marginTop: 20, minHeight: 78, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderStrong },
  gpsHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  gpsHeroStart: { height: 42, borderRadius: 21, backgroundColor: colors.brandOrange, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  gpsHeroStartText: { color: colors.text, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  gpsHeroEyebrow: { color: '#6E8BA7', fontSize: 9, fontWeight: '900', letterSpacing: 2.2, marginBottom: 5 },
  gpsHeroTitulo: { color: colors.text, fontSize: 18, fontWeight: '900', lineHeight: 25 },
  gpsHeroDesc: { color: colors.textSoft, fontSize: 11, marginTop: 10 },
  gpsHeroDivider: { height: 1, backgroundColor: '#203D57', marginVertical: 12 },
  gpsHeroHint: { color: colors.textDim, fontSize: 9, lineHeight: 13 },
  heroHistoria: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroHistoriaText: { color: colors.actionBlue, fontSize: 11, fontWeight: '800' },
  scrollCue: { alignSelf: 'center', alignItems: 'center', minHeight: 44, paddingHorizontal: 24, paddingVertical: 10, marginBottom: 12 },
  scrollCueText: { color: colors.textMuted, fontSize: 10, marginBottom: 2 },
  shareFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.background, paddingTop: 12 },
  shareNombre: { fontSize: 12, color: '#4a6a8a', fontWeight: 'bold' },
  shareUrl: { fontSize: 12, color: '#4a6a8a' },
  retoAcciones: { marginTop: 18, marginBottom: 24, borderTopWidth: 1, borderTopColor: '#213C58', paddingTop: 14 },
  historiaLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 7, marginBottom: 10 },
  historiaLinkText: { color: colors.actionBlue, fontSize: 13, fontWeight: '800' },
  accionesSecundarias: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, paddingVertical: 9 },
  accionSutil: { minHeight: 28, justifyContent: 'center' },
  accionSutilText: { color: colors.textSoft, fontSize: 11, fontWeight: '700' },
  pausaSutil: { alignItems: 'center', paddingTop: 10, marginTop: 4 },
  pausaSutilText: { color: '#6F8298', fontSize: 10, fontWeight: '700' },
    detalleBtn: { backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.actionBlueStrong, paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  detalleBtnText: { color: colors.actionBlueStrong, fontSize: 13, fontWeight: 'bold' },
  compartirBtn: { backgroundColor: colors.background, borderWidth: 1, borderColor: '#2a4a6a', paddingVertical: 10, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  compartirBtnText: { color: colors.textSoft, fontSize: 13, fontWeight: 'bold' },
  bibRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bibBtn: { flex: 1, backgroundColor: colors.surfaceStrong, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.brandOrange },
  bibBtnSecundario: { borderColor: colors.actionBlueStrong },
  bibBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 12 },
  completadoCard: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, marginHorizontal: 20, marginBottom: 12, borderWidth: 1, borderColor: colors.borderStrong },
  completedSeal: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, borderRadius: 16, backgroundColor: colors.backgroundDeep },
  completedSealText: { color: colors.brandOrangeSoft, fontSize: 11, fontWeight: '800' },
  completedActions: { flexDirection: 'row', gap: 12, marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderColor: colors.borderSoft },
  completedAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  completedActionText: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
  completadoChallenge: { fontSize: 15, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  completadoKm: { fontSize: 13, color: colors.textSoft },
  completadoBadge: { fontSize: 12, color: colors.success, fontWeight: 'bold' },
  seccionTitulo: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  modolLibreBanner: { backgroundColor: colors.surfaceStrong, borderRadius: 16, padding: 16, flexDirection: 'row', gap: 12, borderLeftWidth: 4, borderLeftColor: colors.actionBlueStrong },
  modoLibreEmoji: { fontSize: 32 },
  modoLibreTitulo: { fontSize: 15, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  modoLibreDesc: { fontSize: 13, color: colors.textSoft, lineHeight: 18, marginBottom: 8 },
  modoLibreBtn: { fontSize: 13, color: colors.brandOrange, fontWeight: 'bold' },
  actividadLibreCard: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.surfaceStrong },
  storyCard: { backgroundColor: colors.background, borderRadius: 20, padding: 28, width: 300, borderWidth: 2, borderColor: colors.brandOrange, alignItems: 'center' },
  storyHeader: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 24 },
  storyLogo: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  storyTagline: { fontSize: 12, color: colors.brandOrange, fontWeight: 'bold', letterSpacing: 2 },
  storyPctWrapper: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  storyPctNumero: { fontSize: 72, fontWeight: 'bold', color: colors.text, lineHeight: 80 },
  storyPctSymbol: { fontSize: 28, fontWeight: 'bold', color: colors.brandOrange, marginTop: 16 },
  storyChallenge: { fontSize: 16, fontWeight: 'bold', color: colors.textSoft, marginBottom: 16, textAlign: 'center' },
  storyBar: { height: 6, backgroundColor: colors.surfaceStrong, borderRadius: 3, width: '100%', marginBottom: 8 },
  storyBarFill: { height: 6, backgroundColor: colors.brandOrange, borderRadius: 3 },
  storyKm: { fontSize: 13, color: colors.textSoft, marginBottom: 24 },
  storyFooter: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', borderTopWidth: 1, borderTopColor: colors.surfaceStrong, paddingTop: 12 },
  storyNombre: { fontSize: 13, color: colors.text, fontWeight: 'bold' },
  storyUrl: { fontSize: 13, color: colors.brandOrange },
  movimientoSection: { marginHorizontal: 0, marginTop: 14, marginBottom: 6 },
  movimientoTitulo: { color: colors.textSoft, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 10 },
  actividadRecienteCard: { backgroundColor: '#13283D', borderRadius: 16, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: colors.surfaceStrong },
  actividadRecienteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  actividadRecienteEyebrow: { color: '#617184', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  actividadRecienteFecha: { color: '#617184', fontSize: 11, fontWeight: '600' },
  actividadRecienteFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actividadRecienteDeporte: { color: colors.text, fontSize: 16, fontWeight: '800' },
  actividadRecienteFuente: { color: colors.textSoft, fontSize: 11, marginTop: 3 },
  actividadRecienteKm: { color: colors.text, fontSize: 18, fontWeight: '800' },
  actividadesInicioCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 4, marginBottom: 10, borderTopWidth: 1, borderTopColor: colors.surfaceStrong },
  actividadesInicioTitulo: { color: colors.textSoft, fontSize: 13, fontWeight: '800' },
  actividadesInicioDesc: { color: colors.textSoft, fontSize: 11, marginTop: 3 },
  gpsInicioCard: { marginHorizontal: 20, marginTop: 4, marginBottom: 14, paddingHorizontal: 15, paddingVertical: 13, minHeight: 72, borderRadius: 18, backgroundColor: '#122A42', borderWidth: 1, borderColor: '#244B70', flexDirection: 'row', alignItems: 'center', gap: 12 },
  gpsInicioIcono: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#173B60', borderWidth: 1, borderColor: '#28577F', alignItems: 'center', justifyContent: 'center' },
  gpsInicioEyebrow: { color: '#6F95BA', fontSize: 8, fontWeight: '800', letterSpacing: 1.8, marginBottom: 2 },
  gpsInicioTitulo: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 2 },
  gpsInicioDesc: { color: '#8FAECC', fontSize: 10, lineHeight: 14 },
  gpsInicioAccion: { height: 34, borderRadius: 17, backgroundColor: colors.brandOrange, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  gpsInicioAccionText: { color: colors.text, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  actualizarBtn: { marginTop: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2a4a6a', alignItems: 'center' },
  actualizarBtnText: { color: colors.textSoft, fontSize: 14 },
  metaCard: { backgroundColor: colors.surfaceStrong, borderRadius: 16, padding: 18, marginBottom: 8, borderWidth: 1, borderColor: colors.brandOrange },
  metaCardTitulo: { fontSize: 15, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  metaCardSubtitulo: { fontSize: 12, color: colors.textSoft, marginBottom: 14 },
  metaInputRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  metaInput: { flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: '#2a4a6a' },
  metaGuardarBtn: { backgroundColor: colors.brandOrange, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  metaGuardarBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 14 },
  metaSaltarBtn: { alignItems: 'center', paddingVertical: 4 },
  metaSaltarText: { color: '#4a6a8a', fontSize: 12 },
});
