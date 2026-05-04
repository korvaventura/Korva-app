import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

export default function AdminScreen() {
  const [challenges, setChallenges] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [tracking, setTracking] = useState({});
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarChallenges();
  }, []);

  const cargarChallenges = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/admin/challenges-activos`);
      const data = await res.json();
      setChallenges(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setCargando(false);
    }
  };

  const enviarMedalla = async (ucId, nombre) => {
    const trackingNum = tracking[ucId] || '';
    try {
      const res = await fetch(`${BACKEND_URL}/admin/medalla-enviada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_challenge_id: ucId, tracking_number: trackingNum })
      });
      const data = await res.json();
      setMensaje(`✅ Medalla enviada a ${nombre}!`);
      cargarChallenges();
    } catch (error) {
      setMensaje('Error al enviar');
    }
  };

  const renderDireccion = (direccion) => {
    if (!direccion) return (
      <View style={styles.sinDireccionBox}>
        <Text style={styles.sinDireccion}>📍 Sin direccion guardada</Text>
      </View>
    );
    return (
      <View style={styles.direccionBox}>
        <Text style={styles.direccionTitulo}>📦 Enviar a</Text>
        <Text style={styles.direccionNombre}>{direccion.nombre}</Text>
        <Text style={styles.direccionLinea}>🏠 {direccion.direccion}</Text>
        <Text style={styles.direccionLinea}>🏙️ {direccion.ciudad}, {direccion.codigo_postal}</Text>
        <Text style={styles.direccionLinea}>🌍 {direccion.pais}</Text>
        {direccion.telefono && <Text style={styles.direccionLinea}>📞 {direccion.telefono}</Text>}
      </View>
    );
  };

  const pendientes = challenges.filter(c => c.status === 'completed');
  const enviados = challenges.filter(c => c.status === 'shipped');

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>⚙️ Admin</Text>
      <Text style={styles.subtitulo}>Gestion de medallas</Text>

      {/* Resumen */}
      <View style={styles.resumenRow}>
        <View style={[styles.resumenCard, { borderColor: '#FC4C02' }]}>
          <Text style={[styles.resumenNumero, { color: '#FC4C02' }]}>{pendientes.length}</Text>
          <Text style={styles.resumenLabel}>Pendientes</Text>
        </View>
        <View style={[styles.resumenCard, { borderColor: '#4CAF50' }]}>
          <Text style={[styles.resumenNumero, { color: '#4CAF50' }]}>{enviados.length}</Text>
          <Text style={styles.resumenLabel}>Enviadas</Text>
        </View>
        <View style={[styles.resumenCard, { borderColor: '#1E6FD9' }]}>
          <Text style={[styles.resumenNumero, { color: '#1E6FD9' }]}>{challenges.length}</Text>
          <Text style={styles.resumenLabel}>Total</Text>
        </View>
      </View>

      {mensaje ? (
        <View style={styles.mensajeBox}>
          <Text style={styles.mensajeText}>{mensaje}</Text>
        </View>
      ) : null}

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Pendientes */}
          <Text style={styles.seccionTitulo}>🟡 Pendientes de envio ({pendientes.length})</Text>
          {pendientes.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🎉</Text>
              <Text style={styles.emptyText}>Todo al dia!</Text>
              <Text style={styles.emptySubtext}>No hay medallas pendientes de envio</Text>
            </View>
          ) : (
            pendientes.map((item, index) => (
              <View key={index} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.deporte}>{item.modalidad === 'run' ? '🏃 RUNNING' : '🚴 CICLISMO'}</Text>
                    <Text style={styles.nombre}>{item.usuario}</Text>
                    <Text style={styles.challenge}>{item.challenge}</Text>
                  </View>
                  <View style={styles.kmBadge}>
                    <Text style={styles.kmNumero}>{item.km_completados}</Text>
                    <Text style={styles.kmLabel}>km</Text>
                  </View>
                </View>
                <Text style={styles.email}>{item.email}</Text>
                {renderDireccion(item.direccion)}
                <Text style={styles.label}>NUMERO DE TRACKING</Text>
                <TextInput
                  style={styles.input}
                  value={tracking[item.id] || ''}
                  onChangeText={(val) => setTracking({ ...tracking, [item.id]: val })}
                  placeholder="Ej: AR123456789"
                  placeholderTextColor="#4a6a8a"
                />
                <TouchableOpacity style={styles.button} onPress={() => enviarMedalla(item.id, item.usuario)}>
                  <Text style={styles.buttonText}>📬 Marcar como enviada y notificar</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          {/* Enviadas */}
          <Text style={styles.seccionTitulo}>✅ Enviadas ({enviados.length})</Text>
          {enviados.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Sin envios todavia</Text>
            </View>
          ) : (
            enviados.map((item, index) => (
              <View key={index} style={styles.cardShipped}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.deporte}>{item.modalidad === 'run' ? '🏃 RUNNING' : '🚴 CICLISMO'}</Text>
                    <Text style={styles.nombre}>{item.usuario}</Text>
                    <Text style={styles.challenge}>{item.challenge}</Text>
                  </View>
                  <View style={styles.shippedBadge}>
                    <Text style={styles.shippedBadgeText}>✅</Text>
                  </View>
                </View>
                <Text style={styles.email}>{item.email}</Text>
                {renderDireccion(item.direccion)}
                {item.tracking_number && (
                  <View style={styles.trackingBox}>
                    <Text style={styles.trackingLabel}>TRACKING</Text>
                    <Text style={styles.trackingNum}>{item.tracking_number}</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  titulo: { fontSize: 26, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  subtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 20 },
  resumenRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  resumenCard: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  resumenNumero: { fontSize: 28, fontWeight: 'bold', marginBottom: 2 },
  resumenLabel: { fontSize: 11, color: '#A8CFFF', letterSpacing: 0.5 },
  mensajeBox: { backgroundColor: '#0a2a1a', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#4CAF50' },
  mensajeText: { color: '#4CAF50', fontSize: 14, textAlign: 'center', fontWeight: 'bold' },
  seccionTitulo: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12, marginTop: 4, letterSpacing: 0.5 },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 16 },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyText: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  emptySubtext: { fontSize: 13, color: '#A8CFFF' },
  card: { backgroundColor: '#1E3A5F', borderRadius: 18, padding: 20, marginBottom: 16 },
  cardShipped: { backgroundColor: '#1a2a1a', borderRadius: 18, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#2a4a2a' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  deporte: { fontSize: 11, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 1, marginBottom: 4 },
  nombre: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  challenge: { fontSize: 13, color: '#A8CFFF' },
  email: { fontSize: 12, color: '#4a6a8a', marginBottom: 14 },
  kmBadge: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 10, alignItems: 'center', minWidth: 60 },
  kmNumero: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  kmLabel: { fontSize: 11, color: '#A8CFFF' },
  shippedBadge: { backgroundColor: '#0a2a1a', borderRadius: 12, padding: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  shippedBadgeText: { fontSize: 20 },
  sinDireccionBox: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12, marginBottom: 14 },
  sinDireccion: { fontSize: 13, color: '#4a6a8a', fontStyle: 'italic' },
  direccionBox: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 14, marginBottom: 14 },
  direccionTitulo: { fontSize: 10, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 2, marginBottom: 8 },
  direccionNombre: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 6 },
  direccionLinea: { fontSize: 13, color: '#A8CFFF', marginBottom: 4 },
  label: { fontSize: 10, fontWeight: 'bold', color: '#4a6a8a', letterSpacing: 2, marginBottom: 8 },
  input: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 14, color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: '#2a4a6a', marginBottom: 12 },
  button: { backgroundColor: '#FC4C02', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  trackingBox: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12 },
  trackingLabel: { fontSize: 10, fontWeight: 'bold', color: '#4CAF50', letterSpacing: 2, marginBottom: 4 },
  trackingNum: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
});