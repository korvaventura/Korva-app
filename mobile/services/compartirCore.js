// Núcleo puro de las imágenes para compartir: nombre de la foto de fondo de
// cada desafío, paleta de color, formato de números y la línea del recorrido.
// Sin React: se prueba con node --test.

const SUPABASE_URL = 'https://yvlpnshfqwkpcftotltb.supabase.co';
const CARPETA_FONDOS = 'compartir';

const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// "Monte Fuji 68K" -> "monte-fuji"; "San Andrés 57K" -> "san-andres".
// Es el nombre del archivo que se sube a Storage → compartir (<slug>.jpg).
function slugDesafio(titulo) {
  const limpio = sinAcentos(titulo).toLowerCase()
    .replace(/\b\d+(?:[.,]\d+)?\s*k(?:m)?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (limpio.startsWith('islandia')) return 'islandia';
  return limpio;
}

// Primero .jpg (más liviano); si no está, .png.
function urlsFondo(titulo, base = SUPABASE_URL) {
  const slug = slugDesafio(titulo);
  return slug ? ['jpg', 'png'].map((ext) => `${base}/storage/v1/object/public/${CARPETA_FONDOS}/${slug}.${ext}`) : [];
}
function urlFondo(titulo, base = SUPABASE_URL) {
  return urlsFondo(titulo, base)[0] || null;
}

// Paleta sobria por desafío: fondo apagado + un solo acento. Se usa cuando
// el desafío todavía no tiene foto, y el acento también va sobre la foto.
const PALETA_KORVA = { fondo: '#0E1520', texto: '#F4F1EA', suave: '#8C96A6', linea: '#26303F', acento: '#F36B0A' };
const PALETAS = {
  'monte-fuji': { fondo: '#161A26', texto: '#F4EFE6', suave: '#868B9A', linea: '#2A2F3E', acento: '#D9473C' },
  'camino-de-santiago': { fondo: '#13233B', texto: '#F2EFE8', suave: '#8796AD', linea: '#2A3C57', acento: '#E2B54A' },
  'fin-del-mundo': { fondo: '#101C24', texto: '#EEF3F4', suave: '#83969F', linea: '#22343E', acento: '#6FC3D9' },
  'san-andres': { fondo: '#0D2229', texto: '#F1F6F2', suave: '#7F9B9A', linea: '#1D3A42', acento: '#2EC4B6' },
  dubrovnik: { fondo: '#1A1C24', texto: '#F5EFE6', suave: '#8E8C93', linea: '#2E2F3A', acento: '#E0703A' },
  'via-appia': { fondo: '#1D1A17', texto: '#F3EDE3', suave: '#958B7E', linea: '#332E28', acento: '#C9A15B' },
  islandia: { fondo: '#111A20', texto: '#EFF3F4', suave: '#86959E', linea: '#233039', acento: '#7FD1AE' },
};

function paletaDesafio(titulo) {
  return PALETAS[slugDesafio(titulo)] || PALETA_KORVA;
}

const coma = (n, dec) => Number(n).toFixed(dec).replace('.', ',');

// 8.2 -> "8,2"; 12.46 -> "12,5"; 105 -> "105". Sin ceros de más.
function formatoKm(km) {
  const v = Math.max(0, Number(km) || 0);
  if (v >= 100) return String(Math.round(v));
  const t = coma(v, v < 10 ? 2 : 1);
  return t.replace(/,?0+$/, '') || '0';
}

function formatoDuracion(segundos) {
  const s = Math.max(0, Math.round(Number(segundos) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

// Ritmo (min/km) o velocidad (km/h) en bici. null si no hay datos.
function formatoRitmo(km, segundos, deporte) {
  const k = Number(km) || 0, s = Number(segundos) || 0;
  if (!(k > 0) || !(s > 0)) return null;
  if (deporte === 'ride') return { valor: coma(k / (s / 3600), 1), unidad: 'km/h' };
  const t = Math.round(s / k);
  return { valor: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, unidad: '/km' };
}

// Cuánto del desafío había antes de la salida y cuánto después (0..1).
// El progreso que llega ya incluye la salida, así que "antes" = total − salida.
function avanceDesafio(reto, kmSalida) {
  const total = Number(reto?.distancia_total) || 0;
  const ahora = Number(reto?.km_completados) || 0;
  if (!(total > 0)) return null;
  const despues = Math.min(1, Math.max(0, ahora / total));
  const antes = Math.min(despues, Math.max(0, (ahora - (Number(kmSalida) || 0)) / total));
  return { antes, despues, kmAhora: ahora, total };
}

function interpolar(puntos, km) {
  if (km <= puntos[0].km) return puntos[0];
  const ult = puntos[puntos.length - 1];
  if (km >= ult.km) return ult;
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1], b = puntos[i];
    if (km <= b.km) {
      const t = b.km > a.km ? (km - a.km) / (b.km - a.km) : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, km };
    }
  }
  return ult;
}

// Línea del recorrido del desafío encajada en una caja W×H: la ruta entera,
// lo ya hecho y el tramo de esta salida, como paths SVG. puntos = [{x,z,km}].
function trazadoDesafio(puntos, antes, despues, W, H, { pad = 6, maxPuntos = 220 } = {}) {
  const pts = (puntos || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.z) && Number.isFinite(p?.km));
  if (pts.length < 2) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const ancho = Math.max(maxX - minX, 1e-6), alto = Math.max(maxZ - minZ, 1e-6);
  const s = Math.min((W - 2 * pad) / ancho, (H - 2 * pad) / alto);
  const ox = (W - ancho * s) / 2, oz = (H - alto * s) / 2;
  const xy = (p) => [+(ox + (p.x - minX) * s).toFixed(1), +(oz + (p.z - minZ) * s).toFixed(1)];
  const total = pts[pts.length - 1].km;
  const tramo = (desde, hasta) => {
    if (!(hasta > desde)) return [];
    const dentro = pts.filter((p) => p.km > desde && p.km < hasta);
    const paso = Math.max(1, Math.ceil(dentro.length / maxPuntos));
    return [interpolar(pts, desde), ...dentro.filter((_, i) => i % paso === 0), interpolar(pts, hasta)].map(xy);
  };
  const d = (arr) => (arr.length >= 2 ? `M${arr.map((q) => q.join(' ')).join(' L')}` : '');
  const kA = Math.min(1, Math.max(0, antes)) * total;
  const kB = Math.min(1, Math.max(0, despues)) * total;
  const [px, py] = xy(interpolar(pts, kB));
  return { base: d(tramo(0, total)), hecho: d(tramo(0, kA)), hoy: d(tramo(kA, kB)), punto: { x: px, y: py } };
}

