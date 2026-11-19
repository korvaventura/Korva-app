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
    return { texto: 'Sin conectar · sumá tu caminata del día', activos: [],
      accion: { tipo: 'conectarSalud', texto: 'Sumar distancia de Salud (opcional)' } };
  }
  if (!aportes || aportes.disponible === false) {
    return { texto: 'Conectada · sólo para tu resumen', activos: [], accion: null };
  }
  const activos = (aportes.desafios || []).filter((d) => d.activo).map((d) => d.titulo);
  if (!activos.length) {
    const hay = (aportes.desafios || []).length > 0;
    return { texto: 'Conectada · no suma a desafíos', activos,
      accion: hay ? { tipo: 'elegirDesafios', texto: 'Elegir a qué desafíos suma Salud' } : null };
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

function textoPasos(pasos) {
  if (pasos == null) return 'Sin lectura de pasos hoy';
  return `${fmt(pasos, 0)} pasos hoy · los pasos no se convierten en km`;
}

module.exports = { fmt, listaNombres, estadoSaludTarjeta, numerosHoy, textoPasos };
