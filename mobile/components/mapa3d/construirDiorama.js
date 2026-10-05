// Construcción imperativa de la escena three.js a partir de los datos puros de
// terrenoCore. React Three Fiber solo la monta: así la misma escena se puede
// renderizar en un banco de pruebas web y en el iPhone sin divergencias.

import * as THREE from 'three';
import { construirDatosDiorama, puntoEnKm } from '../../services/mapa3d/terrenoCore';
import { deserializarDiorama } from '../../services/mapa3d/horneadoCore';

const cacheDatos = new Map();

// Con `horneado` (producción) solo decodifica; sin él genera en vivo (banco de pruebas).
export function datosDeEscena(escena, horneado) {
  if (!cacheDatos.has(escena.id)) {
    cacheDatos.set(escena.id, horneado ? deserializarDiorama(escena, horneado) : construirDatosDiorama(escena));
  }
  return cacheDatos.get(escena.id);
}

// km/m -> unidades de escena
export function crearConversor(escena) {
  const u = 1 / escena.kmPorUnidad;
  const v = (escena.exageracion / 1000) * u;
  return {
    pos: (x, h, z) => new THREE.Vector3(x * u, h * v, z * u),
    x: (x) => x * u,
    z: (z) => z * u,
    y: (h) => h * v,
  };
}

const lineal = (r, g, b) => {
  const c = new THREE.Color();
  c.setRGB(r, g, b, THREE.SRGBColorSpace); // convierte a lineal de trabajo
  return c;
};

// sRGB 8 bits -> lineal, por tabla (evita 100k objetos Color en Hermes).
const LUT_LINEAL = (() => {
  const t = new Float32Array(256);
  const c = new THREE.Color();
  for (let i = 0; i < 256; i += 1) {
    c.setRGB(i / 255, 0, 0, THREE.SRGBColorSpace);
    t[i] = c.r;
  }
  return t;
})();

