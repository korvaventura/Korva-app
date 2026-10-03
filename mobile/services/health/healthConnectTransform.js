// Transformación pura de Health Connect al contrato común de movimiento diario.
// No importa módulos nativos: se prueba en Node.
export const RECORDING_METHOD_MANUAL_ENTRY = 3;

export const fechaLocal = (fecha) => {
  const d = new Date(fecha);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

export const zonaHoraria = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'desconocida'; }
  catch { return 'desconocida'; }
};

export const rangoUltimosDias = (dias) => {
  const fin = new Date();
  const inicio = new Date(fin);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - (dias - 1));
  return { inicio, fin };
};

export const esManual = (r) => r?.metadata?.recordingMethod === RECORDING_METHOD_MANUAL_ENTRY;

const ms = (v) => new Date(v).getTime();
const solapeMs = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function fusionarIntervalos(intervalos) {
  const ordenados = intervalos
    .map(([a, b]) => [ms(a), ms(b)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  const salida = [];
  for (const actual of ordenados) {
    const ultimo = salida[salida.length - 1];
    if (!ultimo || actual[0] > ultimo[1]) salida.push([...actual]);
    else ultimo[1] = Math.max(ultimo[1], actual[1]);
  }
  return salida;
}

export function proporcionEnIntervalos(inicio, fin, intervalosFusionados) {
  const a = ms(inicio), b = ms(fin);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  const cubierto = intervalosFusionados.reduce((s, [x, y]) => s + solapeMs(a, b, x, y), 0);
  return Math.min(1, Math.max(0, cubierto / (b - a)));
}

const kmDeDistancia = (r) => {
  const d = r?.distance || {};
  if (Number.isFinite(d.inKilometers)) return d.inKilometers;
  if (Number.isFinite(d.inMeters)) return d.inMeters / 1000;
  if (Number.isFinite(d.value)) {
    if (d.unit === 'kilometers') return d.value;
    if (d.unit === 'meters') return d.value / 1000;
    if (d.unit === 'miles') return d.value * 1.609344;
  }
  return 0;
};

const fuenteSimple = (r) => {
  const origen = r?.metadata?.dataOrigin || '(sin dataOrigin)';
  const d = r?.metadata?.device || {};
  const partes = [d.manufacturer, d.model].filter(Boolean);
  return { name: origen, bundleIdentifier: origen, dispositivo: partes.join(' · ') || null };
};

const crearDias = (dias, inicio) => {
  const lista = [], mapa = {};
  for (let i = 0; i < dias; i++) {
    const d = new Date(inicio); d.setDate(inicio.getDate() + i);
    const fecha = fechaLocal(d);
    const r = {
      fecha,
      consolidado: { caminando: null, bici: null, pasos: null },
      fuentesConsolidado: { caminando: [], bici: [], pasos: [] },
      porFuente: { caminando: [], bici: [], pasos: [] },
    };
    lista.push(r); mapa[fecha] = r;
  }
  return { lista, mapa };
};

const limitesDia = (fecha) => {
  const [y, m, d] = fecha.split('-').map(Number);
  const inicio = new Date(y, m - 1, d, 0, 0, 0, 0);
  const fin = new Date(inicio); fin.setDate(fin.getDate() + 1);
  return [inicio.getTime(), fin.getTime()];
};

const agregarFuente = (dia, clave, fuente, valor) => {
  let item = dia.porFuente[clave].find((f) => f.bundleIdentifier === fuente.bundleIdentifier);
  if (!item) {
    item = { name: fuente.name, bundleIdentifier: fuente.bundleIdentifier, valor: 0 };
    dia.porFuente[clave].push(item);
    dia.fuentesConsolidado[clave].push({ name: fuente.name, bundleIdentifier: fuente.bundleIdentifier });
  }
  item.valor += valor;
};

const indiceFuentes = (registros) => {
  const mapa = {};
  for (const r of registros) {
    const f = fuenteSimple(r);
    if (!mapa[f.bundleIdentifier]) mapa[f.bundleIdentifier] = { name: f.name, bundleIdentifier: f.bundleIdentifier, dispositivos: [] };
    if (f.dispositivo && !mapa[f.bundleIdentifier].dispositivos.includes(f.dispositivo)) mapa[f.bundleIdentifier].dispositivos.push(f.dispositivo);
  }
  return Object.values(mapa);
};

export function transformarHealthConnect({ pasos = [], distancias = [], sesiones = [], dias = 7, inicio, fin, exerciseTypeBiking }) {
  const pasosValidos = pasos.filter((r) => !esManual(r));
  const distValidas = distancias.filter((r) => !esManual(r));
  const sesionesValidas = sesiones.filter((r) => !esManual(r));
  const biciSesiones = sesionesValidas.filter((s) => s.exerciseType === exerciseTypeBiking);
  const intervalosBici = fusionarIntervalos(biciSesiones.map((s) => [s.startTime, s.endTime]));
  const { lista, mapa } = crearDias(dias, inicio);

  for (const r of pasosValidos) {
    const a = ms(r.startTime), b = ms(r.endTime); const dur = b - a;
    if (!(dur > 0) || !Number.isFinite(r.count)) continue;
    const fuente = fuenteSimple(r);
    for (const dia of lista) {
      const [x, y] = limitesDia(dia.fecha); const p = solapeMs(a, b, x, y) / dur;
      if (p <= 0) continue;
      if (dia.consolidado.pasos === null) dia.consolidado.pasos = 0;
      const valor = r.count * p; dia.consolidado.pasos += valor; agregarFuente(dia, 'pasos', fuente, valor);
    }
  }

  for (const r of distValidas) {
    const a = ms(r.startTime), b = ms(r.endTime); const dur = b - a; const km = kmDeDistancia(r);
    if (!(dur > 0) || !(km >= 0)) continue;
    const fuente = fuenteSimple(r);
    for (const dia of lista) {
      const [x, y] = limitesDia(dia.fecha); const diaSolape = solapeMs(a, b, x, y);
      if (diaSolape <= 0) continue;
      const biciSolape = intervalosBici.reduce((s, [u, v]) => s + solapeMs(Math.max(a, x), Math.min(b, y), u, v), 0);
      const kmDia = km * (diaSolape / dur);
      const kmBici = km * (biciSolape / dur);
      const kmCaminar = Math.max(0, kmDia - kmBici);
      if (dia.consolidado.caminando === null) dia.consolidado.caminando = 0;
      if (dia.consolidado.bici === null) dia.consolidado.bici = 0;
      dia.consolidado.caminando += kmCaminar; dia.consolidado.bici += kmBici;
      if (kmCaminar > 0) agregarFuente(dia, 'caminando', fuente, kmCaminar);
      if (kmBici > 0) agregarFuente(dia, 'bici', fuente, kmBici);
    }
  }

  return {
    generado: fin.toISOString(), zonaHoraria: zonaHoraria(), desde: fechaLocal(inicio), hasta: fechaLocal(fin), dias: lista,
    fuentes: {
      caminando: indiceFuentes(distValidas), bici: indiceFuentes(distValidas), pasos: indiceFuentes(pasosValidos),
    },
    errores: [], lecturaCompleta: true,
    diagnosticoHealthConnect: {
      estrategia: 'readRecords_sin_manual_clasificacion_bici_por_sesion',
      advertenciaDuplicados: 'readRecords no deduplica entre data origins; validar en dispositivo real antes de habilitar progreso.',
      registros: {
        pasosLeidos: pasos.length, pasosUsados: pasosValidos.length,
        distanciasLeidas: distancias.length, distanciasUsadas: distValidas.length,
        sesionesLeidas: sesiones.length, sesionesUsadas: sesionesValidas.length,
        sesionesBici: biciSesiones.length,
      },
    },
  };
}
