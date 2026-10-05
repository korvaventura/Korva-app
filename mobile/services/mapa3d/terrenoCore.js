// Núcleo puro del motor de dioramas 3D de Korva.
// No importa three ni React Native: genera alturas, colores, sombras horneadas y
// la ruta muestreada en arrays planos. Así se puede testear en Node y reutilizar
// para otros desafíos cambiando solamente la definición de escena.
//
// Convenciones:
//   - Coordenadas de trabajo en km: x = este, z = sur (norte = -z).
//   - Alturas en metros sobre el nivel del mar.
//   - La escena 3D usa 1 unidad = escena.kmPorUnidad km y exageración vertical.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Mínimo suave polinomial (iq): une valle y montaña sin aristas.
const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
};

// ── Ruido de gradiente determinístico ──────────────────────────────────────
function crearRuido(semilla = 1337) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) p[i] = i;
  let s = semilla >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = p[i & 255];
  const gx = new Float32Array(8);
  const gz = new Float32Array(8);
  for (let i = 0; i < 8; i += 1) {
    gx[i] = Math.cos((i * Math.PI) / 4);
    gz[i] = Math.sin((i * Math.PI) / 4);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, z) => gx[h & 7] * x + gz[h & 7] * z;

  const perlin = (x, z) => {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;
    const X = xi & 255;
    const Z = zi & 255;
    const aa = perm[perm[X] + Z];
    const ab = perm[perm[X] + Z + 1];
    const ba = perm[perm[X + 1] + Z];
    const bb = perm[perm[X + 1] + Z + 1];
    const u = fade(xf);
    const v = fade(zf);
    const x1 = lerp(grad(aa, xf, zf), grad(ba, xf - 1, zf), u);
    const x2 = lerp(grad(ab, xf, zf - 1), grad(bb, xf - 1, zf - 1), u);
    return lerp(x1, x2, v) * 1.41; // ~[-1, 1]
  };

  const fbm = (x, z, octavas = 5) => {
    let suma = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < octavas; o += 1) {
      suma += amp * perlin(x * f, z * f);
      f *= 2.03;
      amp *= 0.5;
    }
    return suma;
  };

  // Multifractal "ridged": crestas afiladas tipo cordillera glaciaria.
  const crestas = (x, z, octavas = 5) => {
    let suma = 0;
    let amp = 0.5;
    let f = 1;
    let peso = 1;
    let norm = 0;
    for (let o = 0; o < octavas; o += 1) {
      let r = 1 - Math.abs(perlin(x * f, z * f));
      r *= r;
      r *= peso;
      peso = clamp(r * 1.6, 0, 1);
      suma += r * amp;
      norm += amp;
      f *= 2.1;
      amp *= 0.52;
    }
    return suma / norm; // [0, 1]
  };

  return { perlin, fbm, crestas };
}

// ── Geografía ──────────────────────────────────────────────────────────────
const KM_POR_GRADO_LAT = 111.2;

function crearProyeccion(centro) {
  const kmLon = KM_POR_GRADO_LAT * Math.cos((centro.lat * Math.PI) / 180);
  return {
    aKm: (lat, lon) => ({ x: (lon - centro.lon) * kmLon, z: -(lat - centro.lat) * KM_POR_GRADO_LAT }),
  };
}

// Distancia de un punto a una polilínea; devuelve también el parámetro de
// longitud acumulada del punto más cercano.
function distanciaPolilinea(px, pz, pts, acum) {
  let mejor = Infinity;
  let mejorS = 0;
  let mejorI = 0;
  let mejorT = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1e-9;
    const t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / len2, 0, 1);
    const qx = a.x + dx * t - px;
    const qz = a.z + dz * t - pz;
    const d = qx * qx + qz * qz;
    if (d < mejor) {
      mejor = d;
      mejorI = i;
      mejorT = t;
      if (acum) mejorS = acum[i] + (acum[i + 1] - acum[i]) * t;
    }
  }
  return { d: Math.sqrt(mejor), s: mejorS, i: mejorI, t: mejorT };
}

function longitudesAcumuladas(pts) {
  const acum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i += 1) {
    acum[i] = acum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  }
  return acum;
}

