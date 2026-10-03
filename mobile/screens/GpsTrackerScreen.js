import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import gpsCore from '../services/gps/gpsCore';
import {
  borrarSesionGpsLocal,
  guardarSesionGpsLocal,
  leerSesionGpsLocal,
  recuperarSesionGpsLocal,
} from '../services/gps/gpsPersistence';
import { iniciarGpsBackground, detenerGpsBackground } from '../services/gps/gpsBackgroundTask';

const {
  crearSesionGps,
  agregarPuntoGps,
  pausarSesionGps,
  reanudarSesionGps,
  finalizarSesionGps,
  resumenSesionGps,
} = gpsCore;

const formatearTiempo = (segundos) => {
  const s = Math.max(0, Number(segundos) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);
  return h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

export default function GpsTrackerScreen({ navigation }) {
  const sesionRef = useRef(null);
  const watcherRef = useRef(null);
  const timerRef = useRef(null);
  const [sesion, setSesion] = useState(null);
  const [estadoGps, setEstadoGps] = useState('listo');
  const [precision, setPrecision] = useState(null);
  const [ahoraMs, setAhoraMs] = useState(Date.now());

  const publicar = (s, { persistir = true } = {}) => {
    sesionRef.current = s;
    setSesion(s);
    if (persistir) guardarSesionGpsLocal(s).catch(() => {});
  };

  const detenerWatcher = async () => {
    await detenerGpsBackground();
  };

  useEffect(() => {
    let activa = true;
    recuperarSesionGpsLocal().then((recuperada) => {
      if (!activa || !recuperada) return;
      publicar(recuperada, { persistir: false });
      setEstadoGps('pausado');
      setAhoraMs(Date.now());
    });
    return () => {
      activa = false;
      detenerWatcher();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (sesion?.estado === 'grabando') {
      timerRef.current = setInterval(() => setAhoraMs(Date.now()), 1000);
      return () => {
        clearInterval(timerRef.current);
        timerRef.current = null;
      };
    }
  }, [sesion?.estado]);

  const escucharUbicacion = async () => {
    setEstadoGps('buscando');
    await iniciarGpsBackground();
  };

  const iniciar = async () => {
    try {
      const servicios = await Location.hasServicesEnabledAsync();
      if (!servicios) {
        Alert.alert('Ubicación desactivada', 'Activá la ubicación del teléfono para registrar tu recorrido.');
        return;
      }
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (permiso.status !== 'granted') {
        Alert.alert('Permiso de ubicación', 'Korva necesita acceso a tu ubicación mientras registrás una actividad.');
        return;
      }
      const permisoBackground = await Location.requestBackgroundPermissionsAsync();
      if (permisoBackground.status !== 'granted') {
        Alert.alert('Ubicación en segundo plano', 'Korva necesita permiso de ubicación Siempre para medir mientras bloqueás la pantalla.');
        return;
      }
      const nueva = crearSesionGps({ deporte: 'run', ahoraMs: Date.now() });
      await guardarSesionGpsLocal(nueva);
      publicar(nueva, { persistir: false });
      setAhoraMs(Date.now());
      setPrecision(null);
      await escucharUbicacion();
    } catch (e) {
      await detenerWatcher();
      setEstadoGps('error');
      Alert.alert('GPS no disponible', 'No pudimos iniciar el GPS. Intentá nuevamente.');
    }
  };

  const pausar = async () => {
    await detenerWatcher();
    publicar(pausarSesionGps(sesionRef.current, Date.now()));
    setEstadoGps('pausado');
  };

  const reanudar = async () => {
    publicar(reanudarSesionGps(sesionRef.current, Date.now()));
    setAhoraMs(Date.now());
    try {
      await escucharUbicacion();
    } catch (e) {
      publicar(pausarSesionGps(sesionRef.current, Date.now()));
      setEstadoGps('error');
      Alert.alert('GPS no disponible', 'No pudimos reanudar la ubicación.');
    }
  };

  const finalizar = async () => {
    await detenerWatcher();
    const fin = finalizarSesionGps(sesionRef.current, Date.now());
    publicar(fin, { persistir: false });
    await borrarSesionGpsLocal();
    setEstadoGps('finalizado');
  };

  const resumenBase = resumenSesionGps(sesion);
  const segundosVista = sesion?.estado === 'grabando'
    ? Math.round((sesion.duracionActivaMs + Math.max(0, ahoraMs - sesion.ultimoTickMs)) / 1000)
    : resumenBase.duration_seconds;

  const etiquetaGps = estadoGps === 'buscando' ? 'Buscando señal GPS…'
    : estadoGps === 'senal' ? `GPS activo${precision != null ? ` · ±${precision} m` : ''}`
    : estadoGps === 'pausado' ? 'Actividad pausada'
    : estadoGps === 'finalizado' ? 'Actividad finalizada'
    : estadoGps === 'error' ? 'GPS no disponible'
    : 'Listo para salir';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Actividad GPS</Text>
        <View style={styles.back} />
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.dot, estadoGps === 'senal' && styles.dotActivo]} />
        <Text style={styles.statusText}>{etiquetaGps}</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.label}>DISTANCIA</Text>
        <Text style={styles.distance}>{resumenBase.distancia_km.toFixed(2)}</Text>
        <Text style={styles.unit}>km</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatearTiempo(segundosVista)}</Text>
          <Text style={styles.statLabel}>TIEMPO</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{sesion?.puntos?.length || 0}</Text>
          <Text style={styles.statLabel}>PUNTOS GPS</Text>
        </View>
      </View>

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={20} color="#A8CFFF" />
        <Text style={styles.noteText}>
          Tu sesión se conserva si salís de esta pantalla. Finalizar todavía no modifica tus desafíos.
        </Text>
      </View>

      <View style={styles.controls}>
        {!sesion && (
          <TouchableOpacity style={styles.primary} onPress={iniciar}>
            <Ionicons name="play" size={22} color="#FFFFFF" />
            <Text style={styles.primaryText}>Iniciar actividad</Text>
          </TouchableOpacity>
        )}

        {sesion?.estado === 'grabando' && (
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.secondary} onPress={pausar}>
              <Ionicons name="pause" size={24} color="#FFFFFF" />
              <Text style={styles.secondaryText}>Pausar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.finish} onPress={finalizar}>
              <Ionicons name="stop" size={24} color="#FFFFFF" />
              <Text style={styles.secondaryText}>Finalizar</Text>
            </TouchableOpacity>
          </View>
        )}

        {sesion?.estado === 'pausada' && (
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.primarySmall} onPress={reanudar}>
              <Ionicons name="play" size={24} color="#FFFFFF" />
              <Text style={styles.secondaryText}>Reanudar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.finish} onPress={finalizar}>
              <Ionicons name="stop" size={24} color="#FFFFFF" />
              <Text style={styles.secondaryText}>Finalizar</Text>
            </TouchableOpacity>
          </View>
        )}

        {sesion?.estado === 'finalizada' && (
          <TouchableOpacity style={styles.primary} onPress={() => { publicar(null); borrarSesionGpsLocal().catch(() => {}); setEstadoGps('listo'); setPrecision(null); }}>
            <Text style={styles.primaryText}>Nueva prueba</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07131F', paddingHorizontal: 22, paddingTop: 54 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 30 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#617184', marginRight: 8 },
  dotActivo: { backgroundColor: '#4CAF50' },
  statusText: { color: '#A8CFFF', fontSize: 13 },
  hero: { alignItems: 'center', marginTop: 56 },
  label: { color: '#617184', fontSize: 11, fontWeight: '700', letterSpacing: 2.5 },
  distance: { color: '#FFFFFF', fontSize: 84, lineHeight: 92, fontWeight: '700', letterSpacing: -4, marginTop: 8 },
  unit: { color: '#A8CFFF', fontSize: 18, marginTop: -4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 54, backgroundColor: '#0D1B2A', borderRadius: 18, paddingVertical: 22 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  statLabel: { color: '#617184', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 7 },
  divider: { width: 1, height: 38, backgroundColor: '#1E3A5F' },
  note: { flexDirection: 'row', gap: 10, backgroundColor: '#0D1B2A', borderRadius: 14, padding: 15, marginTop: 18, alignItems: 'center' },
  noteText: { color: '#A8CFFF', fontSize: 12, lineHeight: 17, flex: 1 },
  controls: { marginTop: 'auto', paddingBottom: 38 },
  primary: { height: 58, borderRadius: 18, backgroundColor: '#1E6FD9', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  controlRow: { flexDirection: 'row', gap: 12 },
  secondary: { flex: 1, height: 58, borderRadius: 18, backgroundColor: '#1E3A5F', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  primarySmall: { flex: 1, height: 58, borderRadius: 18, backgroundColor: '#1E6FD9', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  finish: { flex: 1, height: 58, borderRadius: 18, backgroundColor: '#B23A3A', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
