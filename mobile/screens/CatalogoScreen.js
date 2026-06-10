import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Image, Linking, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import DetalleScreen from './DetalleScreen';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = 'https://korva-app-production.up.railway.app';

const ADMINS = [
  'korvaventura@gmail.com',
  'fabrialejandrogonzalez@gmail.com',
  'malejo.eche16@gmail.com',
];

export default function CatalogoScreen() {
  const [challenges, setChallenges] = useState([]);
  const [challengesBloqueados, setChallengesBloqueados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalModalidad, setModalModalidad] = useState(false);
  const [modalPais, setModalPais] = useState(false);
  const [challengeSeleccionado, setChallengeSeleccionado] = useState(null);
  const [detalleVisible, setDetalleVisible] = useState(false);
  const [userId, setUserId] = useState(null);
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
        setEsAdmin(ADMINS.includes(session.user.email?.toLowerCase()));
      }
    });
    cargarChallenges();
  }, []);

  const cargarChallenges = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/challenges`);
      const activos = await res.json();
      setChallenges(Array.isArray(activos) ? activos : []);

      const { data: bloqueados } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', false)
        .order('created_at', { ascending: true });

      setChallengesBloqueados(bloqueados || []);
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
        Alert.alert('Ya inscripto', data.mensaje);
        return;
      }
      setModalPais(true);
    } catch (error) {
      Alert.alert('Error', 'No se pudo completar la inscripción.');
    }
  };

  const elegirPais = (pais) => {
    setModalPais(false);
    const link = pais === 'argentina'
      ? challengeSeleccionado?.link_mercadopago
      : challengeSeleccionado?.link_shopify;

    if (!link) {
      Alert.alert('Link no disponible', 'El link de pago para este reto todavía no está configurado. Contactanos a korvaventura@gmail.com');
      return;
    }
    Linking.openURL(link);
  };

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

  const renderCardActiva = (item, index) => (
    <TouchableOpacity key={index} style={styles.card} onPress={() => abrirDetalle(item)} activeOpacity={0.85}>
      <View style={styles.imageWrapper}>
        {item.medal_image_url && (
          <Image source={{ uri: item.medal_image_url }} style={styles.medallaImage} resizeMode="contain" />
        )}
        {item.oferta_texto && (
          <View style={styles.ofertaBadge}>
            <Text style={styles.ofertaTexto}>🔥 {item.oferta_texto}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.deporteRow}>
          <Text style={styles.deporte}>
            {item.sport_type === 'run' ? '🏃 RUNNING' : item.sport_type === 'ride' ? '🚴 CICLISMO' : '🌐 MULTIDEPORTE'}
          </Text>
          <View>
            <Text style={styles.precio}>USD ${item.price_usd}</Text>
            {item.price_ars && <Text style={styles.precioArs}>$ {item.price_ars.toLocaleString('es-AR')} ARS</Text>}
          </View>
        </View>
        <Text style={styles.titulo2}>{item.title}</Text>
        <Text style={styles.descripcion} numberOfLines={2}>{item.description}</Text>

        {item.modalidades && (
          <View style={styles.modalidadesContainer}>
            {item.modalidades.map((m, i) => (
              <View key={i} style={styles.modalidadTag}>
                <Text style={styles.modalidadEmoji}>{m.tipo === 'run' ? '🏃' : '🚴'}</Text>
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
            <View style={styles.btnRow}>
              <Text style={styles.buttonText}>Inscribirme</Text>
              <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderCardBloqueadaAdmin = (item, index) => (
    <TouchableOpacity key={`admin-${index}`} style={[styles.card, styles.cardAdminPreview]} onPress={() => abrirDetalle(item)} activeOpacity={0.85}>
      <View style={styles.imageWrapper}>
        {item.medal_image_url && (
          <Image source={{ uri: item.medal_image_url }} style={styles.medallaImage} resizeMode="contain" />
        )}
        <View style={styles.adminPreviewBadge}>
          <Text style={styles.adminPreviewBadgeText}>👁️ PREVIEW ADMIN</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.deporteRow}>
          <Text style={styles.deporte}>🔒 PRÓXIMAMENTE</Text>
          <Text style={styles.precio}>USD ${item.price_usd}</Text>
        </View>
        <Text style={styles.titulo2}>{item.title}</Text>
        <Text style={styles.descripcion} numberOfLines={2}>{item.description}</Text>

        {item.modalidades && (
          <View style={styles.modalidadesContainer}>
            {item.modalidades.map((m, i) => (
              <View key={i} style={styles.modalidadTag}>
                <Text style={styles.modalidadEmoji}>{m.tipo === 'run' ? '🏃' : '🚴'}</Text>
                <Text style={styles.modalidadText}>{m.distancia_km}km</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.detalleBtn} onPress={() => abrirDetalle(item)}>
          <Text style={styles.detalleBtnText}>Ver detalle (preview)</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderCardBloqueada = (item, index) => (
    <View key={`bloqueado-${index}`} style={styles.cardBloqueada}>
      <View style={styles.imageWrapperBloqueado}>
        {item.medal_image_url ? (
          <Image source={{ uri: item.medal_image_url }} style={styles.medallaImageBloqueada} resizeMode="contain" blurRadius={18} />
        ) : (
          <View style={styles.medallaImageBloqueada} />
        )}
        <View style={styles.blurOverlay} />
        <View style={styles.candadoWrapper}>
          <Text style={styles.candadoEmoji}>🔒</Text>
          <Text style={styles.candadoTexto}>Próximamente</Text>
        </View>
      </View>
      <View style={styles.cardBodyBloqueado}>
        <Text style={styles.titulo2Bloqueado}>{item.title}</Text>
        <Text style={styles.precioBloqueado}>USD ${item.price_usd}</Text>
        <View style={styles.modalidadesContainerBloqueado}>
          <View style={styles.modalidadTagBloqueado}>
            <Text style={styles.modalidadTextBloqueado}>🏃 Running</Text>
          </View>
          <View style={styles.modalidadTagBloqueado}>
            <Text style={styles.modalidadTextBloqueado}>🚴 Ciclismo</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>Challenges</Text>
      <Text style={styles.subtitulo}>Elegi tu proximo desafio 🏆</Text>

      {cargando ? (
        <ActivityIndicator size="large" color="#1E6FD9" style={{ marginTop: 40 }} />
      ) : (
        <>
          {challenges.map((item, index) => renderCardActiva(item, index))}

          {challengesBloqueados.length > 0 && (
            <>
              <View style={styles.proximamenteSeparador}>
                <View style={styles.separadorLinea} />
                <Text style={styles.separadorTexto}>
                  {esAdmin ? '👁️ PREVIEW — PRÓXIMAMENTE' : 'PRÓXIMAMENTE'}
                </Text>
                <View style={styles.separadorLinea} />
              </View>

              {challengesBloqueados.map((item, index) =>
                esAdmin
                  ? renderCardBloqueadaAdmin(item, index)
                  : renderCardBloqueada(item, index)
              )}
            </>
          )}
        </>
      )}

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
                <Ionicons name="arrow-forward" size={18} color="#1E6FD9" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalModalidad(false)}>
              <Text style={styles.modalCancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
              <Ionicons name="arrow-forward" size={18} color="#1E6FD9" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalButton} onPress={() => elegirPais('internacional')}>
              <View>
                <Text style={styles.modalButtonTitulo}>🌍 Resto del mundo</Text>
                <Text style={styles.modalButtonSub}>Pagar con tarjeta</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color="#1E6FD9" />
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
  cardAdminPreview: { borderWidth: 1, borderColor: '#FC4C02', borderStyle: 'dashed' },
  adminPreviewBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(252,76,2,0.85)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  adminPreviewBadgeText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 11, letterSpacing: 1 },
  imageWrapper: { position: 'relative' },
  medallaImage: { width: '100%', height: 280, backgroundColor: '#f5f5f5' },
  ofertaBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: '#FC4C02', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  ofertaTexto: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  cardBody: { padding: 20 },
  deporteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  deporte: { fontSize: 11, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 1 },
  precio: { fontSize: 18, fontWeight: 'bold', color: '#FC4C02' },
  precioArs: { fontSize: 12, color: '#A8CFFF', textAlign: 'right', marginTop: 2 },
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
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  proximamenteSeparador: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, marginTop: 8 },
  separadorLinea: { flex: 1, height: 1, backgroundColor: '#1E3A5F' },
  separadorTexto: { fontSize: 11, fontWeight: 'bold', color: '#4a6a8a', letterSpacing: 2 },
  cardBloqueada: { backgroundColor: '#1E3A5F', borderRadius: 20, marginBottom: 20, overflow: 'hidden', opacity: 0.85 },
  imageWrapperBloqueado: { position: 'relative', height: 200 },
  medallaImageBloqueada: { width: '100%', height: 200, backgroundColor: '#0D1B2A' },
  blurOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6, 13, 20, 0.72)' },
  candadoWrapper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  candadoEmoji: { fontSize: 36, marginBottom: 8 },
  candadoTexto: { fontSize: 13, fontWeight: 'bold', color: '#4a6a8a', letterSpacing: 2 },
  cardBodyBloqueado: { padding: 20 },
  titulo2Bloqueado: { fontSize: 20, fontWeight: 'bold', color: '#4a6a8a', marginBottom: 6 },
  precioBloqueado: { fontSize: 16, fontWeight: 'bold', color: '#4a6a8a', marginBottom: 12 },
  modalidadesContainerBloqueado: { flexDirection: 'row', gap: 8 },
  modalidadTagBloqueado: { backgroundColor: '#0D1B2A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  modalidadTextBloqueado: { color: '#2a4a6a', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#1E3A5F', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 32 },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  modalSubtitulo: { fontSize: 14, color: '#A8CFFF', marginBottom: 24 },
  modalButton: { backgroundColor: '#0D1B2A', borderRadius: 14, padding: 18, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalButtonTitulo: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  modalButtonSub: { fontSize: 12, color: '#A8CFFF' },
  modalCancelar: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  modalCancelarText: { color: '#A8CFFF', fontSize: 15 },
});