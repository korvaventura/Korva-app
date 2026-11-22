import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RutaGpsActividad from './RutaGpsActividad';
import { colors, radius, spacing } from '../theme/korvaTheme';
import { nombreDeporteActividad, nombreFuenteActividad } from '../utils/actividadPresentacion';

const { formatoKm } = require('../services/compartirCore');

const iconoDeporte = (tipo) => ({ ride: 'bicycle-outline', run: 'fitness-outline', swim: 'water-outline', walk: 'walk-outline' }[tipo] || 'pulse-outline');
const deporteHistoria = (tipo) => (tipo === 'manual' ? 'Actividad' : nombreDeporteActividad(tipo));
const formatearFecha = (fecha) => (fecha ? new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

const hitoActividad = (actividad, index, acumulado, total) => {
  const pct = total > 0 ? (acumulado / total) * 100 : 0;
  const anterior = acumulado - (Number(actividad.distance_km) || 0);
  const normal = { icono: iconoDeporte(actividad.sport_type), texto: deporteHistoria(actividad.sport_type) };
  if (index === 0) return { icono: 'flag-outline', texto: 'Primer paso' };
  if (anterior < total && acumulado >= total) return { icono: 'checkmark-circle-outline', texto: 'Desafío completado' };
  if (pct >= 100) return normal;
  if (pct >= 75) return { icono: 'trending-up-outline', texto: 'En la recta final' };
  if (pct >= 50) return { icono: 'navigate-outline', texto: 'Mitad del camino' };
  if (pct >= 25) return { icono: 'trending-up-outline', texto: 'Arrancando fuerte' };
  return normal;
};

// "Actividades registradas" de un desafío: línea de tiempo de la primera a la
// última salida, cada una con su botón para compartir. Igual en todos los desafíos.
// actividades: en cualquier orden; se muestran de la más reciente a la más vieja.
// reto: { challenge_id, challenge, km_completados, distancia_total } para abrir compartir en ese desafío.
export default function HistorialActividades({ actividades = [], cargando = false, error = false, onReintentar, distanciaTotal = 0, reto = null, navigation }) {
  let acumulado = 0;
  // El acumulado se calcula de la primera a la última; se muestran de la más
  // reciente a la más vieja, así la última salida queda arriba, lista para compartir.
  const lista = [...actividades].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)).map((act, i) => {
    acumulado += Number(act.distance_km) || 0;
    return { ...act, hito: hitoActividad(act, i, acumulado, Number(distanciaTotal) || 0), acumulado };
  }).reverse();
  return (
    <View style={s.seccion}>
      <View style={s.cabecera}>
        <Text style={s.titulo}>Actividades registradas</Text>
        {!cargando && !error && <Text style={s.cantidad}>{lista.length}</Text>}
      </View>
      {cargando ? (
        <ActivityIndicator color={colors.brandOrange} />
      ) : error ? (
        <View style={s.vacio}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} style={{ marginBottom: spacing.md }} />
          <Text style={s.vacioTitulo}>No pudimos cargar tus actividades</Text>
          <Text style={s.vacioTexto}>Tus km están a salvo. Probá de nuevo en un momento.</Text>
          {!!onReintentar && (
            <TouchableOpacity onPress={onReintentar} hitSlop={10} style={{ marginTop: spacing.md }} accessibilityRole="button">
              <Text style={s.reintentar}>Reintentar</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : lista.length === 0 ? (
        <View style={s.vacio}>
          <Ionicons name="flag-outline" size={28} color={colors.brandOrangeSoft} style={{ marginBottom: spacing.md }} />
          <Text style={s.vacioTitulo}>Sin actividades todavía</Text>
          <Text style={s.vacioTexto}>Registrá tu primer km — correr, caminar, bici o nadar, todo suma.</Text>
        </View>
      ) : (
        <View>
          {lista.map((act, index) => (
            <View key={act.id || index} style={s.item}>
              <View style={s.izq}>
                <View style={[s.punto, index === 0 && s.puntoActivo]}>
                  <Ionicons name={act.hito.icono} size={18} color={index === 0 ? colors.brandOrangeSoft : colors.textMuted} />
                </View>
                {index < lista.length - 1 && <View style={s.linea} />}
              </View>
              <View style={s.tarjeta}>
                <Text style={s.hito}>{act.hito.texto}</Text>
                <Text style={s.fecha}>{formatearFecha(act.recorded_at)}</Text>
                <Text style={s.km}>{formatoKm(act.distance_km)} km</Text>
                <Text style={s.tipo}>{deporteHistoria(act.sport_type)} · {nombreFuenteActividad(act.source)}</Text>
                <Text style={s.acumulado}>Acumulado en actividades: {formatoKm(act.acumulado)} km</Text>
                {act.source === 'korva_gps' && act.id && <RutaGpsActividad activityId={act.id} />}
                {!!act.id && (
                  <TouchableOpacity style={s.compartir} accessibilityRole="button" accessibilityLabel="Compartir esta actividad"
                    onPress={() => navigation.navigate('DetalleActividad', { actividad: act, abrirCompartir: true, retoInicial: reto })}>
                    <Text style={[s.compartirTexto, index === 0 && s.compartirUltima]}>Compartir ↗</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  seccion: { marginTop: spacing.md },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.lg },
  titulo: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  cantidad: { color: colors.textMuted, fontSize: 12, fontWeight: '700', backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill },
  vacio: { backgroundColor: colors.surfaceSoft, borderRadius: radius.lg, padding: spacing.xxl, alignItems: 'center' },
  vacioTitulo: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  reintentar: { color: colors.actionBlue, fontSize: 13, fontWeight: '800' },
  vacioTexto: { fontSize: 12, lineHeight: 18, color: colors.textMuted, textAlign: 'center' },
  item: { flexDirection: 'row', gap: spacing.md },
  izq: { alignItems: 'center', width: 32 },
  punto: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.backgroundDeep, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderSoft },
  puntoActivo: { borderColor: colors.brandOrangeSoft },
  linea: { width: 1, flex: 1, backgroundColor: colors.borderSoft, marginVertical: spacing.xs },
  tarjeta: { flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  hito: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  fecha: { fontSize: 11, lineHeight: 16, color: colors.textMuted, marginBottom: spacing.md },
  km: { fontSize: 24, fontWeight: '900', color: colors.text, letterSpacing: -0.5, marginBottom: spacing.xs },
  tipo: { fontSize: 11, lineHeight: 16, color: colors.textSoft },
  acumulado: { fontSize: 11, lineHeight: 16, color: colors.textMuted, marginTop: spacing.md },
  compartir: { alignSelf: 'flex-start', paddingVertical: 8, marginTop: 4 },
  compartirTexto: { color: colors.actionBlue, fontSize: 14, fontWeight: '800' },
  compartirUltima: { color: colors.brandOrange },
});
