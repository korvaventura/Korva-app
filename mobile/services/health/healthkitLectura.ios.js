// Lectura PRODUCTIVA de Apple Health (solo iOS).
//
// Es la lectura mínima que necesita el sync de movimiento diario: totales
// consolidados por día local y el desglose por fuente. No pide permisos, no
// escribe en Salud y no consulta muestras individuales.
// Excluye las muestras ingresadas a mano (HKWasUserEntered = true) en caminando,
// bici y pasos, tanto en el total como en el desglose por fuente.
// El diagnóstico (healthkitDiagnostico) reutiliza esta lectura y le suma extras.
import {
  AuthorizationRequestStatus,
  ComparisonPredicateOperator,
  getRequestStatusForAuthorization,
  isHealthDataAvailableAsync,
  queryStatisticsCollectionForQuantity,
  queryStatisticsCollectionForQuantitySeparateBySource,
} from '@kingstinct/react-native-healthkit';
import { conSinIngresoManual } from './filtroIngresoManual';

export const plataformaSoportada = true;

export const TIPOS = {
  caminando: { id: 'HKQuantityTypeIdentifierDistanceWalkingRunning', unit: 'km' },
  bici: { id: 'HKQuantityTypeIdentifierDistanceCycling', unit: 'km' },
  pasos: { id: 'HKQuantityTypeIdentifierStepCount', unit: 'count' },
};

// Solo lectura: nunca se pide toShare.
export const TIPOS_LECTURA = Object.values(TIPOS).map((t) => t.id);

// Fecha local del teléfono en formato AAAA-MM-DD.
export const fechaLocal = (fecha) => {
  const d = new Date(fecha);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

export const zonaHoraria = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'desconocida';
  } catch {
    return 'desconocida';
  }
};

// querySources() devuelve objetos nativos (SourceProxy) cuya propiedad `name`
// es el nombre interno del objeto; toJSON() devuelve los datos reales de la fuente.
// Las fuentes que vienen dentro de estadísticas y muestras ya son objetos simples.
export const fuenteSimple = (fuente) => {
  const datos = typeof fuente?.toJSON === 'function' ? fuente.toJSON() : fuente;
  return {
    name: datos?.name ?? '(sin nombre)',
    bundleIdentifier: datos?.bundleIdentifier ?? '(sin bundleIdentifier)',
  };
};

// Desde la medianoche local de hace (dias - 1) días hasta ahora.
export const rangoUltimosDias = (dias) => {
  const fin = new Date();
  const inicio = new Date(fin);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - (dias - 1));
  return { inicio, fin };
};

export async function estadoSalud() {
  const disponible = await isHealthDataAvailableAsync();
  if (!disponible) {
    return { disponible: false, estadoPermiso: 'no_disponible' };
  }
  const status = await getRequestStatusForAuthorization({ toRead: TIPOS_LECTURA });
  let estadoPermiso = 'desconocido';
  if (status === AuthorizationRequestStatus.shouldRequest) estadoPermiso = 'no_pedido';
  if (status === AuthorizationRequestStatus.unnecessary) estadoPermiso = 'ya_pedido';
  return { disponible: true, estadoPermiso };
}

export async function leerMovimientoDiario(dias = 7) {
  const { inicio, fin } = rangoUltimosDias(dias);
  // Fechas + sin muestras ingresadas a mano (HKWasUserEntered = true), para los tres tipos.
  const filtro = conSinIngresoManual(
    { date: { startDate: inicio, endDate: fin } },
    ComparisonPredicateOperator.notEqualTo,
  );
  const claves = Object.keys(TIPOS);

  // Un registro por día local, también para los días sin datos.
  const registros = [];
  const porFecha = {};
  for (let i = 0; i < dias; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    const fecha = fechaLocal(d);
    const registro = { fecha, consolidado: {}, fuentesConsolidado: {}, porFuente: {} };
    claves.forEach((clave) => {
      registro.consolidado[clave] = null; // null = HealthKit no devolvió datos para ese día
      registro.fuentesConsolidado[clave] = [];
      registro.porFuente[clave] = [];
    });
    registros.push(registro);
    porFecha[fecha] = registro;
  }

  const fuentes = {};
  const errores = [];
  // false si falló algún total consolidado: con una lectura incompleta no se
  // debe sincronizar, para no pisar un día bueno con un valor faltante.
  let lecturaCompleta = true;

  for (const clave of claves) {
    const tipo = TIPOS[clave];
    fuentes[clave] = [];
    const indice = {};

    // 1. Total consolidado por día (lo que calcula HealthKit).
    try {
      const consolidado = await queryStatisticsCollectionForQuantity(
        tipo.id, ['cumulativeSum'], inicio, { day: 1 }, { filter: filtro, unit: tipo.unit }
      );
      consolidado.forEach((s) => {
        const registro = porFecha[fechaLocal(s.startDate)];
        if (!registro) return;
        registro.consolidado[clave] = s.sumQuantity?.quantity ?? 0;
        registro.fuentesConsolidado[clave] = (s.sources || []).map(fuenteSimple);
      });
    } catch (e) {
      lecturaCompleta = false;
      errores.push(`${clave} / consolidado: ${e?.message || String(e)}`);
    }

    // 2. Valores separados por fuente y por día.
    try {
      const separado = await queryStatisticsCollectionForQuantitySeparateBySource(
        tipo.id, ['cumulativeSum'], inicio, { day: 1 }, { filter: filtro, unit: tipo.unit }
      );
      separado.forEach((s) => {
        const registro = porFecha[fechaLocal(s.startDate)];
        if (!registro) return;
        const simple = fuenteSimple(s.source);
        registro.porFuente[clave].push({ ...simple, valor: s.sumQuantity?.quantity ?? 0 });
        // Fuentes conocidas por esta lectura, sin modelo de dispositivo
        // (las estadísticas no lo traen; fuente_dispositivo queda null).
        if (!indice[simple.bundleIdentifier]) {
          indice[simple.bundleIdentifier] = { ...simple, dispositivos: [] };
          fuentes[clave].push(indice[simple.bundleIdentifier]);
        }
      });
    } catch (e) {
      errores.push(`${clave} / por fuente: ${e?.message || String(e)}`);
    }
  }

  return {
    generado: fin.toISOString(),
    zonaHoraria: zonaHoraria(),
    desde: fechaLocal(inicio),
    hasta: fechaLocal(fin),
    dias: registros,
    fuentes,
    errores,
    lecturaCompleta,
  };
}