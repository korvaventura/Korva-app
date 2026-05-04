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
        body: JSON.stringify({
          user_challenge_id: ucId,
          tracking_number: trackingNum
        })
      });
      const data = await res.json();
      setMensaje(`Medalla enviada a ${nombre} y email enviado!`);
      cargarChallenges();
    } catch (error) {
      setMensaje('Error al enviar');
    }
  };

  const renderDireccion = (direccion) => {
    if (!direccion) return <Text style={styles.sinDireccion}>Sin direccion guardada</Text>;
    return (
      <View style={styles.direccionBox}>
        <Text style={styles.direccionTitulo}>📦 Direccion de envio</Text>
        <Text style={styles.direccionLinea}>👤 {direccion.nombre}</Text>
        <Text style={styles.direccionLinea}>🏠 {direccion.direccion}</Text>
        <Text style={styles.direccionLinea}>🏙️ {direccion.ciudad}, {direccion.codigo_postal}</Text>
        <Text style={styles.direccionLinea}>🌍 {direccion.pais}</Text>
        {direccion.telefono && <Text style={styles.direccionLinea}>📞 {direccion.telefono}</Text>}
      </View>
    );
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>Panel Admin</Text>
      <Text style={styles.subtitulo}>Gestionar envios de medallas</Text>

      {mensaje ? (
        <View style={styles.mensajeBox}>
          <Text style={styles.mensajeText}>{mensaje}</Text>
        </View>
      ) : null}

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" />
      ) : challenges.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No hay challenges completados pendientes de envio</Text>
        </View>
      ) : (
        challenges.map((item, index) => (
          <View key={index} style={styles.card}>
            <Text style={styles.deporte}>{item.modalidad?.toUpperCase()}</Text>
            <Text style={styles.nombre}>{item.usuario}</Text>
            <Text style={styles.challenge}>{item.challenge}</Text>
            <Text style={styles.km}>{item.km_completados} km completados</Text>
            <Text style={styles.email}>{item.email}</Text>

            {renderDireccion(item.direccion)}

            <Text style={styles.label}>Numero de tracking</Text>
            <TextInput
              style={styles.input}
              value={tracking[item.id] || ''}
              onChangeText={(val) => setTracking({ ...tracking, [item.id]: val })}
              placeholder="Ej: AR123456789"
              placeholderTextColor="#A8CFFF"
            />

            <TouchableOpacity
              style={styles.button}
              onPress={() => enviarMedalla(item.id, item.usuario)}
            >
              <Text style={styles.buttonText}>Marcar como enviada y notificar</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  subtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 24 },
  mensajeBox: { backgroundColor: '#1E3A5F', borderRadius: 12, padding: 16, marginBottom: 16 },
  mensajeText: { color: '#FFFFFF', fontSize: 14, textAlign: 'center' },
  emptyCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, alignItems: 'center' },
  emptyText: { color: '#A8CFFF', fontSize: 14, textAlign: 'center' },
  card: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, marginBottom: 16 },
  deporte: { fontSize: 11, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 1, marginBottom: 4 },
  nombre: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  challenge: { fontSize: 14, color: '#A8CFFF', marginBottom: 2 },
  km: { fontSize: 13, color: '#A8CFFF', marginBottom: 2 },
  email: { fontSize: 12, color: '#666', marginBottom: 12 },
  direccionBox: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 14, marginBottom: 16 },
  direccionTitulo: { fontSize: 12, fontWeight: 'bold', color: '#1E6FD9', marginBottom: 8, letterSpacing: 1 },
  direccionLinea: { fontSize: 13, color: '#A8CFFF', marginBottom: 4 },
  sinDireccion: { fontSize: 13, color: '#555', marginBottom: 16, fontStyle: 'italic' },
  label: { fontSize: 12, fontWeight: 'bold', color: '#A8CFFF', letterSpacing: 1, marginBottom: 8 },
  input: { backgroundColor: '#0D1B2A', borderRadius: 10, padding: 12, color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: '#1E6FD9', marginBottom: 12 },
  button: { backgroundColor: '#FC4C02', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});