// Interpolación lineal por tramos de una tabla [[clave, valor], ...] ordenada.
function interpolarTabla(tabla, clave) {
  if (clave <= tabla[0][0]) return tabla[0][1];
  for (let i = 1; i < tabla.length; i += 1) {
    if (clave <= tabla[i][0]) {
      const [k0, v0] = tabla[i - 1];
      const [k1, v1] = tabla[i];
      return lerp(v0, v1, (clave - k0) / (k1 - k0 || 1));
    }
  }
  return tabla[tabla.length - 1][1];
}

// Prepara la ruta: puntos en km + mapeo longitud geométrica -> km del desafío.
// Los waypoints con `km` son anclas: así un checkpoint de km 45 cae exactamente
// en el Paso Garibaldi aunque el trazado geométrico mida distinto.
function prepararRuta(escena, proy) {
  const pts = escena.ruta.map((w) => ({ ...proy.aKm(w.lat, w.lon), km: w.km }));
  const acum = longitudesAcumuladas(pts);
  const anclas = [];
  pts.forEach((p, i) => { if (Number.isFinite(p.km)) anclas.push([acum[i], p.km]); });
  if (!anclas.length || anclas[0][0] !== 0) anclas.unshift([0, 0]);
  const largo = acum[acum.length - 1];
  if (anclas[anclas.length - 1][0] !== largo) anclas.push([largo, escena.distanciaKm]);
  const kmDeS = (s) => interpolarTabla(anclas, s);
  const sDeKm = (km) => interpolarTabla(anclas.map(([s, k]) => [k, s]), km);
  return { pts, acum, largo, kmDeS, sDeKm };
}

function prepararAguas(escena, proy) {
  return escena.aguas.map((agua) => {
    const pts = agua.eje.map(([lat, lon, ancho]) => ({ ...proy.aKm(lat, lon), ancho }));
    const acum = longitudesAcumuladas(pts);
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    pts.forEach((p) => {
      minX = Math.min(minX, p.x - p.ancho); maxX = Math.max(maxX, p.x + p.ancho);
      minZ = Math.min(minZ, p.z - p.ancho); maxZ = Math.max(maxZ, p.z + p.ancho);
    });
    const orilla = agua.orillaKm ?? 2;
    return {
      ...agua,
      pts,
      acum,
      caja: { minX: minX - orilla, maxX: maxX + orilla, minZ: minZ - orilla, maxZ: maxZ + orilla },
    };
  });
}

// Distancia con signo al borde de un cuerpo de agua (negativa = adentro).
function distanciaAgua(agua, x, z, ruido) {
  const { d, i, t } = distanciaPolilinea(x, z, agua.pts, null);
  const a = agua.pts[i];
  const b = agua.pts[Math.min(i + 1, agua.pts.length - 1)];
  const ancho = lerp(a.ancho, b.ancho, t);
  // Costa irregular: fiordos y caletas suaves.
  const costa = ruido.fbm(x * 0.22 + 11.3, z * 0.22 - 4.1, 3) * (agua.irregularidadKm ?? 0.8);
  return d - ancho + costa;
}

