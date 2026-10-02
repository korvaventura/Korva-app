// Progreso unificado de desafíos — Etapa 4A, NÚCLEO PURO.
//
// Funciones puras: no leen ni escriben la base de datos y no usan el reloj
// del sistema (el instante de referencia llega como parámetro "ahoraMs").
//
// 4A usa SOLO user_challenges, challenges y activities. No lee Health,
// daily_movement ni residual. km_base todavía no existe: acá solo se
// informa un "km_base_candidato" como diagnóstico, sin alterar el resultado.
//
// Reglas canónicas 4A (ver etapa4-progreso-unificado-diseno.md, sección 7):
//  1. Solo los desafíos 'active' se recalcularían; terminales congelados; 'pending' sin cálculo.
//  2. Cuentan las actividades del usuario con excluida === false, recorded_at >= started_at,
//     fuera de todo período de periodos_pausados (bordes inclusivos) y anteriores a
//     pausado_at si el desafío está pausado. Cualquier deporte, challenge_id y modalidad.
//  3. km_reconstruido = Σ distance_km de las actividades que cuentan.
//  4. Objetivo = modalidad elegida → primera modalidad → total_distance_km.
//  5. Todos los instantes se interpretan como UTC aunque no traigan zona.

const REGLA_VERSION = 'progreso_4a_v1_2026-10-02';

const ESTADOS_TERMINALES = ['completed', 'cargado', 'shipped'];

// Tolerancias para clasificar diferencias (solo diagnóstico).
const TOLERANCIA_IGUAL_KM = 0.01;
const DIFERENCIA_PEQUENA_KM = 1;

const MOTIVOS = {
  CUENTA: 'cuenta',
  ANTERIOR_AL_INICIO: 'anterior_al_inicio',
  EN_PAUSA: 'en_pausa',
  EN_PAUSA_ABIERTA: 'en_pausa_abierta',
  EXCLUIDA: 'excluida',
  FECHA_INVALIDA: 'fecha_invalida',
};

const CATEGORIAS = {
  COINCIDE: 'coincide',
  DIFERENCIA_PEQUENA: 'diferencia_pequena_o_redondeo',
  MIGRADO_SIN_ACTIVIDADES: 'migrado_sin_actividades',
  ANTERIORES_AL_INICIO: 'actividades_anteriores_al_inicio',
  EFECTO_PAUSAS: 'efecto_pausas',
  ACTIVIDAD_EXCLUIDA: 'actividad_excluida',
  COMBINACION: 'combinacion_de_causas',
  SIN_EXPLICACION: 'sin_explicacion',
  RECONSTRUIDO_MAYOR: 'reconstruido_mayor_que_guardado',
  NO_APLICA: 'no_aplica',
};

/**
 * Convierte un instante a ms UTC. Los textos SIN zona ("2026-09-28T07:00:00",
 * como devuelve Postgres para timestamp without time zone) se interpretan
 * SIEMPRE como UTC, sin depender de la zona horaria del proceso.
 * Devuelve null si no se puede interpretar.
 */
const instanteUTC = (valor) => {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.getTime();
  if (typeof valor !== 'string' || !valor.trim()) return null;
  let texto = valor.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) texto += 'T00:00:00';
  if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(texto)) texto += 'Z';
  const ms = Date.parse(texto);
  return Number.isNaN(ms) ? null : ms;
};

const aISO = (ms) => (ms === null || ms === undefined ? null : new Date(ms).toISOString());

const redondear = (n, decimales = 3) => {
  const f = 10 ** decimales;
  return Math.round((Number(n) || 0) * f) / f;
};

const numero = (valor) => {
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
};

/** Distancia objetivo y cómo se obtuvo. */
const resolverObjetivo = (uc, challenge) => {
  const modalidades = Array.isArray(challenge?.modalidades) ? challenge.modalidades : [];
  const elegida = modalidades.find((m) => m && m.tipo === uc.modalidad);
  const distanciaDe = (m) => numero(m?.distancia_km);

  if (elegida && distanciaDe(elegida) > 0) {
    return { objetivo_km: distanciaDe(elegida), origen: 'modalidad_elegida' };
  }
  if (modalidades.length > 0 && distanciaDe(modalidades[0]) > 0) {
    return { objetivo_km: distanciaDe(modalidades[0]), origen: 'primera_modalidad' };
  }
  if (numero(challenge?.total_distance_km) > 0) {
    return { objetivo_km: numero(challenge.total_distance_km), origen: 'total_distance_km' };
  }
  return { objetivo_km: null, origen: 'sin_objetivo' };
};

