import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../theme/korvaTheme';
import ObjetivoDiarioCard from './ObjetivoDiarioCard';

const format = (n, decimales = 2) => n.toLocaleString('es-AR', { maximumFractionDigits: decimales });
const estados = {
  esperando: 'Preparando tu movimiento.',
  cargando: 'Cargando tu movimiento…',
  no_disponible: 'Tu resumen personal estará disponible próximamente. Podés seguir registrando actividades.',
  sesion: 'Volvé a iniciar sesión para consultar tu movimiento.',
  error: 'No pudimos cargar tu movimiento. Intentá nuevamente.',
};

export default function MovimientoPersonalCard({ estado, onActualizar, compacto = false }) {
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const listo = estado.status === 'disponible';
  const r = listo ? estado.datos : null;
  if (compacto) return (
    <>
      <TouchableOpacity style={styles.summary} activeOpacity={0.85} onPress={() => setDetalleAbierto(true)}
        accessibilityRole="button" accessibilityLabel="Ver mi movimiento de hoy y esta semana">
        <View style={styles.summaryHeader}>
          <Text style={styles.eyebrow}>TU MOVIMIENTO · HOY</Text>
          <Ionicons name="chevron-forward" size={17} color={colors.textSoft} />
        </View>
        {listo ? (
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.summaryValue}>{format(r.hoy.km_movimiento)}<Text style={styles.summaryUnit}> km</Text></Text>
              <Text style={styles.label}>de movimiento</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.summaryValue}>{r.hoy.pasos === null ? '—' : format(r.hoy.pasos, 0)}</Text>
              <Text style={styles.label}>Pasos</Text>
            </View>
          </View>
        ) : <Text style={styles.note}>{estados[estado.status] || estados.error}</Text>}
        <Text style={styles.summaryLink}>Ver mi movimiento</Text>
      </TouchableOpacity>
      {estado.userId && <ObjetivoDiarioCard key={estado.userId} userId={estado.userId} pasos={listo ? r.hoy.pasos : null} />}
      <Modal visible={detalleAbierto} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal
        onRequestClose={() => setDetalleAbierto(false)} onDismiss={() => setDetalleAbierto(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
            <View style={styles.sheetHeader}>
              <Text style={styles.title}>Tu movimiento</Text>
              <TouchableOpacity style={styles.close} onPress={() => setDetalleAbierto(false)}
                accessibilityRole="button" accessibilityLabel="Cerrar mi movimiento">
                <Ionicons name="close" size={24} color={colors.textSoft} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <MovimientoPersonalCard estado={estado} onActualizar={onActualizar} />
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </>
  );
  return (
    <View style={[styles.card, !listo && styles.cardCompact]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>TU MOVIMIENTO</Text>
          <Text style={styles.title}>Cada paso cuenta</Text>
        </View>
        <TouchableOpacity onPress={onActualizar} disabled={estado.status === 'cargando'} accessibilityRole="button" accessibilityLabel="Actualizar tu movimiento" hitSlop={10}>
          <Text style={styles.refresh}>{estado.status === 'no_disponible' ? 'Consultar' : 'Actualizar'}</Text>
        </TouchableOpacity>
      </View>
      {!listo ? (
        <View style={styles.state}>
          {(estado.status === 'cargando' || estado.status === 'esperando') && <ActivityIndicator color={colors.actionBlue} />}
          <Text style={styles.note}>{estados[estado.status] || estados.error}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.period}>HOY</Text>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.value}>{r.hoy.pasos === null ? '—' : format(r.hoy.pasos, 0)}</Text>
              <Text style={styles.label}>pasos</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.value}>{format(r.hoy.km_movimiento)}</Text>
              <Text style={styles.label}>km de movimiento</Text>
            </View>
          </View>
          {r.hoy.pasos === null && <Text style={styles.note}>Todavía no hay una lectura de pasos para hoy.</Text>}
          <View style={styles.week}>
            <View style={styles.weekHeader}>
              <Text style={styles.period}>ESTA SEMANA</Text>
              <Text style={styles.weekKm}>{format(r.semana.km_movimiento)} km</Text>
            </View>
            <View style={styles.days}>
              {r.semana.dias.map((d) => {
                const conMovimiento = d.km_movimiento > 0 || (d.pasos ?? 0) > 0;
                const dia = new Date(`${d.fecha}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'narrow', timeZone: 'UTC' });
                return (
                  <View key={d.fecha} style={styles.day} accessibilityLabel={`${d.fecha}: ${format(d.km_movimiento)} kilómetros${d.pasos === null ? '' : `, ${format(d.pasos, 0)} pasos`}`}>
                    <Text style={styles.dayLabel}>{dia.toUpperCase()}</Text>
                    <View style={[styles.dayMark, conMovimiento && styles.dayMarkActive]} />
                  </View>
                );
              })}
            </View>
            <Text style={styles.note}>Movimiento registrado de lunes a hoy.</Text>
          </View>
          <Text style={styles.history}>{format(r.historial.km_actividades)} km en tu historial de actividades</Text>
          <Text style={styles.note}>Hoy y esta semana incluyen las actividades y el movimiento adicional disponible. Los pasos se muestran por separado.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: colors.backgroundDeep, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryValue: { color: colors.text, fontSize: 25, fontWeight: '800' },
  summaryUnit: { color: colors.textSoft, fontSize: 13, fontWeight: '600' },
  summaryLink: { color: colors.actionBlue, fontSize: 11, fontWeight: '700', marginTop: spacing.sm },
  sheet: { flex: 1, backgroundColor: colors.backgroundDeep },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surfaceSoft },
  sheetContent: { padding: spacing.lg },
  card: { backgroundColor: colors.surfaceSoft, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg },
  cardCompact: { backgroundColor: colors.backgroundDeep, paddingVertical: spacing.lg, borderColor: colors.borderSoft },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  eyebrow: { color: colors.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: spacing.xs },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  refresh: { color: colors.actionBlue, fontSize: 11, fontWeight: '700' },
  state: { gap: spacing.md, alignItems: 'flex-start', paddingVertical: spacing.sm },
  period: { color: colors.textSoft, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  metrics: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, marginBottom: spacing.md },
  metric: { flex: 1 },
  value: { color: colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  label: { color: colors.textSoft, fontSize: 11, marginTop: spacing.xs },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  week: { borderTopColor: colors.borderSoft, borderTopWidth: 1, paddingTop: spacing.lg, marginTop: spacing.md, marginBottom: spacing.lg },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekKm: { color: colors.text, fontSize: 18, fontWeight: '800' },
  days: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  day: { flex: 1, alignItems: 'center', gap: spacing.sm },
  dayLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  dayMark: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.borderSoft },
  dayMarkActive: { backgroundColor: colors.brandOrange },
  history: { color: colors.textSoft, fontSize: 12, fontWeight: '700', marginBottom: spacing.sm },
});
