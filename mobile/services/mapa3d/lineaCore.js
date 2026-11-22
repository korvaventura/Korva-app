// Núcleo puro del mapa "Línea" (oscuro, premium): ruta, hitos, curvas de nivel
// y costa como líneas sobre un plano, en km. Sin React ni Three.
const { deserializarDiorama } = require('./horneadoCore');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Ruta en km (x, z) con su km acumulado. Usa la ruta horneada de la escena;
// si no sirve (mapas con modelo, como Islandia) une los hitos por lat/lon.
function rutaLinea(escena, horneado, checkpoints = []) {
  let datos = null;
  try { datos = horneado ? deserializarDiorama(escena, horneado) : null; } catch { datos = null; }
  const ruta = datos?.ruta || [];
  if (ruta.length >= 20) {
    return { puntos: ruta.map((p) => ({ x: p.x, z: p.z, km: p.km })), campo: datos.campo, aproximada: false };
  }
  return { puntos: rutaDesdeHitos(checkpoints, escena.distanciaKm), campo: null, aproximada: true };
}

function rutaDesdeHitos(checkpoints = [], distanciaKm = 0) {
  const cps = checkpoints.filter((c) => Number.isFinite(c?.lat) && Number.isFinite(c?.lon) && Number.isFinite(c?.kmFisico))
    .sort((a, b) => a.kmFisico - b.kmFisico);
  if (cps.length < 2) return [{ x: 0, z: 0, km: 0 }, { x: 1, z: 0, km: distanciaKm || 1 }];
  const lat0 = cps.reduce((s, c) => s + c.lat, 0) / cps.length;
  const lon0 = cps.reduce((s, c) => s + c.lon, 0) / cps.length;
  const kx = 111.32 * Math.cos(lat0 * Math.PI / 180);
  const pts = cps.map((c) => ({ x: (c.lon - lon0) * kx, z: -(c.lat - lat0) * 110.57, km: c.kmFisico }));
  if (distanciaKm > pts[pts.length - 1].km) pts.push({ ...pts[0], km: distanciaKm });
  return pts;
}

function puntoEnRuta(puntos, km) {
  if (!puntos.length) return { x: 0, z: 0 };
  if (km <= puntos[0].km) return { x: puntos[0].x, z: puntos[0].z };
  for (let i = 1; i < puntos.length; i += 1) {
    if (km <= puntos[i].km) {
      const a = puntos[i - 1]; const b = puntos[i];
      const t = (km - a.km) / ((b.km - a.km) || 1);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
  }
  const u = puntos[puntos.length - 1];
  return { x: u.x, z: u.z };
}

// Dirección de marcha suavizada: del punto actual a uno más adelante.
function direccionEnRuta(puntos, km, ventanaKm) {
  const total = puntos.length ? puntos[puntos.length - 1].km : 0;
  let a = puntoEnRuta(puntos, Math.max(0, km - ventanaKm * 0.25));
  let b = puntoEnRuta(puntos, Math.min(total, km + ventanaKm));
  if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-6) { a = puntoEnRuta(puntos, Math.max(0, km - ventanaKm)); b = puntoEnRuta(puntos, km); }
  const dx = b.x - a.x; const dz = b.z - a.z; const n = Math.hypot(dx, dz) || 1;
  return { dx: dx / n, dz: dz / n };
}

function radioDeRuta(puntos) {
  if (!puntos.length) return 1;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of puntos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  return Math.max(0.2, Math.hypot(maxX - minX, maxZ - minZ) / 2);
}

// Tramo de la ruta [desde, hasta] como cinta plana de ancho fijo (triángulos en y=0).
function cintaRuta(puntos, desdeKm, hastaKm, ancho) {
  const tramo = [];
  const a = puntoEnRuta(puntos, desdeKm);
  tramo.push(a);
  for (const p of puntos) if (p.km > desdeKm && p.km < hastaKm) tramo.push({ x: p.x, z: p.z });
  tramo.push(puntoEnRuta(puntos, hastaKm));
  const out = [];
  const h = ancho / 2;
  for (let i = 1; i < tramo.length; i += 1) {
    const p = tramo[i - 1]; const q = tramo[i];
    const dx = q.x - p.x; const dz = q.z - p.z; const n = Math.hypot(dx, dz);
    if (n < 1e-9) continue;
    const nx = -dz / n * h; const nz = dx / n * h;
    out.push(p.x + nx, 0, p.z + nz, p.x - nx, 0, p.z - nz, q.x + nx, 0, q.z + nz,
      q.x + nx, 0, q.z + nz, p.x - nx, 0, p.z - nz, q.x - nx, 0, q.z - nz);
  }
  return new Float32Array(out);
}