/** Normaliza los períodos de pausa a { desdeMs, hastaMs } (descarta los inválidos). */
const normalizarPausas = (uc) => {
  const lista = Array.isArray(uc.periodos_pausados) ? uc.periodos_pausados : [];
  const validos = [];
  const invalidos = [];
  lista.forEach((p) => {
    const desdeMs = instanteUTC(p?.desde);
    const hastaMs = instanteUTC(p?.hasta);
    if (desdeMs === null || hastaMs === null || hastaMs < desdeMs) invalidos.push(p);
    else validos.push({ desdeMs, hastaMs });
  });
  const pausaAbiertaDesdeMs = uc.pausado === true ? instanteUTC(uc.pausado_at) : null;
  return { validos, invalidos, pausaAbiertaDesdeMs };
};

/** Motivo por el que una actividad cuenta o no para un desafío (orden fijo de reglas). */
const motivoActividad = (actividad, inicioMs, pausas) => {
  const ms = instanteUTC(actividad.recorded_at);
  if (ms === null) return { motivo: MOTIVOS.FECHA_INVALIDA, ms };
  if (inicioMs === null || ms < inicioMs) return { motivo: MOTIVOS.ANTERIOR_AL_INICIO, ms };
  if (pausas.validos.some((p) => ms >= p.desdeMs && ms <= p.hastaMs)) return { motivo: MOTIVOS.EN_PAUSA, ms };
  if (pausas.pausaAbiertaDesdeMs !== null && ms >= pausas.pausaAbiertaDesdeMs) return { motivo: MOTIVOS.EN_PAUSA_ABIERTA, ms };
  if (actividad.excluida !== false) return { motivo: MOTIVOS.EXCLUIDA, ms };
  return { motivo: MOTIVOS.CUENTA, ms };
};

/** Clasifica la diferencia guardado − reconstruido (solo diagnóstico, solo activos). */
const clasificarDiferencia = ({ diferencia, kmPorMotivo, actividadesTotalesUsuario }) => {
  if (Math.abs(diferencia) <= TOLERANCIA_IGUAL_KM) return CATEGORIAS.COINCIDE;
  if (diferencia < 0) return CATEGORIAS.RECONSTRUIDO_MAYOR;
  if (actividadesTotalesUsuario === 0) return CATEGORIAS.MIGRADO_SIN_ACTIVIDADES;

  const cubre = (km) => km >= diferencia - TOLERANCIA_IGUAL_KM;
  const kmPausas = kmPorMotivo[MOTIVOS.EN_PAUSA] + kmPorMotivo[MOTIVOS.EN_PAUSA_ABIERTA];
  const candidatos = [
    [CATEGORIAS.ANTERIORES_AL_INICIO, kmPorMotivo[MOTIVOS.ANTERIOR_AL_INICIO]],
    [CATEGORIAS.EFECTO_PAUSAS, kmPausas],
    [CATEGORIAS.ACTIVIDAD_EXCLUIDA, kmPorMotivo[MOTIVOS.EXCLUIDA]],
  ];
  const unica = candidatos.find(([, km]) => cubre(km));
  if (unica) return unica[0];
  if (cubre(candidatos.reduce((acc, [, km]) => acc + km, 0))) return CATEGORIAS.COMBINACION;
  if (diferencia < DIFERENCIA_PEQUENA_KM) return CATEGORIAS.DIFERENCIA_PEQUENA;
  return CATEGORIAS.SIN_EXPLICACION;
};

/**
 * Calcula el progreso 4A de un desafío.
 *
 * @param {object} entrada
 * @param {object} entrada.uc          fila de user_challenges
 * @param {object} entrada.challenge   fila de challenges (modalidades, total_distance_km, title)
 * @param {object[]} entrada.actividades  TODAS las actividades del usuario (id, distance_km,
 *                                     recorded_at, excluida). Se filtran acá.
 * @param {boolean} [entrada.incluirDetalle=false]  devolver el motivo de cada actividad
 */
