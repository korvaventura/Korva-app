// Ubicación de etiquetas 2D sobre el diorama: evita superposiciones entre
// nombres de checkpoints y respeta los bordes del mapa. Pura y testeable.

const ANCHO_LETRA = 7.6; // px aprox. para 10px bold con tracking 1.1
const ALTO_ETIQUETA = 26;
const MARGEN = 6;

function anchoEstimado(texto) {
  return Math.max(36, String(texto || '').length * ANCHO_LETRA + 4);
}

function seSuperponen(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// items: [{ id, x, y, texto, prioridad }] con (x, y) = centro del pin en px.
// Devuelve { [id]: { lado, x, y, w, h } } con la caja de la etiqueta.
function ubicarEtiquetas(items, ancho, alto, { radioPin = 9, ocupados = [], ocultarSiNoCabe = false } = {}) {
  const cajas = [...ocupados];
  items.forEach((it) => cajas.push({ x: it.x - radioPin, y: it.y - radioPin, w: radioPin * 2, h: radioPin * 2 }));
  const orden = [...items].sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0));
  const salida = {};
  for (const it of orden) {
    const w = anchoEstimado(it.texto);
    const h = ALTO_ETIQUETA;
    const candidatos = [
      { lado: 'derecha', x: it.x + radioPin + 5, y: it.y - h / 2 },
      { lado: 'izquierda', x: it.x - radioPin - 5 - w, y: it.y - h / 2 },
      { lado: 'arriba', x: it.x - w / 2, y: it.y - radioPin - 4 - h },
      { lado: 'abajo', x: it.x - w / 2, y: it.y + radioPin + 4 },
      { lado: 'derecha', x: it.x + radioPin + 5, y: it.y - h - 2 },
      { lado: 'derecha', x: it.x + radioPin + 5, y: it.y + 2 },
    ];
    const dentro = (c) => c.x >= MARGEN && c.y >= MARGEN && c.x + w <= ancho - MARGEN && c.y + h <= alto - MARGEN;
    const libre = (c) => !cajas.some((o) => seSuperponen({ ...c, w, h }, o));
    let elegido = candidatos.find((c) => dentro(c) && libre(c));
    if (!elegido && ocultarSiNoCabe) continue;
    if (!elegido) elegido = candidatos.find((c) => dentro(c)) || candidatos[0];
    const caja = { lado: elegido.lado, x: elegido.x, y: elegido.y, w, h };
    cajas.push(caja);
    salida[it.id] = caja;
  }
  return salida;
}

module.exports = { ubicarEtiquetas, anchoEstimado, seSuperponen };
