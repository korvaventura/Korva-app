// Reloj único para ruta, contador y rótulos. Las paradas cercanas también se leen.
function crearReplayHitos(checkpoints, metaKm, duracionMs = 25000) {
  const meta = Math.max(0, Number(metaKm) || 0);
  const paradas = checkpoints.map(cp => ({ ...cp, kmJourney: cp.kmFisico ?? cp.km }))
    .filter(cp => Number.isFinite(cp.kmJourney) && cp.kmJourney >= 0 && cp.kmJourney <= meta)
    .sort((a, b) => a.kmJourney - b.kmJourney);
  const tramos = [];
  let tiempo = 0, anterior = 0;
  const agregar = (desde, hasta, ms) => {
    tramos.push({ inicio: tiempo, fin: tiempo + ms, desde, hasta });
    tiempo += ms;
  };
  // Preserva el ritmo general, reservando lectura para cada hito alcanzado.
  const viajeMs = Math.max(6000, duracionMs - paradas.length * 850);
  for (const cp of paradas) {
    if (cp.kmJourney > anterior) agregar(anterior, cp.kmJourney,
      Math.max(450, viajeMs * (cp.kmJourney - anterior) / (meta || 1)));
    agregar(cp.kmJourney, cp.kmJourney, 850);
    anterior = cp.kmJourney;
  }
  if (meta > anterior) agregar(anterior, meta, Math.max(450, viajeMs * (meta - anterior) / (meta || 1)));
  return { tramos, duracionMs: tiempo, metaKm: meta, paradas };
}

function kmEnReplay(plan, tiempoMs) {
  const tramo = plan.tramos.find(t => tiempoMs < t.fin);
  if (!tramo) return plan.metaKm;
  const t = Math.max(0, Math.min(1, (tiempoMs - tramo.inicio) / (tramo.fin - tramo.inicio)));
  const suave = t * t * (3 - 2 * t);
  return tramo.desde + (tramo.hasta - tramo.desde) * suave;
}

function rotulosReplay(journey) {
  const actual = journey.checkpoints.filter(cp => cp.estadoJourney === 'conquistado').at(-1) || null;
  return { actual, siguiente: journey.siguiente };
}

module.exports = { crearReplayHitos, kmEnReplay, rotulosReplay };
