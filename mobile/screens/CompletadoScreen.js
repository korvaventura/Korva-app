import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { colors, radius, spacing } from '../theme/korvaTheme';
import KorvaCompletedShare from '../components/KorvaCompletedShare';

const { datosDesafioCompletado } = require('../services/desafioShareCore');

export default function CompletadoScreen({ challenge, nombrePersona, onVolver, onCargarDireccion }) {
  const [tieneDireccion, setTieneDireccion] = useState(null);
  const [compartirVisible, setCompartirVisible] = useState(false);
  const datos = datosDesafioCompletado(challenge);
  const nombreReto = datos?.nombre || challenge?.challenge || challenge?.challenge_title || 'Desafío completado';

  useEffect(() => {
    let activo = true;
    const cargarDireccion = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          if (activo) setTieneDireccion(false);
          return;
        }
        const { data } = await supabase
          .from('users')
          .select('shipping_address')
          .eq('id', session.user.id)
          .maybeSingle();
        if (activo) setTieneDireccion(!!data?.shipping_address?.direccion);
      } catch {
        if (activo) setTieneDireccion(false);
      }
    };
    cargarDireccion();
    return () => { activo = false; };
  }, []);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.seal}>
          <Ionicons name="checkmark" size={34} color={colors.text} />
        </View>

        <Text style={styles.eyebrow}>DESAFÍO COMPLETADO</Text>
        <Text style={styles.title}>Lo conquistaste.</Text>
        <Text style={styles.challenge}>{nombreReto}</Text>

        <View style={styles.rule} />

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{datos?.distanciaTexto || '100%'}</Text>
            <Text style={styles.metricLabel}>{datos?.distanciaTexto ? 'KM' : 'COMPLETADO'}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={styles.metricValue}>100%</Text>
            <Text style={styles.metricLabel}>{datos?.version?.toUpperCase() || 'META ALCANZADA'}</Text>
          </View>
        </View>

        {(datos?.dorsal || datos?.fecha) && (
          <View style={styles.metaRow}>
            {datos?.dorsal ? <Text style={styles.meta}>DORSAL #{datos.dorsal}</Text> : null}
            {datos?.fecha ? <Text style={styles.meta}>{datos.fecha.toUpperCase()}</Text> : null}
          </View>
        )}

        <Text style={styles.message}>
          Cada kilómetro te trajo hasta acá. Tu desafío queda registrado como completado en Korva.
        </Text>

        <TouchableOpacity style={styles.primary} onPress={() => setCompartirVisible(true)} accessibilityRole="button">
          <Ionicons name="share-outline" size={19} color={colors.text} />
          <Text style={styles.primaryText}>COMPARTIR MI LOGRO</Text>
        </TouchableOpacity>

        <View style={styles.shippingCard}>
          <View style={styles.shippingIcon}>
            {tieneDireccion === null
              ? <ActivityIndicator size="small" color={colors.textSoft} />
              : <Ionicons name={tieneDireccion ? 'checkmark-circle-outline' : 'location-outline'} size={22} color={tieneDireccion ? colors.success : colors.brandOrangeSoft} />}
          </View>
          <View style={styles.shippingCopy}>
            <Text style={styles.shippingEyebrow}>TU MEDALLA</Text>
            <Text style={styles.shippingTitle}>
              {tieneDireccion === null ? 'Verificando dirección…' : tieneDireccion ? 'Dirección lista' : 'Falta tu dirección de envío'}
            </Text>
            <Text style={styles.shippingText}>
              {tieneDireccion === null
                ? 'Estamos revisando los datos de envío.'
                : tieneDireccion
                  ? 'Tenemos tus datos. El seguimiento se enviará por email cuando el despacho esté preparado.'
                  : 'Cargala desde tu Perfil para que podamos preparar el envío de tu medalla.'}
            </Text>
          </View>
        </View>

        {tieneDireccion === false && onCargarDireccion ? (
          <TouchableOpacity style={styles.secondary} onPress={onCargarDireccion} accessibilityRole="button">
            <Text style={styles.secondaryText}>CARGAR DIRECCIÓN</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.actionBlue} />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.back} onPress={onVolver} accessibilityRole="button">
          <Text style={styles.backText}>Volver a Inicio</Text>
        </TouchableOpacity>
      </ScrollView>

      {compartirVisible && datos ? (
        <KorvaCompletedShare
          reto={challenge}
          nombrePersona={nombrePersona}
          onClose={() => setCompartirVisible(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backgroundDeep },
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 72, paddingBottom: 36 },
  seal: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.brandOrange, alignItems: 'center', justifyContent: 'center', marginBottom: 26 },
  eyebrow: { color: colors.brandOrangeSoft, fontSize: 9, fontWeight: '900', letterSpacing: 2.2, marginBottom: 10 },
  title: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: '900', textAlign: 'center' },
  challenge: { color: colors.textSoft, fontSize: 18, lineHeight: 24, fontWeight: '700', textAlign: 'center', marginTop: 8, maxWidth: 320 },
  rule: { width: 34, height: 2, backgroundColor: colors.brandOrangeSoft, marginVertical: 28 },
  metrics: { width: '100%', maxWidth: 360, flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.surfaceSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft, paddingVertical: 20 },
  metric: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  metricDivider: { width: 1, backgroundColor: colors.borderSoft },
  metricValue: { color: colors.text, fontSize: 24, fontWeight: '900' },
  metricLabel: { color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 5, textAlign: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 14 },
  meta: { color: colors.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  message: { color: colors.textSoft, fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 330, marginTop: 28, marginBottom: 24 },
  primary: { width: '100%', maxWidth: 360, minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.brandOrange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryText: { color: colors.text, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  shippingCard: { width: '100%', maxWidth: 360, flexDirection: 'row', gap: 13, marginTop: 26, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderSoft },
  shippingIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  shippingCopy: { flex: 1 },
  shippingEyebrow: { color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1.5, marginBottom: 4 },
  shippingTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 5 },
  shippingText: { color: colors.textSoft, fontSize: 11, lineHeight: 17 },
  secondary: { width: '100%', maxWidth: 360, minHeight: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10 },
  secondaryText: { color: colors.actionBlue, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  back: { paddingVertical: 18, paddingHorizontal: 24, marginTop: 8 },
  backText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
});
