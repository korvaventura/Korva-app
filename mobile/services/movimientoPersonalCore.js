// Cliente y controlador sin React Native. Nunca calcula km ni escribe movimiento.
const VERSION = 'movimiento_personal_v1_2026-10-04';
const numero = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const fecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const fallo = (codigo) => Object.assign(new Error(codigo), { codigo });

function validarResumen(r, timezone) {
  if (!r || r.regla_version !== VERSION || r.timezone !== timezone
    || !r.historial || !numero(r.historial.km_actividades)
    || !r.hoy || !fecha(r.hoy.fecha) || !numero(r.hoy.km_movimiento)
    || !(r.hoy.pasos === null || (Number.isInteger(r.hoy.pasos) && r.hoy.pasos >= 0))
    || !r.semana || !numero(r.semana.km_movimiento)
    || !Array.isArray(r.semana.dias) || r.semana.dias.length < 1 || r.semana.dias.length > 7
    || !r.semana.dias.every((d) => fecha(d.fecha) && numero(d.km_movimiento)
      && (d.pasos === null || (Number.isInteger(d.pasos) && d.pasos >= 0)))
    || !Number.isInteger(r.semana.dias_con_datos_pasos)
    || r.semana.dias_con_datos_pasos < 0 || r.semana.dias_con_datos_pasos > r.semana.dias.length) {
    throw fallo('respuesta_invalida');
  }
  return r;
}

function crearClienteMovimientoPersonal({ getSession, fetchImpl, baseUrl, timeoutMs = 12000 }) {
  return async ({ userId, timezone, signal }) => {
    if (signal?.aborted) throw fallo('cancelado');
    const { data, error } = await getSession();
    if (signal?.aborted) throw fallo('cancelado');
    if (error || !data?.session?.access_token || data.session.user?.id !== userId) throw fallo('sesion');
    const controller = new AbortController();
    const cancelar = () => controller.abort();
    signal?.addEventListener('abort', cancelar);
    const timer = setTimeout(cancelar, timeoutMs);
    try {
      const res = await fetchImpl(`${baseUrl}/movimiento-personal?timezone=${encodeURIComponent(timezone)}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` }, signal: controller.signal,
      });
      if (signal?.aborted) throw fallo('cancelado');
      if (controller.signal.aborted) throw fallo('timeout');
      if (res.status === 404) throw fallo('no_disponible');
      if (res.status === 401) throw fallo('sesion');
      if (!res.ok) throw fallo('error');
      const payload = await res.json();
      if (signal?.aborted) throw fallo('cancelado');
      if (controller.signal.aborted) throw fallo('timeout');
      return validarResumen(payload, timezone);
    } catch (e) {
      if (signal?.aborted) throw fallo('cancelado');
      if (controller.signal.aborted) throw fallo('timeout');
      throw e;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancelar);
    }
  };
}

function crearCargaMovimientoPersonal({ leer, emitir }) {
  let version = 0;
  let controller = null;
  const cancelar = () => {
    version++;
    controller?.abort();
    controller = null;
  };
  const actualizar = async ({ userId, timezone }) => {
    cancelar();
    const actual = version;
    const estado = (status, datos = null) => emitir({ status, datos, userId });
    if (!userId) { estado('esperando'); return; }
    controller = new AbortController();
    const signal = controller.signal;
    estado('cargando');
    try {
      const datos = await leer({ userId, timezone, signal });
      if (version === actual && !signal.aborted) estado('disponible', datos);
    } catch (e) {
      if (version !== actual || signal.aborted) return;
      estado(e.codigo === 'no_disponible' ? 'no_disponible' : e.codigo === 'sesion' ? 'sesion' : 'error');
    }
  };
  return { actualizar, cancelar };
}

module.exports = { crearClienteMovimientoPersonal, crearCargaMovimientoPersonal, validarResumen };