const calcularProgresoChallenge = ({ uc, challenge, actividades, incluirDetalle = false }) => {
  const lista = Array.isArray(actividades) ? actividades : [];
  const inicioMs = instanteUTC(uc.started_at);
  const pausas = normalizarPausas(uc);
  const pausadoSinFecha = uc.pausado === true && pausas.pausaAbiertaDesdeMs === null;
  const { objetivo_km, origen } = resolverObjetivo(uc, challenge);

  const kmPorMotivo = Object.fromEntries(Object.values(MOTIVOS).map((m) => [m, 0]));
  const cantidadPorMotivo = Object.fromEntries(Object.values(MOTIVOS).map((m) => [m, 0]));
  const detalle = [];

  lista.forEach((a) => {
    const { motivo, ms } = motivoActividad(a, inicioMs, pausas);
    const km = numero(a.distance_km);
    kmPorMotivo[motivo] += km;
    cantidadPorMotivo[motivo] += 1;
    if (incluirDetalle) {
      detalle.push({ id: a.id, km: redondear(km), recorded_at_utc: aISO(ms), excluida: a.excluida, motivo });
    }
  });

  const kmReconstruido = kmPorMotivo[MOTIVOS.CUENTA];
  const kmGuardado = numero(uc.km_completed);
  const diferencia = kmGuardado - kmReconstruido;
  const status = uc.status;
  const esActivo = status === 'active';
  const esTerminal = ESTADOS_TERMINALES.includes(status);

  const flags = [];
  if (status === 'pending') flags.push('pending_sin_calculo');
  if (esTerminal) flags.push('terminal_congelado');
  if (!esActivo && !esTerminal && status !== 'pending') flags.push('estado_desconocido');
  if (uc.pausado === true) flags.push('pausado_ahora');
  if (pausadoSinFecha) flags.push('pausado_sin_pausado_at'); // no se puede excluir la pausa abierta: se cuenta normal y se marca
  if (pausas.validos.length > 0) flags.push('tiene_pausas_historicas');
  if (pausas.invalidos.length > 0) flags.push('pausas_con_formato_invalido');
  if (inicioMs === null) flags.push('started_at_invalido');
  if (objetivo_km === null) flags.push('sin_objetivo');
  if (origen === 'primera_modalidad' || origen === 'total_distance_km') flags.push(`objetivo_por_${origen}`);
  if (cantidadPorMotivo[MOTIVOS.FECHA_INVALIDA] > 0) flags.push('actividades_con_fecha_invalida');
  if (cantidadPorMotivo[MOTIVOS.CUENTA] === 0) flags.push('sin_actividades_que_cuenten');
  if (lista.length === 0) flags.push('usuario_sin_actividades');
  if (cantidadPorMotivo[MOTIVOS.EXCLUIDA] > 0) flags.push('hay_actividades_excluidas');
  if (cantidadPorMotivo[MOTIVOS.ANTERIOR_AL_INICIO] > 0) flags.push('hay_actividades_anteriores_al_inicio');
  if (cantidadPorMotivo[MOTIVOS.EN_PAUSA] + cantidadPorMotivo[MOTIVOS.EN_PAUSA_ABIERTA] > 0) flags.push('hay_actividades_en_pausa');

  if (esActivo) {
    if (diferencia > TOLERANCIA_IGUAL_KM) flags.push('el_calculo_nuevo_bajaria_km');
    if (diferencia < -TOLERANCIA_IGUAL_KM) flags.push('el_calculo_nuevo_subiria_km');
    if (objetivo_km !== null && kmReconstruido >= objetivo_km) flags.push('reconstruido_alcanza_objetivo');
    if (objetivo_km !== null && kmGuardado >= objetivo_km && kmReconstruido < objetivo_km) flags.push('guardado_alcanza_objetivo_pero_reconstruido_no');
  }

  const categoria = esActivo
    ? clasificarDiferencia({ diferencia, kmPorMotivo, actividadesTotalesUsuario: lista.length })
    : CATEGORIAS.NO_APLICA;

  const resultado = {
    regla_version: REGLA_VERSION,
    user_id: uc.user_id ?? null,
    user_challenge_id: uc.id ?? null,
    challenge_id: uc.challenge_id ?? null,
    challenge_titulo: challenge?.title ?? null,
    status,
    se_recalcularia: esActivo,
    started_at_utc: aISO(inicioMs),
    modalidad: uc.modalidad ?? null,
    objetivo_km: objetivo_km === null ? null : redondear(objetivo_km),
    objetivo_origen: origen,
    pausas: {
      pausado_ahora: uc.pausado === true,
      pausado_desde_utc: aISO(pausas.pausaAbiertaDesdeMs),
      periodos: pausas.validos.map((p) => ({ desde_utc: aISO(p.desdeMs), hasta_utc: aISO(p.hastaMs) })),
      periodos_invalidos: pausas.invalidos.length,
    },
    km_completed_actual: redondear(kmGuardado),
    km_reconstruido_actividades: redondear(kmReconstruido),
    diferencia_km: redondear(diferencia),
    km_base_candidato: esActivo ? redondear(Math.max(0, diferencia)) : null,
    porcentaje_reconstruido: objetivo_km ? redondear(Math.min((kmReconstruido / objetivo_km) * 100, 100), 1) : null,
    actividades: {
      total_usuario: lista.length,
      cuentan: { cantidad: cantidadPorMotivo[MOTIVOS.CUENTA], km: redondear(kmPorMotivo[MOTIVOS.CUENTA]) },
      excluidas_por_usuario: { cantidad: cantidadPorMotivo[MOTIVOS.EXCLUIDA], km: redondear(kmPorMotivo[MOTIVOS.EXCLUIDA]) },
      anteriores_al_inicio: { cantidad: cantidadPorMotivo[MOTIVOS.ANTERIOR_AL_INICIO], km: redondear(kmPorMotivo[MOTIVOS.ANTERIOR_AL_INICIO]) },
      en_pausa: {
        cantidad: cantidadPorMotivo[MOTIVOS.EN_PAUSA] + cantidadPorMotivo[MOTIVOS.EN_PAUSA_ABIERTA],
        km: redondear(kmPorMotivo[MOTIVOS.EN_PAUSA] + kmPorMotivo[MOTIVOS.EN_PAUSA_ABIERTA]),
        de_ellas_en_pausa_abierta: cantidadPorMotivo[MOTIVOS.EN_PAUSA_ABIERTA],
      },
      fecha_invalida: cantidadPorMotivo[MOTIVOS.FECHA_INVALIDA],
    },
    categoria_diferencia: categoria,
    flags,
  };
  if (incluirDetalle) {
    resultado.detalle_actividades = detalle.sort((x, y) => String(x.recorded_at_utc).localeCompare(String(y.recorded_at_utc)));
  }
  return resultado;
};

