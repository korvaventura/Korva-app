import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
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
  const latMedia = ((minLat + maxLat) / 2) * Math.PI / 180;
  const cosLat = Math.max(0.2, Math.cos(latMedia));
  const rangoLat = Math.max(maxLat - minLat, 0.000001);
  const rangoLonAjustado = Math.max((maxLon - minLon) * cosLat, 0.000001);
  const ancho = WIDTH - PAD * 2;
  const alto = HEIGHT - PAD * 2;
  const escala = Math.min(ancho / rangoLonAjustado, alto / rangoLat);
  const dibujoAncho = rangoLonAjustado * escala;
  const dibujoAlto = rangoLat * escala;
  const offsetX = PAD + (ancho - dibujoAncho) / 2;
  const offsetY = PAD + (alto - dibujoAlto) / 2;
  return validos.map((p) => ({
    x: offsetX + (Number(p.longitude) - minLon) * cosLat * escala,
    y: offsetY + (maxLat - Number(p.latitude)) * escala,
  }));
};

export default function RutaGpsActividad({ activityId, modoDetalle = false }) {
  const [abierta, setAbierta] = useState(modoDetalle);
  const [cargando, setCargando] = useState(modoDetalle);
  const [ruta, setRuta] = useState(null);
  const [error, setError] = useState('');

  const cargarRuta = async () => {
    await cargarRuta();
  };

  useEffect(() => {
    if (modoDetalle && activityId) cargarRuta();
  }, [activityId, modoDetalle]);

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
      {!modoDetalle && <TouchableOpacity onPress={alternar} accessibilityRole="button">
        <Text style={styles.link}>{abierta ? 'Ocultar recorrido' : 'Ver recorrido GPS'}</Text>
      </TouchableOpacity>}
      {abierta && (
        <View style={styles.card}>
          {cargando ? <ActivityIndicator /> : error ? <Text style={styles.error}>{error}</Text> : trazado.length >= 2 ? (
            <>
              <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
                <Polyline points={points} fill="none" stroke="#2F80ED" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <Circle cx={trazado[0].x} cy={trazado[0].y} r="5" fill="#FFFFFF" />
                <Circle cx={trazado[trazado.length - 1].x} cy={trazado[trazado.length - 1].y} r="5" fill="#FC4C02" />
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
