// Diagnóstico TEMPORAL de Apple Health (solo iOS, solo admins).
//
// Reutiliza la lectura productiva (healthkitLectura) y le suma extras de
// diagnóstico: lista de fuentes con querySources() y el modelo de dispositivo
// a partir de unas pocas muestras. No escribe en Salud, no envía nada por sí
// mismo y no estima km a partir de pasos.
import {
  queryQuantitySamples,
  querySources,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import {
  TIPOS,
  TIPOS_LECTURA,
  estadoSalud as estadoSaludLectura,
  fuenteSimple,
  leerMovimientoDiario,
  rangoUltimosDias,
} from './healthkitLectura';

export const plataformaSoportada = true;

const DIAS = 7;
// Muestras individuales solo para identificar el dispositivo de cada fuente.
// Límite chico a propósito: no queremos descargar grandes cantidades de datos.
const MUESTRAS_POR_TIPO = 30;

export const estadoSalud = estadoSaludLectura;

export async function conectar() {
  // Solo lectura de los 3 tipos. Sin toShare.
  return requestAuthorization({ toRead: TIPOS_LECTURA });
}

export async function leerDiagnostico() {
  const base = await leerMovimientoDiario(DIAS);
  const { inicio, fin } = rangoUltimosDias(DIAS);
  const filtro = { date: { startDate: inicio, endDate: fin } };

  const fuentes = {};
  const errores = [...base.errores];

  for (const clave of Object.keys(TIPOS)) {
    const tipo = TIPOS[clave];
    fuentes[clave] = [];
    const indice = {};
    const agregar = (simple) => {
      if (!indice[simple.bundleIdentifier]) {
        indice[simple.bundleIdentifier] = { ...simple, dispositivos: [] };
        fuentes[clave].push(indice[simple.bundleIdentifier]);
      }
      return indice[simple.bundleIdentifier];
    };

    // Extra 1: fuentes que escribieron este tipo de dato en el período.
    try {
      const lista = await querySources(tipo.id, filtro);
      lista.forEach((f) => agregar(fuenteSimple(f)));
    } catch (e) {
      errores.push(`${clave} / fuentes: ${e?.message || String(e)}`);
    }

    // Extra 2 (secundario y limitado): modelo de dispositivo de cada fuente.
    try {
      const muestras = await queryQuantitySamples(tipo.id, {
        limit: MUESTRAS_POR_TIPO,
        ascending: false,
        filter: filtro,
        unit: tipo.unit,
      });
      muestras.forEach((m) => {
        const entrada = agregar(fuenteSimple(m.sourceRevision?.source));
        const descripcion = [
          m.sourceRevision?.productType,
          m.device?.model,
          m.device?.name,
        ].filter(Boolean).join(' · ');
        if (descripcion && !entrada.dispositivos.includes(descripcion)) {
          entrada.dispositivos.push(descripcion);
        }
      });
    } catch (e) {
      errores.push(`${clave} / muestras: ${e?.message || String(e)}`);
    }
  }

  return {
    ...base,
    muestrasPorTipo: MUESTRAS_POR_TIPO,
    fuentes,
    errores,
  };
}