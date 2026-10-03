// Bandeja PERSISTENTE de eventos del webhook de Strava (Etapa 4A-8, flag "strava_webhook").
//
// Problema que resuelve: Strava solo reintenta un evento si no le respondemos 2xx. Si respondemos
// 200 y el proceso muere antes de aplicar el evento, se pierde. Por eso, con la flag encendida:
//  1. ACK: el evento se GUARDA en public.strava_webhook_eventos ANTES de responder 200. Si no se
//     puede guardar, se responde 500 y Strava lo reintenta. Un reintento de Strava (mismo evento)
//     cae en la misma clave y no se duplica.
//  2. Proceso: se toma el evento con compare-and-set (estado + intentos) y un arriendo de 5 min;
//     se aplica (lib/webhookStrava.js, idempotente) y se cierra con compare-and-set por token.
//  3. Recuperación: cada minuto se toman los eventos pendientes vencidos y los "procesando" cuyo
//     arriendo venció (el proceso que los tenía murió). Reintentos con espera creciente; después de
//     MAX_INTENTOS queda en 'error' (visible por SQL, no se pierde).
// Todo funciona igual con varios procesos/instancias: no depende de nada en memoria.
const crypto = require('crypto');
const { logMotor } = require('./recuperacionRecalculo');

const TABLA = 'strava_webhook_eventos';
const ESTADOS = { PENDIENTE: 'pendiente', PROCESANDO: 'procesando', HECHO: 'hecho', IGNORADO: 'ignorado', ERROR: 'error' };
const TERMINALES = [ESTADOS.HECHO, ESTADOS.IGNORADO, ESTADOS.ERROR];
const ARRIENDO_MS = 5 * 60 * 1000;
const MAX_INTENTOS = 8;
const INTERVALO_RECUPERACION_MS = 60 * 1000;
const DEMORA_INICIAL_MS = 5 * 1000;
const LIMITE_POR_RONDA = 50;

/** 1 min, 2, 4, 8 … tope 1 h. */
const esperaReintentoMs = (intentos) => Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** Math.max(0, intentos - 1));

const logBandeja = (datos) => logMotor({ writer: 'strava_webhook', bandeja: true, ...datos });

const ordenar = (v) => {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => { o[k] = ordenar(v[k]); return o; }, {});
  return v;
};

/** Clave idempotente: el mismo evento reenviado por Strava produce la misma clave. */
const claveDeEvento = (e) => crypto.createHash('sha256').update(JSON.stringify([
  String(e.owner_id), e.object_type, String(e.object_id), e.aspect_type, e.event_time ?? null, ordenar(e.updates || {}),
])).digest('hex');

