const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const copiar = c => ({ ...c, objetivo: [...c.objetivo] });
function cajaProyectada(puntos) {
  const visibles = puntos.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!visibles.length) return null;
  return { minX: Math.min(...visibles.map(p => p.x)), maxX: Math.max(...visibles.map(p => p.x)),
    minY: Math.min(...visibles.map(p => p.y)), maxY: Math.max(...visibles.map(p => p.y)) };
}
// Se ejecuta sólo al abrir, cambiar tamaño o tocar General, no en cada frame.
function resolverGeneralCamino(proyectar, inicial, ancho, alto, opciones = {}) {
  const top = opciones.top ?? Math.min(138, alto * .22), bottom = opciones.bottom ?? Math.min(90, alto * .14);
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
  let lo = opciones.zoomMin ?? .55, hi = opciones.zoomMax ?? 1.4;
  for (let it = 0; it < 13; it++) {
    const zoom = (lo + hi) / 2, c = centrar(zoom), b = cajaProyectada(proyectar(c));
    if (!b) return copiar(inicial);
    if (b.maxX - b.minX <= limiteX * 2 && b.maxY - b.minY <= altoDisponible) hi = zoom;
    else lo = zoom;
  }
  return centrar(hi * (opciones.margenZoom ?? 1.025));
}
// Límites por defecto: los aprobados para el Camino. Cada escena puede
// declarar los suyos en territorio.limitesGestos (unidades de escena).
const LIMITES_CAMINO = { caja: { minX: -10.5, maxX: 16, minZ: -12, maxZ: 12 }, radio: { x: [2.2, 12], z: [2, 11] } };
// Sólo para gestos manuales. Replay y cámaras de monumentos no se recalculan.
function limitarVistaCamino(control, camara, general, limites = LIMITES_CAMINO) {
  const { caja, radio: elipse } = limites;
  const c = copiar({ ...control, objetivo: control.objetivo || general.objetivo });
  c.zoom = clamp(c.zoom || 1, camara.zoomMin, Math.max(camara.zoomExploracionMax ?? camara.zoomMax, general.zoom));
  const detalle = c.zoom < .1;
  const base = camara.elevacionGrados * Math.PI / 180;
  c.elevacion = clamp(c.elevacion || 0, (detalle ? 20 : 35) * Math.PI / 180 - base, 70 * Math.PI / 180 - base);
  const amplitud = clamp((.9 - c.zoom) / .7, 0, 1);
  const rx = elipse.x[0] + amplitud * elipse.x[1], rz = elipse.z[0] + amplitud * elipse.z[1];
  const dx = c.objetivo[0] - general.objetivo[0], dz = c.objetivo[2] - general.objetivo[2];
  const radio = Math.hypot(dx / rx, dz / rz);
  if (radio > 1) { c.objetivo[0] = general.objetivo[0] + dx / radio; c.objetivo[2] = general.objetivo[2] + dz / radio; }
  c.objetivo[0] = clamp(c.objetivo[0], caja.minX, caja.maxX);
  c.objetivo[2] = clamp(c.objetivo[2], caja.minZ, caja.maxZ);
  return c;
}
module.exports = { resolverGeneralCamino, limitarVistaCamino, LIMITES_CAMINO };
