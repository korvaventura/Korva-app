// Efectos reales de los eventos del motor (Etapa 4A-3e): certificado, emails y push.
//
// Cada efecto es un PASO de completionEventos. Reglas comunes:
//  - Un efecto externo llama a ctx.guardarIntencion() (escritura con fencing) justo ANTES de
//    llamar al servicio externo. Todo lo previo (lecturas, generar el PDF) es reintentable.
//  - Clasificación del resultado:
//      ok          → hecho.
//      omitido     → no correspondía (sin token de push, aviso que no aplica, certificado ya emitido).
//      error       → falló SIN enviar (o el reenvío es seguro): se reintenta más tarde.
//      definitivo  → no tiene sentido reintentar (ej. email inválido).
//      incierto    → pudo haber salido: NO se reintenta automáticamente.
//
// Garantías por efecto:
//  - serial: reserva con compare-and-set (lib/certificadoSerial.js) → un único serial por desafío,
//    compartido con el camino viejo. La intención guarda el serial propuesto, así una caída después
//    de reservar se reconoce como propia.
//  - email_admin_medalla / email_consolidado: contenido determinista (sale del contexto congelado) y
//    clave de idempotencia de Resend por evento y paso → un reenvío dentro de la ventana es
//    descartado por Resend. Fuera de la ventana (23 h, Resend guarda 24 h) un resultado dudoso
//    pasa a 'incierto'.
//  - email_usuario: el PDF adjunto se regenera y no es idéntico byte a byte, así que la clave no
//    protege un reenvío: solo se reintenta si el fallo fue seguro (no salió). Dudoso → 'incierto'.
//  - push: Expo no tiene idempotencia. Intención antes de enviar; dudoso → 'incierto'. A lo sumo una vez.
const { pedirSerial, leerSerial, reservarSerialCAS } = require('./certificadoSerial');
const { objetivoDeInscripcion } = require('./versionDesafio');

const VENTANA_IDEMPOTENCIA_MS = 23 * 60 * 60 * 1000;
const RESULTADO = { OK: 'ok', OMITIDO: 'omitido', ERROR: 'error', DEFINITIVO: 'definitivo', INCIERTO: 'incierto' };

const clave = (evento, paso) => `korva-evt-${evento.id}-${paso}`;
const mensaje = (e) => (e && e.message ? e.message : String(e));
const dentroDeVentana = (previo, ahoraMs) => !previo || !previo.desde || ahoraMs - Date.parse(previo.desde) < VENTANA_IDEMPOTENCIA_MS;

/**
 * Clasifica la respuesta de Resend ({ data, error }) o una excepción.
 * `determinista`: el contenido es idéntico en cada intento (la clave de idempotencia lo protege).
 */
const clasificarResend = ({ respuesta, excepcion, determinista, previo, ahoraMs }) => {
  const dudoso = () => (determinista && dentroDeVentana(previo, ahoraMs)
    ? { estado: RESULTADO.ERROR, ambiguo: true }
    : { estado: RESULTADO.INCIERTO });
  if (excepcion) return { ...dudoso(), error: mensaje(excepcion) };
  if (respuesta && respuesta.data && respuesta.data.id && !respuesta.error) return { estado: RESULTADO.OK, resend_id: respuesta.data.id };
  const err = (respuesta && respuesta.error) || { name: 'respuesta_vacia', message: 'Resend no devolvió id' };
  const nombre = err.name || '';
  const codigo = Number(err.statusCode) || 0;
  const detalle = `${nombre}${codigo ? ` (${codigo})` : ''}: ${err.message || ''}`;
  if (nombre === 'concurrent_idempotent_requests') return { estado: RESULTADO.ERROR, error: detalle };
  if (nombre === 'invalid_idempotent_request') return { estado: RESULTADO.INCIERTO, error: detalle };
  if (codigo === 429 || ['rate_limit_exceeded', 'daily_quota_exceeded', 'monthly_quota_exceeded'].includes(nombre)) {
    return { estado: RESULTADO.ERROR, error: detalle };
  }
  if (['missing_api_key', 'invalid_api_key', 'restricted_api_key'].includes(nombre)) return { estado: RESULTADO.ERROR, error: detalle }; // configuración: no salió
  if (['validation_error', 'invalid_attachment', 'invalid_from_address', 'invalid_parameter', 'missing_required_field'].includes(nombre) ||
      (codigo >= 400 && codigo < 500)) {
    return { estado: RESULTADO.DEFINITIVO, error: detalle };
  }
  return { ...dudoso(), error: detalle }; // 5xx, application_error o desconocido
};

