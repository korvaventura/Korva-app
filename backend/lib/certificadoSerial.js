// Reserva atómica del serial del certificado (Etapa 4A-3e).
//
// Un desafío tiene UN solo certificado. Antes de generar el PDF o mandar cualquier email, quien
// quiera emitirlo reserva el serial con compare-and-set:
//     UPDATE user_challenges SET certificado_serial = :nuevo
//     WHERE id = :id AND certificado_serial IS NULL
// Solo una llamada puede ganar. Las demás ven que ya había serial y NO emiten nada.
// Lo usan el camino viejo (enviarCertificadoFinisher) y los efectos del motor (efectosCompletado),
// así los dos caminos no pueden emitir dos certificados para el mismo desafío.
//
// El número sale de la secuencia de la base (get_next_certificado_serial). Si una llamada pierde
// la reserva, el número que pidió queda sin usar (huecos en la numeración; no se reutiliza).

const serialDeRespaldo = () => `KORVA-${new Date().getFullYear()}-0000`;

/** Pide el próximo serial a la base. Si falla, usa el mismo respaldo que el código histórico. */
const pedirSerial = async (supabase) => {
  try {
    const { data, error } = await supabase.rpc('get_next_certificado_serial');
    if (!error && data) return data;
  } catch (e) {
    console.error('Error generando numero de serie:', e && e.message);
  }
  return serialDeRespaldo();
};

/** Serial actual del desafío (null si no tiene). undefined si el desafío no existe. */
const leerSerial = async (supabase, ucId) => {
  const { data, error } = await supabase.from('user_challenges').select('id, certificado_serial').eq('id', ucId).maybeSingle();
  if (error) throw error;
  return data ? (data.certificado_serial ?? null) : undefined;
};

/** Intenta reservar `serial` para el desafío. true solo si esta llamada lo reservó. */
const reservarSerialCAS = async (supabase, ucId, serial) => {
  const { data, error } = await supabase
    .from('user_challenges')
    .update({ certificado_serial: serial })
    .eq('id', ucId)
    .is('certificado_serial', null)
    .select('id');
  if (error) throw error;
  return Array.isArray(data) && data.length === 1;
};

/**
 * Para el camino viejo: si el desafío ya tiene serial no reserva nada; si no, pide uno y lo
 * reserva. Devuelve { reservado: true, serial } o { reservado: false, serial: <el existente> }.
 */
const reservarSerialCertificado = async (supabase, ucId, obtenerSerial = pedirSerial) => {
  const actual = await leerSerial(supabase, ucId);
  if (actual) return { reservado: false, serial: actual };
  if (actual === undefined) return { reservado: false, serial: null };
  const serial = await obtenerSerial(supabase);
  if (await reservarSerialCAS(supabase, ucId, serial)) return { reservado: true, serial };
  return { reservado: false, serial: await leerSerial(supabase, ucId) };
};

/**
 * Libera una reserva PROPIA que no llegó a usarse (ej. el PDF no se pudo generar): vuelve a NULL
 * solo si el serial sigue siendo el reservado. El trigger de la base permite valor → NULL.
 */
const liberarSerialCAS = async (supabase, ucId, serial) => {
  const { data, error } = await supabase
    .from('user_challenges')
    .update({ certificado_serial: null })
    .eq('id', ucId)
    .eq('certificado_serial', serial)
    .select('id');
  if (error) throw error;
  return Array.isArray(data) && data.length === 1;
};

module.exports = { pedirSerial, leerSerial, reservarSerialCAS, reservarSerialCertificado, liberarSerialCAS };
