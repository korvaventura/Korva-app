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

function distanciaRutaVisual(datos, x, z) {
  let mejor = Infinity;
  // La ruta horneada es densa; muestrear cada pocos puntos alcanza para la máscara.
  const paso = Math.max(1, Math.floor(datos.ruta.length / 90));
  for (let i = 0; i < datos.ruta.length; i += paso) {
    const p = datos.ruta[i];
    mejor = Math.min(mejor, Math.hypot(x - p.x, z - p.z));
  }
  const ultimo = datos.ruta[datos.ruta.length - 1];
  return Math.min(mejor, Math.hypot(x - ultimo.x, z - ultimo.z));
}

function mascaraTerreno(datos, escena, x, z) {
  const cfg = escena.terrenoVisual || {};
  const corredor = cfg.corredorKm ?? 22;
  const borde = cfg.bordeKm ?? 9;
  const variacion = cfg.variacionKm ?? 5;
  const frecuencia = cfg.frecuencia ?? 0.09;
  // Dos ondas no alineadas evitan una silueta paralela/perfecta a la ruta.
  const ondulacion =
    Math.sin(x * frecuencia + z * frecuencia * 0.63) * variacion * 0.55 +
    Math.sin(x * frecuencia * 0.47 - z * frecuencia * 1.31 + 1.7) * variacion * 0.45;
  const d = distanciaRutaVisual(datos, x, z);
  const nucleo = corredor + ondulacion;
  const t = THREE.MathUtils.smoothstep(d, nucleo, nucleo + borde);
  return {
    peso: t,
    // El último anillo cae por debajo de la niebla en vez de terminar como una mesa.
    caidaM: Math.pow(1 - t, 1.65) * (cfg.caidaBordeM ?? 1450),
  };
}

function geometriaTerreno(datos, conv, escena) {
  const { campo, colores } = datos;
  const { nx, nz, dx, dz, minX, minZ, alturas } = campo;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);

  // El terreno representa la región completa del desafío. Antes se recortaba
  // alrededor de la ruta con mascaraTerreno(); eso convertía Tierra del Fuego
  // en una tira/isla flotando sobre el fondo azul. El agua ahora existe SOLO
  // donde el heightfield horneado marca un lago, bahía o canal real.
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i;
      const x = minX + i * dx;
      const z = minZ + j * dz;
      pos[k * 3] = conv.x(x);
      pos[k * 3 + 1] = conv.y(alturas[k]);
      pos[k * 3 + 2] = conv.z(z);
      col[k * 3] = LUT_LINEAL[Math.round(colores[k * 3] * 255)];
      col[k * 3 + 1] = LUT_LINEAL[Math.round(colores[k * 3 + 1] * 255)];
      col[k * 3 + 2] = LUT_LINEAL[Math.round(colores[k * 3 + 2] * 255)];
    }
  }

  const indices = new (nx * nz > 65535 ? Uint32Array : Uint16Array)((nx - 1) * (nz - 1) * 6);
  let p = 0;
  for (let j = 0; j < nz - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = j * nx + i;
      const b = a + 1;
      const cc = a + nx;
      const d = cc + 1;
      indices[p++] = a; indices[p++] = cc; indices[p++] = b;
      indices[p++] = b; indices[p++] = cc; indices[p++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
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
  const { nx, nz, dx, dz, minX, minZ, agua } = campo;
  const niveles = [...new Set(escena.aguas.map((a) => a.nivelM))];

  niveles.forEach((nivel) => {
    const pos = [];
    const push = (i, j) => {
      const k = j * nx + i;
      pos.push(conv.x(minX + i * dx), conv.y(nivel + 1.5), conv.z(minZ + j * dz));
    };
    for (let j = 0; j < nz - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        const a = j * nx + i; const b = a + 1; const c = a + nx; const d = c + 1;
        const pertenece = (k) => Number.isFinite(agua[k]) && Math.abs(agua[k] - nivel) < 0.01;
        const x = minX + (i + 0.5) * dx; const z = minZ + (j + 0.5) * dz;
        if (!(pertenece(a) || pertenece(b) || pertenece(c) || pertenece(d))) continue;
        push(i, j); push(i, j + 1); push(i + 1, j);
        push(i + 1, j); push(i, j + 1); push(i + 1, j + 1);
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({
      color: '#24566F', roughness: 0.38, metalness: 0,
      transparent: true, opacity: 0.82, depthWrite: false,
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
    geometriaTerreno(datos, conv, escena),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, flatShading: false }),
  );
  grupo.add(terreno);
  grupo.add(new THREE.Mesh(
    geometriaZocalo(datos, conv, escena),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
  ));
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
