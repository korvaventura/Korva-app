import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { useState, useEffect } from 'react';

const BACKEND_URL = 'http://localhost:3000';
const USER_ID = 'd7a14473-49bb-4afd-bcad-d0b27c15a39d';

export default function CatalogoScreen() {
  const [challenges, setChallenges] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [challengeSeleccionado, setChallengeSeleccionado] = useState(null);

  useEffect(() => {
    cargarChallenges();
  }, []);

  const cargarChallenges = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/challenges`);
      const data = await res.json();
      setChallenges(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setCargando(false);
    }
  };

  const abrirModal = (challenge) => {
    setChallengeSeleccionado(challenge);
    setModalVisible(true);
  };

  const inscribirse = async (modalidad) => {
    try {
      const res = await fetch(`${BACKEND_URL}/challenges/inscribir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: USER_ID,
          challenge_id: challengeSeleccionado.id,
          modalidad: modalidad
        })
      });
      const data = await res.json();
      setModalVisible(false);
      alert(data.mensaje || 'Inscripto exitosamente!');
    } catch (error) {
      alert('Error al inscribirse');
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>Challenges disponibles</Text>
      <Text style={styles.subtitulo}>Elegi tu proximo desafio</Text>

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" />
      ) : (
        challenges.map((item, index) => (
          <View key={index} style={styles.card}>
            <Text style={styles.deporte}>
              {item.sport_type === 'run' ? 'RUNNING' : item.sport_type === 'ride' ? 'CICLISMO' : 'MULTIDEPORTE'}
            </Text>
            <Text style={styles.titulo2}>{item.title}</Text>
            <Text style={styles.descripcion}>{item.description}</Text>
            <View style={styles.row}>
              <Text style={styles.distancia}>{item.total_distance_km} km</Text>
              <Text style={styles.precio}>USD ${item.price_usd}</Text>
            </View>
            {item.modalidades && (
              <View style={styles.modalidadesContainer}>
                {item.modalidades.map((m, i) => (
                  <View key={i} style={styles.modalidadTag}>
                    <Text style={styles.modalidadText}>{m.label} — {m.distancia_km}km</Text>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity style={styles.button} onPress={() => abrirModal(item)}>
              <Text style={styles.buttonText}>Inscribirme</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Elegí tu modalidad</Text>
            <Text style={styles.modalSubtitulo}>{challengeSeleccionado?.title}</Text>

            {challengeSeleccionado?.modalidades?.map((m, i) => (
              <TouchableOpacity key={i} style={styles.modalButton} onPress={() => inscribirse(m.tipo)}>
                <Text style={styles.modalButtonTitulo}>{m.label}</Text>
                <Text style={styles.modalButtonKm}>{m.distancia_km} km</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  subtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 24 },
  card: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, width: '100%', marginBottom: 16 },
  deporte: { fontSize: 11, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 1, marginBottom: 6 },
  titulo2: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  descripcion: { fontSize: 13, color: '#A8CFFF', marginBottom: 16, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  distancia: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  precio: { fontSize: 16, fontWeight: 'bold', color: '#FC4C02' },
  modalidadesContainer: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modalidadTag: { backgroundColor: '#0D1B2A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  modalidadText: { color: '#A8CFFF', fontSize: 12 },
  button: { backgroundColor: '#1E6FD9', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#1E3A5F', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 32 },
  modalTitulo: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  modalSubtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 24 },
  modalButton: { backgroundColor: '#0D1B2A', borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalButtonTitulo: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  modalButtonKm: { fontSize: 14, color: '#1E6FD9' },
  modalCancelar: { marginTop: 8, alignItems: 'center' },
  modalCancelarText: { color: '#A8CFFF', fontSize: 15 },
});