// ── Función de altura ──────────────────────────────────────────────────────
function crearFuncionAltura(escena) {
  const proy = crearProyeccion(escena.centro);
  const ruido = crearRuido(escena.semilla);
  const ruta = prepararRuta(escena, proy);
  const aguas = prepararAguas(escena, proy);
  const relieve = escena.relieve;
  const picos = (relieve.picos || []).map((p) => ({ ...p, ...proy.aKm(p.lat, p.lon) }));
  const perfil = escena.perfilRuta; // [[km, metros], ...]

  const montana = (x, z) => {
    // Distorsión de dominio: rompe la regularidad del ruido.
    const wx = x + 5.5 * ruido.fbm(x * 0.045 + 3.1, z * 0.045 - 1.7, 3);
    const wz = z + 3.5 * ruido.fbm(x * 0.045 - 8.2, z * 0.045 + 5.9, 3);

    let h = 0;
    for (const faja of relieve.fajas) {
      // Centro de la faja variable con x para que la cordillera no sea una regla.
      const cz = faja.centroZ + (faja.inclinacion || 0) * x + 2.5 * ruido.perlin(x * 0.03, 9.1);
      const dz = Math.abs(wz - cz);
      const banda = 1 - smoothstep(faja.semiAncho - faja.borde, faja.semiAncho + faja.borde, dz);
      if (banda <= 0) continue;
      const amp = interpolarTabla(faja.amplitudPorX, x);
      const cr = ruido.crestas((wx * faja.escalaX) + faja.desfase, (wz * faja.escalaZ) - faja.desfase, 5);
      // Valles transversales de erosión: cortan los cordones en macizos legibles.
      const erosion = smoothstep(0.0, 0.32, Math.abs(ruido.perlin(wx * faja.escalaX * 0.55 + 17.3, wz * 0.05 - 4.4)));
      const masa = 0.32 + 0.68 * smoothstep(faja.semiAncho + faja.borde, 0, dz);
      const relieveFaja = faja.base + (1 - faja.base) * cr * (0.45 + 0.55 * erosion);
      h = Math.max(h, banda * amp * relieveFaja * masa);
    }

    // Llanura/colinas fueguinas al norte: suaves, con turbales planos.
    const colinas = relieve.colinas;
    const lomas = colinas.base + colinas.amp * (0.5 + 0.5 * ruido.fbm(x * 0.07 + 20, z * 0.07 - 20, 4));
    h = Math.max(h, lomas);

    // Picos nombrados: masas reconocibles dentro del mismo campo continuo.
    for (const p of picos) {
      const d = Math.hypot(x - p.x, (z - p.z) * (p.elongacion || 1));
      if (d > p.radioKm * 1.6) continue;
      const k = 1 - smoothstep(0, p.radioKm, d);
      const aristas = 0.75 + 0.25 * ruido.crestas(x * 0.6 + p.x, z * 0.6 - p.z, 3);
      const forma = Math.pow(k, p.agudeza || 1.6) * p.alturaM * aristas;
      h = -smin(-h, -forma, 120); // máximo suave
    }
    return h;
  };

  const altura = (x, z) => {
    let h = montana(x, z);

    // Corredor de la RN3: valle glaciar en U siguiendo la ruta.
    const cr = distanciaPolilinea(x, z, ruta.pts, ruta.acum);
    const piso = interpolarTabla(perfil, ruta.kmDeS(cr.s));
    const corredor = escena.corredor;
    const exceso = Math.max(0, cr.d - corredor.planoKm);
    const valle = piso + corredor.paredM * Math.pow(exceso, corredor.potencia);
    h = smin(h, valle, corredor.suavizadoM);

    // Cuerpos de agua: cuencas talladas + costas que suben desde el nivel.
    let nivelAgua = -Infinity;
    for (const agua of aguas) {
      const c = agua.caja;
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      const d = distanciaAgua(agua, x, z, ruido);
      const orilla = agua.orillaKm ?? 2;
      if (d < 0) {
        const fondo = agua.nivelM - agua.profundidadM * smoothstep(0, -agua.taludKm, d);
        h = Math.min(h, fondo);
        nivelAgua = Math.max(nivelAgua, agua.nivelM);
      } else if (d < orilla) {
        const t = smoothstep(0, orilla, d);
        const costa = agua.nivelM + 4 + d * 18;
        h = lerp(Math.min(h, costa), h, t * t);
        h = Math.max(h, agua.nivelM + 2 + d * 6);
      } else {
        h = Math.max(h, agua.nivelM + 2 + orilla * 6);
      }
    }

    // La ruta nunca queda bajo el agua ni enterrada.
    if (cr.d < corredor.planoKm * 1.6) {
      const t = smoothstep(corredor.planoKm * 1.6, corredor.planoKm * 0.6, cr.d);
      h = lerp(h, Math.max(h, piso), t);
    }

    return { h, nivelAgua };
  };

  return { altura, ruta, aguas, proy, ruido, picos };
}

// ── Heightfield en grilla + horneado de luz y color ───────────────────────
function generarCampo(escena) {
  const t0 = Date.now();
  const geo = crearFuncionAltura(escena);
  const { minX, maxX, minZ, maxZ } = escena.limitesKm;
  const res = escena.resolucionKm;
  const nx = Math.round((maxX - minX) / res) + 1;
  const nz = Math.round((maxZ - minZ) / res) + 1;
  const dx = (maxX - minX) / (nx - 1);
  const dz = (maxZ - minZ) / (nz - 1);
  const alturas = new Float32Array(nx * nz);
  const agua = new Float32Array(nx * nz);

  for (let j = 0; j < nz; j += 1) {
    const z = minZ + j * dz;
    for (let i = 0; i < nx; i += 1) {
      const x = minX + i * dx;
      const { h, nivelAgua } = geo.altura(x, z);
      alturas[j * nx + i] = h;
      agua[j * nx + i] = nivelAgua;
    }
  }

  const campo = { nx, nz, dx, dz, minX, maxX, minZ, maxZ, alturas, agua, geo };
  campo.muestrear = (x, z) => muestrearBilineal(campo, x, z);
  campo.ms = Date.now() - t0;
  return campo;
}

