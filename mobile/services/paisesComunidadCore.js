// Banderas y nombres de país para Comunidad → Por país.
// El país llega como texto libre de la dirección de envío (a veces en inglés
// o sin tildes), así que se compara normalizado y se unifica el nombre.

const PAISES = [
  ['Argentina', '🇦🇷', ['argentina']],
  ['Colombia', '🇨🇴', ['colombia']],
  ['Uruguay', '🇺🇾', ['uruguay']],
  ['España', '🇪🇸', ['espana', 'spain', 'espagne']],
  ['Ecuador', '🇪🇨', ['ecuador']],
  ['México', '🇲🇽', ['mexico']],
  ['Costa Rica', '🇨🇷', ['costa rica']],
  ['Chile', '🇨🇱', ['chile']],
  ['Estados Unidos', '🇺🇸', ['estados unidos', 'usa', 'eeuu', 'ee uu', 'united states', 'united states of america', 'us']],
  ['Perú', '🇵🇪', ['peru']],
  ['Puerto Rico', '🇵🇷', ['puerto rico']],
  ['Venezuela', '🇻🇪', ['venezuela']],
  ['República Dominicana', '🇩🇴', ['republica dominicana', 'dominican republic']],
  ['Panamá', '🇵🇦', ['panama']],
  ['Brasil', '🇧🇷', ['brasil', 'brazil']],
  ['Australia', '🇦🇺', ['australia']],
  ['El Salvador', '🇸🇻', ['el salvador']],
  ['Guatemala', '🇬🇹', ['guatemala']],
  ['Paraguay', '🇵🇾', ['paraguay']],
  ['Bolivia', '🇧🇴', ['bolivia']],
  ['Cuba', '🇨🇺', ['cuba']],
  ['Honduras', '🇭🇳', ['honduras']],
  ['Nicaragua', '🇳🇮', ['nicaragua']],
  ['Alemania', '🇩🇪', ['alemania', 'germany', 'deutschland']],
  ['Italia', '🇮🇹', ['italia', 'italy']],
  ['Francia', '🇫🇷', ['francia', 'france']],
  ['Aruba', '🇦🇼', ['aruba']],
  ['Curazao', '🇨🇼', ['curazao', 'curacao']],
  ['Corea del Sur', '🇰🇷', ['corea del sur', 'south korea', 'korea']],
  ['Croacia', '🇭🇷', ['croacia', 'croatia', 'hrvatska']],
  ['Portugal', '🇵🇹', ['portugal']],
  ['Reino Unido', '🇬🇧', ['reino unido', 'united kingdom', 'uk', 'inglaterra', 'england']],
  ['Canadá', '🇨🇦', ['canada']],
  ['Suiza', '🇨🇭', ['suiza', 'switzerland']],
  ['Países Bajos', '🇳🇱', ['paises bajos', 'holanda', 'netherlands']],
  ['Irlanda', '🇮🇪', ['irlanda', 'ireland']],
  ['Nueva Zelanda', '🇳🇿', ['nueva zelanda', 'new zealand']],
  ['Japón', '🇯🇵', ['japon', 'japan']],
];

function normalizar(texto) {
  return String(texto ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.\s]+/g, ' ').trim();
}

const POR_ALIAS = new Map();
for (const [nombre, bandera, alias] of PAISES) {
  for (const a of [nombre, ...alias]) POR_ALIAS.set(normalizar(a), { nombre, bandera });
}

function paisConocido(pais) {
  return POR_ALIAS.get(normalizar(pais)) || null;
}

function banderaDe(pais) {
  return paisConocido(pais)?.bandera || '🏳️';
}

// Une filas del mismo país escritas distinto ("Spain" + "España") y ordena por cantidad.
function unirPaises(lista = []) {
  const porNombre = new Map();
  for (const item of lista) {
    if (!item || typeof item.pais !== 'string') continue;
    const nombre = paisConocido(item.pais)?.nombre || item.pais.trim();
    const previo = porNombre.get(nombre);
    porNombre.set(nombre, { pais: nombre, cantidad: (previo?.cantidad || 0) + (Number(item.cantidad) || 0) });
  }
  return [...porNombre.values()].sort((a, b) => b.cantidad - a.cantidad || a.pais.localeCompare(b.pais, 'es'));
}

module.exports = { normalizar, paisConocido, banderaDe, unirPaises };
