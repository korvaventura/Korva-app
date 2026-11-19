// Textos y acción de la tarjeta "Cómo sumás km" del Home. Puro para poder probarlo.

const fmt = (n, dec = 1) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: dec, minimumFractionDigits: 0 });

function listaNombres(nombres) {
  if (nombres.length <= 1) return nombres[0] || '';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

// Estado de Salud en palabras + el único botón que corresponde.
// aportes: respuesta de /movimiento-diario/desafios ({ disponible, desafios: [{ titulo, activo }] }) o null si no se pudo leer.
function estadoSaludTarjeta({ soportada, conectada, aportes }) {
  if (!soportada) return null;
  if (!conectada) {
    return { texto: 'Lo que caminás sin grabar una actividad', activos: [],
      accion: { tipo: 'conectarSalud', texto: 'Conectar Salud' } };
  }
  if (!aportes || aportes.disponible === false) {
    return { texto: 'Conectada · sólo para tu resumen', activos: [], accion: null };
  }
  const activos = (aportes.desafios || []).filter((d) => d.activo).map((d) => d.titulo);
  if (!activos.length) {
    const hay = (aportes.desafios || []).length > 0;
    return { texto: 'Conectada · no suma a desafíos', activos,
      accion: hay ? { tipo: 'elegirDesafios', texto: 'Elegir desafíos' } : null };
  }
  return { texto: `Suma a ${listaNombres(activos)}`, activos, accion: null };
}

// Números de hoy desde el resumen de movimiento (puede no estar disponible).
function numerosHoy(movimiento) {
  const hoy = movimiento?.status === 'disponible' ? movimiento.datos?.hoy : null;
  if (!hoy) return null;
  return {
    actividades: Number.isFinite(hoy.km_actividades) ? hoy.km_actividades : Number(hoy.km_movimiento) || 0,
    salud: Number.isFinite(hoy.km_health_adicional) ? hoy.km_health_adicional : 0,
    pasos: hoy.pasos == null ? null : Number(hoy.pasos),
  };
}

// Cómo registrar si ya usás otra app o reloj: de lo más cómodo a lo menos.
const OPCIONES_REGISTRO = [
  { id: 'strava', titulo: 'Conectala a Strava', texto: 'Strava es una app gratuita para registrar entrenamientos. Garmin, Coros, Polar, Suunto y la mayoría de los relojes y apps se conectan con Strava, y desde ahí tus salidas llegan solas a Korva. ¿No la tenés? Bajala gratis y conectá tu reloj o app.' },
  { id: 'manual', titulo: 'O cargala a mano', texto: 'Seguí usando tu reloj o app de siempre y, al terminar, cargá la salida en Registrar → Manual con los km y el tiempo.' },
  { id: 'gps', titulo: '¿No usás ninguna?', texto: 'Grabá con Korva GPS desde Iniciar.' },
];

function textoPasos(pasos) {
  if (pasos == null) return 'Sin lectura de pasos hoy';
  return `${fmt(pasos, 0)} pasos hoy · los pasos no se convierten en km`;
}

module.exports = { OPCIONES_REGISTRO, fmt, listaNombres, estadoSaludTarjeta, numerosHoy, textoPasos };