// Traza GPS propia (sin desafío): mismos paths a partir de {x,y} ya proyectados.
function trazadoPlano(proyectados) {
  const pts = (proyectados || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  if (pts.length < 2) return null;
  const d = `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}`;
  const u = pts[pts.length - 1];
  return { base: '', hecho: '', hoy: d, punto: { x: u.x, y: u.y } };
}

// Islandia (ruta libre) no viene en el progreso de desafíos: la sumamos como
// opción para compartir si la salida es posterior a cuando la empezó.
const ISLANDIA = { id: '3b211caf-ee16-54c8-a93c-343a5eb2d57e', titulo: 'Islandia · Ring Road', km: 1400 };
function retoIslandia(participacion, actividad) {
  const p = participacion;
  if (!p || p.abandonado || !p.started_at || !actividad?.recorded_at) return null;
  if (new Date(actividad.recorded_at) < new Date(p.started_at)) return null;
  return { challenge_id: ISLANDIA.id, challenge: ISLANDIA.titulo, km_completados: Number(p.km) || 0, distancia_total: ISLANDIA.km, libre: true };
}

// Aviso de Strava: { tipo: 'compartir_actividad', external_id } -> la salida de la lista.
function actividadDeAviso(data, actividades) {
  if (!data || data.tipo !== 'compartir_actividad' || !data.external_id) return null;
  return (Array.isArray(actividades) ? actividades : [])
    .find((a) => a && String(a.external_id) === String(data.external_id) && a.excluida !== true) || null;
}

module.exports = {
  ISLANDIA, retoIslandia, actividadDeAviso,
  SUPABASE_URL, CARPETA_FONDOS, PALETA_KORVA, PALETAS,
  slugDesafio, urlFondo, urlsFondo, paletaDesafio, formatoKm, formatoDuracion, formatoRitmo, avanceDesafio, trazadoDesafio, trazadoPlano,
};
