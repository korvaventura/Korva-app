import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const activity = Platform.OS === 'ios' ? requireOptionalNativeModule('KorvaLiveGps') : null;
let pending = Promise.resolve();
let nextUpdateAt = 0;

export function sincronizarActividadGps(sesion, { transition = false } = {}) {
  if (!activity || !sesion?.sessionId) return;
  const now = Date.now();
  if (!transition && now < nextUpdateAt) return;
  nextUpdateAt = now + 10000;

  pending = pending.then(async () => {
    if (sesion.estado === 'finalizada') {
      await activity.end(sesion.sessionId);
      return;
    }

    const recording = sesion.estado === 'grabando';
    const accumulated = sesion.duracionActivaMs || 0;
    const segmentStart = sesion.tramoActivoDesdeMs || sesion.ultimoTickMs || now;
    const elapsed = Math.floor((accumulated + (recording ? Math.max(0, now - segmentStart) : 0)) / 1000);
    const km = (sesion.distanciaM || 0) / 1000;
    const isRide = sesion.deporte === 'ride';
    let average = '—';
    if (elapsed > 0 && km > 0) {
      if (isRide) {
        average = `${(km * 3600 / elapsed).toFixed(1).replace('.', ',')} km/h`;
      } else {
        const pace = Math.round(elapsed / km);
        average = `${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, '0')} /km`;
      }
    }
    await activity.sync(
      sesion.sessionId,
      isRide ? 'Bici' : 'Correr / Caminar',
      elapsed,
      recording ? Math.min(segmentStart, now) - accumulated : null,
      average,
      `${km.toFixed(2).replace('.', ',')} km`,
      transition
    );
  }).catch((error) => console.warn('Korva GPS: actividad en vivo', error));
}
