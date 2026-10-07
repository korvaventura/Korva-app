// Movimiento diario pasivo (Apple Health / Health Connect) — Etapa 2.
//
// Solo guarda en daily_movement. A propósito NO toca activities, NO toca
// user_challenges y NO ejecuta ningún recálculo de km: en esta etapa el
// movimiento diario no afecta el progreso de ningún usuario.
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const requireUser = require('../middleware/requireUser');
const { prepararRecalculoHealth, terminarRecalculoHealth } = require('../lib/healthRecalculo');
let dispararEfectos = () => {};
router.configurarMotor = (opciones) => { dispararEfectos = opciones.dispararEfectos; };

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const PLATAFORMAS = ['apple_health', 'health_connect'];
const TIPOS_MEDICION = ['medido', 'estimado'];

// Validación del endpoint (no es una limitación de la arquitectura).
const MAX_DIAS_ATRAS = 30;
const MAX_DIAS_POR_PEDIDO = 31;

// Topes de sentido común por día.
const MAX_KM_CAMINANDO_DIA = 150;
const MAX_KM_BICI_DIA = 500;
const MAX_PASOS_DIA = 300000;

const MAX_LARGO_FUENTE = 100;
const MAX_BYTES_RAW_PAYLOAD = 20000;

const esTimezoneValida = (tz) => {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// Fecha de "hoy" (AAAA-MM-DD) en la zona horaria indicada.
const hoyEnTimezone = (tz) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

// Convierte 'AAAA-MM-DD' a milisegundos UTC, o null si no es una fecha real.
const fechaAMs = (fecha) => {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const ms = Date.UTC(anio, mes - 1, dia);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return ms;
};

const esNumeroValido = (valor, maximo) =>
  typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= maximo;

// POST /movimiento-diario/sync
// Body: { plataforma, timezone, dias: [ { fecha, distancia_caminando_km, distancia_bici_km,
//         pasos, tipo_medicion, fuente_dispositivo, raw_payload } ] }
// El usuario sale exclusivamente del token (req.userId), nunca del body.
router.post('/sync', requireUser, async (req, res) => {
  const userId = req.userId;
  const { plataforma, timezone, dias } = req.body || {};
  const errores = [];

  if (!PLATAFORMAS.includes(plataforma)) {
    errores.push(`plataforma inválida (valores permitidos: ${PLATAFORMAS.join(', ')})`);
  }
  if (!esTimezoneValida(timezone)) {
    errores.push('timezone obligatoria y debe ser una zona horaria válida (ej. America/Argentina/Buenos_Aires)');
  }
  if (!Array.isArray(dias) || dias.length === 0) {
    errores.push('dias debe ser una lista con al menos un día');
  } else if (dias.length > MAX_DIAS_POR_PEDIDO) {
    errores.push(`máximo ${MAX_DIAS_POR_PEDIDO} días por pedido`);
  }

  if (errores.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos', detalle: errores });
  }

  const hoyMs = fechaAMs(hoyEnTimezone(timezone));
  const fechasVistas = new Set();
  const filas = [];

  dias.forEach((dia, i) => {
    const pref = `dias[${i}]`;
    if (!dia || typeof dia !== 'object' || Array.isArray(dia)) {
      errores.push(`${pref}: debe ser un objeto`);
      return;
    }

    const {
      fecha,
      distancia_caminando_km = 0,
      distancia_bici_km = 0,
      pasos = null,
      tipo_medicion,
      fuente_dispositivo = null,
      raw_payload = null,
    } = dia;

    const fechaMs = fechaAMs(fecha);
    if (fechaMs === null) {
      errores.push(`${pref}: fecha inválida (formato AAAA-MM-DD)`);
    } else {
      if (fechaMs > hoyMs) errores.push(`${pref}: la fecha ${fecha} es futura para la zona horaria ${timezone}`);
      if ((hoyMs - fechaMs) / 86400000 > MAX_DIAS_ATRAS) errores.push(`${pref}: la fecha ${fecha} tiene más de ${MAX_DIAS_ATRAS} días`);
      if (fechasVistas.has(fecha)) errores.push(`${pref}: la fecha ${fecha} está repetida en el pedido`);
      fechasVistas.add(fecha);
    }

    if (!esNumeroValido(distancia_caminando_km, MAX_KM_CAMINANDO_DIA)) {
      errores.push(`${pref}: distancia_caminando_km debe ser un número entre 0 y ${MAX_KM_CAMINANDO_DIA}`);
    }
    if (!esNumeroValido(distancia_bici_km, MAX_KM_BICI_DIA)) {
      errores.push(`${pref}: distancia_bici_km debe ser un número entre 0 y ${MAX_KM_BICI_DIA}`);
    }
    if (pasos !== null && !(Number.isInteger(pasos) && esNumeroValido(pasos, MAX_PASOS_DIA))) {
      errores.push(`${pref}: pasos debe ser un entero entre 0 y ${MAX_PASOS_DIA}, u omitirse`);
    }
    if (!TIPOS_MEDICION.includes(tipo_medicion)) {
      errores.push(`${pref}: tipo_medicion inválido (valores permitidos: ${TIPOS_MEDICION.join(', ')})`);
    }
    if (fuente_dispositivo !== null && (typeof fuente_dispositivo !== 'string' || fuente_dispositivo.length > MAX_LARGO_FUENTE)) {
      errores.push(`${pref}: fuente_dispositivo debe ser texto de hasta ${MAX_LARGO_FUENTE} caracteres, u omitirse`);
    }
    if (raw_payload !== null) {
      if (typeof raw_payload !== 'object') {
        errores.push(`${pref}: raw_payload debe ser un objeto o lista JSON, u omitirse`);
      } else if (Buffer.byteLength(JSON.stringify(raw_payload), 'utf8') > MAX_BYTES_RAW_PAYLOAD) {
        errores.push(`${pref}: raw_payload supera ${MAX_BYTES_RAW_PAYLOAD} bytes`);
      }
    }

    filas.push({
      user_id: userId,
      fecha,
      timezone,
      plataforma,
      distancia_caminando_km,
      distancia_bici_km,
      pasos,
      // Siempre la calcula el backend. Nunca se acepta del teléfono.
      // El backend NO convierte pasos a km.
      distancia_km_total: distancia_caminando_km + distancia_bici_km,
      tipo_medicion,
      fuente_dispositivo,
      raw_payload,
    });
  });

  if (errores.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos', detalle: errores });
  }

  try {
    const supabase = getSupabase();

    // Los días cerrados no se modifican nunca desde este endpoint.
    const { data: cerrados, error: errorCerrados } = await supabase
      .from('daily_movement')
      .select('fecha')
      .eq('user_id', userId)
      .eq('cerrado', true)
      .in('fecha', filas.map((f) => f.fecha));
    if (errorCerrados) throw errorCerrados;

    const fechasCerradas = new Set((cerrados || []).map((c) => c.fecha));
    const omitidos = filas
      .filter((f) => fechasCerradas.has(f.fecha))
      .map((f) => ({ fecha: f.fecha, motivo: 'cerrado' }));
    const aGuardar = filas.filter((f) => !fechasCerradas.has(f.fecha));
    const preparado = aGuardar.length ? await prepararRecalculoHealth(supabase, userId) : null;

    if (aGuardar.length > 0) {
      // Idempotente por (user_id, fecha): si el día existe se reemplaza con los
      // valores nuevos; created_at se conserva y updated_at lo actualiza el trigger.
      // No se envía "cerrado", así que un upsert nunca abre ni cierra un día.
      const { error: errorUpsert } = await supabase
        .from('daily_movement')
        .upsert(aGuardar, { onConflict: 'user_id,fecha' });

      if (errorUpsert) {
        if (errorUpsert.code === '23503') {
          return res.status(404).json({ error: 'Usuario no encontrado', detalle: 'Tu sesión puede estar desactualizada. Cerrá sesión y volvé a entrar.' });
        }
        throw errorUpsert;
      }
    }

    const recalculo = await terminarRecalculoHealth(preparado, userId, dispararEfectos);
    res.json({
      ok: true,
      progreso: recalculo.ok ? 'actualizado' : 'pendiente',
      guardados: aGuardar.map((f) => f.fecha),
      omitidos,
    });
  } catch (error) {
    console.error('Error en /movimiento-diario/sync:', error.message);
    res.status(500).json({ error: 'No se pudo guardar el movimiento diario.' });
  }
});

module.exports = router;