function geometriaTerreno(datos, conv) {
  const { campo, colores } = datos;
  const { nx, nz, dx, dz, minX, minZ, alturas } = campo;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i;
      pos[k * 3] = conv.x(minX + i * dx);
      pos[k * 3 + 1] = conv.y(alturas[k]);
      pos[k * 3 + 2] = conv.z(minZ + j * dz);
    }
  }
  for (let k = 0; k < nx * nz * 3; k += 1) col[k] = LUT_LINEAL[Math.round(colores[k] * 255)];
  // Misma diagonal que muestrearBilineal: (i+1,j)-(i,j+1).
  const idx = new Uint16Array((nx - 1) * (nz - 1) * 6);
  let p = 0;
  for (let j = 0; j < nz - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// Zócalo del diorama: paredes con estratos que cierran el bloque.
function geometriaZocalo(datos, conv, escena) {
  const { campo } = datos;
  const { nx, nz, alturas, agua } = campo;
  const base = conv.y(escena.zocaloM ?? -900);
  const bordes = [];
  for (let i = 0; i < nx; i += 1) bordes.push([i, 0]);
  for (let j = 0; j < nz; j += 1) bordes.push([nx - 1, j]);
  for (let i = nx - 1; i >= 0; i -= 1) bordes.push([i, nz - 1]);
  for (let j = nz - 1; j >= 0; j -= 1) bordes.push([0, j]);

  const pos = [];
  const col = [];
  const tierraTop = lineal(0.22, 0.19, 0.16);
  const fondo = lineal(0.035, 0.07, 0.11);
  const marTop = lineal(0.09, 0.27, 0.36);
  const marFondo = lineal(0.03, 0.10, 0.17);
  const push = (v, c) => { pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); };

  for (let k = 0; k < bordes.length - 1; k += 1) {
    const [i0, j0] = bordes[k];
    const [i1, j1] = bordes[k + 1];
    if (i0 === i1 && j0 === j1) continue;
    const a = j0 * nx + i0;
    const b = j1 * nx + i1;
    const enAgua = (n) => agua[n] > -Infinity && alturas[n] < agua[n];
    const topA = enAgua(a) ? agua[a] : alturas[a];
    const topB = enAgua(b) ? agua[b] : alturas[b];
    const xa = campo.minX + i0 * campo.dx; const za = campo.minZ + j0 * campo.dz;
    const xb = campo.minX + i1 * campo.dx; const zb = campo.minZ + j1 * campo.dz;
    const A = conv.pos(xa, topA, za); const B = conv.pos(xb, topB, zb);
    const A0 = new THREE.Vector3(A.x, base, A.z); const B0 = new THREE.Vector3(B.x, base, B.z);
    const cA = enAgua(a) ? marTop : tierraTop;
    const cB = enAgua(b) ? marTop : tierraTop;
    const cA0 = enAgua(a) ? marFondo : fondo;
    const cB0 = enAgua(b) ? marFondo : fondo;
    // dos triángulos (orientados hacia afuera; material DoubleSide igual)
    push(A, cA); push(A0, cA0); push(B, cB);
    push(B, cB); push(A0, cA0); push(B0, cB0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Planos de agua recortados al bloque. Color con falso fresnel (más claro lejos).
function crearAguas(datos, conv, escena) {
  const grupo = new THREE.Group();
  const { campo } = datos;
  const niveles = [...new Set(escena.aguas.map((a) => a.nivelM))];
  niveles.forEach((nivel) => {
    const cuerpos = campo.geo.aguas.filter((a) => a.nivelM === nivel);
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    cuerpos.forEach(({ caja }) => {
      minX = Math.min(minX, caja.minX); maxX = Math.max(maxX, caja.maxX);
      minZ = Math.min(minZ, caja.minZ); maxZ = Math.max(maxZ, caja.maxZ);
    });
    minX = Math.max(minX, campo.minX); maxX = Math.min(maxX, campo.maxX);
    minZ = Math.max(minZ, campo.minZ); maxZ = Math.min(maxZ, campo.maxZ);
    const segX = 24; const segZ = 12;
    const g = new THREE.PlaneGeometry(conv.x(maxX - minX), conv.z(maxZ - minZ), segX, segZ);
    g.rotateX(-Math.PI / 2);
    g.translate(conv.x((minX + maxX) / 2), conv.y(nivel), conv.z((minZ + maxZ) / 2));
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const cerca = lineal(0.045, 0.16, 0.24);
    const lejos = lineal(0.20, 0.36, 0.46);
    for (let i = 0; i < p.count; i += 1) {
      // Cámara al norte (-z): lo lejano es +z.
      const t = THREE.MathUtils.smoothstep(p.getZ(i), conv.z(campo.minZ), conv.z(campo.maxZ));
      const c = cerca.clone().lerp(lejos, t * 0.85);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0.0,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 2;
    grupo.add(mesh);
  });
  return grupo;
}

export function construirDiorama(escena, horneado) {
  const datos = datosDeEscena(escena, horneado);
  const conv = crearConversor(escena);
  const grupo = new THREE.Group();

  const terreno = new THREE.Mesh(
    geometriaTerreno(datos, conv),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, flatShading: false }),
  );
  grupo.add(terreno);

  const zocalo = new THREE.Mesh(
    geometriaZocalo(datos, conv, escena),
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }),
  );
  grupo.add(zocalo);
  grupo.add(crearAguas(datos, conv, escena));
  return { grupo, datos, conv };
}

// ── Ruta ──────────────────────────────────────────────────────────────────
const ALTURA_RUTA_M = 22; // separación visual sobre el terreno

function puntosRuta(datos, conv, kmDesde, kmHasta) {
  const pts = [];
  const ruta = datos.ruta;
  pts.push(puntoEnKm(ruta, kmDesde));
  ruta.forEach((p) => { if (p.km > kmDesde && p.km < kmHasta) pts.push(p); });
  pts.push(puntoEnKm(ruta, kmHasta));
  return pts.map((p) => conv.pos(p.x, p.h + ALTURA_RUTA_M, p.z));
}

