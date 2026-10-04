import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../theme/korvaTheme';

const format = (n, decimales = 2) => n.toLocaleString('es-AR', { maximumFractionDigits: decimales });
const estados = {
  esperando: 'Preparando tu movimiento.',
  cargando: 'Cargando tu movimiento…',
  no_disponible: 'Tu resumen personal estará disponible próximamente. Podés seguir registrando actividades.',
  sesion: 'Volvé a iniciar sesión para consultar tu movimiento.',
  error: 'No pudimos cargar tu movimiento. Intentá nuevamente.',
};

export default function MovimientoPersonalCard({ estado, onActualizar }) {
  const listo = estado.status === 'disponible';
  const r = listo ? estado.datos : null;
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>TU MOVIMIENTO</Text>
          <Text style={styles.title}>Cada paso cuenta</Text>
        </View>
        <TouchableOpacity onPress={onActualizar} disabled={estado.status === 'cargando'} accessibilityRole="button" accessibilityLabel="Actualizar tu movimiento" hitSlop={10}>
          <Text style={styles.refresh}>Actualizar</Text>
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
  card: { backgroundColor: colors.surfaceSoft, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg },
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
