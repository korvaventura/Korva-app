// Recorrido guiado: pasos y geometría pura (sin React) para poder probarla.

// pantalla: pestaña donde está el elemento. tab: resaltar el botón de la barra.
const PASOS = [
  { id: 'desafio', pantalla: 'Mis Retos', titulo: 'Tu desafío',
    texto: 'Acá ves cuántos km llevás, tu próximo hito y "Explorar ruta" para abrir el mapa de tu recorrido.' },
  { id: 'mundi', stack: 'KorvaMundi', titulo: 'Korva Mundi',
    texto: 'Todos los desafíos en un mismo planeta. Girá el globo con el dedo y tocá un punto para ver ese desafío. Desde cualquier mapa podés alejarte hasta acá.' },
  { id: 'comoSumas', pantalla: 'Mis Retos', titulo: 'Tres formas de sumar km',
    texto: 'Conectando una app, con Korva GPS o con carga manual: las tres suman igual. Usá la que te quede más cómoda, una sola por salida. Te mostramos cada una.' },
  { id: 'conectar', objetivo: 'strava', pantalla: 'Perfil',
    titulo: (d) => (d?.garmin ? 'Forma 1 · Conectá Strava o Garmin' : 'Forma 1 · Conectá Strava'),
    texto: (d) => (d?.garmin
      ? 'Si ya registrás tus salidas en Strava o Garmin, conectá una y llegan solas, sin cargar nada. No es obligatorio: si no usás ninguna, sumá con Korva GPS o carga manual.'
      : 'Si ya registrás tus salidas en Strava, conectala y llegan solas, sin cargar nada. No es obligatorio: si no la usás, sumá con Korva GPS o carga manual.') },
  { id: 'registrar-gps', objetivo: 'registrar', pantalla: 'Registrar', titulo: 'Forma 2 · Korva GPS',
    texto: 'Grabás tu salida con el teléfono, sin instalar nada más: tocás Iniciar y salís.' },
  { id: 'gps-mapa', stack: 'GpsTracker', titulo: 'Forma 2 · Mirate avanzar',
    texto: 'Lo propio de Korva GPS: mientras grabás te ves avanzar en vivo por el mapa de tu desafío, con el próximo hito y los km de hoy. Deslizá para pasar de Datos a Mapa.' },
  { id: 'registrar-manual', objetivo: 'registrar', pantalla: 'Registrar', titulo: 'Forma 3 · Carga manual',
    texto: '¿Saliste con tu reloj u otra app que no está conectada? Elegí Manual y cargá los km y el tiempo de esa salida.' },
  { id: 'actividades', pantalla: 'Perfil', titulo: 'Tus actividades',
    texto: 'Si una salida se cargó dos veces, borrala acá con la papelera.' },
  { id: 'direccion', pantalla: 'Perfil', titulo: 'Dirección de envío',
    texto: 'Cuando completes un desafío, estos datos le llegan a nuestro equipo para enviarte la medalla. No son públicos: los demás participantes no los ven.' },
  { id: 'tab-Catalogo', tab: 'Catalogo', titulo: 'Catálogo',
    texto: 'Elegí tu próxima aventura. Islandia es una ruta libre, sin costo.' },
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

// El globito va abajo del elemento si hay lugar; si no, arriba; si el elemento
// es muy alto y no entra en ningún lado, abajo de la pantalla. Sin elemento: centrado.
function posicionGlobo(rect, pantalla, altoGlobo = 170, margen = 14) {
  if (!rect) return { top: Math.max(60, (pantalla.height - altoGlobo) / 2) };
  const abajo = rect.y + rect.height + margen;
  if (abajo + altoGlobo < pantalla.height - 20) return { top: abajo };
  const arriba = rect.y - margen - altoGlobo;
  if (arriba >= 50) return { top: arriba };
  return { top: Math.max(50, pantalla.height - altoGlobo - 110) };
}

// Botón de la barra inferior: mismas columnas que dibuja la barra de pestañas.
function rectTab(indice, total, pantalla, insetInferior = 0, altoBarra = 49) {
  const ancho = pantalla.width / Math.max(1, total);
  return { x: indice * ancho, y: pantalla.height - insetInferior - altoBarra, width: ancho, height: altoBarra };
}

// ¿Hace falta desplazar? Si el elemento no queda cómodo a la vista, devuelve
// cuánto mover para dejarlo siempre en el mismo lugar: arriba, con el globito abajo.
function desplazamientoNecesario(rect, pantalla, { arriba = 90, abajo = 160 } = {}) {
  if (!rect) return 0;
  const limiteAbajo = pantalla.height - abajo;
  if (rect.y >= arriba - 10 && rect.y + Math.min(rect.height, pantalla.height * 0.5) <= limiteAbajo) return 0;
  return rect.y - arriba;
}

// Usuario nuevo (cuenta de menos de 3 días): recorrido automático. El resto: se le ofrece una vez.
function modoInicioTour({ creadoEn, visto, ofrecido, ahora = Date.now() }) {
  if (visto) return null;
  const creado = Date.parse(creadoEn || '');
  if (Number.isFinite(creado) && ahora - creado < 3 * 86400000) return 'auto';
  return ofrecido ? null : 'ofrecer';
}

// Título y texto pueden depender de lo que tiene la persona (p. ej. si le aparece Garmin).
function textoPaso(paso, datos = {}) {
  const leer = (v) => (typeof v === 'function' ? v(datos) : v);
  return { titulo: leer(paso?.titulo) || '', texto: leer(paso?.texto) || '' };
}

// ¿Se movió el elemento lo suficiente como para redibujar el recuadro?
function rectCambio(a, b, tolerancia = 2) {
  if (!a || !b) return a !== b;
  return ['x', 'y', 'width', 'height'].some((k) => Math.abs(a[k] - b[k]) > tolerancia);
}

module.exports = { textoPaso, rectCambio, PASOS, huecoOverlay, posicionGlobo, rectTab, desplazamientoNecesario, modoInicioTour };
