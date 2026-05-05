import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Image, Linking } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import DetalleScreen from './DetalleScreen';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

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
  const [detalleVisible, setDetalleVisible] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id);
    });
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

  const abrirDetalle = (challenge) => {
    setChallengeSeleccionado(challenge);
    setDetalleVisible(true);
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
        body: JSON.stringify({ user_id: userId, challenge_id: challengeSeleccionado.id, modalidad })
      });
      const data = await res.json();
      setModalModalidad(false);
      if (data.mensaje === 'Ya estas inscripto en este challenge con esta modalidad') {
        alert(data.mensaje);
        return;
      }
      setModalPais(true);
    } catch (error) {
      alert('Error al inscribirse');
    }
  };

  const elegirPais = (pais) => {
    setModalPais(false);
    Linking.openURL(PAGOS[pais]);
  };

  // Si hay detalle visible, mostrar DetalleScreen
  if (detalleVisible && challengeSeleccionado) {
    return (
      <DetalleScreen
        challenge={challengeSeleccionado}
        userId={userId}
        onVolver={() => setDetalleVisible(false)}
        onInscribir={() => {
          setDetalleVisible(false);
          setModalModalidad(true);
        }}
      />
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>Challenges</Text>
      <Text style={styles.subtitulo}>Elegi tu proximo desafio 🏆</Text>

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" style={{ marginTop: 40 }} />
      ) : (
        challenges.map((item, index) => (
          <TouchableOpacity key={index} style={styles.card} onPress={() => abrirDetalle(item)} activeOpacity={0.85}>
            {item.medal_image_url && (
              <Image source={{ uri: item.medal_image_url }} style={styles.medallaImage} resizeMode="contain" />
            )}
            <View style={styles.cardBody}>
              <View style={styles.deporteRow}>
                <Text style={styles.deporte}>
                  {item.sport_type === 'run' ? '🏃 RUNNING' : item.sport_type === 'ride' ? '🚴 CICLISMO' : '🌐 MULTIDEPORTE'}
                </Text>
                <Text style={styles.precio}>USD ${item.price_usd}</Text>
              </View>
              <Text style={styles.titulo2}>{item.title}</Text>
              <Text style={styles.descripcion} numberOfLines={2}>{item.description}</Text>

              {item.modalidades && (
                <View style={styles.modalidadesContainer}>
                  {item.modalidades.map((m, i) => (
                    <View key={i} style={styles.modalidadTag}>
                      <Text style={styles.modalidadEmoji}>
                        {m.tipo === 'run' ? '🏃' : '🚴'}
                      </Text>
                      <Text style={styles.modalidadText}>{m.label} — {m.distancia_km}km</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.botonesRow}>
                <TouchableOpacity style={styles.detalleBtn} onPress={() => abrirDetalle(item)}>
                  <Text style={styles.detalleBtnText}>Ver detalle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.button} onPress={(e) => { e.stopPropagation?.(); abrirModal(item); }}>
                  <Text style={styles.buttonText}>Inscribirme →</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
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
                <View>
                  <Text style={styles.modalButtonTitulo}>{m.tipo === 'run' ? '🏃' : '🚴'} {m.label}</Text>
                  <Text style={styles.modalButtonSub}>{m.distancia_km} km totales</Text>
                </View>
                <Text style={styles.modalArrow}>→</Text>
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
            <Text style={styles.modalSubtitulo}>Selecciona tu metodo de pago</Text>
            <TouchableOpacity style={styles.modalButton} onPress={() => elegirPais('argentina')}>
              <View>
                <Text style={styles.modalButtonTitulo}>🇦🇷 Argentina</Text>
                <Text style={styles.modalButtonSub}>Pagar con Mercado Pago</Text>
              </View>
              <Text style={styles.modalArrow}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalButton} onPress={() => elegirPais('internacional')}>
              <View>
                <Text style={styles.modalButtonTitulo}>🌍 Resto del mundo</Text>
                <Text style={styles.modalButtonSub}>Pagar con tarjeta</Text>
              </View>
              <Text style={styles.modalArrow}>→</Text>
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
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  subtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 24 },
  card: { backgroundColor: '#1E3A5F', borderRadius: 20, marginBottom: 20, overflow: 'hidden' },
  medallaImage: { width: '100%', height: 280, backgroundColor: '#f5f5f5' },
  cardBody: { padding: 20 },
  deporteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  deporte: { fontSize: 11, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 1 },
  precio: { fontSize: 18, fontWeight: 'bold', color: '#FC4C02' },
  titulo2: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  descripcion: { fontSize: 13, color: '#A8CFFF', marginBottom: 16, lineHeight: 20 },
  modalidadesContainer: { gap: 8, marginBottom: 16 },
  modalidadTag: { backgroundColor: '#0D1B2A', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalidadEmoji: { fontSize: 14 },
  modalidadText: { color: '#A8CFFF', fontSize: 13 },
  botonesRow: { flexDirection: 'row', gap: 10 },
  detalleBtn: { flex: 1, borderWidth: 1, borderColor: '#1E6FD9', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  detalleBtnText: { color: '#1E6FD9', fontWeight: 'bold', fontSize: 14 },
  button: { flex: 1, backgroundColor: '#1E6FD9', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#1E3A5F', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 32 },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  modalSubtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 24 },
  modalButton: { backgroundColor: '#0D1B2A', borderRadius: 14, padding: 18, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalButtonTitulo: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  modalButtonSub: { fontSize: 12, color: '#A8CFFF' },
  modalArrow: { fontSize: 18, color: '#1E6FD9' },
  modalCancelar: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  modalCancelarText: { color: '#A8CFFF', fontSize: 15 },
});