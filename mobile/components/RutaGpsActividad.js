import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { obtenerRutaGps } from '../services/gps/gpsApi';

const WIDTH = 260;
const HEIGHT = 150;
const PAD = 12;

const proyectar = (puntos = []) => {
  const validos = puntos.filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)));
  if (validos.length < 2) return [];
  const lats = validos.map((p) => Number(p.latitude));
  const lons = validos.map((p) => Number(p.longitude));
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const rangoLat = Math.max(maxLat - minLat, 0.000001);
  const rangoLon = Math.max(maxLon - minLon, 0.000001);
  return validos.map((p) => ({
    x: PAD + ((Number(p.longitude) - minLon) / rangoLon) * (WIDTH - PAD * 2),
    y: PAD + (1 - (Number(p.latitude) - minLat) / rangoLat) * (HEIGHT - PAD * 2),
  }));
};

export default function RutaGpsActividad({ activityId }) {
  const [abierta, setAbierta] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [ruta, setRuta] = useState(null);
  const [error, setError] = useState('');

  const alternar = async () => {
    if (abierta) { setAbierta(false); return; }
    setAbierta(true);
    if (ruta || cargando) return;
    setCargando(true);
    setError('');
    try {
      const data = await obtenerRutaGps(activityId);
      if (!data) setError('Recorrido no disponible.');
      else setRuta(data);
    } catch {
      setError('No se pudo cargar el recorrido.');
    } finally {
      setCargando(false);
    }
  };

  const trazado = proyectar(ruta?.points || []);
  const points = trazado.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View style={styles.wrap}>
      <TouchableOpacity onPress={alternar} accessibilityRole="button">
        <Text style={styles.link}>{abierta ? 'Ocultar recorrido' : 'Ver recorrido GPS'}</Text>
      </TouchableOpacity>
      {abierta && (
        <View style={styles.card}>
          {cargando ? <ActivityIndicator /> : error ? <Text style={styles.error}>{error}</Text> : trazado.length >= 2 ? (
            <>
              <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
                <Polyline points={points} fill="none" stroke="#2F80ED" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={styles.meta}>{ruta?.point_count || trazado.length} puntos GPS · recorrido guardado por Korva</Text>
            </>
          ) : <Text style={styles.error}>Recorrido insuficiente para mostrar.</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  link: { color: '#67A9FF', fontSize: 12, fontWeight: '700' },
  card: { marginTop: 8, borderRadius: 12, backgroundColor: '#0D1B2A', padding: 10, alignItems: 'center' },
  meta: { marginTop: 4, color: '#6F8CAA', fontSize: 10 },
  error: { color: '#A8CFFF', fontSize: 11, paddingVertical: 12 },
});
