import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, Modal } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import MapaRecorrido from './MapaRecorrido';

const COMO_FUNCIONA = [
  { emoji: '1️⃣', titulo: 'Inscribite', desc: 'Elegí tu modalidad y completá el pago.' },
  { emoji: '2️⃣', titulo: 'Registrá tus km', desc: 'Cargá tus actividades manualmente desde la app. Strava estará disponible próximamente.' },
  { emoji: '3️⃣', titulo: 'Corré a tu ritmo', desc: 'No hay límite de tiempo para completar la distancia.' },
  { emoji: '4️⃣', titulo: 'Recibí tu medalla', desc: 'Al completar el reto, iniciamos el envío de tu medalla física.' },
];


export default function DetalleScreen({ challenge, onVolver, onInscribir }) {
  const [modalFaqVisible, setModalFaqVisible] = useState(false);
  const [faqAbierta, setFaqAbierta] = useState(null);

  if (!challenge) return null;

  const modalidades = challenge.modalidades || [];
  const galeria = Array.isArray(challenge.galeria) ? challenge.galeria : [];
  const distanciaTotal = modalidades[0]?.distancia_km || challenge.total_distance_km || 0;

  return (
    <>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      <View style={styles.heroWrapper}>
        {challenge.imagen_portada || challenge.medal_image_url ? (
          <Image source={{ uri: challenge.imagen_portada || challenge.medal_image_url }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Text style={styles.heroPlaceholderText}>🏅</Text>
          </View>
        )}
        <TouchableOpacity style={styles.backBtn} onPress={onVolver}>
          <View style={styles.backBtnRow}>
            <Ionicons name="arrow-back" size={14} color="#FFFFFF" />
            <Text style={styles.backBtnText}>Volver</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>USD ${challenge.price_usd}</Text>
        </View>
      </View>

      <View style={styles.seccion}>
        <Text style={styles.deporte}>
          {challenge.sport_type === 'run' ? '🏃 RUNNING' : challenge.sport_type === 'ride' ? '🚴 CICLISMO' : '🌐 MULTIDEPORTE'}
        </Text>
        <Text style={styles.titulo}>{challenge.title}</Text>
        <Text style={styles.descripcion}>{challenge.description}</Text>
      </View>

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>🎯 Tu objetivo</Text>
        <View style={styles.modalidadesRow}>
          {modalidades.map((m, i) => (
            <View key={i} style={styles.modalidadCard}>
              <Text style={styles.modalidadEmoji}>{m.tipo === 'run' ? '🏃' : '🚴'}</Text>
              <Text style={styles.modalidadLabel}>{m.label}</Text>
              <Text style={styles.modalidadKm}>{m.distancia_km} km</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>📖 La historia</Text>
        <View style={styles.historiaCard}>
          <Text style={styles.historiaTexto}>
            {challenge.historia || 'Completá la distancia a tu ritmo desde cualquier lugar del mundo. Cada kilómetro cuenta.'}
          </Text>
        </View>
      </View>

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>⚙️ Cómo funciona</Text>
        {COMO_FUNCIONA.map((paso, i) => (
          <View key={i} style={styles.pasoRow}>
            <Text style={styles.pasoEmoji}>{paso.emoji}</Text>
            <View style={styles.pasoInfo}>
              <Text style={styles.pasoTitulo}>{paso.titulo}</Text>
              <Text style={styles.pasoDesc}>{paso.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Mapa interactivo real */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>🗺️ La ruta</Text>
        <Text style={styles.mapaSubtitulo}>Explorá los checkpoints — se desbloquean a medida que avanzás</Text>
        <MapaRecorrido
          kmCompletados={0}
          distanciaTotal={distanciaTotal}
          porcentaje="0"
          challengeId={challenge.id}
          challengeTitle={challenge.title}
          fullscreen={true}
        />
      </View>

      {galeria.length > 0 && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>📸 Galería</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {galeria.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={styles.galeriaImg} resizeMode="cover" />
            ))}
          </ScrollView>
        </View>
      )}

      <TouchableOpacity style={styles.faqLinkBtn} onPress={() => setModalFaqVisible(true)}>
        <View style={styles.btnRow}>
          <Ionicons name="help-circle-outline" size={18} color="#1E6FD9" />
          <Text style={styles.faqLinkText}>¿Tenés dudas? Mirá las preguntas frecuentes</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.ctaWrapper}>
        <Text style={styles.ctaPrecio}>USD ${challenge.price_usd} — medalla incluida 🏅</Text>
        {challenge.price_ars && <Text style={styles.ctaPrecioArs}>$ {challenge.price_ars.toLocaleString('es-AR')} ARS</Text>}
        <TouchableOpacity style={styles.ctaBtn} onPress={onInscribir}>
          <View style={styles.btnRow}>
            <Text style={styles.ctaBtnText}>Quiero este reto</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <Text style={styles.ctaSubtexto}>Completá el reto a tu ritmo · Envío a todo el mundo</Text>
      </View>

    </ScrollView>

      <Modal visible={modalFaqVisible} transparent animationType="slide" onRequestClose={() => setModalFaqVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={styles.modalTitulo}>❓ Preguntas frecuentes</Text>
              <TouchableOpacity onPress={() => setModalFaqVisible(false)}>
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
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { paddingBottom: 60 },
  heroWrapper: { position: 'relative', width: '100%', height: 320 },
  heroImage: { width: '100%', height: 320 },
  heroPlaceholder: { width: '100%', height: 320, backgroundColor: '#1E3A5F', alignItems: 'center', justifyContent: 'center' },
  heroPlaceholderText: { fontSize: 80 },
  backBtn: { position: 'absolute', top: 52, left: 20, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  backBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  heroBadge: { position: 'absolute', bottom: 16, right: 16, backgroundColor: '#FC4C02', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  heroBadgeText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  seccion: { paddingHorizontal: 24, marginTop: 28 },
  seccionTitulo: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 6 },
  mapaSubtitulo: { fontSize: 12, color: '#4a6a8a', marginBottom: 14 },
  deporte: { fontSize: 11, fontWeight: 'bold', color: '#1E6FD9', letterSpacing: 1, marginBottom: 8 },
  titulo: { fontSize: 26, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 10 },
  descripcion: { fontSize: 14, color: '#A8CFFF', lineHeight: 22 },
  modalidadesRow: { flexDirection: 'row', gap: 12 },
  modalidadCard: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 14, padding: 16, alignItems: 'center' },
  modalidadEmoji: { fontSize: 28, marginBottom: 6 },
  modalidadLabel: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  modalidadKm: { fontSize: 22, fontWeight: 'bold', color: '#FC4C02' },
  historiaCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 20 },
  historiaTexto: { fontSize: 14, color: '#A8CFFF', lineHeight: 24 },
  pasoRow: { flexDirection: 'row', gap: 14, marginBottom: 16, alignItems: 'flex-start' },
  pasoEmoji: { fontSize: 22, width: 32 },
  pasoInfo: { flex: 1 },
  pasoTitulo: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 2 },
  pasoDesc: { fontSize: 13, color: '#A8CFFF', lineHeight: 20 },
  galeriaImg: { width: 200, height: 140, borderRadius: 14, marginRight: 10 },
  testimonioCard: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 18, marginBottom: 12 },
  testimonioTexto: { fontSize: 13, color: '#A8CFFF', lineHeight: 20, marginBottom: 10, fontStyle: 'italic' },
  testimonioNombre: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF' },
  ctaWrapper: { marginTop: 32, paddingHorizontal: 24, alignItems: 'center' },
  ctaPrecio: { fontSize: 14, color: '#A8CFFF', marginBottom: 4 },
  ctaPrecioArs: { fontSize: 13, color: '#FC4C02', marginBottom: 14, fontWeight: 'bold' },
  ctaBtn: { backgroundColor: '#FC4C02', paddingVertical: 16, borderRadius: 14, width: '100%', alignItems: 'center', marginBottom: 12 },
  ctaBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 17 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaSubtexto: { fontSize: 12, color: '#4a6a8a', textAlign: 'center' },
  faqLinkBtn: { marginHorizontal: 24, marginTop: 28, backgroundColor: '#1E3A5F', borderWidth: 1, borderColor: '#1E6FD9', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  faqLinkText: { color: '#1E6FD9', fontWeight: 'bold', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#1E3A5F', borderRadius: 24, padding: 28, width: '100%', maxHeight: '85%', borderWidth: 1, borderColor: '#FC4C02' },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF' },
  faqItem: { borderBottomWidth: 1, borderBottomColor: '#2a4a6a', paddingVertical: 14 },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  faqPregunta: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', flex: 1, paddingRight: 12 },
  faqChevron: { color: '#4a6a8a', fontSize: 12 },
  faqRespuesta: { fontSize: 13, color: '#A8CFFF', lineHeight: 20, marginTop: 10 },
});