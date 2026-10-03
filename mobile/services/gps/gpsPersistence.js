import AsyncStorage from '@react-native-async-storage/async-storage';
import gpsCore from './gpsCore';

const { agregarPuntoGps, tickSesionGps } = gpsCore;

const GPS_SESSION_KEY = '@korva/gps_session_v1';

const sesionRecuperable = (sesion) =>
  sesion && (sesion.estado === 'grabando' || sesion.estado === 'pausada');

export const guardarSesionGpsLocal = async (sesion) => {
  if (!sesionRecuperable(sesion)) {
    await AsyncStorage.removeItem(GPS_SESSION_KEY);
    return;
  }
  await AsyncStorage.setItem(GPS_SESSION_KEY, JSON.stringify(sesion));
};

export const recuperarSesionGpsLocal = async () => {
  try {
    const raw = await AsyncStorage.getItem(GPS_SESSION_KEY);
    if (!raw) return null;
    const sesion = JSON.parse(raw);
    if (!sesionRecuperable(sesion) || !Array.isArray(sesion.puntos)) {
      await AsyncStorage.removeItem(GPS_SESSION_KEY);
      return null;
    }
    // Foreground todavía no puede afirmar que siguió grabando mientras la app
    // estuvo cerrada. Se recupera pausada para no inventar tiempo ni distancia.
    return {
      ...sesion,
      estado: 'pausada',
      ultimoPunto: null,
    };
  } catch {
    await AsyncStorage.removeItem(GPS_SESSION_KEY);
    return null;
  }
};

export const borrarSesionGpsLocal = () => AsyncStorage.removeItem(GPS_SESSION_KEY);


export const leerSesionGpsLocal = async () => {
  try {
    const raw = await AsyncStorage.getItem(GPS_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const procesarUbicacionesGpsLocal = async (locations = []) => {
  const sesion = await leerSesionGpsLocal();
  if (!sesion || sesion.estado !== 'grabando') return null;

  let siguiente = sesion;
  for (const loc of locations) {
    const coords = loc?.coords;
    if (!coords) continue;
    const timestamp = loc.timestamp || Date.now();
    siguiente = tickSesionGps(siguiente, timestamp);
    siguiente = agregarPuntoGps(siguiente, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      timestamp,
    });
  }

  await AsyncStorage.setItem(GPS_SESSION_KEY, JSON.stringify(siguiente));
  return siguiente;
};
