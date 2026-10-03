// Diagnóstico Android de Health Connect. Solo admins, solo lectura.
import { aggregateRecord, requestPermission } from 'react-native-health-connect';
import { PERMISOS_LECTURA, estadoSalud as estadoSaludLectura, leerMovimientoDiario } from './healthkitLectura';

export const plataformaSoportada = true;
export const estadoSalud = estadoSaludLectura;

export async function conectar() {
  return requestPermission(PERMISOS_LECTURA);
}

export async function leerDiagnostico() {
  const base = await leerMovimientoDiario(7);
  // Referencia diagnóstica: los aggregates nativos pueden deduplicar entre orígenes,
  // pero no permiten excluir recordingMethod=manual. No alimentan el sync.
  const timeRangeFilter = {
    operator: 'between',
    startTime: new Date(`${base.desde}T00:00:00`).toISOString(),
    endTime: new Date().toISOString(),
  };
  const agregadosNativos = {};
  for (const recordType of ['Steps', 'Distance']) {
    try { agregadosNativos[recordType] = await aggregateRecord({ recordType, timeRangeFilter }); }
    catch (e) { agregadosNativos[recordType] = { error: e?.message || String(e) }; }
  }
  return {
    ...base,
    diagnosticoHealthConnect: {
      ...base.diagnosticoHealthConnect,
      agregadosNativosReferencia: agregadosNativos,
      notaAgregados: 'Solo diagnóstico: aggregate puede deduplicar orígenes pero incluye manuales; el sync usa readRecords filtrado.',
    },
  };
}

