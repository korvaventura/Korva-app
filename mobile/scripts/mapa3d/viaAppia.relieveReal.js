// Relieve real de la Vía Appia (NOAA DEM Global Mosaic + costa y lagos de
// Natural Earth), preparado por tools/mapa3d/preparar_appia.py. Sólo se usa al
// hornear y en las pruebas: la app recibe el resultado ya horneado.
//
// Dos grillas de la misma fuente: corredor a 0,8 km y contexto a 2 km. Cada
// una tiene una pirámide de niveles promediados: el muestreo elige el nivel
// según el tamaño local de la celda de la malla, así el territorio lejano
// conserva su relieve real sin vetas ni aliasing, y nunca se estira un borde.
const fs = require('fs');
const path = require('path');
const { crearGrilla } = require('../../services/mapa3d/terrenoCore');

const meta = require('./viaAppia.relieve.json');

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Pirámide: nivel k = promedio de bloques 2^k (alturas); el agua se conserva
// sólo en el nivel 0 (código por celda) y se deriva del nivel de altura.
function crearPiramide(alturas, nx, nz, niveles) {
  const out = [{ h: Float32Array.from(alturas), nx, nz, f: 1 }];
  for (let k = 1; k < niveles; k += 1) {
    const p = out[k - 1];
    const mx = Math.ceil(p.nx / 2); const mz = Math.ceil(p.nz / 2);
    const h = new Float32Array(mx * mz);
    for (let j = 0; j < mz; j += 1) for (let i = 0; i < mx; i += 1) {
      let s = 0; let n = 0;
      for (let dj = 0; dj < 2; dj += 1) for (let di = 0; di < 2; di += 1) {
        const ii = 2 * i + di; const jj = 2 * j + dj;
        if (ii < p.nx && jj < p.nz) { s += p.h[jj * p.nx + ii]; n += 1; }
      }
      h[j * mx + i] = s / n;
    }
    out.push({ h, nx: mx, nz: mz, f: p.f * 2 });
  }
  return out;
}

function cargar() {
  const buf = fs.readFileSync(path.join(__dirname, 'viaAppia.relieve.bin'));
  let o = 0;
  const tomar = (Tipo, n) => {
    const bytes = n * Tipo.BYTES_PER_ELEMENT;
    const v = new Tipo(buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + bytes));
    o += bytes; return v;
  };
  const grilla = (g) => {
    const n = g.nx * g.nz;
    const alturas = tomar(Int16Array, n); const agua = tomar(Uint8Array, n);
    return { ...g, maxX: g.minX + (g.nx - 1) * g.pasoKm, maxZ: g.minZ + (g.nz - 1) * g.pasoKm, agua, piramide: crearPiramide(alturas, g.nx, g.nz, 6) };
  };
  const detalle = grilla(meta.detalle);
  const contexto = grilla(meta.contexto);
  if (o !== buf.length) throw new Error('viaAppia.relieve.bin no coincide con su metadato');
  const niveles = Object.fromEntries(meta.lagos.map((l) => [l.codigo, l.nivelM]));
  return { detalle, contexto, niveles };
}

// Bilineal en un nivel de la pirámide (coordenadas en km locales).
function bilineal(g, nivel, x, z) {
  const p = g.piramide[nivel];
  const paso = g.pasoKm * p.f;
  // El centro de un bloque 2^k está desplazado medio bloque menos medio paso.
  const off = (p.f - 1) * g.pasoKm / 2;
  const fx = clamp((x - g.minX - off) / paso, 0, p.nx - 1);
  const fz = clamp((z - g.minZ - off) / paso, 0, p.nz - 1);
  const i = Math.min(p.nx - 2, Math.floor(fx)); const j = Math.min(p.nz - 2, Math.floor(fz));
  const tx = fx - i; const tz = fz - j; const k = j * p.nx + i;
  return (p.h[k] * (1 - tx) + p.h[k + 1] * tx) * (1 - tz) + (p.h[k + p.nx] * (1 - tx) + p.h[k + p.nx + 1] * tx) * tz;
}

function alturaGrilla(g, x, z, celdaKm) {
  const nivel = clamp(Math.log2(Math.max(1, celdaKm / g.pasoKm)), 0, g.piramide.length - 1);
  const a = Math.floor(nivel); const b = Math.min(g.piramide.length - 1, a + 1); const t = nivel - a;
  const ha = bilineal(g, a, x, z);
  return t > 0 ? ha + (bilineal(g, b, x, z) - ha) * t : ha;
}

const codigo = (g, x, z) => {
  const i = clamp(Math.round((x - g.minX) / g.pasoKm), 0, g.nx - 1);
  const j = clamp(Math.round((z - g.minZ) / g.pasoKm), 0, g.nz - 1);
  return g.agua[j * g.nx + i];
};
const dentro = (g, x, z) => x >= g.minX && x <= g.maxX && z >= g.minZ && z <= g.maxZ;

// Tamaño local de celda de la malla horneada: la pirámide filtra en
// consecuencia (una celda de 20 km promedia 20 km de relieve real).
function crearCelda(escena) {
  const { xs, zs } = crearGrilla(escena);
  const busca = (eje, v) => {
    let lo = 0; let hi = eje.length - 1;
    if (v <= eje[0]) return 0; if (v >= eje[hi]) return hi - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (eje[m] <= v) lo = m; else hi = m; }
    return lo;
  };
  return (x, z) => {
    const i = busca(xs, x); const j = busca(zs, z);
    return Math.max(xs[i + 1] - xs[i], zs[j + 1] - zs[j]);
  };
}

const MARGEN_DETALLE_KM = 30; // fundido gradual corredor -> contexto

function crearMuestreo(escena) {
  const { detalle, contexto, niveles } = cargar();
  const celda = crearCelda(escena);
  const { xs, zs } = crearGrilla(escena);
  for (const [x, z] of [[xs[0], zs[0]], [xs[xs.length - 1], zs[zs.length - 1]]]) {
    if (!dentro(contexto, x, z)) throw new Error('El contexto NOAA de Vía Appia no cubre toda la malla');
  }
  return (x, z) => {
    const c = celda(x, z);
    let h = alturaGrilla(contexto, x, z, c);
    let cod = codigo(contexto, x, z);
    if (dentro(detalle, x, z)) {
      const borde = Math.min(x - detalle.minX, detalle.maxX - x, z - detalle.minZ, detalle.maxZ - z);
      const w = smooth(0, MARGEN_DETALLE_KM, borde);
      if (w > 0) {
        h += (alturaGrilla(detalle, x, z, c) - h) * w;
        if (w > 0.5) cod = codigo(detalle, x, z);
      }
    }
    // Lagos interiores: nivel propio y lecho por debajo. Mar y lagunas: nivel 0,
    // decidido por el signo de la altura ya compuesta (costa coherente con la malla).
    if (cod >= 2 && niveles[cod] != null) {
      return { h: Math.min(h, niveles[cod] - 4), agua: niveles[cod] };
    }
    return { h, agua: h < 0 ? 0 : -Infinity };
  };
}

function conRelieveReal(escena) {
  if (escena.centro.lat !== meta.centro.lat || escena.centro.lon !== meta.centro.lon) {
    throw new Error('El relieve real de Vía Appia se preparó para otro centro de escena');
  }
  return { ...escena, relieve: { ...escena.relieve, real: { fuente: meta.fuente, muestrear: crearMuestreo(escena) } } };
}

module.exports = { conRelieveReal, meta, cargar, alturaGrilla };
