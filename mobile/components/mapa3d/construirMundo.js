// Motor de mundo 3D de Korva Journey (genérico: no conoce ninguna escena).
//
// Concepto: no es un diorama ni una isla. Es una ventana sobre un territorio
// continuo que se extiende cientos de km más allá del encuadre. El terreno lejano
// se funde con el horizonte por perspectiva aérea (niebla del color del cielo) y
// la niebla siempre termina antes que la malla: el borde nunca es visible.
//
// La geometría se arma desde datos puros (terrenoCore / horneadoCore); React
// Three Fiber solo la monta, y el banco de pruebas web usa exactamente lo mismo.

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
    aKm: (unidades) => unidades / u,
  };
}

// sRGB 8 bits -> lineal, por tabla (evita miles de objetos Color en Hermes).
const LUT_LINEAL = (() => {
  const t = new Float32Array(256);
  const c = new THREE.Color();
  for (let i = 0; i < 256; i += 1) {
    c.setRGB(i / 255, 0, 0, THREE.SRGBColorSpace);
    t[i] = c.r;
  }
  return t;
})();

// ── Terreno: una sola malla continua sobre la grilla graduada ──────────────
function geometriaTerreno(datos, conv) {
  const { campo, colores } = datos;
  const { nx, nz, xs, zs, alturas } = campo;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i;
      pos[k * 3] = conv.x(xs[i]);
      pos[k * 3 + 1] = conv.y(alturas[k]);
      pos[k * 3 + 2] = conv.z(zs[j]);
    }
  }
  for (let k = 0; k < nx * nz * 3; k += 1) col[k] = LUT_LINEAL[Math.round(colores[k] * 255)];

  const Indices = nx * nz > 65535 ? Uint32Array : Uint16Array;
  const idx = new Indices((nx - 1) * (nz - 1) * 6);
  let p = 0;
  for (let j = 0; j < nz - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // Diagonal (i+1,j)-(i,j+1): idéntica a muestrearBilineal.
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

// ── Agua: superficies por cuerpo, solo sobre las celdas que son agua ───────
// La línea de costa la dibuja la intersección (depth test) entre el plano de
// agua y el terreno que sube: orillas suaves sin polígonos de contorno.
function crearAguas(datos, conv, escena) {
  const grupo = new THREE.Group();
  const { nx, nz, xs, zs, agua } = datos.campo;
  const estilo = escena.agua || {};
  const niveles = [...new Set(escena.aguas.map((a) => a.nivelM))];

  niveles.forEach((nivel) => {
    const pos = [];
    const pertenece = (k) => agua[k] > -Infinity && Math.abs(agua[k] - nivel) < 0.01;
    const vert = (i, j) => pos.push(conv.x(xs[i]), conv.y(nivel + 1.5), conv.z(zs[j]));
    for (let j = 0; j < nz - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        const a = j * nx + i;
        if (!(pertenece(a) || pertenece(a + 1) || pertenece(a + nx) || pertenece(a + nx + 1))) continue;
        vert(i, j); vert(i, j + 1); vert(i + 1, j);
        vert(i + 1, j); vert(i, j + 1); vert(i + 1, j + 1);
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({
      color: estilo.color || '#2B6079',
      roughness: estilo.rugosidad ?? 0.32,
      metalness: 0,
      transparent: true,
      opacity: estilo.opacidad ?? 0.88,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 2;
    grupo.add(mesh);
  });
  return grupo;
}

// ── Cielo: cúpula que acompaña a la cámara ──────────────────────────────────
// Su horizonte tiene exactamente el color de la niebla: terreno lejano y cielo
// se funden en una sola línea de horizonte atmosférica.
function crearCielo(escena) {
  const atm = escena.atmosfera;
  const R = 90;
  const g = new THREE.SphereGeometry(R, 48, 24);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const horizonte = new THREE.Color(atm.horizonte);
  const medio = new THREE.Color(atm.medio);
  const cenit = new THREE.Color(atm.cenit);
  const resplandor = new THREE.Color(atm.resplandor);
  const sol = new THREE.Vector3(...escena.luz.solDir).setY(0).normalize();
  const dir = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 1) {
    const y = p.getY(i) / R;
    let c;
    if (y <= 0) c = horizonte.clone();
    else if (y < 0.18) c = horizonte.clone().lerp(medio, y / 0.18);
    else c = medio.clone().lerp(cenit, Math.min(1, (y - 0.18) / 0.55));
    dir.set(p.getX(i), 0, p.getZ(i)).normalize();
    const haciaSol = Math.max(0, dir.dot(sol));
    const banda = Math.max(0, 1 - Math.abs(y - 0.03) / 0.16);
    c.lerp(resplandor, Math.pow(haciaSol, 2.5) * banda * 0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: true });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

export function construirMundo(escena, horneado) {
  const datos = datosDeEscena(escena, horneado);
  const conv = crearConversor(escena);
  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(
    geometriaTerreno(datos, conv),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 }),
  ));
  grupo.add(crearAguas(datos, conv, escena));
  const cielo = crearCielo(escena);
  const niebla = new THREE.Fog(escena.atmosfera.horizonte, 5, 30);
  const limites = {
    minX: conv.x(datos.campo.minX), maxX: conv.x(datos.campo.maxX),
    minZ: conv.z(datos.campo.minZ), maxZ: conv.z(datos.campo.maxZ),
  };
  return { grupo, cielo, niebla, datos, conv, limites };
}

// Distancia horizontal desde un punto hasta el borde del mundo en una dirección.
function distanciaAlBorde(limites, ox, oz, dx, dz) {
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (limites.maxX - ox) / dx);
  if (dx < -1e-6) t = Math.min(t, (limites.minX - ox) / dx);
  if (dz > 1e-6) t = Math.min(t, (limites.maxZ - oz) / dz);
  if (dz < -1e-6) t = Math.min(t, (limites.minZ - oz) / dz);
  return Math.max(0, t);
}

