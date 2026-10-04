import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { leerMovimientoPersonal } from './movimientoPersonalApi';
const { crearCargaMovimientoPersonal } = require('./movimientoPersonalCore');

export default function useMovimientoPersonal(userId) {
  const [estado, setEstado] = useState({ status: 'esperando', datos: null, userId: null });
  const cargaRef = useRef(null);
  const actualizar = useCallback(() => {
    if (!cargaRef.current) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return cargaRef.current.actualizar({ userId, timezone });
  }, [userId]);

  useFocusEffect(useCallback(() => {
    const carga = crearCargaMovimientoPersonal({ leer: leerMovimientoPersonal, emitir: setEstado });
    cargaRef.current = carga;
    actualizar();
    let anterior = AppState.currentState;
    const subscription = AppState.addEventListener('change', (actual) => {
      if (actual !== 'active') carga.cancelar();
      else if (anterior !== 'active') actualizar();
      anterior = actual;
    });
    return () => {
      subscription.remove();
      carga.cancelar();
      if (cargaRef.current === carga) cargaRef.current = null;
    };
  }, [actualizar]));

  // No muestra datos de la cuenta anterior durante un cambio de usuario.
  return { actualizar, estado: estado.userId === userId
    ? estado : { status: 'esperando', datos: null, userId } };
}
