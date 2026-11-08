const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const copiar = c => ({ ...c, objetivo: [...c.objetivo] });
function cajaProyectada(puntos) {
  const visibles = puntos.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!visibles.length) return null;
  return { minX: Math.min(...visibles.map(p => p.x)), maxX: Math.max(...visibles.map(p => p.x)),
    minY: Math.min(...visibles.map(p => p.y)), maxY: Math.max(...visibles.map(p => p.y)) };
}
// Se ejecuta sólo al abrir, cambiar tamaño o tocar General, no en cada frame.
function resolverGeneralCamino(proyectar, inicial, ancho, alto) {
  const top = Math.min(138, alto * .22), bottom = Math.min(90, alto * .14);
  const destinoY = (bottom - top) / alto;
  const limiteX = 1 - 2 * Math.min(36, ancho * .09) / ancho;
  const altoDisponible = 2 * (alto - top - bottom) / alto;
  const centrar = zoom => {
    const c = { ...copiar(inicial), zoom };
    for (let it = 0; it < 6; it++) {
      const b = cajaProyectada(proyectar(c));
      if (!b) return c;
      const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
      const ex = -cx, ey = destinoY - cy;
      if (Math.abs(ex) + Math.abs(ey) < .001) break;
      const paso = .05, x = copiar(c), z = copiar(c); x.objetivo[0] += paso; z.objetivo[2] += paso;
      const bx = cajaProyectada(proyectar(x)), bz = cajaProyectada(proyectar(z));
      const j00 = ((bx.minX + bx.maxX) / 2 - cx) / paso, j01 = ((bz.minX + bz.maxX) / 2 - cx) / paso;
      const j10 = ((bx.minY + bx.maxY) / 2 - cy) / paso, j11 = ((bz.minY + bz.maxY) / 2 - cy) / paso;
      const det = j00 * j11 - j01 * j10;
      if (Math.abs(det) < 1e-8) break;
      c.objetivo[0] += clamp((ex * j11 - j01 * ey) / det, -1.5, 1.5);
      c.objetivo[2] += clamp((j00 * ey - ex * j10) / det, -1.5, 1.5);
    }
    return c;
  };
  let lo = .55, hi = 1.4;
  for (let it = 0; it < 13; it++) {
    const zoom = (lo + hi) / 2, c = centrar(zoom), b = cajaProyectada(proyectar(c));
    if (!b) return copiar(inicial);
    if (b.maxX - b.minX <= limiteX * 2 && b.maxY - b.minY <= altoDisponible) hi = zoom;
    else lo = zoom;
  }
  return centrar(hi * 1.025);
}
// Sólo para gestos manuales. Replay y cámaras de monumentos no se recalculan.
function limitarVistaCamino(control, camara, general) {
  const c = copiar({ ...control, objetivo: control.objetivo || general.objetivo });
  c.zoom = clamp(c.zoom || 1, camara.zoomMin, Math.max(camara.zoomExploracionMax ?? camara.zoomMax, general.zoom));
  const detalle = c.zoom < .1;
  const base = camara.elevacionGrados * Math.PI / 180;
  c.elevacion = clamp(c.elevacion || 0, (detalle ? 20 : 35) * Math.PI / 180 - base, 70 * Math.PI / 180 - base);
  const amplitud = clamp((.9 - c.zoom) / .7, 0, 1);
  const rx = 2.2 + amplitud * 12, rz = 2 + amplitud * 11;
  const dx = c.objetivo[0] - general.objetivo[0], dz = c.objetivo[2] - general.objetivo[2];
  const radio = Math.hypot(dx / rx, dz / rz);
  if (radio > 1) { c.objetivo[0] = general.objetivo[0] + dx / radio; c.objetivo[2] = general.objetivo[2] + dz / radio; }
  c.objetivo[0] = clamp(c.objetivo[0], -10.5, 16);
  c.objetivo[2] = clamp(c.objetivo[2], -12, 12);
  return c;
}
module.exports = { resolverGeneralCamino, limitarVistaCamino };
