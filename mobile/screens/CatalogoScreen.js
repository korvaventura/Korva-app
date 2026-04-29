import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { useState, useEffect } from 'react';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const USER_ID = 'd7a14473-49bb-4afd-bcad-d0b27c15a39d';

const PAGOS = {
  argentina: 'https://mercadopago.com.ar/checkout/v1/payment/redirect/?source=link&preference-id=219142022-90f45334-5f3f-4915-9257-8bd9927358f7&router-request-id=598a77b8-fb4f-4a59-a7af-726a549fee84',
  internacional: 'https://korva.run/checkouts/cn/hWNBaFxYXSDjdVEYt4dknUlo/es-au?_r=AQABySzhco79xS3HYq8eSjDO34Kb_o1URh9NZ-OcTwEZBDI&auto_redirect=false&edge_redirect=true&skip_shop_pay=true',
};

export default function CatalogoScreen() {
  const [challenges, setChallenges] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalModalidad, setModalModalidad] = useState(false);
  const [modalPais, setModalPais] = useState(false);
  const [challengeSeleccionado, setChallengeSeleccionado] = useState(null);
  const [modalidadSeleccionada, setModalidadSeleccionada] = useState(null);

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
    setModalModalidad(true);
  };

  const elegirModalidad = async (modalidad) => {
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
      setModalModalidad(false);

      if (data.mensaje === 'Ya estas inscripto en este challenge con esta modalidad') {
        alert(data.mensaje);
        return;
      }

      setModalidadSeleccionada(modalidad);
      setModalPais(true);

    } catch (error) {
      alert('Error al inscribirse');
    }
  };

  const elegirPais = (pais) => {
    setModalPais(false);
    window.open(PAGOS[pais], '_blank');
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

      {/* Modal modalidad */}
      <Modal visible={modalModalidad} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Elegi tu modalidad</Text>
            <Text style={styles.modalSubtitulo}>{challengeSeleccionado?.title}</Text>
            {challengeSeleccionado?.modalidades?.map((m, i) => (
              <TouchableOpacity key={i} style={styles.modalButton} onPress={() => elegirModalidad(m.tipo)}>
                <Text style={styles.modalButtonTitulo}>{m.label}</Text>
                <Text style={styles.modalButtonKm}>{m.distancia_km} km</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalModalidad(false)}>
              <Text style={styles.modalCancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal pais */}
      <Modal visible={modalPais} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Donde estas?</Text>
            <Text style={styles.modalSubtitulo}>Elegí tu metodo de pago</Text>

            <TouchableOpacity style={styles.modalButton} onPress={() => elegirPais('argentina')}>
              <Text style={styles.modalButtonTitulo}>Argentina</Text>
              <Text style={styles.modalButtonKm}>Mercado Pago</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalButton} onPress={() => elegirPais('internacional')}>
              <Text style={styles.modalButtonTitulo}>Resto del mundo</Text>
              <Text style={styles.modalButtonKm}>Tarjeta / Shopify</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalPais(false)}>
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