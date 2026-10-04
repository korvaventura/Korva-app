import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import gpsCore from '../services/gps/gpsCore';
import {
  archivarSesionGpsConfirmada,
  borrarSesionGpsLocal,
  guardarSesionGpsLocal,
  leerSesionGpsLocal,
  recuperarSesionGpsLocal,
} from '../services/gps/gpsPersistence';
import { iniciarGpsBackground, detenerGpsBackground } from '../services/gps/gpsBackgroundTask';
import { confirmarActividadGps } from '../services/gps/gpsApi';
import { colors, radius } from '../theme/korvaTheme';

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
  const timerRef = useRef(null);
  const [sesion, setSesion] = useState(null);
  const [estadoGps, setEstadoGps] = useState('listo');
  const [precision, setPrecision] = useState(null);
  const [ahoraMs, setAhoraMs] = useState(Date.now());
  const [deporte, setDeporte] = useState('run');
  const [confirmando, setConfirmando] = useState(false);

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
      setDeporte(recuperada.deporte || 'run');
      setEstadoGps(
        recuperada.estado === 'grabando' ? 'senal'
          : recuperada.estado === 'finalizada' ? 'finalizado'
          : 'pausado'
      );
      setPrecision(recuperada.ultimoPunto?.accuracy != null ? Math.round(recuperada.ultimoPunto.accuracy) : null);
      setAhoraMs(Date.now());
    });
    return () => {
      activa = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      const actual = await leerSesionGpsLocal();
      if (!actual) return;
      sesionRef.current = actual;
      setSesion(actual);
      if (actual.estado === 'grabando' && actual.ultimoPunto) {
        setEstadoGps('senal');
        setPrecision(actual.ultimoPunto.accuracy != null ? Math.round(actual.ultimoPunto.accuracy) : null);
      }
    }, 1000);
    return () => clearInterval(id);
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
      const nueva = crearSesionGps({ deporte, ahoraMs: Date.now() });
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
    const ultima = (await leerSesionGpsLocal()) || sesionRef.current;
    const pausada = pausarSesionGps(ultima, Date.now());
    await guardarSesionGpsLocal(pausada);
    publicar(pausada, { persistir: false });
    setEstadoGps('pausado');
  };

  const reanudar = async () => {
    const ultima = (await leerSesionGpsLocal()) || sesionRef.current;
    const reanudada = reanudarSesionGps(ultima, Date.now());
    await guardarSesionGpsLocal(reanudada);
    publicar(reanudada, { persistir: false });
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
    const ultima = (await leerSesionGpsLocal()) || sesionRef.current;
    const fin = finalizarSesionGps(ultima, Date.now());
    await guardarSesionGpsLocal(fin);
    publicar(fin, { persistir: false });
    setEstadoGps('finalizado');
  };

  const resumenBase = resumenSesionGps(sesion);
  const segundosVista = sesion?.estado === 'grabando'
    ? Math.round((
        sesion.duracionActivaMs +
        Math.max(0, ahoraMs - (sesion.tramoActivoDesdeMs || sesion.ultimoTickMs || ahoraMs))
      ) / 1000)
    : resumenBase.duration_seconds;

  const etiquetaGps = estadoGps === 'buscando' ? 'Buscando GPS · puede tardar unos segundos'
    : estadoGps === 'senal' ? `GPS listo ✓${precision != null ? ` · ±${precision} m` : ''}`
    : estadoGps === 'pausado' ? 'Actividad pausada'
    : estadoGps === 'finalizado' ? 'Actividad finalizada'
    : estadoGps === 'error' ? 'GPS no disponible'
    : 'Listo para salir';

  const confirmar = async () => {
    if (!sesion || sesion.estado !== 'finalizada' || confirmando) return;
    setConfirmando(true);
    try {
      const data = await confirmarActividadGps(sesion, resumenSesionGps(sesion));
      // Conservamos el trazado confirmado antes de limpiar la sesión activa.
      // Así el recorrido no se pierde mientras el backend aún no persiste rutas.
      await archivarSesionGpsConfirmada(sesion, data);
      await borrarSesionGpsLocal();
      publicar(null, { persistir: false });
      setEstadoGps('listo');
      setPrecision(null);
      const actividadGuardada = data.actividad || null;
      if (actividadGuardada?.id) {
        navigation.replace('DetalleActividad', {
          actividad: actividadGuardada,
          recienGuardada: true,
          rutaGpsDisponible: data.ruta_guardada === true,
        });
      } else {
        Alert.alert(
          data.idempotente ? 'Actividad ya guardada' : 'Actividad registrada',
          data.idempotente
            ? 'Korva ya tenía registrada esta actividad. No se duplicaron kilómetros.'
            : 'Tu actividad se guardó correctamente y el progreso fue actualizado.'
        );
        navigation.goBack();
      }
    } catch (e) {
      Alert.alert(
        'Actividad pendiente',
        'No pudimos confirmarla ahora. El recorrido quedó guardado en este teléfono para que puedas reintentar sin perderlo.'
      );
    } finally {
      setConfirmando(false);
    }
  };

  const nombreDeporte = deporte === 'ride' ? 'Bici' : 'Correr / Caminar';
  const velocidadKmh = segundosVista > 0
    ? resumenBase.distancia_km / (segundosVista / 3600)
    : 0;
  const ritmoTotalSeg = resumenBase.distancia_km > 0
    ? Math.round(segundosVista / resumenBase.distancia_km)
    : 0;
  const ritmoTexto = ritmoTotalSeg > 0 && Number.isFinite(ritmoTotalSeg)
    ? `${Math.floor(ritmoTotalSeg / 60)}:${String(ritmoTotalSeg % 60).padStart(2, '0')} /km`
    : '--';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Korva GPS</Text>
        <View style={styles.back} />
      </View>

      {!sesion && (
        <View style={styles.sportRow}>
          {[
            ['run', 'Correr / Caminar', 'footsteps-outline'],
            ['ride', 'Bici', 'bicycle-outline'],
          ].map(([value, label, icon]) => (
            <TouchableOpacity
              key={value}
              style={[styles.sportOption, deporte === value && styles.sportOptionActive]}
              onPress={() => setDeporte(value)}
            >
              <Ionicons name={icon} size={18} color={deporte === value ? colors.text : colors.textSoft} />
              <Text style={[styles.sportText, deporte === value && styles.sportTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

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
          <Text style={styles.statValue}>
            {deporte === 'ride' ? (velocidadKmh > 0 ? `${velocidadKmh.toFixed(1)} km/h` : '--') : ritmoTexto}
          </Text>
          <Text style={styles.statLabel}>{deporte === 'ride' ? 'VELOCIDAD' : 'RITMO'}</Text>
        </View>
      </View>

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={20} color="#A8CFFF" />
        <Text style={styles.noteText}>
          {sesion
            ? 'El GPS sigue registrando si bloqueás la pantalla o usás otra app.'
            : 'Al finalizar vas a revisar y confirmar la actividad. Recién al confirmarla suma a tus desafíos activos.'}
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
          <View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Resumen de actividad</Text>
              <Text style={styles.summarySport}>{nombreDeporte}</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{resumenBase.distancia_km.toFixed(2)} km</Text>
                  <Text style={styles.summaryLabel}>DISTANCIA</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{formatearTiempo(resumenBase.duration_seconds)}</Text>
                  <Text style={styles.summaryLabel}>TIEMPO ACTIVO</Text>
                </View>
              </View>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{deporte === 'ride' ? `${velocidadKmh.toFixed(1)} km/h` : ritmoTexto}</Text>
                  <Text style={styles.summaryLabel}>{deporte === 'ride' ? 'VELOCIDAD MEDIA' : 'RITMO MEDIO'}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{resumenBase.puntos}</Text>
                  <Text style={styles.summaryLabel}>PUNTOS GPS</Text>
                </View>
              </View>
            </View>
            <View style={styles.controlRow}>
              <TouchableOpacity style={styles.secondary} onPress={() => {
                publicar(null);
                borrarSesionGpsLocal().catch(() => {});
                setEstadoGps('listo');
                setPrecision(null);
              }}>
                <Text style={styles.secondaryText}>Descartar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primarySmall, confirmando && styles.disabled]}
                disabled={confirmando}
                onPress={confirmar}
              >
                <Ionicons name="checkmark" size={22} color="#FFFFFF" />
                <Text style={styles.secondaryText}>{confirmando ? 'Guardando…' : 'Confirmar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundDeep, paddingHorizontal: 22, paddingTop: 54 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  sportRow: { flexDirection: 'row', gap: 8, marginTop: 24 },
  sportOption: { flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderSoft, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  sportOptionActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.brandOrange },
  sportText: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
  sportTextActive: { color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 30 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted, marginRight: 8 },
  dotActivo: { backgroundColor: colors.success },
  statusText: { color: colors.textSoft, fontSize: 13 },
  hero: { alignItems: 'center', marginTop: 56 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2.5 },
  distance: { color: colors.text, fontSize: 84, lineHeight: 92, fontWeight: '700', letterSpacing: -4, marginTop: 8 },
  unit: { color: colors.textSoft, fontSize: 18, marginTop: -4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 54, backgroundColor: colors.background, borderRadius: 18, paddingVertical: 22 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 7 },
  divider: { width: 1, height: 38, backgroundColor: colors.surfaceStrong },
  note: { flexDirection: 'row', gap: 10, backgroundColor: colors.background, borderRadius: 14, padding: 15, marginTop: 18, alignItems: 'center' },
  noteText: { color: colors.textSoft, fontSize: 12, lineHeight: 17, flex: 1 },
  summaryCard: { backgroundColor: colors.background, borderRadius: 18, padding: 18, marginBottom: 12 },
  summaryTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  summarySport: { color: colors.textSoft, fontSize: 13, marginTop: 3, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', marginTop: 10 },
  summaryItem: { flex: 1 },
  summaryValue: { color: colors.text, fontSize: 17, fontWeight: '700' },
  summaryLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 4 },
  controls: { marginTop: 'auto', paddingBottom: 38 },
  primary: { height: 58, borderRadius: 18, backgroundColor: colors.brandOrange, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  controlRow: { flexDirection: 'row', gap: 12 },
  secondary: { flex: 1, height: 58, borderRadius: 18, backgroundColor: colors.surfaceStrong, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  primarySmall: { flex: 1, height: 58, borderRadius: 18, backgroundColor: colors.brandOrange, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  finish: { flex: 1, height: 58, borderRadius: 18, backgroundColor: '#B23A3A', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },
});