function muestrearBilineal(campo, x, z) {
  const { nx, nz, dx, dz, minX, minZ, alturas } = campo;
  const fx = clamp((x - minX) / dx, 0, nx - 1.0001);
  const fz = clamp((z - minZ) / dz, 0, nz - 1.0001);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const a = alturas[j * nx + i];
  const b = alturas[j * nx + i + 1];
  const c = alturas[(j + 1) * nx + i];
  const d = alturas[(j + 1) * nx + i + 1];
  // Igual que la triangulación de PlaneGeometry (diagonal a-d no; usa b-c).
  if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
  return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}

// Sombras proyectadas por el sol (ray march sobre la grilla) + oclusión ambiental
// por concavidad. Se hornea una sola vez: en el teléfono no hay shadow maps.
function hornearLuz(campo, escena) {
  const { nx, nz, dx, alturas } = campo;
  const exag = escena.exageracion;
  const sol = escena.luz.solDir; // vector hacia el sol (x este, y arriba, z sur)
  const horiz = Math.hypot(sol[0], sol[2]) || 1;
  const pendienteSol = sol[1] / horiz; // subida en km por km horizontal
  const paso = dx * 0.9;
  const sx = (sol[0] / horiz) * paso;
  const sz = (sol[2] / horiz) * paso;
  const sombra = new Float32Array(nx * nz);
  const pasos = Math.ceil(escena.luz.alcanceSombraKm / paso);

  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const idx = j * nx + i;
      const x0 = campo.minX + i * campo.dx;
      const z0 = campo.minZ + j * campo.dz;
      const h0 = alturas[idx] * exag + 6;
      let luz = 1;
      for (let k = 1; k <= pasos; k += 1) {
        const x = x0 + sx * k;
        const z = z0 + sz * k;
        if (x < campo.minX || x > campo.maxX || z < campo.minZ || z > campo.maxZ) break;
        const rayo = h0 + pendienteSol * paso * k * 1000;
        const terreno = muestrearBilineal(campo, x, z) * exag;
        const margen = (rayo - terreno) / (paso * k * 1000 * 0.06); // penumbra
        if (margen < 1) {
          luz = Math.min(luz, Math.max(0, margen));
          if (luz <= 0) break;
        }
      }
      sombra[idx] = luz;
    }
  }

  // Oclusión: altura promedio vecina vs altura propia (box blur separable).
  const r = Math.max(2, Math.round(escena.luz.radioOclusionKm / dx));
  const tmp = new Float32Array(nx * nz);
  const prom = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      let s = 0; let n = 0;
      for (let k = -r; k <= r; k += 1) {
        const ii = clamp(i + k, 0, nx - 1);
        s += alturas[j * nx + ii]; n += 1;
      }
      tmp[j * nx + i] = s / n;
    }
  }
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      let s = 0; let n = 0;
      for (let k = -r; k <= r; k += 1) {
        const jj = clamp(j + k, 0, nz - 1);
        s += tmp[jj * nx + i]; n += 1;
      }
      prom[j * nx + i] = s / n;
    }
  }
  const oclusion = new Float32Array(nx * nz);
  for (let i = 0; i < nx * nz; i += 1) {
    const concavidad = (prom[i] - alturas[i]) / 220; // >0 en valles
    oclusion[i] = clamp(1 - Math.max(0, concavidad) * 0.55 + Math.max(0, -concavidad) * 0.12, 0.45, 1.12);
  }
  return { sombra, oclusion };
}

const hexARgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mezclar = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Colores por vértice (sRGB 0..1): bosque de lenga, turba, roca, nieve, costa.
function colorearTerreno(campo, escena, luz) {
  const { nx, nz, dx, dz, alturas, agua } = campo;
  const pal = {};
  Object.entries(escena.paleta).forEach(([k, v]) => { pal[k] = hexARgb(v); });
  const pisos = escena.pisos;
  const ruido = campo.geo.ruido;
  const colores = new Float32Array(nx * nz * 3);

  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const idx = j * nx + i;
      const h = alturas[idx];
      const x = campo.minX + i * dx;
      const z = campo.minZ + j * dz;
      const hl = alturas[j * nx + Math.max(0, i - 1)];
      const hr = alturas[j * nx + Math.min(nx - 1, i + 1)];
      const hu = alturas[Math.max(0, j - 1) * nx + i];
      const hd = alturas[Math.min(nz - 1, j + 1) * nx + i];
      const pendiente = Math.hypot((hr - hl) / (2 * dx * 1000), (hd - hu) / (2 * dz * 1000)); // m/m real

      const n1 = ruido.fbm(x * 0.35, z * 0.35, 3);
      const n2 = ruido.fbm(x * 1.3 + 40, z * 1.3 - 40, 2);
      const lineaArboles = pisos.lineaArbolesM + n1 * 110;
      const lineaNieve = pisos.lineaNieveM + n1 * 140 + (z - campo.minZ) * pisos.nieveBajaHaciaSurM;

      let c;
      const bajoAgua = agua[idx] > -Infinity && h < agua[idx];
      if (bajoAgua) {
        const prof = clamp((agua[idx] - h) / 60, 0, 1);
        c = mezclar(pal.fondoSomero, pal.fondoProfundo, prof);
      } else {
        // Llanura norte: turba y coirón en tonos oliva/ocre.
        const turba = smoothstep(0.05, 0.35, ruido.fbm(x * 0.18 + 7, z * 0.18 + 3, 3));
        const llano = mezclar(pal.estepa, pal.turba, turba * 0.75);
        // Bosque de lenga con manchas otoñales cerca del límite superior.
        const bosqueBase = mezclar(pal.bosque, pal.bosqueClaro, 0.5 + 0.5 * n2);
        const otono = smoothstep(lineaArboles - 260, lineaArboles - 30, h) * smoothstep(0.1, 0.45, ruido.fbm(x * 0.5 - 9, z * 0.5 + 9, 3));
        const bosque = mezclar(bosqueBase, pal.lengaOtono, otono * pisos.intensidadOtono);
        // Al sur del Fagnano domina el bosque de lenga; al norte solo en lomas.
        const tBosque = smoothstep(pisos.inicioBosqueM - 40, pisos.inicioBosqueM + 60, h) + smoothstep(pisos.bosqueAlSurZ - 3, pisos.bosqueAlSurZ + 1, z) * (0.75 + 0.25 * n2);
        c = mezclar(llano, bosque, clamp(tBosque, 0, 1));
        // Fondos de valle planos: vegas y turbales que abren claros en el bosque.
        if (pal.vega) {
          const plano = 1 - smoothstep(0.04, 0.12, pendiente);
          const vega = plano * smoothstep(0.0, 0.3, ruido.fbm(x * 0.6 + 3, z * 0.6 - 7, 3) + 0.15) * (1 - smoothstep(lineaArboles - 150, lineaArboles, h));
          c = mezclar(c, pal.vega, vega * 0.45);
        }
        // Límite de árboles -> pradera alpina/pedrero -> roca.
        const tAlpino = smoothstep(lineaArboles - 30, lineaArboles + 70, h);
        const alpino = mezclar(pal.pedrero, pal.roca, smoothstep(0.35, 0.8, pendiente));
        c = mezclar(c, alpino, tAlpino);
        // Roca expuesta en paredes fuertes aun dentro del bosque.
        c = mezclar(c, pal.roca, smoothstep(0.55, 0.95, pendiente) * 0.75);
        // Nieve: más en lo alto y en lo plano; la roca empinada no la retiene.
        const tNieve = smoothstep(lineaNieve - 60, lineaNieve + 120, h) * (1 - smoothstep(0.55, 1.05, pendiente) * 0.85);
        c = mezclar(c, pal.nieve, clamp(tNieve, 0, 1));
        // Costa/playa de canto rodado.
        if (agua[idx] === -Infinity) {
          // nada
        }
        const costa = campo.costa ? campo.costa[idx] : 0;
        c = mezclar(c, pal.costa, costa);
      }

      const s = luz.sombra[idx];
      const o = luz.oclusion[idx];
      const sombraTinte = mezclar(pal.sombra, [1, 1, 1], s);
      const f = o * (escena.luz.sombraMin + (1 - escena.luz.sombraMin) * s);
      colores[idx * 3] = clamp(c[0] * f * sombraTinte[0], 0, 1);
      colores[idx * 3 + 1] = clamp(c[1] * f * sombraTinte[1], 0, 1);
      colores[idx * 3 + 2] = clamp(c[2] * f * sombraTinte[2], 0, 1);
    }
  }
  return colores;
}

