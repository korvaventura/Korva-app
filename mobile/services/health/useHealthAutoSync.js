// Dispara el sync automático de Apple Health (solo iOS, solo el usuario que se pasa).
//
// - Al abrir la app: con unos segundos de demora y después de las animaciones,
//   para no competir con la carga inicial.
// - Al volver de segundo plano a primer plano.
// La frecuencia, el opt-in y los permisos los controla syncAutomatico.js.
// IMPORTANTE: llamar este hook arriba de todo en el componente, antes de cualquier return.
import { useEffect } from 'react';
import { AppState, DeviceEventEmitter, InteractionManager, Platform } from 'react-native';
import { ejecutarSyncAutomatico } from './syncAutomatico';

const DEMORA_INICIO_MS = 5000;

export default function useHealthAutoSync(userId) {
  useEffect(() => {
    if (!['ios', 'android'].includes(Platform.OS) || !userId) return undefined;

    let cancelado = false;
    const disparar = () => {
      InteractionManager.runAfterInteractions(() => {
        if (cancelado) return;
        ejecutarSyncAutomatico(userId).then((resultado) => {
          if (!cancelado && resultado?.motivo === 'ok') {
            DeviceEventEmitter.emit('korva:movimiento-actualizado', { userId });
          }
        }).catch(() => {});
      });
    };

    const temporizador = setTimeout(disparar, DEMORA_INICIO_MS);

    let estadoAnterior = AppState.currentState;
    const suscripcion = AppState.addEventListener('change', (estadoNuevo) => {
      if ((estadoAnterior === 'background' || estadoAnterior === 'inactive') && estadoNuevo === 'active') {
        disparar();
      }
      estadoAnterior = estadoNuevo;
    });

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
      suscripcion.remove();
    };
  }, [userId]);
}