// Niebla relativa a la cámara, con una garantía: termina antes que la malla en
// todo el campo visual. Así el mundo nunca muestra su borde, con cualquier
// órbita o zoom, sin recortar la geografía cercana.
export function actualizarAtmosfera(mundo, escena, camara) {
  const atm = escena.atmosfera;
  mundo.cielo.position.copy(camara.position);
  const d = camara.userData.distanciaObjetivo || 10;
  const adelante = new THREE.Vector3();
  camara.getWorldDirection(adelante);
  const base = Math.atan2(adelante.z, adelante.x);
  const medioAncho = Math.atan(Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) * camara.aspect) + 0.08;
  let borde = Infinity;
  for (const desvio of [-medioAncho, 0, medioAncho]) {
    const ang = base + desvio;
    borde = Math.min(borde, distanciaAlBorde(mundo.limites, camara.position.x, camara.position.z, Math.cos(ang), Math.sin(ang)));
  }
  const lejos = Math.min(d * (atm.lejos ?? 2.4), borde * 0.94);
  mundo.niebla.far = lejos;
  mundo.niebla.near = Math.min(d * (atm.cerca ?? 0.85), lejos * 0.55);
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
  pendiente: () => new THREE.MeshBasicMaterial({ color: '#F4F8FB', transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false, fog: false }),
  hecho: (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false }),
  brillo: (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending }),
};

// Cámara orbital alrededor de un objetivo. `control` agrega órbita, zoom y foco
// (gestos y playback del Journey) sobre la composición base de la escena.
export function configurarCamara(camara, escena, aspecto, control = {}) {
  const c = escena.camara;
  const el = THREE.MathUtils.degToRad(c.elevacionGrados) + (control.elevacion || 0);
  const az = THREE.MathUtils.degToRad(c.azimutGrados) + (control.azimut || 0);
  const ajuste = Math.max(1, (c.aspectoReferencia || 1.0) / Math.max(0.3, aspecto));
  const d = c.distancia * ajuste * THREE.MathUtils.clamp(control.zoom || 1, 0.5, 1.7);
  const [tx, ty, tz] = control.objetivo || c.objetivo;
  camara.position.set(tx + Math.sin(az) * Math.cos(el) * d, ty + Math.sin(el) * d, tz - Math.cos(az) * Math.cos(el) * d);
  camara.fov = c.fov;
  camara.near = 0.05;
  camara.far = 200;
  camara.aspect = aspecto;
  camara.lookAt(tx, ty, tz);
  camara.userData.distanciaObjetivo = d;
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
