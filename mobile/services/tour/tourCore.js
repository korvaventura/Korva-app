// Recorrido guiado: pasos y geometría pura (sin React) para poder probarla.

// pantalla: pestaña donde está el elemento. tab: resaltar el botón de la barra.
const PASOS = [
  { id: 'desafio', pantalla: 'Mis Retos', titulo: 'Tu desafío',
    texto: 'Acá ves cuántos km llevás, tu próximo hito y "Explorar ruta" para abrir el mapa de tu recorrido.' },
  { id: 'comoSumas', pantalla: 'Mis Retos', titulo: 'Cómo sumás km',
    texto: '¿Usás Strava, Garmin u otra app? Acá ves cómo conectarla. Usá una sola forma por salida.' },
  { id: 'mundi', stack: 'KorvaMundi', titulo: 'Korva Mundi',
    texto: 'Todos los desafíos en un mismo planeta. Girá el globo con el dedo y tocá un punto para ver ese desafío. Desde cualquier mapa podés alejarte hasta acá.' },
  { id: 'registrar', pantalla: 'Registrar', titulo: 'Cargá tus km',
    texto: 'GPS: grabá tu salida con el teléfono y mirate avanzar en el mapa. Manual: cargá una salida que hiciste con tu reloj u otra app.' },
  { id: 'tab-Catalogo', tab: 'Catalogo', titulo: 'Catálogo',
    texto: 'Elegí tu próxima aventura. Islandia es una ruta libre, sin costo.' },
  { id: 'actividades', pantalla: 'Perfil', titulo: 'Tus actividades',
    texto: 'Si una salida se cargó dos veces, borrala acá con la papelera.' },
  { id: 'direccion', pantalla: 'Perfil', titulo: 'Dirección de envío',
    texto: 'Cuando completes un desafío, estos datos le llegan a nuestro equipo para enviarte la medalla. No son públicos: los demás participantes no los ven.' },
  { id: 'fin', titulo: '¡Listo!', texto: 'Ya sabés moverte por Korva. Podés volver a ver este recorrido desde el botón "?" del Inicio.' },
];

// Cuatro rectángulos oscuros alrededor del hueco (con margen) que deja ver el elemento.
function huecoOverlay(rect, pantalla, margen = 8) {
  const W = pantalla.width; const H = pantalla.height;
  if (!rect) return [{ x: 0, y: 0, w: W, h: H }];
  const x0 = Math.max(0, rect.x - margen); const y0 = Math.max(0, rect.y - margen);
  const x1 = Math.min(W, rect.x + rect.width + margen); const y1 = Math.min(H, rect.y + rect.height + margen);
  return [
    { x: 0, y: 0, w: W, h: y0 },
    { x: 0, y: y1, w: W, h: Math.max(0, H - y1) },
    { x: 0, y: y0, w: x0, h: y1 - y0 },
    { x: x1, y: y0, w: Math.max(0, W - x1), h: y1 - y0 },
  ];
}

// El globito va abajo del elemento si hay lugar; si no, arriba. Sin elemento: centrado.
function posicionGlobo(rect, pantalla, altoGlobo = 170, margen = 14) {
  if (!rect) return { top: Math.max(60, (pantalla.height - altoGlobo) / 2) };
  const abajo = rect.y + rect.height + margen;
  if (abajo + altoGlobo < pantalla.height - 20) return { top: abajo };
  return { top: Math.max(50, rect.y - margen - altoGlobo) };
}

// Botón de la barra inferior: mismas columnas que dibuja la barra de pestañas.
function rectTab(indice, total, pantalla, insetInferior = 0, altoBarra = 49) {
  const ancho = pantalla.width / Math.max(1, total);
  return { x: indice * ancho, y: pantalla.height - insetInferior - altoBarra, width: ancho, height: altoBarra };
}

// ¿Hace falta desplazar para que el elemento quede cómodo a la vista?
function desplazamientoNecesario(rect, pantalla, { arriba = 90, abajo = 160 } = {}) {
  if (!rect) return 0;
  const limiteAbajo = pantalla.height - abajo;
  if (rect.y >= arriba && rect.y + Math.min(rect.height, pantalla.height * 0.5) <= limiteAbajo) return 0;
  return rect.y - pantalla.height * 0.28;
}

// Usuario nuevo (cuenta de menos de 3 días): recorrido automático. El resto: se le ofrece una vez.
function modoInicioTour({ creadoEn, visto, ofrecido, ahora = Date.now() }) {
  if (visto) return null;
  const creado = Date.parse(creadoEn || '');
  if (Number.isFinite(creado) && ahora - creado < 3 * 86400000) return 'auto';
  return ofrecido ? null : 'ofrecer';
}

module.exports = { PASOS, huecoOverlay, posicionGlobo, rectTab, desplazamientoNecesario, modoInicioTour };
