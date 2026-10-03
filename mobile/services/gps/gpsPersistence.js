import AsyncStorage from '@react-native-async-storage/async-storage';
import gpsCore from './gpsCore';

const { agregarPuntoGps } = gpsCore;

const GPS_SESSION_KEY = '@korva/gps_session_v1';

const sesionPersistible = (sesion) =>
  sesion && ['grabando', 'pausada', 'finalizada'].includes(sesion.estado);

export const guardarSesionGpsLocal = async (sesion) => {
  if (!sesionPersistible(sesion)) {
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
    if (!sesionPersistible(sesion) || !Array.isArray(sesion.puntos)) {
      await AsyncStorage.removeItem(GPS_SESSION_KEY);
      return null;
    }
    return sesion;
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
