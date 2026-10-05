// Gestos incrementales: cambiar de cantidad de dedos vuelve a fijar la base.
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
function muestraGesto(touches) {
  const ts = Array.from(touches || []).slice(0, 2).sort((a, b) => (a.identifier ?? 0) - (b.identifier ?? 0));
  if (!ts.length) return null;
  const [a, b] = ts;
  return { ids: ts.map((t) => t.identifier ?? 0).join(','), n: ts.length,
    x: b ? (a.pageX + b.pageX) / 2 : a.pageX,
    y: b ? (a.pageY + b.pageY) / 2 : a.pageY,
    distancia: b ? Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY) : 0,
    angulo: b ? Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX) : 0 };
}
function avanzarGesto(control, anterior, actual, { ancho, alto, elevacionBase }) {
  if (!anterior || !actual || anterior.ids !== actual.ids || anterior.n !== actual.n) return { control, pan: null };
  const dx = actual.x - anterior.x; const dy = actual.y - anterior.y;
  if (actual.n === 1) return { control: { ...control,
    azimut: (control.azimut || 0) - dx * Math.PI / Math.max(1, ancho),
    elevacion: limitar((control.elevacion || 0) + dy * 0.9 / Math.max(1, alto), 8 * Math.PI / 180 - elevacionBase, 75 * Math.PI / 180 - elevacionBase),
  }, pan: null };
  let giro = actual.angulo - anterior.angulo;
  giro = Math.atan2(Math.sin(giro), Math.cos(giro));
  return { control: { ...control,
    zoom: limitar((control.zoom || 1) * Math.max(1, anterior.distancia) / Math.max(1, actual.distancia), 0.5, 1.7),
    azimut: (control.azimut || 0) + giro,
  }, pan: { dx, dy } };
}
module.exports = { muestraGesto, avanzarGesto };
