import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { AppState, DeviceEventEmitter } from 'react-native';
import { consultarRutaLibre } from './rutasLibresApi';
export default function useRutaLibre() {
  const [estado, setEstado] = useState({ cargando: true, datos: null, error: '' });
  const generacion = useRef(0), controller = useRef(null);
  const actualizar = useCallback(async ({ conservarDatos = false } = {}) => {
    const turno = ++generacion.current;
    controller.current?.abort(); controller.current = new AbortController();
    setEstado(prev => ({ cargando: true, datos: conservarDatos ? prev.datos : null, error: '' }));
    try {
      const datos = await consultarRutaLibre({ signal: controller.current.signal });
      if (turno === generacion.current) setEstado({ cargando: false, datos, error: '' });
    } catch (e) {
      if (turno === generacion.current) setEstado({ cargando: false, datos: null, error: e.message });
    }
  }, []);
  useFocusEffect(useCallback(() => {
    actualizar();
    let anterior = AppState.currentState;
    const app = AppState.addEventListener('change', (actual) => {
      if (actual === 'active' && anterior !== 'active') actualizar();
      anterior = actual;
    });
    const actividades = DeviceEventEmitter.addListener('korva:actividades-actualizadas', () => {
      if (AppState.currentState === 'active') actualizar();
    });
    const movimiento = DeviceEventEmitter.addListener('korva:movimiento-actualizado', () => {
      if (AppState.currentState === 'active') actualizar({ conservarDatos: true });
    });
    return () => { app.remove(); actividades.remove(); movimiento.remove(); generacion.current++; controller.current?.abort(); };
  }, [actualizar]));
  return { estado, actualizar };
}
