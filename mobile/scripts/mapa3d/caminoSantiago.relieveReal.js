// Relieve real del Camino de Santiago (MDT500 del IGN + costa + Encoro de
// Belesar), preparado por tools/mapa3d/preparar_relieve_camino.py. Sólo se usa
// al hornear y en las pruebas: la app recibe el resultado ya horneado.
const fs = require('fs');
const path = require('path');

const meta = require('./caminoSantiago.relieve.json');
const europa = require('./caminoSantiago.europa.json');
const bytesEuropa = Buffer.from(europa.alturas, 'base64');
const alturasEuropa = new Int16Array(bytesEuropa.buffer.slice(bytesEuropa.byteOffset, bytesEuropa.byteOffset + bytesEuropa.byteLength));
const pesosIGN = Buffer.from(europa.detalle.pesosIGN, 'base64');
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

// Cobertura real continua: IGN en el Camino, NOAA en Portugal, Francia y
// el resto del contexto. No hay relleno procedural ni máscara de costa recortada.
// Este módulo sólo se ejecuta al hornear; la app recibe el resultado final.
function interpolar(grilla, datos, x, z) {
  const fx = (x - datos.minX) / datos.pasoKm, fz = (z - datos.minZ) / datos.pasoKm;
  if (fx < 0 || fz < 0 || fx > datos.nx - 1 || fz > datos.nz - 1) throw new Error('Cobertura de Europa insuficiente para el terreno');
  const i = Math.min(datos.nx - 2, Math.floor(fx)), j = Math.min(datos.nz - 2, Math.floor(fz));
  const tx = fx - i, tz = fz - j, k = j * datos.nx + i;
  return (grilla[k] * (1 - tx) + grilla[k + 1] * tx) * (1 - tz)
    + (grilla[k + datos.nx] * (1 - tx) + grilla[k + datos.nx + 1] * tx) * tz;
}
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
    const maxX = minX + (nx - 1) * pasoKm;
    const maxZ = minZ + (nz - 1) * pasoKm;
    const dentroIGN = x >= minX && x <= maxX && z >= minZ && z <= maxZ;
    const peso = dentroIGN ? interpolar(pesosIGN, europa.detalle, x, z) / 255 : 0;
    if (peso >= .999999) return { h, agua: c ? niveles[c] : -Infinity };
    // Batimetría acotada al fondo visible; conserva el cruce real de nivel 0.
    const global = Math.max(-80, interpolar(alturasEuropa, europa, x, z));
    const alturaFinal = global + (h - global) * peso;
    return { h: alturaFinal, agua: alturaFinal < 0 ? 0 : -Infinity };
  };
}

function conRelieveReal(escena) {
  if (escena.centro.lat !== meta.centro.lat || escena.centro.lon !== meta.centro.lon) {
    throw new Error('El relieve real se preparó para otro centro de escena');
  }
  return { ...escena, relieve: { ...escena.relieve, real: { fuente: meta.fuente, muestrear: crearMuestreo(escena) } } };
}

module.exports = { conRelieveReal, meta };
