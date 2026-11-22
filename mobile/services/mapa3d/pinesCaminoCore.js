// Separa sólo las cabezas del HUD; las bases y el trazado siguen en su lugar.
function separarPinesCamino(pines, ancho, alto, minimo = 28) {
  const salida = pines.map(p => ({ ...p, cabeza: { ...p.cabeza } }));
  const anclas = pines.map(p => ({ ...p.cabeza }));
  const visibles = salida.map((p, i) => p.cabeza.visible && p.base.visible ? i : -1).filter(i => i >= 0);
  const limitar = i => {
    const p = salida[i].cabeza, a = anclas[i];
    const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
    if (d > 48) { p.x = a.x + dx * 48 / d; p.y = a.y + dy * 48 / d; }
    p.x = Math.max(16, Math.min(ancho - 16, p.x));
    p.y = Math.max(16, Math.min(alto - 16, p.y));
  };
  for (let vuelta = 0; vuelta < 24; vuelta++) {
    let choque = false;
    for (let ai = 0; ai < visibles.length; ai++) for (let bi = ai + 1; bi < visibles.length; bi++) {
      const ia = visibles[ai], ib = visibles[bi], a = salida[ia].cabeza, b = salida[ib].cabeza;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= minimo - .1) continue;
      if (d < .001) { const ang = (ia + ib * 3) * 2.399963; dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
      const empuje = (minimo - Math.hypot(b.x - a.x, b.y - a.y)) / 2;
      a.x -= dx / d * empuje; a.y -= dy / d * empuje;
      b.x += dx / d * empuje; b.y += dy / d * empuje;
      limitar(ia); limitar(ib); choque = true;
    }
    if (!choque) break;
  }
  return salida;
}
module.exports = { separarPinesCamino };
