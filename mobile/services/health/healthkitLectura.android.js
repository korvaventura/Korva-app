// Lectura productiva Android: Health Connect → contrato común de movimiento diario.
import {
  getGrantedPermissions,
  initialize,
  readRecords,
} from 'react-native-health-connect';
import { rangoUltimosDias, transformarHealthConnect } from './healthConnectTransform';
import { leerPaginado } from './healthConnectPaginacion';

export const plataformaSoportada = true;
// Health Connect ExerciseSession: BIKING = 8 (valor de la API usado por v4.1.3).
const EXERCISE_TYPE_BIKING = 8;
export const PERMISOS_LECTURA = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ExerciseSession' },
];

const tienePermiso = (lista, esperado) => lista.some((p) => p.accessType === esperado.accessType && p.recordType === esperado.recordType);

export async function estadoSalud() {
  const disponible = await initialize();
  if (!disponible) return { disponible: false, estadoPermiso: 'no_disponible' };
  const otorgados = await getGrantedPermissions();
  const todos = PERMISOS_LECTURA.every((p) => tienePermiso(otorgados || [], p));
  return { disponible: true, estadoPermiso: todos ? 'ya_pedido' : 'no_pedido' };
}

export async function leerTodos(recordType, timeRangeFilter) {
  return leerPaginado(readRecords, recordType, timeRangeFilter);
}

export async function leerMovimientoDiario(dias = 7) {
  const disponible = await initialize();
  if (!disponible) throw new Error('Health Connect no está disponible en este dispositivo.');
  const { inicio, fin } = rangoUltimosDias(dias);
  const timeRangeFilter = { operator: 'between', startTime: inicio.toISOString(), endTime: fin.toISOString() };
  const errores = [];
  const leer = async (tipo) => {
    try { return await leerTodos(tipo, timeRangeFilter); }
    catch (e) { errores.push(`${tipo}: ${e?.message || String(e)}`); return null; }
  };
  const [pasos, distancias, sesiones] = await Promise.all([leer('Steps'), leer('Distance'), leer('ExerciseSession')]);
  if (!pasos || !distancias || !sesiones) {
    return {
      generado: fin.toISOString(), zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone || 'desconocida',
      desde: '', hasta: '', dias: [], fuentes: {}, errores, lecturaCompleta: false,
    };
  }
  const resultado = transformarHealthConnect({
    pasos, distancias, sesiones, dias, inicio, fin,
    exerciseTypeBiking: EXERCISE_TYPE_BIKING,
  });
  return { ...resultado, errores, lecturaCompleta: errores.length === 0 };
}
