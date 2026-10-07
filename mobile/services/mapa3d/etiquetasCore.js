// Ubicación de etiquetas 2D sobre el diorama: evita superposiciones entre
// nombres de checkpoints y respeta los bordes del mapa. Pura y testeable.

const ANCHO_LETRA = 8.6; // margen conservador para mayúsculas, bold y tracking 1.1
const ALTO_ETIQUETA = 26;
const MARGEN = 6;

function anchoEstimado(texto) {
  return Math.max(36, String(texto || '').length * ANCHO_LETRA + 16);
}

function medidasEtiqueta(texto, ancho) {
  const estimado = anchoEstimado(texto);
  const w = Math.min(estimado, 240, Math.max(36, ancho - MARGEN * 2));
  return { w, h: estimado > w ? 42 : ALTO_ETIQUETA };
}

function seSuperponen(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// items: [{ id, x, y, texto, prioridad }] con (x, y) = centro del pin en px.
// Devuelve { [id]: { lado, x, y, w, h } } con la caja de la etiqueta.
function ubicarEtiquetas(items, ancho, alto, { radioPin = 9, ocupados = [], ocultarSiNoCabe = false, preferidas = {} } = {}) {
  const cajas = [...ocupados];
  items.forEach((it) => cajas.push({ x: it.x - radioPin, y: it.y - radioPin, w: radioPin * 2, h: radioPin * 2 }));
  const orden = [...items].sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0));
  const salida = {};
  for (const it of orden) {
    const { w, h } = medidasEtiqueta(it.texto, ancho);
    const candidatos = [
      { lado: 'derecha', x: it.x + radioPin + 5, y: it.y - h / 2 },
      { lado: 'izquierda', x: it.x - radioPin - 5 - w, y: it.y - h / 2 },
      { lado: 'arriba', x: it.x - w / 2, y: it.y - radioPin - 4 - h },
      { lado: 'abajo', x: it.x - w / 2, y: it.y + radioPin + 4 },
      { lado: 'derecha', x: it.x + radioPin + 5, y: it.y - h - 2 },
      { lado: 'derecha', x: it.x + radioPin + 5, y: it.y + 2 },
    ];
    // Keep the previous offset while it still fits: names follow their pin
    // instead of switching sides at every small camera movement.
    const previa=preferidas[it.id];
    if(previa) candidatos.unshift({lado:previa.lado,x:it.x+previa.dx,y:it.y+previa.dy});
    // Cerca del borde el nombre puede quedar arriba/abajo del pin sin salir
    // de pantalla. Las alternativas verticales permiten títulos de dos líneas.
    const centrado = Math.max(MARGEN, Math.min(ancho - MARGEN - w, it.x - w / 2));
    candidatos.push(...[-1, 1].flatMap((signo) => [0, 14, 28, 42].map((extra) => ({
      lado: signo < 0 ? 'arriba' : 'abajo', x: centrado,
      y: signo < 0 ? it.y - radioPin - 4 - h - extra : it.y + radioPin + 4 + extra,
    }))));
    const acotarX = (x) => Math.max(MARGEN, Math.min(ancho - MARGEN - w, x));
    for (const paso of [18, 36, 54, 72, 90, 108, 126]) {
      candidatos.push(
        { lado: 'derecha', x: acotarX(it.x + radioPin + 5 + paso), y: it.y - h / 2 },
        { lado: 'izquierda', x: acotarX(it.x - radioPin - 5 - w - paso), y: it.y - h / 2 },
        ...[-1, 1].flatMap((signo) => [centrado, acotarX(it.x + radioPin + 5), acotarX(it.x - radioPin - 5 - w)].map((x) => ({
          lado: signo < 0 ? 'arriba' : 'abajo', x,
          y: signo < 0 ? it.y - radioPin - 4 - h - paso : it.y + radioPin + 4 + paso,
        }))),
      );
    }
    const dentro = (c) => c.x >= MARGEN && c.y >= MARGEN && c.x + w <= ancho - MARGEN && c.y + h <= alto - MARGEN;
    const libre = (c) => !cajas.some((o) => seSuperponen({ ...c, w, h }, o));
    let elegido = candidatos.find((c) => dentro(c) && libre(c));
    if (!elegido && ocultarSiNoCabe) {
      // Última opción: buscar un hueco cercano entre controles y otros nombres.
      // Una guía une la caja desplazada con su pin en la vista.
      let mejor = Infinity;
      for (let y = MARGEN; y <= alto - MARGEN - h; y += 14) {
        for (let x = MARGEN; x <= ancho - MARGEN - w; x += 14) {
          const d = Math.hypot(x + w / 2 - it.x, y + h / 2 - it.y);
          if (d > 200 || d >= mejor) continue;
          const c = { lado: 'arriba', x, y };
          if (libre(c)) { elegido = c; mejor = d; }
        }
      }
      if (!elegido) continue;
    }
    if (!elegido) elegido = candidatos.find((c) => dentro(c)) || candidatos[0];
    const caja = { lado: elegido.lado, x: elegido.x, y: elegido.y, w, h };
    cajas.push(caja);
    salida[it.id] = caja;
  }
  return salida;
}

// Presentation only: keep route anchors untouched while separating tappable heads.
function separarPinesCercanos(pines, grupos, ancho, alto, minimo = 64) {
  if (!grupos?.length) return pines;
  const salida=pines.map(p=>({...p,cabeza:{...p.cabeza}}));
  for(const [idA,idB] of grupos || []) {
    const a=salida.find(p=>p.cp.id===idA),b=salida.find(p=>p.cp.id===idB);
    if(!a?.cabeza.visible || !b?.cabeza.visible || !a.base.visible || !b.base.visible)continue;
    let dx=b.cabeza.x-a.cabeza.x,dy=b.cabeza.y-a.cabeza.y;
    const distancia=Math.hypot(dx,dy);if(distancia>=minimo)continue;
    if(distancia<.001){dx=1;dy=0;}else{dx/=distancia;dy/=distancia;}
    const radio=minimo/2, margen=24;
    const limitar=(v,t,r)=>Math.max(margen+r,Math.min(t-margen-r,v));
    const x=limitar((a.cabeza.x+b.cabeza.x)/2,ancho,Math.abs(dx)*radio);
    const y=limitar((a.cabeza.y+b.cabeza.y)/2,alto,Math.abs(dy)*radio);
    a.cabeza.x=x-dx*radio;a.cabeza.y=y-dy*radio;
    b.cabeza.x=x+dx*radio;b.cabeza.y=y+dy*radio;
  }
  return salida;
}
module.exports = { ubicarEtiquetas, anchoEstimado, medidasEtiqueta, seSuperponen, separarPinesCercanos };
