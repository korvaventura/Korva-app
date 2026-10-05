import KorvaHelpSheet from '../components/KorvaHelpSheet';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/korvaTheme';
import { precioReferencia } from '../utils/precioCatalogo';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import MapaRecorrido from './MapaRecorrido';
import { versionesDelDesafio, distanciaDeVersion } from '../utils/versionDesafio';

const COMO_FUNCIONA = [
  { emoji: '1️⃣', titulo: 'Comprá en la tienda', desc: 'Una vez confirmado el pago, el desafío se activa automáticamente en la app.' },
  { emoji: '2️⃣', titulo: 'Registrá tus km', desc: 'Abrí Registrar y elegí GPS o Manual. También podés sincronizar Strava si está habilitado y conectado en tu cuenta.' },
  { emoji: '3️⃣', titulo: 'Movete a tu ritmo', desc: 'Caminá, corré o pedaleá: todos los km cuentan igual. No hay límite de tiempo para completar la distancia.' },
  { emoji: '4️⃣', titulo: 'Recibí tu medalla', desc: 'El progreso en la app y el envío de tu pedido se gestionan por separado. Consultá el seguimiento y las condiciones de envío.' },
];


export default function DetalleScreen({ challenge, onVolver, onInscribir }) {
  const [modalFaqVisible, setModalFaqVisible] = useState(false);
  const [distanciasAbiertas, setDistanciasAbiertas] = useState(false);
  const [comoFuncionaAbierto, setComoFuncionaAbierto] = useState(false);

  if (!challenge) return null;

  // Versiones Estándar / Extendida: solo distancia, no deporte.
  const versiones = versionesDelDesafio(challenge).filter(v => v.distancia_km !== null);
  const precio = precioReferencia(challenge);
  const galeria = Array.isArray(challenge.galeria) ? challenge.galeria : [];
  const distanciaTotal = distanciaDeVersion(challenge, 'estandar') || versiones[0]?.distancia_km || challenge.total_distance_km || 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      <View style={styles.heroWrapper}>
        {challenge.imagen_portada || challenge.medal_image_url ? (
          <Image source={{ uri: challenge.imagen_portada || challenge.medal_image_url }} style={styles.heroImage} resizeMode={challenge.imagen_portada ? 'cover' : 'contain'} />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons name="medal-outline" size={64} color={colors.brandOrangeSoft} />
          </View>
        )}
        <TouchableOpacity style={styles.backBtn} onPress={onVolver}>
          <View style={styles.backBtnRow}>
            <Ionicons name="arrow-back" size={14} color={colors.text} />
            <Text style={styles.backBtnText}>Volver</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>MEDALLA FÍSICA</Text>
        </View>
      </View>

      <View style={styles.seccion}>
        <Text style={styles.deporte}>
          DESAFÍO VIRTUAL
        </Text>
        <Text style={styles.titulo}>{challenge.title}</Text>
        <Text style={styles.descripcion}>{challenge.description}</Text>
      </View>

      {distanciaTotal > 0 && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>{distanciaTotal} km · A tu ritmo</Text>
          {versiones.length > 1 && (
            <>
              <TouchableOpacity style={styles.distanciasToggle} onPress={() => setDistanciasAbiertas(prev => !prev)} accessibilityRole="button" accessibilityState={{ expanded: distanciasAbiertas }}>
                <Text style={styles.distanciasToggleText}>Opciones de distancia</Text>
                <Ionicons name={distanciasAbiertas ? 'chevron-up' : 'chevron-down'} size={16} color={colors.actionBlue} />
              </TouchableOpacity>
              {distanciasAbiertas && (
                <View>
                  <View style={styles.modalidadesRow}>
                    {versiones.map(v => (
                      <View key={v.version} style={styles.modalidadCard}>
                        <Text style={styles.modalidadLabel}>{v.label}</Text>
                        <Text style={styles.modalidadKm}>{v.distancia_km} km</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.mapaSubtitulo}>Podés cambiar la distancia desde Perfil. Caminando, corriendo o en bici: todos los km suman igual.</Text>
                </View>
              )}
            </>
          )}
        </View>
      )}


      {/* Primero la propuesta y la medalla; la ruta queda como contenido de exploración. */}
      <View style={styles.comoFuncionaBox}>
        <TouchableOpacity
          style={styles.comoFuncionaToggle}
          onPress={() => setComoFuncionaAbierto(prev => !prev)}
          accessibilityRole="button"
          accessibilityState={{ expanded: comoFuncionaAbierto }}
        >
          <View style={styles.comoFuncionaToggleCopy}>
            <Ionicons name="information-circle-outline" size={19} color={colors.textSoft} />
            <View style={{ flex: 1 }}>
              <Text style={styles.comoFuncionaTitulo}>¿Cómo funciona el desafío?</Text>
              {!comoFuncionaAbierto && <Text style={styles.comoFuncionaResumen}>Compra · registrá tus km · completá a tu ritmo · recibí tu medalla</Text>}
            </View>
          </View>
          <Ionicons name={comoFuncionaAbierto ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textMuted} />
        </TouchableOpacity>
        {comoFuncionaAbierto && (
          <View style={styles.comoFuncionaContenido}>
            {COMO_FUNCIONA.map((paso, i) => (
              <View key={i} style={styles.pasoRow}>
                <Text style={styles.pasoEmoji}>{i + 1}</Text>
                <View style={styles.pasoInfo}>
                  <Text style={styles.pasoTitulo}>{paso.titulo}</Text>
                  <Text style={styles.pasoDesc}>{paso.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* La aventura es el producto: la ruta aparece antes que la explicación operativa. */}
      <View style={styles.seccionRuta}>
        <View style={styles.rutaHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rutaEyebrow}>EXPLORÁ LA AVENTURA</Text>
            <Text style={styles.rutaTitulo}>La ruta</Text>
          </View>
          <Ionicons name="map-outline" size={21} color={colors.brandOrangeSoft} />
        </View>
        <Text style={styles.mapaSubtitulo}>Descubrí los checkpoints y las historias que vas desbloqueando a medida que avanzás.</Text>
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
          <Ionicons name="help-circle-outline" size={18} color={colors.actionBlue} />
          <Text style={styles.faqLinkText}>¿Tenés dudas? Mirá las preguntas frecuentes</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.ctaWrapper}>
        <Text style={styles.ctaPrecio}>{precio ? `Precio de referencia · ${precio}` : 'Consultar precio en la tienda'}</Text>
        <Text style={styles.ctaPrecioArs}>Medalla física incluida · compra necesaria</Text>
        <TouchableOpacity style={styles.ctaBtn} onPress={onInscribir}>
          <View style={styles.btnRow}>
            <Text style={styles.ctaBtnText}>Ver en la tienda</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.text} />
          </View>
        </TouchableOpacity>
        <Text style={styles.ctaSubtexto}>Precio final, moneda y condiciones de envío en la tienda.</Text>
      </View>

    </ScrollView>

      <KorvaHelpSheet visible={modalFaqVisible} onClose={() => setModalFaqVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { paddingBottom: 60 },
  heroWrapper: { position: 'relative', width: '100%', height: 320 },
  heroImage: { width: '100%', height: 320 },
  heroPlaceholder: { width: '100%', height: 320, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  heroPlaceholderText: { fontSize: 80 },
  backBtn: { position: 'absolute', top: 16, left: 20, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', paddingVertical: 8, borderRadius: 20 },
  backBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 14 },
  heroBadge: { position: 'absolute', bottom: 16, right: 16, backgroundColor: colors.brandOrange, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  heroBadgeText: { color: colors.text, fontWeight: '800', fontSize: 10 },
  seccion: { paddingHorizontal: 24, marginTop: 28 },
  seccionRuta: { paddingHorizontal: 24, marginTop: 22 },
  rutaHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  rutaEyebrow: { color: colors.brandOrangeSoft, fontSize: 9, fontWeight: '900', letterSpacing: 1.6, marginBottom: 3 },
  rutaTitulo: { color: colors.text, fontSize: 21, fontWeight: '900' },
  comoFuncionaBox: { marginHorizontal: 24, marginTop: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderSoft },
  comoFuncionaToggle: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  comoFuncionaToggleCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  comoFuncionaTitulo: { color: colors.text, fontSize: 14, fontWeight: '800' },
  comoFuncionaResumen: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  comoFuncionaContenido: { paddingTop: 8, paddingBottom: 6 },
  seccionTitulo: { fontSize: 15, fontWeight: 'bold', color: colors.text, marginBottom: 6 },
  mapaSubtitulo: { fontSize: 12, color: colors.textMuted, marginBottom: 14 },
  deporte: { fontSize: 11, fontWeight: 'bold', color: colors.actionBlue, letterSpacing: 1, marginBottom: 8 },
  titulo: { fontSize: 26, fontWeight: 'bold', color: colors.text, marginBottom: 10 },
  descripcion: { fontSize: 14, color: colors.textSoft, lineHeight: 22 },
  distanciasToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginBottom: 8 },
  distanciasToggleText: { fontSize: 13, color: colors.actionBlue, fontWeight: '600' },
  modalidadesRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  modalidadCard: { flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: 14, padding: 16, alignItems: 'center' },
  modalidadEmoji: { fontSize: 28, marginBottom: 6 },
  modalidadLabel: { fontSize: 13, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  modalidadKm: { fontSize: 22, fontWeight: 'bold', color: colors.brandOrange },
  historiaCard: { backgroundColor: colors.surfaceSoft, borderRadius: 16, padding: 20 },
  historiaTexto: { fontSize: 14, color: colors.textSoft, lineHeight: 24 },
  pasoRow: { flexDirection: 'row', gap: 14, marginBottom: 16, alignItems: 'flex-start' },
  pasoEmoji: { fontSize: 16, color: colors.brandOrangeSoft, fontWeight: '800', width: 24 },
  pasoInfo: { flex: 1 },
  pasoTitulo: { fontSize: 15, fontWeight: 'bold', color: colors.text, marginBottom: 2 },
  pasoDesc: { fontSize: 13, color: colors.textSoft, lineHeight: 20 },
  galeriaImg: { width: 200, height: 140, borderRadius: 14, marginRight: 10 },
  testimonioCard: { backgroundColor: colors.surfaceSoft, borderRadius: 16, padding: 18, marginBottom: 12 },
  testimonioTexto: { fontSize: 13, color: colors.textSoft, lineHeight: 20, marginBottom: 10, fontStyle: 'italic' },
  testimonioNombre: { fontSize: 13, fontWeight: 'bold', color: colors.text },
  ctaWrapper: { marginTop: 32, paddingHorizontal: 24, alignItems: 'center' },
  ctaPrecio: { fontSize: 14, color: colors.textSoft, marginBottom: 4 },
  ctaPrecioArs: { fontSize: 13, color: colors.brandOrange, marginBottom: 14, fontWeight: 'bold' },
  ctaBtn: { backgroundColor: colors.brandOrange, paddingVertical: 16, borderRadius: 14, width: '100%', alignItems: 'center', marginBottom: 12 },
  ctaBtnText: { color: colors.text, fontWeight: 'bold', fontSize: 17 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaSubtexto: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  faqLinkBtn: { marginHorizontal: 24, marginTop: 28, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.actionBlue, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  faqLinkText: { color: colors.actionBlue, fontWeight: 'bold', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.surfaceSoft, borderRadius: 24, padding: 28, width: '100%', maxHeight: '85%', borderWidth: 1, borderColor: colors.brandOrange },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', color: colors.text },
  faqItem: { borderBottomWidth: 1, borderBottomColor: colors.borderSoft, paddingVertical: 14 },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  faqPregunta: { fontSize: 14, fontWeight: 'bold', color: colors.text, flex: 1, paddingRight: 12 },
  faqChevron: { color: colors.textMuted, fontSize: 12 },
  faqRespuesta: { fontSize: 13, color: colors.textSoft, lineHeight: 20, marginTop: 10 },
});
