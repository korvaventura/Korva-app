import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView, Linking, TextInput, Alert, Modal } from 'react-native';
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

const CHECKPOINTS_NOMBRES = ['Tolhuin', 'Lago Fagnano', 'Paso Garibaldi', 'Monte Olivia', 'Ushuaia'];
const CHECKPOINTS_KM = [0, 20, 45, 80, 103];

const PASOS = [
  { emoji: '🔗', titulo: 'Conectá Strava', desc: 'Sincronizá tus actividades automáticamente.' },
  { emoji: '🏃', titulo: 'Empezá a correr', desc: 'Cada km cuenta hacia tu medalla.' },
  { emoji: '📦', titulo: 'Recibí tu medalla', desc: 'Al llegar al 100% te la enviamos a casa.' },
];

const getFrase = (pct, modalidad) => {
  if (pct >= 100) return '¡Llegué al fin del mundo! 🏁';
  if (pct >= 75) return 'Ya casi llego... 💪';
  if (pct >= 50) return 'Mitad del camino recorrido 🔥';
  if (pct >= 25) return 'Arrancando fuerte ⚡';
  return 'El camino empieza con el primer paso 🌱';
};

const diasEntre = (fecha1, fecha2) => {
  const d1 = new Date(fecha1);
  const d2 = new Date(fecha2);
  return Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)));
};

const getCheckpointDesbloqueado = (kmCompletados, distanciaTotal) => {
  const DISTANCIA_FISICA = 103;
  const factor = distanciaTotal / DISTANCIA_FISICA;
  const kmFisicos = parseFloat(kmCompletados) / factor;
  let ultimoDesbloqueado = null;
  for (let i = 0; i < CHECKPOINTS_KM.length; i++) {
    if (kmFisicos >= CHECKPOINTS_KM[i]) {
      ultimoDesbloqueado = CHECKPOINTS_NOMBRES[i];
    }
  }
  return ultimoDesbloqueado;
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
  const [modalStravaVisible, setModalStravaVisible] = useState(false);
  const viewShotRefs = useRef([]);

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
        .select('strava_token')
        .eq('id', userId)
        .single();
      setStravaConectado(!!data?.strava_token);
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
      console.error('Error:', err);
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
    const result = await WebBrowser.openAuthSessionAsync(
      `${BACKEND_URL}/strava/auth`,
      'korva://strava-connected'
    );
    if (result.type === 'success' || result.url?.includes('strava-connected')) {
      await verificarStrava();
      await cargarProgreso();
      setModalStravaVisible(true);
    }
  };

  const compartirProgreso = async (index) => {
    try {
      const uri = await viewShotRefs.current[index].capture();
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Compartir mi progreso en Korva',
      });
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

      {/* Modal instructivo Strava */}
      <Modal
        visible={modalStravaVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalStravaVisible(false)}
      >
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

      <View style={styles.header}>
        <View>
          <Text style={styles.saludo}>Hola{nombre ? `, ${nombre}` : ''}! 👋</Text>
          <Text style={styles.subtitulo}>Tus retos activos</Text>
        </View>

        {stravaConectado ? (
          <View style={styles.stravaConectadoBadge}>
            <Text style={styles.stravaConectadoBadgeText}>✓ Strava</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.stravaBtn} onPress={conectarStrava}>
            <Text style={styles.stravaBtnText}>Conectar Strava</Text>
          </TouchableOpacity>
        )}
      </View>

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
          {!stravaConectado && (
            <TouchableOpacity style={styles.bannerBtn} onPress={conectarStrava}>
              <View style={styles.btnRow}>
                <Text style={styles.bannerBtnText}>Conectar Strava ahora</Text>
                <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}

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

          {challengesActivos.length === 0 && challengesPending.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🏁</Text>
              <Text style={styles.emptyText}>Sin retos activos</Text>
              <Text style={styles.emptySubtext}>Inscribite en un challenge desde el Catálogo y empezá a correr</Text>
            </View>
          ) : (
            challengesActivos.map((item, index) => {
              const pct = Math.min(parseFloat(item.porcentaje), 100);
              const estaCompletado = pct >= 100;
              const frase = getFrase(pct, item.modalidad);
              const mostrarCardMeta = metaVisibles[item.challenge_id];
              const checkpointActual = getCheckpointDesbloqueado(item.km_completados, item.distancia_total);
              const metaFormateada = formatearFechaMeta(item.meta_fecha);
              const bordeCard = estaCompletado ? '#FC4C02' : pct >= 75 ? '#FC4C02' : '#1E3A5F';

              return (
                <View key={`activo-${index}`}>
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

                      {checkpointActual && checkpointActual !== 'Tolhuin' && (
                        <View style={styles.shareCheckpoint}>
                          <Text style={styles.shareCheckpointText}>📍 {checkpointActual}</Text>
                        </View>
                      )}

                      <View style={styles.shareProgressBar}>
                        <View style={[styles.shareProgressFill, { width: `${pct}%` }, estaCompletado && styles.shareProgressFillCompletado]} />
                      </View>

                      <View style={styles.shareKmRow}>
                        <Text style={styles.shareKmText}>{item.km_completados} km</Text>
                        <Text style={styles.shareKmTotal}>· Tolhuin → Ushuaia</Text>
                        {estaCompletado && <Text style={styles.shareCompletadoBadge}>🏅</Text>}
                      </View>

                      {metaFormateada && (
                        <Text style={styles.shareMetaText}>🎯 Meta: {metaFormateada}</Text>
                      )}

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

                  <TouchableOpacity
                    style={styles.detalleBtn}
                    onPress={() => navigation.navigate('DetalleReto', { item, userId })}
                  >
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
            })
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

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  saludo: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  subtitulo: { fontSize: 13, color: '#A8CFFF' },
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
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 40, alignItems: 'center', marginTop: 20 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#A8CFFF', textAlign: 'center', lineHeight: 20 },
  shareCard: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 24, marginBottom: 8, borderWidth: 2 },
  shareHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  shareKorvaLogo: { fontSize: 13, fontWeight: 'bold', color: '#FC4C02', letterSpacing: 2 },
  shareDeporte: { fontSize: 11, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 1 },
  sharePctWrapper: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  sharePctNumero: { fontSize: 72, fontWeight: 'bold', color: '#FFFFFF', lineHeight: 80 },
  sharePctSymbol: { fontSize: 32, fontWeight: 'bold', color: '#FC4C02', marginBottom: 12, marginLeft: 4 },
  shareChallengeName: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  shareFrase: { fontSize: 13, color: '#A8CFFF', marginBottom: 12, fontStyle: 'italic' },
  shareCheckpoint: { backgroundColor: '#0D1B2A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: 14 },
  shareCheckpointText: { fontSize: 12, color: '#FC4C02', fontWeight: 'bold' },
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