// Franja costera: celdas de tierra pegadas al agua.
function marcarCosta(campo) {
  const { nx, nz, alturas, agua } = campo;
  const costa = new Float32Array(nx * nz);
  // Nivel de agua más cercano por vecindad (para tierra seca).
  for (let j = 1; j < nz - 1; j += 1) {
    for (let i = 1; i < nx - 1; i += 1) {
      const idx = j * nx + i;
      if (agua[idx] > -Infinity && alturas[idx] < agua[idx]) continue;
      let nivel = -Infinity;
      for (let dj = -1; dj <= 1; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          const n = (j + dj) * nx + i + di;
          if (agua[n] > -Infinity && alturas[n] < agua[n]) nivel = Math.max(nivel, agua[n]);
        }
      }
      if (nivel > -Infinity) costa[idx] = clamp(1 - (alturas[idx] - nivel) / 22, 0, 1) * 0.55;
    }
  }
  campo.costa = costa;
}

// Ruta densa sobre el terreno: puntos cada `pasoKm`, con km del desafío.
function muestrearRuta(campo, pasoKm = 0.25) {
  const { ruta } = campo.geo;
  const salida = [];
  const n = Math.max(2, Math.ceil(ruta.largo / pasoKm));
  for (let k = 0; k <= n; k += 1) {
    const s = (ruta.largo * k) / n;
    let i = 0;
    while (i < ruta.acum.length - 2 && ruta.acum[i + 1] < s) i += 1;
    const t = (s - ruta.acum[i]) / ((ruta.acum[i + 1] - ruta.acum[i]) || 1);
    const a = ruta.pts[i];
    const b = ruta.pts[i + 1];
    const x = lerp(a.x, b.x, t);
    const z = lerp(a.z, b.z, t);
    salida.push({ x, z, h: campo.muestrear(x, z), km: ruta.kmDeS(s) });
  }
  // Suavizado Chaikin-lite para que las esquinas del trazado no se vean poligonales.
  for (let pasada = 0; pasada < 2; pasada += 1) {
    for (let k = 1; k < salida.length - 1; k += 1) {
      const p = salida[k];
      p.x = (salida[k - 1].x + p.x * 2 + salida[k + 1].x) / 4;
      p.z = (salida[k - 1].z + p.z * 2 + salida[k + 1].z) / 4;
      p.h = campo.muestrear(p.x, p.z);
    }
  }
  return salida;
}

// Punto de la ruta para un km del desafío.
function puntoEnKm(rutaDensa, km) {
  if (km <= rutaDensa[0].km) return { ...rutaDensa[0] };
  for (let i = 1; i < rutaDensa.length; i += 1) {
    if (km <= rutaDensa[i].km) {
      const a = rutaDensa[i - 1];
      const b = rutaDensa[i];
      const t = (km - a.km) / ((b.km - a.km) || 1);
      return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), h: lerp(a.h, b.h, t), km };
    }
  }
  return { ...rutaDensa[rutaDensa.length - 1] };
}

// Progreso normalizado [0..1] -> km del desafío. Un desafío completado es 100%.
function kmDeProgreso(progreso, distanciaKm, completado = false) {
  if (completado) return distanciaKm;
  const p = Number(progreso);
  if (!Number.isFinite(p)) return 0;
  return clamp(p, 0, 1) * distanciaKm;
}

function construirDatosDiorama(escena) {
  const campo = generarCampo(escena);
  marcarCosta(campo);
  const luz = hornearLuz(campo, escena);
  const colores = colorearTerreno(campo, escena, luz);
  const ruta = muestrearRuta(campo, escena.pasoRutaKm || 0.25);
  return { campo, colores, ruta, luz };
}

module.exports = {
  clamp,
  lerp,
  smoothstep,
  crearRuido,
  crearProyeccion,
  distanciaPolilinea,
  interpolarTabla,
  crearFuncionAltura,
  generarCampo,
  muestrearBilineal,
  hornearLuz,
  colorearTerreno,
  muestrearRuta,
  puntoEnKm,
  kmDeProgreso,
  construirDatosDiorama,
};