/** Push de Expo: devuelve una salida de paso. No reintenta nada por sí mismo. */
const enviarPushExpo = async ({ fetchImpl = fetch, token, title, body }) => {
  let res;
  try {
    res = await fetchImpl('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: token, title, body, sound: 'default' }),
    });
  } catch (e) {
    return { estado: RESULTADO.INCIERTO, error: mensaje(e) };
  }
  if (!res.ok) {
    return res.status >= 400 && res.status < 500
      ? { estado: RESULTADO.DEFINITIVO, error: `HTTP ${res.status}` }
      : { estado: RESULTADO.INCIERTO, error: `HTTP ${res.status}` };
  }
  let json = null;
  try { json = await res.json(); } catch { /* respuesta sin JSON */ }
  const ticket = json && (Array.isArray(json.data) ? json.data[0] : json.data);
  if (ticket && ticket.status === 'error') {
    return { estado: RESULTADO.DEFINITIVO, error: `${(ticket.details && ticket.details.error) || ''} ${ticket.message || ''}`.trim() };
  }
  return { estado: RESULTADO.OK, ticket_id: ticket && ticket.id ? ticket.id : null };
};

const formatearFecha = (valor) => {
  const texto = String(valor || '').trim();
  const conZona = /([zZ]|[+-]\d{2}:?\d{2})$/.test(texto) ? texto : `${texto.replace(' ', 'T')}Z`;
  const d = texto ? new Date(conZona) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * @param {object} deps
 * @param {object} deps.supabase          cliente con service role
 * @param {Function} deps.generarCertificado  (supabase, nombre, desafio, km, bib, fecha, serial) → base64 | null
 * @param {object} deps.emails            { construirEmailCompletado, construirEmailAdminMedallaLista, construirEmailAdmin }
 * @param {Function} deps.obtenerResend   () → cliente Resend ({ emails.send(payload, { idempotencyKey }) })
 * @param {Function} [deps.fetchImpl]     fetch para el push
 * @param {Function} [deps.obtenerSerial] (supabase) → serial nuevo
 */
const crearEfectosCompletado = ({ supabase, generarCertificado, emails, obtenerResend, fetchImpl = fetch, obtenerSerial = pedirSerial }) => {
  const leerUsuario = async (id, campos) => {
    const { data, error } = await supabase.from('users').select(campos).eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  };
  const contextoDe = (ctx) => (ctx.efectos.contexto && ctx.efectos.contexto.datos) || null;
  const serialPropio = (ctx) => !!(ctx.efectos.serial && ctx.efectos.serial.propio);

  const enviarEmail = async ({ ctx, paso, payload, determinista }) => {
    await ctx.guardarIntencion({});
    let respuesta = null;
    let excepcion = null;
    try {
      respuesta = await obtenerResend().emails.send(payload, { idempotencyKey: clave(ctx.evento, paso) });
    } catch (e) {
      excepcion = e;
    }
    return clasificarResend({ respuesta, excepcion, determinista, previo: ctx.previo, ahoraMs: ctx.ahoraMs });
  };

  /** Reintento de un email determinista: solo si el intento dudoso anterior está dentro de la ventana. */
  const seguroReintentarDeterminista = (previo, ctx) => (dentroDeVentana(previo, ctx.ahoraMs) ? 'reintentar' : 'incierto');

  const efectos = {
    // 1. Serial: reserva atómica compartida con el camino viejo.
    serial: {
      alEncontrarEnCurso: () => 'reintentar', // interno: se resuelve con el serial propuesto guardado
      ejecutar: async (ctx) => {
        const ucId = ctx.evento.user_challenge_id;
        // Aserción defensiva: el evento 'completado' del motor nace en la MISMA transacción que la
        // completitud (RPC). Si el desafío no está en un estado de completitud (ej. alguien lo
        // revirtió a mano) no se emite nada y va a intervención.
        const { data: estadoUc, error: eSt } = await supabase.from('user_challenges').select('id, status').eq('id', ucId).maybeSingle();
        if (eSt) throw eSt;
        if (!estadoUc) return { estado: RESULTADO.DEFINITIVO, error: 'el desafío ya no existe' };
        if (!['completed', 'cargado', 'shipped'].includes(estadoUc.status)) {
          return { estado: RESULTADO.DEFINITIVO, error: `el desafío no está completado (${estadoUc.status}): no debería pasar` };
        }
        const propuestoAntes = ctx.previo && ctx.previo.serial_propuesto;
        const actual = await leerSerial(supabase, ucId);
        if (actual === undefined) return { estado: RESULTADO.DEFINITIVO, error: 'el desafío ya no existe' };
        if (actual && propuestoAntes && actual === propuestoAntes) return { estado: RESULTADO.OK, serial: actual, propio: true };
        if (actual) return { estado: RESULTADO.OK, serial: actual, propio: false, motivo: 'certificado ya emitido por otro camino' };
        const propuesto = propuestoAntes || await obtenerSerial(supabase);
        await ctx.guardarIntencion({ serial_propuesto: propuesto });
        if (await reservarSerialCAS(supabase, ucId, propuesto)) return { estado: RESULTADO.OK, serial: propuesto, propio: true };
        const ganador = await leerSerial(supabase, ucId);
        return { estado: RESULTADO.OK, serial: ganador, propio: ganador === propuesto, motivo: 'otra llamada reservó primero' };
      },
    },

    // 2. Contexto congelado: a quién se avisa y con qué datos (ids y estados; sin emails).
    contexto: {
      alEncontrarEnCurso: () => 'reintentar',
      ejecutar: async (ctx) => {
        const ev = ctx.evento;
        const { data: uc, error: e1 } = await supabase
          .from('user_challenges')
          .select('id, user_id, challenge_id, group_id, completed_at, status, version, modalidad, challenges(title, modalidades, total_distance_km)')
          .eq('id', ev.user_challenge_id)
          .maybeSingle();
        if (e1) throw e1;
        if (!uc) return { estado: RESULTADO.DEFINITIVO, error: 'el desafío ya no existe' };
        const usuario = await leerUsuario(ev.user_id, 'id, shipping_address');
        if (!usuario) return { estado: RESULTADO.DEFINITIVO, error: 'el usuario ya no existe' };

        const groupId = uc.group_id || null;
        const esGrupo = !!groupId;
        const esComprador = esGrupo && groupId === ev.user_id;
        let miembros = [];
        let otrosCompletados = 0;
        if (esGrupo && esComprador) {
          const { data: mUC, error: e2 } = await supabase
            .from('user_challenges').select('user_id, status, km_completed').eq('group_id', groupId).eq('challenge_id', uc.challenge_id);
          if (e2) throw e2;
          miembros = (mUC || []).map((m) => ({ user_id: m.user_id, status: m.status, km: m.km_completed, esComprador: m.user_id === groupId }));
          otrosCompletados = (mUC || []).filter((m) => m.user_id !== ev.user_id && (m.status === 'completed' || m.status === 'shipped')).length;
        }
        let otrosTitulos = [];
        const avisarAdmin = !esGrupo || (esComprador && otrosCompletados === 0);
        if (avisarAdmin) {
          const { data: otros, error: e3 } = await supabase
            .from('user_challenges').select('id, challenges(title)').eq('user_id', ev.user_id)
            .in('status', ['active', 'completed', 'pending']).neq('challenge_id', uc.challenge_id);
          if (e3) throw e3;
          otrosTitulos = (otros || []).map((r) => r.challenges && r.challenges.title).filter(Boolean);
        }
        const datos = ev.datos || {};
        const titulo = datos.challenge_titulo || (uc.challenges && uc.challenges.title) || 'Desafío Korva';
        return {
          estado: RESULTADO.OK,
          datos: {
            titulo,
            // D-V1: distancia de la versión elegida (la que fijó el motor al completar; si faltara, se recalcula).
            distancia_km: datos.objetivo_km ?? objetivoDeInscripcion(uc, uc.challenges).objetivo_km,
            fecha_completado: formatearFecha(uc.completed_at || ev.creado_at),
            tieneDir: !!usuario.shipping_address,
            esGrupo,
            esComprador,
            compradorId: esGrupo ? groupId : null,
            miembros,
            avisarAdmin,
            avisarConsolidado: avisarAdmin && otrosTitulos.length > 0,
            otrosTitulos,
          },
        };
      },
    },

    // 3. "Medalla lista para despachar" a Korva (crítico para el envío).
    email_admin_medalla: {
      alEncontrarEnCurso: seguroReintentarDeterminista,
      ejecutar: async (ctx) => {
        const c = contextoDe(ctx);
        if (!serialPropio(ctx)) return { estado: RESULTADO.OMITIDO, motivo: 'certificado ya emitido por otro camino' };
        if (!c.avisarAdmin) return { estado: RESULTADO.OMITIDO, motivo: 'otro miembro del grupo ya avisó' };
        if (!dentroDeVentana(ctx.previo, ctx.ahoraMs) && ctx.previo.ambiguo) return { estado: RESULTADO.INCIERTO, error: 'fuera de la ventana de idempotencia' };
        const u = await leerUsuario(ctx.evento.user_id, 'name, email');
        if (!u) return { estado: RESULTADO.DEFINITIVO, error: 'el usuario ya no existe' };
        let miembros = [];
        if (c.esGrupo && c.miembros.length > 0) {
          const { data: us, error } = await supabase.from('users').select('id, name, email').in('id', c.miembros.map((m) => m.user_id));
          if (error) throw error;
          miembros = c.miembros.map((m) => {
            const x = (us || []).find((y) => y.id === m.user_id) || {};
            return { nombre: x.name, email: x.email, status: m.status, km: m.km, esComprador: m.esComprador };
          });
        }
        const payload = emails.construirEmailAdminMedallaLista(u.name, u.email, c.titulo, c.tieneDir, c.esGrupo, miembros);
        return enviarEmail({ ctx, paso: 'email_admin_medalla', payload, determinista: true });
      },
    },

    // 4. Email al usuario con el certificado (el PDF se genera acá; si falla, no se envió nada).
    email_usuario: {
      alEncontrarEnCurso: () => 'incierto',
      ejecutar: async (ctx) => {
        const c = contextoDe(ctx);
        if (!serialPropio(ctx)) return { estado: RESULTADO.OMITIDO, motivo: 'certificado ya emitido por otro camino' };
        const u = await leerUsuario(ctx.evento.user_id, 'name, email, bib_number');
        if (!u) return { estado: RESULTADO.DEFINITIVO, error: 'el usuario ya no existe' };
        if (!u.email) return { estado: RESULTADO.DEFINITIVO, error: 'el usuario no tiene email' };
        const pdf = await generarCertificado(supabase, u.name, c.titulo, c.distancia_km, u.bib_number || '---', c.fecha_completado, ctx.efectos.serial.serial);
        if (!pdf) return { estado: RESULTADO.ERROR, error: 'no se pudo generar el PDF del certificado' };
        let opciones;
        if (c.esGrupo && !c.esComprador) {
          const comprador = c.compradorId ? await leerUsuario(c.compradorId, 'name') : null;
          opciones = { tieneDir: c.tieneDir, esGrupo: true, esComprador: false, nombreComprador: (comprador && comprador.name) || '' };
        } else {
          let miembros = [];
          if (c.esGrupo && c.miembros.length > 0) {
            const { data: us, error } = await supabase.from('users').select('id, name, email').in('id', c.miembros.map((m) => m.user_id));
            if (error) throw error;
            miembros = c.miembros.map((m) => {
              const x = (us || []).find((y) => y.id === m.user_id) || {};
              return { nombre: x.name, email: x.email, status: m.status, km: m.km, esComprador: m.esComprador };
            });
          }
          opciones = { tieneDir: c.tieneDir, esGrupo: c.esGrupo, esComprador: true, miembros };
        }
        const payload = emails.construirEmailCompletado(u.email, u.name, c.titulo, pdf, opciones);
        return enviarEmail({ ctx, paso: 'email_usuario', payload, determinista: false });
      },
    },

    // 5. Aviso de envío consolidado a Korva (si el usuario tiene otros desafíos).
    email_consolidado: {
      alEncontrarEnCurso: seguroReintentarDeterminista,
      ejecutar: async (ctx) => {
        const c = contextoDe(ctx);
        if (!serialPropio(ctx)) return { estado: RESULTADO.OMITIDO, motivo: 'certificado ya emitido por otro camino' };
        if (!c.avisarConsolidado) return { estado: RESULTADO.OMITIDO, motivo: 'no tiene otros desafíos' };
        if (!dentroDeVentana(ctx.previo, ctx.ahoraMs) && ctx.previo.ambiguo) return { estado: RESULTADO.INCIERTO, error: 'fuera de la ventana de idempotencia' };
        const u = await leerUsuario(ctx.evento.user_id, 'name, email');
        if (!u) return { estado: RESULTADO.DEFINITIVO, error: 'el usuario ya no existe' };
        const payload = emails.construirEmailAdmin(
          `📦 Envío consolidado — ${u.name}`,
          `${u.name} (${u.email}) completó ${c.titulo} pero también tiene otros desafíos: ${c.otrosTitulos.join(', ')}.\n\nConsiderar esperar antes de despachar para consolidar el envío en un solo paquete.`,
        );
        return enviarEmail({ ctx, paso: 'email_consolidado', payload, determinista: true });
      },
    },

    // 6. Push de completado (a lo sumo una vez).
    push_completado: {
      alEncontrarEnCurso: () => 'incierto',
      ejecutar: async (ctx) => {
        const u = await leerUsuario(ctx.evento.user_id, 'push_token');
        if (!u || !u.push_token) return { estado: RESULTADO.OMITIDO, motivo: 'sin token de push' };
        const titulo = (ctx.evento.datos && ctx.evento.datos.challenge_titulo) || 'tu desafío';
        await ctx.guardarIntencion({});
        return enviarPushExpo({
          fetchImpl, token: u.push_token, title: '🏅 ¡Lo lograste!',
          body: `¡Lo lograste! 🎉 Completaste ${titulo}. Nuestro equipo procesará tu pedido en los próximos días hábiles.`,
        });
      },
    },

    // Evento cruce_75: aviso de cargar la dirección (solo si no la tiene).
    push_aviso_direccion: {
      alEncontrarEnCurso: () => 'incierto',
      ejecutar: async (ctx) => {
        const u = await leerUsuario(ctx.evento.user_id, 'push_token, shipping_address');
        if (!u || !u.push_token) return { estado: RESULTADO.OMITIDO, motivo: 'sin token de push' };
        if (u.shipping_address) return { estado: RESULTADO.OMITIDO, motivo: 'ya tiene dirección' };
        await ctx.guardarIntencion({});
        return enviarPushExpo({
          fetchImpl, token: u.push_token, title: '📦 ¡Ya casi llegás!',
          body: 'Acordate de cargar tu dirección de envío en el Perfil para que tu medalla salga sin demoras 🏅',
        });
      },
    },
  };
  return efectos;
};

module.exports = { crearEfectosCompletado, clasificarResend, enviarPushExpo, VENTANA_IDEMPOTENCIA_MS };