const enteroValido = (v) => {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Fila de la bandeja a partir del cuerpo del webhook, o null si no tiene lo mínimo para procesarse. */
const filaDeEvento = (e, ahoraMs = Date.now()) => {
  if (!e || typeof e !== 'object') return null;
  const ownerId = enteroValido(e.owner_id);
  const objectId = enteroValido(e.object_id);
  if (!ownerId || !objectId || typeof e.object_type !== 'string' || typeof e.aspect_type !== 'string') return null;
  const ahoraIso = new Date(ahoraMs).toISOString();
  return {
    clave: claveDeEvento(e),
    owner_id: ownerId,
    object_type: e.object_type,
    aspect_type: e.aspect_type,
    object_id: objectId,
    event_time: enteroValido(e.event_time),
    updates: e.updates && typeof e.updates === 'object' ? e.updates : {},
    estado: ESTADOS.PENDIENTE,
    intentos: 0,
    siguiente_intento_at: ahoraIso,
    recibido_at: ahoraIso,
  };
};

/** Acceso a la tabla (service role). */
const crearRepositorioBandeja = (supabase) => Object.freeze({
  /** Guarda el evento (o no hace nada si ya estaba). Devuelve { id, estado } del registro. */
  registrar: async ({ fila }) => {
    const { error } = await supabase.from(TABLA).upsert(fila, { onConflict: 'clave', ignoreDuplicates: true });
    if (error) throw error;
    const { data, error: e2 } = await supabase.from(TABLA).select('id, estado').eq('clave', fila.clave).maybeSingle();
    if (e2) throw e2;
    if (!data) throw new Error('el evento no quedó registrado');
    return data;
  },
  leer: async ({ id }) => {
    const { data, error } = await supabase.from(TABLA).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },
  /** CAS: solo uno toma el evento (estado e intentos tienen que seguir siendo los leídos). */
  tomar: async ({ id, estadoLeido, intentosLeidos, token, ahoraIso, arriendoHastaIso }) => {
    const { data, error } = await supabase.from(TABLA)
      .update({ estado: ESTADOS.PROCESANDO, intentos: intentosLeidos + 1, token, tomado_at: ahoraIso, siguiente_intento_at: arriendoHastaIso })
      .eq('id', id).eq('estado', estadoLeido).eq('intentos', intentosLeidos)
      .select('id');
    if (error) throw error;
    return Array.isArray(data) && data.length === 1;
  },
  /** CAS por token: si otro proceso lo retomó (arriendo vencido), este cierre no pisa nada. */
  cerrar: async ({ id, token, valores }) => {
    const { data, error } = await supabase.from(TABLA).update(valores).eq('id', id).eq('token', token).select('id');
    if (error) throw error;
    return Array.isArray(data) && data.length === 1;
  },
  /** Pendientes vencidos y "procesando" con el arriendo vencido. */
  listarVencidos: async ({ ahoraIso, limite }) => {
    const { data, error } = await supabase.from(TABLA)
      .select('id')
      .in('estado', [ESTADOS.PENDIENTE, ESTADOS.PROCESANDO])
      .lte('siguiente_intento_at', ahoraIso)
      .order('siguiente_intento_at', { ascending: true })
      .limit(limite);
    if (error) throw error;
    return (data || []).map((f) => f.id);
  },
});

const generarTokenUnico = () => crypto.randomUUID();

/**
 * Toma, aplica y cierra UN evento. `manejar(evento)` devuelve
 *   { estado: 'hecho' | 'ignorado', resultado }  o  { reintentar: true, error }  (o lanza → reintentar).
 */
const procesarEventoBandeja = async ({
  repo, id, manejar, reloj = Date.now, generarToken = generarTokenUnico, log = logBandeja,
}) => {
  const ev = await repo.leer({ id });
  if (!ev) return { resultado: 'no_existe' };
  if (TERMINALES.includes(ev.estado)) return { resultado: 'ya_cerrado', estado: ev.estado };
  const ahora = reloj();
  if (ev.siguiente_intento_at && Date.parse(ev.siguiente_intento_at) > ahora) return { resultado: 'no_vencido' };

  const token = generarToken();
  const tomado = await repo.tomar({
    id, estadoLeido: ev.estado, intentosLeidos: ev.intentos || 0, token,
    ahoraIso: new Date(ahora).toISOString(), arriendoHastaIso: new Date(ahora + ARRIENDO_MS).toISOString(),
  });
  if (!tomado) return { resultado: 'tomado_por_otro' };
  const intentos = (ev.intentos || 0) + 1;
  if (ev.estado === ESTADOS.PROCESANDO) log({ resultado: 'arriendo_vencido_retomado', evento_id: id, intentos });

  let salida;
  try {
    salida = await manejar({ ...ev, intentos });
  } catch (e) {
    salida = { reintentar: true, error: e && e.message };
  }
  const fin = reloj();
  const finIso = new Date(fin).toISOString();
  let valores;
  if (salida && (salida.estado === ESTADOS.HECHO || salida.estado === ESTADOS.IGNORADO)) {
    valores = { estado: salida.estado, resultado: salida.resultado || null, procesado_at: finIso, ultimo_error: null };
  } else if (intentos >= MAX_INTENTOS) {
    valores = { estado: ESTADOS.ERROR, resultado: 'agotado', procesado_at: finIso, ultimo_error: (salida && salida.error) || 'sin detalle' };
  } else {
    valores = {
      estado: ESTADOS.PENDIENTE, ultimo_error: (salida && salida.error) || 'sin detalle',
      siguiente_intento_at: new Date(fin + esperaReintentoMs(intentos)).toISOString(),
    };
  }
  let cerrado = false;
  try {
    cerrado = await repo.cerrar({ id, token, valores });
  } catch (e) {
    log({ resultado: 'no_se_pudo_cerrar', evento_id: id, error: e && e.message }); // el arriendo vence y se reintenta
  }
  log({
    resultado: `evento_${valores.estado}`, evento_id: id, aspect_type: ev.aspect_type, object_id: ev.object_id,
    intentos, detalle: valores.resultado || valores.ultimo_error || null, cerrado,
  });
  return { resultado: valores.estado, cerrado, intentos };
};

/** Una ronda de recuperación: procesa los vencidos, uno por uno. */
const recuperarBandeja = async ({ repo, manejar, reloj = Date.now, limite = LIMITE_POR_RONDA, log = logBandeja, generarToken }) => {
  const ids = await repo.listarVencidos({ ahoraIso: new Date(reloj()).toISOString(), limite });
  const resultados = [];
  for (const id of ids) {
    try {
      resultados.push(await procesarEventoBandeja({ repo, id, manejar, reloj, log, generarToken }));
    } catch (e) {
      log({ resultado: 'recuperacion_evento_fallida', evento_id: id, error: e && e.message });
    }
  }
  if (ids.length > 0) log({ resultado: 'ronda_bandeja', revisados: ids.length, hechos: resultados.filter((r) => r.resultado === 'hecho').length });
  return { revisados: ids.length, resultados };
};

/** Timer de recuperación (unref: no frena el apagado). */
const iniciarRecuperacionBandeja = ({
  crearRepo, manejar, intervaloMs = INTERVALO_RECUPERACION_MS, demoraInicialMs = DEMORA_INICIAL_MS, log = logBandeja,
}) => {
  let temporizador = null;
  let detenido = false;
  const programar = (ms) => {
    temporizador = setTimeout(ronda, ms);
    if (temporizador.unref) temporizador.unref();
  };
  async function ronda() {
    try {
      await recuperarBandeja({ repo: crearRepo(), manejar, log });
    } catch (e) {
      log({ resultado: 'ronda_bandeja_fallida', error: e && e.message });
    }
    if (!detenido) programar(intervaloMs);
  }
  programar(demoraInicialMs);
  log({ resultado: 'recuperacion_bandeja_iniciada', intervalo_ms: intervaloMs });
  return { detener: () => { detenido = true; if (temporizador) clearTimeout(temporizador); } };
};

module.exports = {
  TABLA, ESTADOS, ARRIENDO_MS, MAX_INTENTOS, esperaReintentoMs,
  claveDeEvento, filaDeEvento, crearRepositorioBandeja, procesarEventoBandeja, recuperarBandeja, iniciarRecuperacionBandeja,
};
