// Núcleo puro del Journey Engine de Korva.
// Convierte progreso + definición de escena en un estado visual reutilizable.
// No depende de React Native ni Three: cada desafío aporta sus datos.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function normalizarCheckpoints(checkpoints = [], distanciaKm = 0) {
  return checkpoints.map((cp, i) => ({
    ...cp,
    kmJourney: Number.isFinite(cp.kmFisico)
      ? cp.kmFisico
      : Number.isFinite(cp.km)
        ? cp.km
        : (distanciaKm * i) / Math.max(1, checkpoints.length - 1),
  }));
}

function estadoJourney({ checkpoints = [], kmProgreso = 0, distanciaKm = 0, completado = false }) {
  const total = Math.max(0, Number(distanciaKm) || 0);
  const actual = completado ? total : clamp(Number(kmProgreso) || 0, 0, total);
  const cps = normalizarCheckpoints(checkpoints, total);
  let siguiente = null;
  const estados = cps.map((cp) => {
    const conquistado = cp.kmJourney <= actual + 0.01;
    if (!conquistado && !siguiente) siguiente = cp;
    return { ...cp, estadoJourney: conquistado ? 'conquistado' : 'bloqueado' };
  });
  if (siguiente) {
    const i = estados.findIndex((cp) => cp.id === siguiente.id);
    estados[i] = { ...estados[i], estadoJourney: 'proximo' };
    siguiente = estados[i];
  }
  return {
    kmActual: actual,
    porcentaje: total > 0 ? actual / total : 0,
    checkpoints: estados,
    siguiente,
    kmHastaSiguiente: siguiente ? Math.max(0, siguiente.kmJourney - actual) : 0,
  };
}

module.exports = { clamp, normalizarCheckpoints, estadoJourney };