// Marching squares sobre la grilla del campo (xs, zs no uniformes). Devuelve
// segmentos [x1, z1, x2, z2, …] donde el valor cruza `nivel`, dentro de `region`.
function contorno(campo, valor, nivel, region, paso = 1) {
  const { nx, nz, xs, zs } = campo;
  const out = [];
  const i0 = Math.max(0, xs.findIndex((x) => x >= region.minX) - 1);
  let i1 = xs.findIndex((x) => x > region.maxX); i1 = i1 < 0 ? nx - 1 : Math.min(nx - 1, i1);
  const j0 = Math.max(0, zs.findIndex((z) => z >= region.minZ) - 1);
  let j1 = zs.findIndex((z) => z > region.maxZ); j1 = j1 < 0 ? nz - 1 : Math.min(nz - 1, j1);
  const interp = (xa, za, va, xb, zb, vb) => { const t = (nivel - va) / ((vb - va) || 1e-9); return [xa + (xb - xa) * t, za + (zb - za) * t]; };
  for (let j = j0; j + paso <= j1; j += paso) {
    for (let i = i0; i + paso <= i1; i += paso) {
      const ia = i, ib = i + paso, ja = j, jb = j + paso;
      const v0 = valor(ia, ja), v1 = valor(ib, ja), v2 = valor(ib, jb), v3 = valor(ia, jb);
      if (![v0, v1, v2, v3].every(Number.isFinite)) continue;
      const c = (v0 > nivel ? 1 : 0) | (v1 > nivel ? 2 : 0) | (v2 > nivel ? 4 : 0) | (v3 > nivel ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const x0 = xs[ia], x1 = xs[ib], z0 = zs[ja], z1 = zs[jb];
      const e = [
        () => interp(x0, z0, v0, x1, z0, v1), // abajo
        () => interp(x1, z0, v1, x1, z1, v2), // derecha
        () => interp(x1, z1, v2, x0, z1, v3), // arriba
        () => interp(x0, z1, v3, x0, z0, v0), // izquierda
      ];
      const pares = TABLA[c];
      for (const [ea, eb] of pares) { const p = e[ea](); const q = e[eb](); out.push(p[0], p[1], q[0], q[1]); }
    }
  }
  return out;
}
const TABLA = {
  1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]],
  8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]],
};

// Curvas de nivel y costa alrededor de la ruta. Se calcula una vez por escena.
function lineasDeTerreno(campo, puntos, { niveles = 6, margen = 0.6 } = {}) {
  if (!campo?.alturas || !puntos.length) return { curvas: new Float32Array(0), costa: new Float32Array(0) };
  const r = radioDeRuta(puntos);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of puntos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const region = { minX: minX - r * margen, maxX: maxX + r * margen, minZ: minZ - r * margen, maxZ: maxZ + r * margen };
  const { nx, alturas, agua } = campo;
  const idx = (i, j) => j * nx + i;
  const esAgua = (k) => agua[k] > -Infinity && alturas[k] < agua[k];
  const celdas = Math.max(1, (campo.nx * campo.nz));
  const paso = celdas > 120000 ? 2 : 1;
  const tierra = [];
  for (let k = 0; k < alturas.length; k += 7) if (!esAgua(k) && Number.isFinite(alturas[k])) tierra.push(alturas[k]);
  tierra.sort((a, b) => a - b);
  const curvas = [];
  if (tierra.length > 10) {
    for (let n = 1; n <= niveles; n += 1) {
      const nivel = tierra[Math.floor(tierra.length * n / (niveles + 1))];
      const segs = contorno(campo, (i, j) => { const k = idx(i, j); return esAgua(k) ? -1e6 : alturas[k]; }, nivel, region, paso);
      for (let q = 0; q < segs.length; q += 1) curvas.push(segs[q]);
    }
  }
  const costa = contorno(campo, (i, j) => (esAgua(idx(i, j)) ? 0 : 1), 0.5, region, paso);
  return { curvas: new Float32Array(curvas), costa: new Float32Array(costa) };
}

// Próximo hito (en km de escena) a partir del km actual.
function proximoHito(checkpoints = [], km = 0) {
  return checkpoints.filter((c) => Number.isFinite(c?.kmFisico) && c.kmFisico > km + 1e-6)
    .sort((a, b) => a.kmFisico - b.kmFisico)[0] || null;
}

// Cámara de persecución sobre el plano: detrás y arriba del corredor, mirando adelante.
function camaraLinea(p, dir, distancia, elevacionGrados = 34) {
  const el = elevacionGrados * Math.PI / 180;
  const atras = distancia * Math.cos(el);
  return {
    posicion: [p.x - dir.dx * atras, distancia * Math.sin(el), p.z - dir.dz * atras],
    mira: [p.x + dir.dx * distancia * 0.45, 0, p.z + dir.dz * distancia * 0.45],
  };
}

// Rayitas perpendiculares a la ruta cada `pasoKm` (en km de escena), para
// sentir el avance. Si serían demasiadas, se agranda el paso.
function marcasKm(puntos, totalKm, pasoKm, largo, maximo = 1500) {
  if (!(pasoKm > 0) || !(totalKm > 0)) return { segmentos: new Float32Array(0), paso: pasoKm };
  let paso = pasoKm;
  while (totalKm / paso > maximo) paso *= 5;
  const out = [];
  const h = largo / 2;
  for (let km = paso; km < totalKm; km += paso) {
    const p = puntoEnRuta(puntos, km);
    const d = direccionEnRuta(puntos, km, paso * 0.5);
    out.push(p.x - d.dz * h, p.z + d.dx * h, p.x + d.dz * h, p.z - d.dx * h);
  }
  return { segmentos: new Float32Array(out), paso };
}

// Hito alcanzado entre dos lecturas de km (sólo avanzando). Devuelve el último cruzado.
function hitoCruzado(checkpoints = [], kmAntes, kmAhora) {
  if (!Number.isFinite(kmAntes) || !Number.isFinite(kmAhora) || kmAhora <= kmAntes) return null;
  const cruzados = checkpoints.filter((c) => Number.isFinite(c?.kmFisico) && c.kmFisico > kmAntes && c.kmFisico <= kmAhora)
    .sort((a, b) => a.kmFisico - b.kmFisico);
  return cruzados[cruzados.length - 1] || null;
}

module.exports = {
  marcasKm, hitoCruzado,
  rutaLinea, rutaDesdeHitos, puntoEnRuta, direccionEnRuta, radioDeRuta, cintaRuta,
  contorno, lineasDeTerreno, proximoHito, camaraLinea, clamp,
};