// Cinta tubular sobre el terreno entre dos km del desafío.
export function geometriaTramo(datos, conv, kmDesde, kmHasta, radio) {
  if (kmHasta - kmDesde < 0.05) return null;
  const pts = puntosRuta(datos, conv, kmDesde, kmHasta);
  if (pts.length < 2) return null;
  const curva = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const segmentos = Math.min(700, Math.max(8, Math.round(pts.length * 1.2)));
  return new THREE.TubeGeometry(curva, segmentos, radio, 6, false);
}

export function posicionEnKm(datos, conv, km, elevacionExtraM = 0) {
  const p = puntoEnKm(datos.ruta, km);
  return conv.pos(p.x, p.h + ALTURA_RUTA_M + elevacionExtraM, p.z);
}

export function posicionGeo(datos, conv, lat, lon, alturaM) {
  const { x, z } = datos.campo.geo.proy.aKm(lat, lon);
  const h = alturaM ?? datos.campo.muestrear(x, z);
  return conv.pos(x, h, z);
}

export const materialesRuta = {
  pendiente: () => new THREE.MeshBasicMaterial({ color: '#F4F8FB', transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, fog: false }),
  sombra: () => new THREE.MeshBasicMaterial({ color: '#03080E', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }),
  hecho: (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false }),
  brillo: (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending }),
};

// Cámara: orbital alrededor del objetivo. Ajusta distancia para que el ancho del
// diorama entre en pantallas angostas.
export function configurarCamara(camara, escena, aspecto, control = {}) {
  const c = escena.camara;
  const el = THREE.MathUtils.degToRad(c.elevacionGrados) + (control.elevacion || 0);
  const az = THREE.MathUtils.degToRad(c.azimutGrados) + (control.azimut || 0);
  const ajuste = Math.max(1, (c.aspectoReferencia || 1.0) / Math.max(0.3, aspecto));
  const d = c.distancia * ajuste * THREE.MathUtils.clamp(control.zoom || 1, 0.58, 1.7);
  const [tx, ty, tz] = control.objetivo || c.objetivo;
  // Cámara al norte (-z) mirando al sur (+z); azimut rota hacia el este (+x).
  camara.position.set(tx + Math.sin(az) * Math.cos(el) * d, ty + Math.sin(el) * d, tz - Math.cos(az) * Math.cos(el) * d);
  camara.fov = c.fov;
  camara.near = 0.1;
  camara.far = 120;
  camara.aspect = aspecto;
  camara.lookAt(tx, ty, tz);
  camara.updateProjectionMatrix();
  camara.updateMatrixWorld(true);
}

export function crearLuces(escena) {
  const l = escena.luz;
  const s = new THREE.Vector3(...l.solDir).normalize();
  const sol = new THREE.DirectionalLight(l.colorSol || '#FFE0B8', l.intensidadSol ?? 2.6);
  sol.position.copy(s.multiplyScalar(20));
  const hemi = new THREE.HemisphereLight(l.colorCielo || '#9EC3E6', l.colorSuelo || '#2B2A22', l.intensidadHemi ?? 0.9);
  const relleno = new THREE.DirectionalLight(l.colorRelleno || '#7FA6D8', l.intensidadRelleno ?? 0.35);
  relleno.position.set(6, 5, -8);
  return [sol, hemi, relleno];
}

// Niebla atmosférica relativa a la distancia de cámara: separa planos sin lavar
// el primer plano.
export function crearNiebla(escena) {
  const n = escena.niebla || {};
  const d = escena.camara.distancia;
  return new THREE.Fog(n.color || '#3F5872', d * (n.cerca ?? 0.95), d * (n.lejos ?? 2.1));
}

export function ajustarNiebla(niebla, escena, camara) {
  const n = escena.niebla || {};
  const [tx, ty, tz] = escena.camara.objetivo;
  const d = camara.position.distanceTo(new THREE.Vector3(tx, ty, tz));
  niebla.near = d * (n.cerca ?? 0.95);
  niebla.far = d * (n.lejos ?? 2.1);
}
