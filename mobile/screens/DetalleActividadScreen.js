import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import RutaGpsActividad from '../components/RutaGpsActividad';

const deporte = (tipo) => ({ run: 'Running', walk: 'Caminata', ride: 'Ciclismo', swim: 'Natación' }[tipo] || tipo || 'Actividad');
const fuente = (source) => source === 'korva_gps' ? 'Korva GPS' : source === 'strava' ? 'Strava' : source === 'manual' ? 'Manual' : (source || 'Korva');

const duracion = (segundos) => {
  const s = Math.max(0, Number(segundos) || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, '0')}`;
};

export default function DetalleActividadScreen({ route, navigation }) {
  const a = route.params?.actividad || {};
  const km = Number(a.distance_km || 0);
  const segundos = Number(a.duration_seconds || 0);
  const pace = km > 0 && segundos > 0 ? segundos / 60 / km : null;
  const paceTxt = pace ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')} /km` : '—';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.volver}>← Volver</Text></TouchableOpacity>
      <Text style={styles.titulo}>{deporte(a.sport_type)}</Text>
      <Text style={styles.fecha}>{a.recorded_at ? new Date(a.recorded_at).toLocaleString('es-AR') : ''} · {fuente(a.source)}</Text>
      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.valor}>{km.toFixed(2)}</Text><Text style={styles.label}>km</Text></View>
        <View style={styles.stat}><Text style={styles.valor}>{duracion(segundos)}</Text><Text style={styles.label}>tiempo</Text></View>
        <View style={styles.stat}><Text style={styles.valor}>{a.sport_type === 'ride' && segundos > 0 ? `${(km / (segundos / 3600)).toFixed(1)} km/h` : paceTxt}</Text><Text style={styles.label}>{a.sport_type === 'ride' ? 'velocidad' : 'ritmo'}</Text></View>
      </View>
      {a.source === 'korva_gps' && a.id ? (
        <View style={styles.rutaCard}>
          <Text style={styles.rutaTitulo}>Tu recorrido</Text>
          <RutaGpsActividad activityId={a.id} modoDetalle />
        </View>
      ) : (
        <View style={styles.info}><Text style={styles.infoText}>Esta actividad fue registrada mediante {fuente(a.source)}.</Text></View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  volver: { color: '#67A9FF', fontWeight: '700', marginBottom: 24 },
  titulo: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  fecha: { color: '#A8CFFF', fontSize: 12, marginTop: 6, marginBottom: 22 },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  stat: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 14, padding: 12, alignItems: 'center' },
  valor: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  label: { color: '#A8CFFF', fontSize: 10, marginTop: 4 },
  rutaCard: { backgroundColor: '#1E3A5F', borderRadius: 18, padding: 16 },
  rutaTitulo: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  info: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 18 },
  infoText: { color: '#A8CFFF' },
});