/** Resumen de un conjunto de resultados (para el reporte de todos los activos). */
const resumirResultados = (resultados) => {
  const activos = resultados.filter((r) => r.se_recalcularia);
  const porCategoria = {};
  activos.forEach((r) => {
    const c = porCategoria[r.categoria_diferencia] || { desafios: 0, km_base_candidato: 0 };
    c.desafios += 1;
    c.km_base_candidato = redondear(c.km_base_candidato + (r.km_base_candidato || 0));
    porCategoria[r.categoria_diferencia] = c;
  });
  return {
    desafios: resultados.length,
    activos: activos.length,
    coinciden: activos.filter((r) => r.categoria_diferencia === CATEGORIAS.COINCIDE).length,
    nuevo_bajaria: activos.filter((r) => r.flags.includes('el_calculo_nuevo_bajaria_km')).length,
    nuevo_subiria: activos.filter((r) => r.flags.includes('el_calculo_nuevo_subiria_km')).length,
    km_base_candidato_total: redondear(activos.reduce((acc, r) => acc + (r.km_base_candidato || 0), 0)),
    por_categoria: porCategoria,
  };
};

module.exports = {
  REGLA_VERSION,
  ESTADOS_TERMINALES,
  MOTIVOS,
  CATEGORIAS,
  TOLERANCIA_IGUAL_KM,
  DIFERENCIA_PEQUENA_KM,
  instanteUTC,
  resolverObjetivo,
  normalizarPausas,
  calcularProgresoChallenge,
  resumirResultados,
};