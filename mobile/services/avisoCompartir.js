import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const { actividadDeAviso } = require('./compartirCore');

const BACKEND_URL = 'https://korva-app-production.up.railway.app';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Tocar el aviso "+8,2 km registrados · Tocá para compartir tu salida" abre la
// salida de Strava con la pantalla de compartir ya abierta.
async function abrirDesdeAviso(data, navigationRef) {
  if (data?.tipo !== 'compartir_actividad') return;
  try {
    // En arranque en frío la navegación y la sesión tardan un poco.
    for (let i = 0; i < 60 && !navigationRef.isReady(); i++) await espera(250);
    if (!navigationRef.isReady()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    // La salida puede tardar unos segundos en aparecer después del aviso.
    for (let intento = 0; intento < 3; intento++) {
      const res = await fetch(`${BACKEND_URL}/actividades`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const lista = res.ok ? await res.json() : [];
      const actividad = actividadDeAviso(data, lista);
      if (actividad) {
        navigationRef.navigate('DetalleActividad', { actividad, userId: session.user.id, abrirCompartir: true });
        return;
      }
      await espera(2000);
    }
  } catch {
    // Si falla, la app abre normal: el aviso no rompe nada.
  }
}

export function escucharAvisosCompartir(navigationRef) {
  let vivo = true;
  // El último aviso tocado (app cerrada) se reporta en cada arranque: lo abrimos una sola vez.
  Notifications.getLastNotificationResponseAsync?.()
    .then(async (r) => {
      const id = r?.notification?.request?.identifier;
      if (!vivo || !r || !id) return;
      if ((await AsyncStorage.getItem('korva:aviso-compartir-ultimo')) === id) return;
      await AsyncStorage.setItem('korva:aviso-compartir-ultimo', id);
      abrirDesdeAviso(r.notification?.request?.content?.data, navigationRef);
    })
    .catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const id = r?.notification?.request?.identifier;
    if (id) AsyncStorage.setItem('korva:aviso-compartir-ultimo', id).catch(() => {});
    abrirDesdeAviso(r.notification?.request?.content?.data, navigationRef);
  });
  return () => { vivo = false; sub.remove(); };
}
