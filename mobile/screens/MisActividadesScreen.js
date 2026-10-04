import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listarMisActividades } from '../services/actividadesApi';
import { nombreDeporteActividad, nombreFuenteActividad } from '../utils/actividadPresentacion';

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
  scroll: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  volver: { color: '#67A9FF', fontWeight: '700', marginBottom: 20 },
  titulo: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  subtitulo: { color: '#A8CFFF', marginTop: 4, marginBottom: 22 },
  card: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 16, marginBottom: 12 },
  fila: { flexDirection: 'row', alignItems: 'center' },
  deporte: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  meta: { color: '#A8CFFF', fontSize: 12, marginTop: 4 },
  km: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  ver: { color: '#67A9FF', fontSize: 12, fontWeight: '700', marginTop: 12 },
  vacia: { backgroundColor: '#1E3A5F', borderRadius: 16, padding: 24, marginTop: 20 },
  vaciaTitulo: { color: '#FFFFFF', textAlign: 'center', fontWeight: '700' },
});
