// Dobles de los servicios externos de los efectos (Etapa 4A-3e). Sin red.
//
// Resend falso con la semántica real de las claves de idempotencia:
//   - misma clave + mismo contenido → devuelve el id original y NO entrega otra vez;
//   - misma clave + contenido distinto → 409 invalid_idempotent_request;
//   - `fallas` permite simular errores por paso (respuesta con error o excepción), antes o después
//     de "entregar" (un 5xx/timeout después de entregar es el caso dudoso real).
// Expo falso: registra cada push entregado; `fallasPush` simula respuestas.
// PDF falso: distinto en cada llamada (como el real, que no es idéntico byte a byte).

const crearResendFalso = () => {
  const porClave = new Map();
  const entregados = [];
  const llamadas = [];
  const fallas = []; // { paso, veces, tipo: 'error'|'excepcion', error?, entregarAntes?: bool }
  let n = 0;
  const cliente = {
    emails: {
      send: async (payload, opciones = {}) => {
        const k = opciones.idempotencyKey || null;
        llamadas.push({ clave: k, para: payload.to, asunto: payload.subject });
        const falla = fallas.find((f) => f.veces > 0 && (!f.paso || (k || '').endsWith(`-${f.paso}`)));
        const entregar = () => {
          if (k && porClave.has(k)) {
            const previo = porClave.get(k);
            if (previo.json !== JSON.stringify(payload)) {
              return { data: null, error: { name: 'invalid_idempotent_request', statusCode: 409, message: 'payload distinto' } };
            }
            return { data: { id: previo.id }, error: null };
          }
          n += 1;
          const id = `email-${n}`;
          if (k) porClave.set(k, { id, json: JSON.stringify(payload) });
          entregados.push({ id, clave: k, para: payload.to, asunto: payload.subject, adjuntos: (payload.attachments || []).length });
          return { data: { id }, error: null };
        };
        if (falla) {
          falla.veces -= 1;
          if (falla.entregarAntes) entregar();
          if (falla.tipo === 'excepcion') throw new Error(falla.mensaje || 'timeout de red');
          return { data: null, error: falla.error };
        }
        return entregar();
      },
    },
  };
  return { cliente, entregados, llamadas, fallas, entregadosDe: (paso) => entregados.filter((e) => (e.clave || '').endsWith(`-${paso}`)) };
};

const crearExpoFalso = () => {
  const entregados = [];
  const fallas = []; // { veces, tipo: 'excepcion'|'http'|'ticket_error', status?, entregarAntes? }
  const fetchImpl = async (_url, init) => {
    const cuerpo = JSON.parse(init.body);
    const falla = fallas.find((f) => f.veces > 0);
    if (falla) {
      falla.veces -= 1;
      if (falla.entregarAntes) entregados.push(cuerpo);
      if (falla.tipo === 'excepcion') throw new Error('timeout de red');
      if (falla.tipo === 'http') return { ok: false, status: falla.status || 500, json: async () => ({}) };
      if (falla.tipo === 'ticket_error') return { ok: true, status: 200, json: async () => ({ data: { status: 'error', message: 'no registrado', details: { error: 'DeviceNotRegistered' } } }) };
    }
    entregados.push(cuerpo);
    return { ok: true, status: 200, json: async () => ({ data: { status: 'ok', id: `ticket-${entregados.length}` } }) };
  };
  return { fetchImpl, entregados, fallas };
};

const crearPdfFalso = () => {
  const estado = { llamadas: 0, fallas: 0 };
  const generarCertificado = async (_supabase, nombre, desafio, km, bib, fecha, serial) => {
    estado.llamadas += 1;
    if (estado.fallas > 0) { estado.fallas -= 1; return null; }
    return Buffer.from(`PDF ${serial} ${nombre} ${desafio} ${km} ${bib} ${fecha} #${estado.llamadas}`).toString('base64');
  };
  return { generarCertificado, estado };
};

/** Secuencia de seriales como get_next_certificado_serial. */
const crearSecuenciaSerial = () => {
  let n = 0;
  return { siguiente: async () => { n += 1; return `KORVA-2026-${String(n).padStart(4, '0')}`; }, usados: () => n };
};

module.exports = { crearResendFalso, crearExpoFalso, crearPdfFalso, crearSecuenciaSerial };
