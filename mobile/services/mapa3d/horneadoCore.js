// Serialización compacta del diorama horneado. Pura y sin dependencias:
// Hermes no tiene JIT, así que el terreno se genera offline (scripts/hornearMapa3D.js)
// y en el teléfono solo se decodifica.

const { crearProyeccion, muestrearBilineal } = require('./terrenoCore');

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const INVERSO = new Uint8Array(128);
for (let i = 0; i < ALFABETO.length; i += 1) INVERSO[ALFABETO.charCodeAt(i)] = i;

function bytesABase64(bytes) {
  let salida = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    salida += ALFABETO[a >> 2] + ALFABETO[((a & 3) << 4) | (b >> 4)];
    salida += i + 1 < bytes.length ? ALFABETO[((b & 15) << 2) | (c >> 6)] : '=';
    salida += i + 2 < bytes.length ? ALFABETO[c & 63] : '=';
  }
  return salida;
}

function base64ABytes(texto) {
  let largo = (texto.length / 4) * 3;
  if (texto.endsWith('==')) largo -= 2;
  else if (texto.endsWith('=')) largo -= 1;
  const bytes = new Uint8Array(largo);
  let p = 0;
  for (let i = 0; i < texto.length; i += 4) {
    const a = INVERSO[texto.charCodeAt(i)];
    const b = INVERSO[texto.charCodeAt(i + 1)];
    const c = INVERSO[texto.charCodeAt(i + 2)];
    const d = INVERSO[texto.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    if (p < largo) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < largo) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

// v2: grilla graduada (ejes xs/zs explícitos) y agua como índice de cuerpo (Uint8).
const VERSION = 2;

function serializarDiorama(datos) {
  const { campo, colores, ruta } = datos;
  const n = campo.nx * campo.nz;
  const aguas = campo.geo.aguas.map((a) => ({ id: a.id, nivelM: a.nivelM, caja: a.caja }));
  // Solo las escenas marinas usan la tabla explícita; conserva el formato anterior.
  const niveles = campo.geo.mar
    ? [...new Set(Array.from(campo.agua).filter(Number.isFinite))].sort((a, b) => a - b)
    : aguas.map((a) => a.nivelM);
  const nauticos = ruta.some((p) => p.nautico);
  const alturas = new Int16Array(n);
  const agua = new Uint8Array(n);
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    alturas[i] = Math.round(clampI16(campo.alturas[i]));
    agua[i] = campo.agua[i] > -Infinity ? niveles.indexOf(campo.agua[i]) + 1 : 0;
  }
  for (let i = 0; i < n * 3; i += 1) rgb[i] = Math.round(colores[i] * 255);
  const r = (v, d = 3) => Number(v.toFixed(d));
  return {
    version: VERSION,
    nx: campo.nx,
    nz: campo.nz,
    xs: bytesABase64(new Uint8Array(Float32Array.from(campo.xs).buffer)),
    zs: bytesABase64(new Uint8Array(Float32Array.from(campo.zs).buffer)),
    alturas: bytesABase64(new Uint8Array(alturas.buffer)),
    agua: bytesABase64(agua),
    colores: bytesABase64(rgb),
    ruta: ruta.map((p) => [...[r(p.x), r(p.z), r(p.h, 1), r(p.km, 3)], ...(nauticos ? [p.nautico ? 1 : 0] : [])]),
    ...(campo.geo.mar ? { niveles } : {}),
    aguas,
  };
}

const clampI16 = (v) => Math.max(-32000, Math.min(32000, v));

// Little-endian en ambos lados (V8/Hermes en ARM/x86 son LE).
function deserializarDiorama(escena, h) {
  if (h.version !== VERSION) throw new Error(`Horneado v${h.version} incompatible: correr node scripts/hornearMapa3D.js`);
  const n = h.nx * h.nz;
  const niveles = h.niveles ?? h.aguas.map((a) => a.nivelM);
  const xs = new Float32Array(base64ABytes(h.xs).buffer);
  const zs = new Float32Array(base64ABytes(h.zs).buffer);
  const alturasI = new Int16Array(base64ABytes(h.alturas).buffer);
  const aguaI = base64ABytes(h.agua);
  const rgb = base64ABytes(h.colores);
  const alturas = new Float32Array(n);
  const agua = new Float32Array(n);
  const colores = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    alturas[i] = alturasI[i];
    agua[i] = aguaI[i] === 0 ? -Infinity : niveles[aguaI[i] - 1];
  }
  for (let i = 0; i < n * 3; i += 1) colores[i] = rgb[i] / 255;
  const campo = {
    nx: h.nx,
    nz: h.nz,
    xs,
    zs,
    minX: xs[0],
    maxX: xs[h.nx - 1],
    minZ: zs[0],
    maxZ: zs[h.nz - 1],
    alturas,
    agua,
    geo: { proy: crearProyeccion(escena.centro), aguas: h.aguas },
  };
  campo.muestrear = (x, z) => muestrearBilineal(campo, x, z);
  const ruta = h.ruta.map(([x, z, alt, km, nautico]) => ({ x, z, h: alt, km, ...(nautico == null ? {} : { nautico: nautico === 1 }) }));
  return { campo, colores, ruta };
}

module.exports = { bytesABase64, base64ABytes, serializarDiorama, deserializarDiorama };
