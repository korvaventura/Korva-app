// Residual de movimiento diario (Apple Health / Health Connect) — Etapa 3, MODO SOMBRA.
//
// Funciones PURAS: no leen ni escriben la base de datos, no usan la hora del
// sistema salvo que se la pasen (parámetro "ahoraMs"). Solo calculan.
//
// Fórmula aprobada (por categoría):
//   residual_pie   = max(0, health_pie  - activities_pie)
//   residual_bici  = max(0, health_bici - activities_bici)
//   residual_total = max(0, residual_pie + residual_bici - activities_sin_clasificar)
//
// - Las actividades "no compatibles" (natación, ski, remo...) NO restan.
// - Las actividades excluidas (excluida = true) NO restan; se informan aparte.
// - No se aplica ningún umbral: se devuelve el residual crudo y los datos
//   necesarios para simular umbrales después.
// - Nada de esto afecta el progreso: no se usa en ningún recálculo de km.

const REGLA_VERSION = 'residual_v1_2026-10-01';

const MS_MINUTO = 60 * 1000;
const MS_HORA = 60 * MS_MINUTO;

// Hipótesis de cierre a validar en modo sombra (NO es una constante productiva).
const HIPOTESIS_CIERRE_HORAS = 48;

// Una actividad sin duración que empieza a menos de estas horas del fin del
// día podría haber cruzado la medianoche sin que lo sepamos.
const HORAS_BORDE_SIN_DURACION = 3;

// ---------------------------------------------------------------------------
// Mapeo de sport_type → categoría (único lugar; versionado con REGLA_VERSION)
// ---------------------------------------------------------------------------

const CATEGORIAS = {
  PIE: 'pie',
  BICI: 'bici',
  NO_COMPATIBLE: 'no_compatible',
  SIN_CLASIFICAR: 'sin_clasificar',
};

// Valores exactos (ya normalizados: minúsculas, sin tildes, sin espacios extra).
// Strava guarda "run"/"ride" normalizados y el resto del tipo de Strava en minúsculas.
const EXACTOS = {
  // A pie: Salud los mide en DistanceWalkingRunning.
  run: CATEGORIAS.PIE,
  walk: CATEGORIAS.PIE,
  hike: CATEGORIAS.PIE,
  trailrun: CATEGORIAS.PIE,
  virtualrun: CATEGORIAS.PIE,
  treadmill: CATEGORIAS.PIE,
  // Bici: solo aparece en DistanceCycling si un dispositivo/app la escribió en Salud.
  ride: CATEGORIAS.BICI,
  virtualride: CATEGORIAS.BICI,
  mountainbikeride: CATEGORIAS.BICI,
  gravelride: CATEGORIAS.BICI,
  ebikeride: CATEGORIAS.BICI,
  // No compatibles: Salud no las mide como caminar/correr ni como bici.
  swim: CATEGORIAS.NO_COMPATIBLE,
  alpineski: CATEGORIAS.NO_COMPATIBLE,
  backcountryski: CATEGORIAS.NO_COMPATIBLE,
  nordicski: CATEGORIAS.NO_COMPATIBLE,
  rollerski: CATEGORIAS.NO_COMPATIBLE,
  snowboard: CATEGORIAS.NO_COMPATIBLE,
  rowing: CATEGORIAS.NO_COMPATIBLE,
  virtualrow: CATEGORIAS.NO_COMPATIBLE,
  kayaking: CATEGORIAS.NO_COMPATIBLE,
  canoeing: CATEGORIAS.NO_COMPATIBLE,
  standuppaddling: CATEGORIAS.NO_COMPATIBLE,
  surfing: CATEGORIAS.NO_COMPATIBLE,
  kitesurf: CATEGORIAS.NO_COMPATIBLE,
  windsurf: CATEGORIAS.NO_COMPATIBLE,
  sail: CATEGORIAS.NO_COMPATIBLE,
  iceskate: CATEGORIAS.NO_COMPATIBLE,
  inlineskate: CATEGORIAS.NO_COMPATIBLE,
  skateboard: CATEGORIAS.NO_COMPATIBLE,
  wheelchair: CATEGORIAS.NO_COMPATIBLE,
  // Cualquier otro valor exacto (workout, soccer, golf, velomobile, manual...) → sin clasificar.
};

