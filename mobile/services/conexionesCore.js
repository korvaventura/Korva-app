// Núcleo puro de la sección "Conexiones" (Perfil): qué dice cada fila según
// lo que informa el servidor. Sin React: se prueba con node --test.
//
// Garmin, contrato actual del backend (rama feat/garmin-oauth-20261121):
//   GET /garmin/status  -> { available, connected, connected_at, permissions, activities_enabled }
//   cuando la cuenta no está habilitada: { available: false, connected: false }
//   POST /garmin/auth   -> { authorization_url, expires_in } | 404 no habilitada | 409 ya conectada o en curso
//   regreso: korva://garmin-connected?result=connected|cancelled|invalid_state|permission_required|account_in_use|unavailable|error
// No hay operación de desconectar todavía: la app no la ofrece.

// La fila de Garmin solo aparece si el servidor dice que está habilitada para esta cuenta.
function mostrarGarmin(status) {
  return status?.available === true;
}

// "Cuenta vinculada" y "salidas que suman" son dos cosas distintas.
function filaGarmin(status) {
  if (!mostrarGarmin(status)) return null;
  if (!status.connected) {
    return { estado: 'sin_conectar', titulo: 'Sin conectar', detalle: 'Conectala y tus salidas de Garmin llegan solas.', accion: 'conectar' };
  }
  if (status.activities_enabled === true) {
    return { estado: 'sincroniza', titulo: 'Conectada', detalle: 'Tus salidas de Garmin suman solas a tus desafíos.', accion: null };
  }
  return {
    estado: 'vinculada',
    titulo: 'Cuenta vinculada',
    detalle: 'Las salidas de Garmin todavía no suman km. Seguí registrando con Strava, Korva GPS o carga manual.',
    accion: null,
  };
}

function filaStrava(conectado) {
  return conectado
    ? { estado: 'sincroniza', titulo: 'Conectada', detalle: 'Tus salidas de Strava suman solas a tus desafíos.' }
    : { estado: 'sin_conectar', titulo: 'Sin conectar', detalle: 'Conectala y tus salidas llegan solas.' };
}

// Mensaje después de volver del navegador. El estado del servidor manda:
// un "connected" en el link no alcanza para mostrar éxito.
function mensajeGarmin({ conectado, resultado, tipo }) {
  if (conectado) {
    return { titulo: 'Garmin vinculado', texto: 'Tu cuenta quedó vinculada. Por ahora tus salidas de Garmin no suman km: seguí registrando con Strava, Korva GPS o carga manual.' };
  }
  if (tipo !== 'success' || resultado === 'cancelled') return null; // cerró el navegador o canceló: sin cartel
  const textos = {
    permission_required: 'Para vincular Garmin, autorizá compartir tus actividades en la pantalla de Garmin.',
    account_in_use: 'Esa cuenta Garmin ya está vinculada a otra cuenta de Korva.',
    invalid_state: 'El enlace venció. Volvé a tocar Conectar.',
    unavailable: 'Garmin no está disponible para tu cuenta.',
  };
  return { titulo: 'Conectar Garmin', texto: textos[resultado] || 'No pudimos completar la conexión. Intentá nuevamente.' };
}

// Sin URL/searchParams: en React Native no siempre están completos.
function resultadoDeUrl(url) {
  const m = /[?&]result=([a-z_]+)/.exec(String(url || ''));
  return m ? m[1] : null;
}

// Solo abrimos el navegador hacia la página de Korva que redirige a Garmin.
const ORIGEN_GARMIN = 'https://korva-app-production.up.railway.app/garmin/authorize?';
function urlAutorizacionValida(url) {
  return typeof url === 'string' && url.startsWith(ORIGEN_GARMIN);
}

// Garmin está en beta: un aviso, una sola vez, cuando ya suma km.
const SOPORTE_WHATSAPP = '61474024238';
const SOPORTE_MAIL = 'korvaventura@gmail.com';
const AVISO_BETA_GARMIN = {
  titulo: 'Garmin está en beta',
  texto: 'Tus salidas de Garmin se van a sumar solas a tus desafíos. Es una función nueva: si ves km raros, una salida que no aparece o algo que se suma dos veces, avisanos y lo revisamos.',
};
const CLAVE_AVISO_BETA = (userId) => `korva:garmin-beta-visto:v1:${userId || 'anon'}`;
function debeMostrarAvisoBeta(fila, visto) {
  return fila?.estado === 'sincroniza' && !visto;
}
function urlWhatsappSoporte(texto = 'Hola Korva, vi algo raro con Garmin: ') {
  return `https://wa.me/${SOPORTE_WHATSAPP}?text=${encodeURIComponent(texto)}`;
}
function urlMailSoporte(asunto = 'Garmin en Korva') {
  return `mailto:${SOPORTE_MAIL}?subject=${encodeURIComponent(asunto)}`;
}

module.exports = { AVISO_BETA_GARMIN, CLAVE_AVISO_BETA, debeMostrarAvisoBeta, urlWhatsappSoporte, urlMailSoporte, SOPORTE_MAIL, mostrarGarmin, filaGarmin, filaStrava, mensajeGarmin, resultadoDeUrl, urlAutorizacionValida };
