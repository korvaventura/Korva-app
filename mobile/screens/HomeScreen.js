import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import CompletadoScreen from './CompletadoScreen';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const PASOS = [
  { emoji: '🔗', titulo: 'Conectá Strava', desc: 'Sincronizá tus actividades automáticamente.' },
  { emoji: '🏃', titulo: 'Empezá a correr', desc: 'Cada km cuenta hacia tu medalla.' },
  { emoji: '📦', titulo: 'Recibí tu medalla', desc: 'Al llegar al 100% te la enviamos a casa.' },
];

export default function HomeScreen() {
  const [challenges, setChallenges] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [userId, setUserId] = useState(null);
  const [completado, setCompletado] = useState(null);
  const [nombre, setNombre] = useState('');
  const [bannerVisible, setBannerVisible] = useState(false);
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
    if (userId) cargarProgreso();
  }, [userId]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('strava-connected')) cargarProgreso();
    });
    return () => subscription.remove();
  }, []);

  const cargarProgreso = async () => {
    if (!userId) return;
    try {
      setCargando(true);
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
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setCargando(false);
    }
  };

  const conectarStrava = async () => {
    await Linking.openURL(`${BACKEND_URL}/strava/auth`);
  };

  const compartirProgreso = async (index) => {
    try {
      const uri = await viewShotRefs.current[index].capture();
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Compartir mi progreso en Korva',
      });
    } catch (error) {
      console.error('Error compartiendo:', error);
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
      
      <View style={styles.header}>
        <View>
          <Text style={styles.saludo}>Hola{nombre ? `, ${nombre}` : ''}! 👋</Text>
          <Text style={styles.subtitulo}>Tus retos activos</Text>
        </View>
        <TouchableOpacity style={styles.stravaBtn} onPress={conectarStrava}>
          <Text style={styles.stravaBtnText}>Strava</Text>
        </TouchableOpacity>
      </View>

      {/* Banner qué hacer después de pagar */}
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
          <TouchableOpacity style={styles.bannerBtn} onPress={conectarStrava}>
            <Text style={styles.bannerBtnText}>Conectar Strava ahora →</Text>
          </TouchableOpacity>
        </View>
      )}

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Cards de challenges pendientes de pago */}
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

          {/* Challenges activos */}
          {challengesActivos.length === 0 && challengesPending.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🏁</Text>
              <Text style={styles.emptyText}>Sin retos activos</Text>
              <Text style={styles.emptySubtext}>Inscribite en un challenge desde el Catalogo y empeza a correr</Text>
            </View>
          ) : (
            challengesActivos.map((item, index) => {
              const pct = Math.min(parseFloat(item.porcentaje), 100);
              const completado = pct >= 100;
              return (
                <View key={`activo-${index}`}>
                  <ViewShot
                    ref={ref => viewShotRefs.current[index] = ref}
                    options={{ format: 'png', quality: 1 }}
                  >
                    <View style={[styles.card, completado && styles.cardCompletado]}>
                      <View style={styles.korvaTag}>
                        <Text style={styles.korvaTagText}>🏅 KORVA</Text>
                      </View>
                      <View style={styles.cardTop}>
                        <View>
                          <Text style={styles.deporte}>
                            {item.modalidad === 'Running' ? '🏃 RUNNING' : item.modalidad === 'Ciclismo' ? '🚴 CICLISMO' : '🏊 NATACION'}
                          </Text>
                          <Text style={styles.challengeTitle}>{item.challenge}</Text>
                        </View>
                        <View style={styles.pctCircle}>
                          <Text style={styles.pctText}>{pct.toFixed(0)}%</Text>
                        </View>
                      </View>

                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${pct}%` }, completado && styles.progressFillCompletado]} />
                      </View>

                      <View style={styles.cardBottom}>
                        <Text style={styles.kmText}>{item.km_completados} km</Text>
                        <Text style={styles.kmTotal}>de {item.distancia_total} km</Text>
                        <Text style={[styles.estado, completado && styles.estadoCompletado]}>
                          {completado ? '🏅 Completado!' : '⚡ En progreso'}
                        </Text>
                      </View>

                      {nombre ? (
                        <Text style={styles.cardNombre}>{nombre} · korva.run</Text>
                      ) : null}
                    </View>
                  </ViewShot>

                  <TouchableOpacity style={styles.compartirBtn} onPress={() => compartirProgreso(index)}>
                    <Text style={styles.compartirBtnText}>📤 Compartir progreso</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </>
      )}

      <TouchableOpacity style={styles.actualizarBtn} onPress={cargarProgreso}>
        <Text style={styles.actualizarBtnText}>↻ Actualizar progreso</Text>
      </TouchableOpacity>

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
  card: { backgroundColor: '#1E3A5F', borderRadius: 20, padding: 20, marginBottom: 8 },
  cardCompletado: { borderWidth: 1, borderColor: '#FC4C02' },
  korvaTag: { marginBottom: 10 },
  korvaTagText: { fontSize: 11, fontWeight: 'bold', color: '#FC4C02', letterSpacing: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  deporte: { fontSize: 11, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 1, marginBottom: 4 },
  challengeTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  pctCircle: { backgroundColor: '#0D1B2A', borderRadius: 30, width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  pctText: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' },
  progressBar: { height: 8, backgroundColor: '#0D1B2A', borderRadius: 4, marginBottom: 14 },
  progressFill: { height: 8, backgroundColor: '#1E6FD9', borderRadius: 4 },
  progressFillCompletado: { backgroundColor: '#FC4C02' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kmText: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  kmTotal: { fontSize: 13, color: '#A8CFFF', flex: 1 },
  estado: { fontSize: 12, color: '#A8CFFF', fontWeight: 'bold' },
  estadoCompletado: { color: '#FC4C02' },
  cardNombre: { fontSize: 11, color: '#4a6a8a', marginTop: 12, textAlign: 'right' },
  compartirBtn: { backgroundColor: '#0D1B2A', borderWidth: 1, borderColor: '#2a4a6a', paddingVertical: 10, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  compartirBtnText: { color: '#A8CFFF', fontSize: 13, fontWeight: 'bold' },
  actualizarBtn: { marginTop: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2a4a6a', alignItems: 'center' },
  actualizarBtnText: { color: '#A8CFFF', fontSize: 14 },
});