// Palabras clave para texto libre (carga manual). Se buscan como palabras
// enteras sobre el texto normalizado. Si coinciden palabras de más de una
// categoría, queda "sin clasificar".
const PALABRAS = {
  [CATEGORIAS.NO_COMPATIBLE]: [
    'natacion', 'nadar', 'nado', 'nade', 'swim', 'swimming', 'pileta', 'piscina',
    'remo', 'remar', 'kayak', 'canoa', 'ski', 'esqui', 'snowboard', 'surf',
    'patin', 'patines', 'patinaje', 'patinar', 'skate',
  ],
  [CATEGORIAS.BICI]: [
    'ride', 'bici', 'bicicleta', 'ciclismo', 'mtb', 'bike', 'cycling',
    'spinning', 'rodillo', 'pedal', 'pedaleo', 'gravel',
  ],
  [CATEGORIAS.PIE]: [
    'run', 'running', 'correr', 'corri', 'corrida', 'carrera', 'trote', 'trotar',
    'caminata', 'caminar', 'camine', 'caminando', 'walk', 'walking', 'hike', 'hiking',
    'trail', 'trekking', 'treking', 'senderismo', 'cinta', 'maraton', 'marcha',
  ],
};

const normalizarTexto = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Devuelve { categoria, metodo, normalizado }.
 *   metodo: 'exacto' | 'palabra_clave' | 'ambiguo' | 'desconocido'
 */
const categorizarActividad = (sportType) => {
  const normalizado = normalizarTexto(sportType);
  const compacto = normalizado.replace(/ /g, '');

  if (Object.prototype.hasOwnProperty.call(EXACTOS, compacto)) {
    return { categoria: EXACTOS[compacto], metodo: 'exacto', normalizado };
  }

  const palabras = new Set(normalizado.split(' ').filter(Boolean));
  const coincidencias = Object.entries(PALABRAS)
    .filter(([, lista]) => lista.some((p) => palabras.has(p)))
    .map(([categoria]) => categoria);

  if (coincidencias.length === 1) {
    return { categoria: coincidencias[0], metodo: 'palabra_clave', normalizado };
  }
  return {
    categoria: CATEGORIAS.SIN_CLASIFICAR,
    metodo: coincidencias.length > 1 ? 'ambiguo' : 'desconocido',
    normalizado,
  };
};

// ---------------------------------------------------------------------------
// Fechas y zonas horarias
// ---------------------------------------------------------------------------

const formateadores = new Map();
const formateadorFecha = (timezone) => {
  if (!formateadores.has(timezone)) {
    formateadores.set(
      timezone,
      new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    );
  }
  return formateadores.get(timezone);
};

const formateadoresHora = new Map();
const formateadorFechaHora = (timezone) => {
  if (!formateadoresHora.has(timezone)) {
    formateadoresHora.set(
      timezone,
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      })
    );
  }
  return formateadoresHora.get(timezone);
};

const esTimezoneValida = (timezone) => {
  if (typeof timezone !== 'string' || !timezone.trim()) return false;
  try {
    formateadorFecha(timezone);
    return true;
  } catch {
    return false;
  }
};

/** Fecha local 'AAAA-MM-DD' de un instante (ms) en una zona IANA. */
const fechaLocalDe = (ms, timezone) => formateadorFecha(timezone).format(new Date(ms));

/** Fecha y hora local legible ('AAAA-MM-DD HH:MM:SS') de un instante en una zona IANA. */
const fechaHoraLocalDe = (ms, timezone) => formateadorFechaHora(timezone).format(new Date(ms));

/** Suma días a una fecha 'AAAA-MM-DD' (aritmética de calendario, sin zonas). */
const sumarDias = (fecha, dias) => {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
};

/**
 * Primer instante (ms UTC) cuya fecha local en "timezone" es >= "fecha".
 * Búsqueda binaria con precisión de 1 minuto; funciona con cambios de horario
 * (días de 23 o 25 horas) e incluso si la medianoche local no existe.
 */
