// Relieve real del Camino de Santiago (MDT500 del IGN + costa + Encoro de
// Belesar), preparado por tools/mapa3d/preparar_relieve_camino.py. Sólo se usa
// al hornear y en las pruebas: la app recibe el resultado ya horneado.
const fs = require('fs');
const path = require('path');

const meta = require('./caminoSantiago.relieve.json');

let cache = null;
function cargar() {
  if (cache) return cache;
  const buf = fs.readFileSync(path.join(__dirname, 'caminoSantiago.relieve.bin'));
  const n = meta.nx * meta.nz;
  const alturas = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + n * 2));
  const agua = new Uint8Array(buf.buffer.slice(buf.byteOffset + n * 2, buf.byteOffset + n * 3));
  const niveles = Object.fromEntries(Object.entries(meta.nivelesAguaM).map(([k, v]) => [Number(k), v]));
  cache = { alturas, agua, niveles };
  return cache;
}

// Bilineal en alturas; el agua se toma de la celda más cercana. Fuera de la
// grilla se repite el borde (mar al norte y oeste; tierra al sur y este).
function crearMuestreo() {
  const { alturas, agua, niveles } = cargar();
  const { nx, nz, minX, minZ, pasoKm } = meta;
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  return (x, z) => {
    const fx = lim((x - minX) / pasoKm, 0, nx - 1);
    const fz = lim((z - minZ) / pasoKm, 0, nz - 1);
    const i = Math.min(nx - 2, Math.floor(fx));
    const j = Math.min(nz - 2, Math.floor(fz));
    const tx = fx - i; const tz = fz - j;
    const k = j * nx + i;
    const h = (alturas[k] * (1 - tx) + alturas[k + 1] * tx) * (1 - tz)
      + (alturas[k + nx] * (1 - tx) + alturas[k + nx + 1] * tx) * tz;
    const c = agua[Math.round(fz) * nx + Math.round(fx)];
    return { h, agua: c ? niveles[c] : -Infinity };
  };
}

function conRelieveReal(escena) {
  if (escena.centro.lat !== meta.centro.lat || escena.centro.lon !== meta.centro.lon) {
    throw new Error('El relieve real se preparó para otro centro de escena');
  }
  return { ...escena, relieve: { ...escena.relieve, real: { fuente: meta.fuente, muestrear: crearMuestreo() } } };
}

module.exports = { conRelieveReal, meta };
