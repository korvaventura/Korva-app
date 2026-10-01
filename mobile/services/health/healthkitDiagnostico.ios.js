// Diagnóstico TEMPORAL de Apple Health (solo iOS, solo admins).
//
// Solo LEE datos de Salud para observarlos en pantalla. No escribe en Salud,
// no envía nada al backend, no toca daily_movement, activities ni user_challenges,
// y no estima km a partir de pasos.
import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailableAsync,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  queryStatisticsCollectionForQuantitySeparateBySource,
  querySources,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

export const plataformaSoportada = true;

const TIPOS = {
  caminando: { id: 'HKQuantityTypeIdentifierDistanceWalkingRunning', unit: 'km' },
  bici: { id: 'HKQuantityTypeIdentifierDistanceCycling', unit: 'km' },
  pasos: { id: 'HKQuantityTypeIdentifierStepCount', unit: 'count' },
};

// Solo lectura: nunca se pide toShare.
const TIPOS_LECTURA = Object.values(TIPOS).map((t) => t.id);

const DIAS = 7;
// Muestras individuales solo para identificar el dispositivo de cada fuente.
// Límite chico a propósito: no queremos descargar grandes cantidades de datos.
const MUESTRAS_POR_TIPO = 30;

// Fecha local del teléfono en formato AAAA-MM-DD.
const fechaLocal = (fecha) => {
  const d = new Date(fecha);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

const zonaHoraria = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'desconocida';
  } catch {
    return 'desconocida';
  }
};

// querySources() devuelve objetos nativos (SourceProxy) cuya propiedad `name`
// es el nombre interno del objeto; toJSON() devuelve los datos reales de la fuente.
// Las fuentes que vienen dentro de estadísticas y muestras ya son objetos simples.
const fuenteSimple = (fuente) => {
  const datos = typeof fuente?.toJSON === 'function' ? fuente.toJSON() : fuente;
  return {
    name: datos?.name ?? '(sin nombre)',
    bundleIdentifier: datos?.bundleIdentifier ?? '(sin bundleIdentifier)',
  };
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

export async function conectar() {
  // Solo lectura de los 3 tipos. Sin toShare.
  return requestAuthorization({ toRead: TIPOS_LECTURA });
}

export async function leerDiagnostico() {
  const ahora = new Date();
  const inicio = new Date(ahora);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - (DIAS - 1));

  const filtro = { date: { startDate: inicio, endDate: ahora } };
  const claves = Object.keys(TIPOS);

  // Un registro por día local, también para los días sin datos.
  const dias = [];
  const porFecha = {};
  for (let i = 0; i < DIAS; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    const fecha = fechaLocal(d);
    const registro = { fecha, consolidado: {}, fuentesConsolidado: {}, porFuente: {} };
    claves.forEach((clave) => {
      registro.consolidado[clave] = null; // null = HealthKit no devolvió datos para ese día
      registro.fuentesConsolidado[clave] = [];
      registro.porFuente[clave] = [];
    });
    dias.push(registro);
    porFecha[fecha] = registro;
  }

  const fuentes = {};
  const errores = [];

  for (const clave of claves) {
    const tipo = TIPOS[clave];
    fuentes[clave] = [];

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
        registro.porFuente[clave].push({
          ...fuenteSimple(s.source),
          valor: s.sumQuantity?.quantity ?? 0,
        });
      });
    } catch (e) {
      errores.push(`${clave} / por fuente: ${e?.message || String(e)}`);
    }

    // 3. Fuentes que escribieron este tipo de dato en el período.
    const indice = {};
    try {
      const lista = await querySources(tipo.id, filtro);
      lista.forEach((f) => {
        const simple = fuenteSimple(f);
        if (!indice[simple.bundleIdentifier]) {
          indice[simple.bundleIdentifier] = { ...simple, dispositivos: [] };
          fuentes[clave].push(indice[simple.bundleIdentifier]);
        }
      });
    } catch (e) {
      errores.push(`${clave} / fuentes: ${e?.message || String(e)}`);
    }

    // 4. Secundario y limitado: modelo de dispositivo de cada fuente.
    try {
      const muestras = await queryQuantitySamples(tipo.id, {
        limit: MUESTRAS_POR_TIPO,
        ascending: false,
        filter: filtro,
        unit: tipo.unit,
      });
      muestras.forEach((m) => {
        const simple = fuenteSimple(m.sourceRevision?.source);
        if (!indice[simple.bundleIdentifier]) {
          indice[simple.bundleIdentifier] = { ...simple, dispositivos: [] };
          fuentes[clave].push(indice[simple.bundleIdentifier]);
        }
        const descripcion = [
          m.sourceRevision?.productType,
          m.device?.model,
          m.device?.name,
        ].filter(Boolean).join(' · ');
        if (descripcion && !indice[simple.bundleIdentifier].dispositivos.includes(descripcion)) {
          indice[simple.bundleIdentifier].dispositivos.push(descripcion);
        }
      });
    } catch (e) {
      errores.push(`${clave} / muestras: ${e?.message || String(e)}`);
    }
  }

  return {
    generado: ahora.toISOString(),
    zonaHoraria: zonaHoraria(),
    desde: fechaLocal(inicio),
    hasta: fechaLocal(ahora),
    muestrasPorTipo: MUESTRAS_POR_TIPO,
    dias,
    fuentes,
    errores,
  };
}