const inicioDiaLocalUTC = (fecha, timezone) => {
  const [a, m, d] = fecha.split('-').map(Number);
  const base = Date.UTC(a, m - 1, d);
  // Ninguna zona real está a más de ±14 h de UTC.
  let bajo = Math.floor((base - 16 * MS_HORA) / MS_MINUTO);
  let alto = Math.ceil((base + 16 * MS_HORA) / MS_MINUTO);
  while (bajo < alto) {
    const medio = Math.floor((bajo + alto) / 2);
    if (fechaLocalDe(medio * MS_MINUTO, timezone) >= fecha) alto = medio;
    else bajo = medio + 1;
  }
  return bajo * MS_MINUTO;
};

/** Ventana [inicio, fin) en ms UTC del día local "fecha" en "timezone". */
const ventanaDiaUTC = (fecha, timezone) => {
  const inicioMs = inicioDiaLocalUTC(fecha, timezone);
  const finMs = inicioDiaLocalUTC(sumarDias(fecha, 1), timezone);
  return { inicioMs, finMs, horas: (finMs - inicioMs) / MS_HORA };
};

/**
 * activities.recorded_at es "timestamp without time zone" con hora UTC.
 * Se interpreta SIEMPRE como UTC, tenga o no marca de zona en el texto.
 * Devuelve ms o null si no se puede interpretar.
 */
const recordedAtAMs = (valor) => {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.getTime();
  if (typeof valor !== 'string' || !valor.trim()) return null;
  let texto = valor.trim().replace(' ', 'T');
  const tieneZona = /([zZ]|[+-]\d{2}:?\d{2})$/.test(texto);
  if (!tieneZona) texto += 'Z';
  const ms = Date.parse(texto);
  return Number.isNaN(ms) ? null : ms;
};

/** 'AAAA-MM-DDTHH:MM:SS' en UTC, sin zona (para comparar con timestamp without time zone). */
const msATimestampUTCSinZona = (ms) => new Date(ms).toISOString().slice(0, 19);

const redondear = (n, decimales = 3) => {
  const f = 10 ** decimales;
  return Math.round((Number(n) || 0) * f) / f;
};

// ---------------------------------------------------------------------------
// Asignación de una actividad a un día
// ---------------------------------------------------------------------------

/**
 * Devuelve null si la actividad no toca la ventana del día; si no, el detalle
 * de cuántos km se asignan a ese día y con qué método.
 */
const asignarActividadAlDia = (actividad, ventana, timezone) => {
  const { inicioMs, finMs } = ventana;
  const inicioActividadMs = recordedAtAMs(actividad.recorded_at);
  if (inicioActividadMs === null) return null;

  const kmOriginales = Number(actividad.distance_km) || 0;
  const esManual = actividad.source === 'manual';
  const duracion = Number(actividad.duration_seconds) || 0;
  const marcas = [];

  let kmAsignados;
  let metodo;
  let cruzaMedianoche = false;

  if (esManual) {
    // La hora de una carga manual es el momento de carga, no la de la actividad.
    // Se usa el día local de esa hora como aproximación, sin repartir.
    if (inicioActividadMs < inicioMs || inicioActividadMs >= finMs) return null;
    kmAsignados = kmOriginales;
    metodo = 'manual_dia_de_carga_aproximado';
  } else if (duracion > 0) {
    const finActividadMs = inicioActividadMs + duracion * 1000;
    const solape = Math.min(finActividadMs, finMs) - Math.max(inicioActividadMs, inicioMs);
    if (solape <= 0) return null;
    cruzaMedianoche = inicioActividadMs < inicioMs || finActividadMs > finMs;
    if (cruzaMedianoche) {
      kmAsignados = kmOriginales * (solape / (finActividadMs - inicioActividadMs));
      metodo = 'proporcional_por_duracion_aproximado';
      marcas.push('cruza_medianoche');
    } else {
      kmAsignados = kmOriginales;
      metodo = 'completa';
    }
  } else {
    if (inicioActividadMs < inicioMs || inicioActividadMs >= finMs) return null;
    kmAsignados = kmOriginales;
    metodo = 'completa_sin_duracion';
    if (finMs - inicioActividadMs < HORAS_BORDE_SIN_DURACION * MS_HORA) {
      marcas.push('posible_cruce_medianoche_sin_duracion');
    }
  }

  const { categoria, metodo: metodoCategoria } = categorizarActividad(actividad.sport_type);
  if (esManual) marcas.push('manual_fecha_aproximada');
  if (metodoCategoria === 'palabra_clave') marcas.push('categoria_por_texto_libre');
  if (metodoCategoria === 'ambiguo') marcas.push('categoria_ambigua');

  return {
    id: actividad.id,
    source: actividad.source ?? null,
    sport_type: actividad.sport_type ?? null,
    categoria,
    metodo_categoria: metodoCategoria,
    excluida: actividad.excluida === true,
    km_originales: redondear(kmOriginales),
    km_asignados: redondear(kmAsignados),
    km_asignados_sin_redondear: kmAsignados,
    es_manual: esManual,
    fecha_manual_aproximada: esManual,
    cruza_medianoche: cruzaMedianoche,
    metodo_asignacion: metodo,
    duration_seconds: duracion > 0 ? duracion : null,
    recorded_at_utc: new Date(inicioActividadMs).toISOString(),
    inicio_local: fechaHoraLocalDe(inicioActividadMs, timezone),
    marcas,
  };
};

