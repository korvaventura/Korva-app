import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listarMisActividades } from '../services/actividadesApi';
import { nombreDeporteActividad, nombreFuenteActividad } from '../utils/actividadPresentacion';
import { colors, radius, spacing } from '../theme/korvaTheme';

const fecha = (valor) => valor ? new Date(valor).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function MisActividadesScreen({ navigation }) {
  const [actividades, setActividades] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setActividades(await listarMisActividades()); }
    catch { setActividades([]); }
    finally { setCargando(false); }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.volver}>← Volver</Text></TouchableOpacity>
      <Text style={styles.titulo}>Mis actividades</Text>
      <Text style={styles.subtitulo}>Tu historial deportivo en Korva</Text>
      {cargando ? <ActivityIndicator style={{ marginTop: 32 }} /> : actividades.length === 0 ? (
        <View style={styles.vacia}><Text style={styles.vaciaTitulo}>Todavía no hay actividades</Text></View>
      ) : actividades.map((a) => (
        <TouchableOpacity key={a.id} style={styles.card} onPress={() => navigation.navigate('DetalleActividad', { actividad: a })}>
          <View style={styles.fila}>
            <View style={{ flex: 1 }}>
              <Text style={styles.deporte}>{nombreDeporteActividad(a.sport_type)}</Text>
              <Text style={styles.meta}>{fecha(a.recorded_at)} · {nombreFuenteActividad(a.source)}</Text>
            </View>
            <Text style={styles.km}>{Number(a.distance_km || 0).toFixed(2)} km</Text>
          </View>
          <Text style={styles.ver}>Ver actividad →</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  volver: { color: colors.actionBlue, fontWeight: '700', marginBottom: 20 },
  titulo: { color: colors.text, fontSize: 28, fontWeight: '800' },
  subtitulo: { color: colors.textSoft, marginTop: 4, marginBottom: 22 },
  card: { backgroundColor: colors.surfaceSoft, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderSoft },
  fila: { flexDirection: 'row', alignItems: 'center' },
  deporte: { color: colors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.textSoft, fontSize: 12, marginTop: 4 },
  km: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  ver: { color: colors.actionBlue, fontSize: 12, fontWeight: '700', marginTop: 12 },
  vacia: { backgroundColor: colors.surfaceStrong, borderRadius: 16, padding: 24, marginTop: 20 },
  vaciaTitulo: { color: colors.text, textAlign: 'center', fontWeight: '700' },
});
