import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const COMO_FUNCIONA = [
  { emoji: '1️⃣', titulo: 'Inscribite', desc: 'Elegí tu modalidad y completá el pago.' },
  { emoji: '2️⃣', titulo: 'Conectá Strava', desc: 'Tus actividades se sincronizan automáticamente.' },
  { emoji: '3️⃣', titulo: 'Corré a tu ritmo', desc: 'Tenés tiempo para completar la distancia.' },
  { emoji: '4️⃣', titulo: 'Recibí tu medalla', desc: 'Al completar el reto, te enviamos la medalla física a tu casa.' },
];

const TESTIMONIOS = [
  { nombre: 'Lucía M.', texto: 'La medalla me llegó en perfectas condiciones. El reto fue brutal pero valió cada kilómetro.', pais: '🇦🇷' },
  { nombre: 'Carlos R.', texto: 'Nunca pensé que iba a completar 103km corriendo. Korva me dio el empuje que necesitaba.', pais: '🇨🇴' },
  { nombre: 'Ana V.', texto: 'La conexión con Strava funciona perfecta. Cada salida contaba automáticamente.', pais: '🇲🇽' },
];

export default function DetalleScreen({ challenge, onVolver, onInscribir }) {
  if (!challenge) return null;

  const modalidades = challenge.modalidades || [];
  const galeria = Array.isArray(challenge.galeria) ? challenge.galeria : [];

  return (
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
            {challenge.historia || 'El fin del mundo no es un destino, es un estado mental. Este reto nació de la idea de empujar los límites hasta el último confín — donde el viento sopla fuerte, el terreno es salvaje y solo los que se atreven llegan.\n\nCorré o pedaleá a tu ritmo, desde donde estés. La distancia es real. La medalla, también.'}
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

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>🗺️ La ruta</Text>
        <View style={styles.mapaPlaceholder}>
          <Text style={styles.mapaEmoji}>🗺️</Text>
          <Text style={styles.mapaTexto}>Mapa de la ruta próximamente</Text>
          <Text style={styles.mapaSubtexto}>Podés completar la distancia desde cualquier lugar del mundo</Text>
        </View>
      </View>

      {/* Galería */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>📸 Galería</Text>
        {galeria.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {galeria.map((url, i) => (
              <Image
                key={i}
                source={{ uri: url }}
                style={styles.galeriaImg}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.galeriaSinFotos}>
            <Text style={styles.galeriaSinFotosText}>📷 Fotos próximamente</Text>
          </View>
        )}
      </View>

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>💬 Lo que dicen</Text>
        {TESTIMONIOS.map((t, i) => (
          <View key={i} style={styles.testimonioCard}>
            <Text style={styles.testimonioTexto}>"{t.texto}"</Text>
            <Text style={styles.testimonioNombre}>{t.pais} {t.nombre}</Text>
          </View>
        ))}
      </View>

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
  seccionTitulo: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 14 },
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
  mapaPlaceholder: { backgroundColor: '#1E3A5F', borderRadius: 16, height: 160, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2a4a6a' },
  mapaEmoji: { fontSize: 36, marginBottom: 10 },
  mapaTexto: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  mapaSubtexto: { fontSize: 12, color: '#A8CFFF', textAlign: 'center', paddingHorizontal: 20 },
  galeriaImg: { width: 200, height: 140, borderRadius: 14, marginRight: 10 },
  galeriaSinFotos: { backgroundColor: '#1E3A5F', borderRadius: 14, height: 100, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2a4a6a' },
  galeriaSinFotosText: { color: '#4a6a8a', fontSize: 14 },
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
});