// ---------------------------------------------------------------------------
// Cálculo del día
// ---------------------------------------------------------------------------

/**
 * Calcula el residual de un día.
 *
 * @param {object} dia     fila de daily_movement: { fecha, timezone, distancia_caminando_km,
 *                         distancia_bici_km, updated_at, cerrado, ... }
 * @param {object[]} actividades  filas de activities del usuario (pueden incluir otros días;
 *                         se filtran acá). Campos: id, source, sport_type, distance_km,
 *                         duration_seconds, recorded_at, excluida.
 * @param {number} ahoraMs instante de referencia para la hipótesis de cierre.
 */
const calcularResidualDia = (dia, actividades, ahoraMs) => {
  const { fecha, timezone } = dia;
  if (!esTimezoneValida(timezone)) {
    throw new Error(`timezone inválida en ${fecha}: ${timezone}`);
  }
  const ventana = ventanaDiaUTC(fecha, timezone);

  const healthPie = Number(dia.distancia_caminando_km) || 0;
  const healthBici = Number(dia.distancia_bici_km) || 0;

  const detalle = (actividades || [])
    .map((a) => asignarActividadAlDia(a, ventana, timezone))
    .filter(Boolean)
    .sort((x, y) => x.recorded_at_utc.localeCompare(y.recorded_at_utc));

  const suma = (filtro) =>
    detalle.filter(filtro).reduce((acc, a) => acc + a.km_asignados_sin_redondear, 0);

  const validas = (cat) => (a) => !a.excluida && a.categoria === cat;
  const actPie = suma(validas(CATEGORIAS.PIE));
  const actBici = suma(validas(CATEGORIAS.BICI));
  const actSinClasificar = suma(validas(CATEGORIAS.SIN_CLASIFICAR));
  const actNoCompatibles = suma(validas(CATEGORIAS.NO_COMPATIBLE));
  const actExcluidas = suma((a) => a.excluida);

  const residualPie = Math.max(0, healthPie - actPie);
  const residualBici = Math.max(0, healthBici - actBici);
  const residualTotal = Math.max(0, residualPie + residualBici - actSinClasificar);

  // Hipótesis de cierre: 48 h desde el fin del día local + al menos un sync
  // posterior al fin del día (la foto guardada se tomó con el día completo).
  const updatedAtMs = dia.updated_at ? Date.parse(dia.updated_at) : null;
  const syncPosteriorAlFin = updatedAtMs !== null && updatedAtMs >= ventana.finMs;
  const cumple48h = ahoraMs >= ventana.finMs + HIPOTESIS_CIERRE_HORAS * MS_HORA;
  const diaEnCurso = ahoraMs < ventana.finMs;

  const marcas = new Set();
  detalle.forEach((a) => a.marcas.forEach((m) => marcas.add(m)));
  if (diaEnCurso) marcas.add('dia_en_curso');
  if (!syncPosteriorAlFin) marcas.add('foto_health_anterior_al_fin_del_dia');
  if (ventana.horas !== 24) marcas.add('cambio_de_horario');
  if (actSinClasificar > 0) marcas.add('hay_actividades_sin_clasificar');
  if (actExcluidas > 0) marcas.add('hay_actividades_excluidas');
  if (actPie > healthPie) marcas.add('actividades_pie_superan_health_pie');
  if (actBici > 0 && healthBici === 0) marcas.add('bici_sin_health_cycling');
  if (actBici > healthBici && healthBici > 0) marcas.add('actividades_bici_superan_health_bici');

  const sinRedondeo = ({ km_asignados_sin_redondear, ...resto }) => resto;

  return {
    fecha,
    timezone,
    ventana_utc: {
      inicio: new Date(ventana.inicioMs).toISOString(),
      fin: new Date(ventana.finMs).toISOString(),
      horas: ventana.horas,
    },
    health: {
      pie_km: redondear(healthPie),
      bici_km: redondear(healthBici),
      total_km: redondear(healthPie + healthBici),
      pasos: dia.pasos ?? null,
      tipo_medicion: dia.tipo_medicion ?? null,
      plataforma: dia.plataforma ?? null,
      origen: dia.raw_payload?.origen ?? null,
    },
    actividades: {
      pie_km: redondear(actPie),
      bici_km: redondear(actBici),
      sin_clasificar_km: redondear(actSinClasificar),
      no_compatibles_km: redondear(actNoCompatibles),
      excluidas_km: redondear(actExcluidas),
      cantidad: detalle.length,
    },
    residual: {
      pie_km: redondear(residualPie),
      bici_km: redondear(residualBici),
      total_crudo_km: redondear(residualTotal),
    },
    // Datos para simular umbrales después (no se aplica ninguno).
    para_umbrales: {
      diferencia_pie_km: redondear(healthPie - actPie),
      diferencia_bici_km: redondear(healthBici - actBici),
      km_compatibles_restados: redondear(actPie + actBici + actSinClasificar),
      residual_sobre_actividades_pie: actPie > 0 ? redondear(residualPie / actPie, 4) : null,
      dia_con_actividades_compatibles: actPie + actBici + actSinClasificar > 0,
    },
    daily_movement_updated_at: dia.updated_at ?? null,
    cerrado_actual: dia.cerrado === true,
    hipotesis_cierre: {
      regla: `${HIPOTESIS_CIERRE_HORAS}h_desde_fin_del_dia_mas_sync_posterior`,
      fin_dia_utc: new Date(ventana.finMs).toISOString(),
      cumple_48h: cumple48h,
      sync_posterior_al_fin_del_dia: syncPosteriorAlFin,
      se_cerraria: cumple48h && syncPosteriorAlFin,
      se_cerraria_desde: syncPosteriorAlFin
        ? new Date(ventana.finMs + HIPOTESIS_CIERRE_HORAS * MS_HORA).toISOString()
        : null,
    },
    marcas: [...marcas].sort(),
    detalle_actividades: detalle.map(sinRedondeo),
  };
};

/**
 * Rango UTC de recorded_at a buscar para cubrir todos los días pedidos,
 * con margen hacia atrás para actividades largas que empiezan el día anterior.
 */
const rangoBusquedaActividades = (dias, margenHorasAtras = 48) => {
  let desde = Infinity;
  let hasta = -Infinity;
  dias.forEach(({ fecha, timezone }) => {
    const v = ventanaDiaUTC(fecha, timezone);
    desde = Math.min(desde, v.inicioMs);
    hasta = Math.max(hasta, v.finMs);
  });
  if (!Number.isFinite(desde)) return null;
  return {
    desdeMs: desde - margenHorasAtras * MS_HORA,
    hastaMs: hasta,
  };
};

module.exports = {
  REGLA_VERSION,
  CATEGORIAS,
  HIPOTESIS_CIERRE_HORAS,
  normalizarTexto,
  categorizarActividad,
  esTimezoneValida,
  fechaLocalDe,
  sumarDias,
  ventanaDiaUTC,
  recordedAtAMs,
  msATimestampUTCSinZona,
  asignarActividadAlDia,
  calcularResidualDia,
  rangoBusquedaActividades,
};