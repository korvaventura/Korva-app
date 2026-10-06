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
    elevacionRutaUnidades: escena.elevacionRutaUnidades,
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
function geometriaTerreno(datos, conv, escena) {
  const { campo, colores } = datos;
  const { nx, nz, xs, zs, alturas } = campo;
  const suelo = escena.arquitectura?.suelo;
  const a = suelo ? campo.geo.proy.aKm(suelo.latMin, suelo.lonMin) : null;
  const b = suelo ? campo.geo.proy.aKm(suelo.latMax, suelo.lonMax) : null;
  const fuertes = (escena.arquitectura?.torres || []).filter((t) => t.id === 'fuerte_lovrijenac').map((t) => campo.geo.proy.aKm(t.eje[0][0], t.eje[0][1]));
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i;
      pos[k * 3] = conv.x(xs[i]);
      let h = alturas[k];
      if (suelo && xs[i] >= a.x && xs[i] <= b.x && zs[j] >= b.z && zs[j] <= a.z) h = Math.min(h, suelo.alturaM);
      // El fuerte se monta sobre su roca, no sobre una torre de terreno.
      for (const t of fuertes) {
        if (Math.hypot(xs[i] - t.x, zs[j] - t.z) < 0.03) h = Math.min(h, 37);
      }
      pos[k * 3 + 1] = conv.y(h);
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
  const { nx, nz, xs, zs, agua, alturas } = datos.campo;
  const estilo = escena.agua || {};
  const niveles = [...new Set([...(escena.aguas || []).map((a) => a.nivelM), ...(escena.mar ? [escena.mar.nivelM] : [])])];
  // Color por profundidad (opcional): laguna turquesa -> azul profundo.
  const porProfundidad = !!(estilo.somero && estilo.profundo);
  const somero = porProfundidad ? new THREE.Color(estilo.somero) : null;
  const medio = porProfundidad ? new THREE.Color(estilo.medio || estilo.somero) : null;
  const profundo = porProfundidad ? new THREE.Color(estilo.profundo) : null;
  const escalaM = estilo.profundidadColorM ?? 40;
  const espuma = estilo.espuma ? new THREE.Color(estilo.espuma) : null;
  const c = new THREE.Color();

  niveles.forEach((nivel) => {
    // Indexada: comparte vértices de grilla (un mar puede cubrir casi todo el mundo).
    const pos = [];
    const col = [];
    const indices = [];
    const mapa = new Int32Array(nx * nz).fill(-1);
    const pertenece = (k) => agua[k] > -Infinity && Math.abs(agua[k] - nivel) < 0.01;
    const vert = (i, j) => {
      const k = j * nx + i;
      if (mapa[k] >= 0) return mapa[k];
      mapa[k] = pos.length / 3;
      pos.push(conv.x(xs[i]), conv.y(nivel + (estilo.elevacionM ?? 1.5)), conv.z(zs[j]));
      if (porProfundidad) {
        const prof = nivel - alturas[k];
        const t = Math.min(1, Math.max(0, prof / escalaM));
        if (t < 0.35) c.copy(somero).lerp(medio, t / 0.35);
        else c.copy(medio).lerp(profundo, (t - 0.35) / 0.65);
        // Rompiente: espuma sobre crestas casi a flor de agua (arrecifes, bajíos).
        if (espuma && prof > 0 && prof < (estilo.espumaHastaM ?? 1.2)) c.lerp(espuma, 0.55 * (1 - prof / (estilo.espumaHastaM ?? 1.2)));
        col.push(c.r, c.g, c.b);
      }
      return mapa[k];
    };
    for (let j = 0; j < nz - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        const a = j * nx + i;
        if (!(pertenece(a) || pertenece(a + 1) || pertenece(a + nx) || pertenece(a + nx + 1))) continue;
        const va = vert(i, j); const vb = vert(i + 1, j); const vc = vert(i, j + 1); const vd = vert(i + 1, j + 1);
        indices.push(va, vc, vb, vb, vc, vd);
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (porProfundidad) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({
      color: porProfundidad ? '#FFFFFF' : (estilo.color || '#2B6079'),
      vertexColors: porProfundidad,
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

// Arquitectura opcional: un único mesh de fachadas y cubiertas con color por
// vértice. Los edificios usan el terreno horneado y no agregan cientos de draws.
function crearArquitectura(datos, conv, escena) {
  const config = escena.arquitectura;
  if (!config) return null;
  const posiciones = []; const colores = [];
  const pared = new THREE.Color(config.colorPared); const tejado = new THREE.Color(config.colorTejado);
  const proy = datos.campo.geo.proy;
  const incluir = (geo, color, x, y, z) => {
    const plano = geo.index ? geo.toNonIndexed() : geo;
    const a = plano.attributes.position;
    for (let i = 0; i < a.count; i += 1) {
      posiciones.push(a.getX(i) + x, a.getY(i) + y, a.getZ(i) + z);
      colores.push(color.r, color.g, color.b);
    }
    if (plano !== geo) plano.dispose();
    geo.dispose();
  };
  for (const e of config.edificios) {
    const { x, z } = proy.aKm(e.lat, e.lon);
    const h = datos.campo.muestrear(x, z);
    // Las murallas y fortalezas conservan su silueta, sin casas encima.
    if (!(h >= 2 && h < 34)) continue;
    const w = conv.x(e.anchoM / 1000); const d = conv.z(e.largoM / 1000);
    const alto = conv.y(e.alturaM); const base = conv.y(Math.min(h, config.suelo?.alturaM ?? h));
    const px = conv.x(x); const pz = conv.z(z);
    incluir(new THREE.BoxGeometry(w, alto, d), pared, px, base + alto / 2, pz);
    const cubierta = new THREE.BufferGeometry();
    const k = conv.y(3); const v = [
      -w/2,0,-d/2, w/2,0,-d/2, 0,k,-d/2,
      -w/2,0,d/2, 0,k,d/2, w/2,0,d/2,
      -w/2,0,-d/2, 0,k,-d/2, 0,k,d/2, -w/2,0,-d/2, 0,k,d/2, -w/2,0,d/2,
      w/2,0,-d/2, w/2,0,d/2, 0,k,d/2, w/2,0,-d/2, 0,k,d/2, 0,k,-d/2,
    ];
    // Caras exteriores: la cubierta se ve desde arriba sin doble cara.
    for (let i = 0; i < v.length; i += 9) {
      for (let j = 0; j < 3; j += 1) [v[i + 3 + j], v[i + 6 + j]] = [v[i + 6 + j], v[i + 3 + j]];
    }
    cubierta.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    incluir(cubierta, tejado, px, base + alto, pz);
  }
  const piedra = new THREE.Color(config.colorMuralla || config.colorPared);
  const baseM = config.suelo?.alturaM ?? 0;
  for (const muro of config.murallas || []) {
    const puntos = muro.eje.map(([lat, lon]) => proy.aKm(lat, lon));
    for (let i = 1; i < puntos.length; i += 1) {
      const a = puntos[i - 1]; const b = puntos[i];
      const dx = conv.x(b.x - a.x); const dz = conv.z(b.z - a.z);
      const largo = Math.hypot(dx, dz); const alto = conv.y(muro.alturaM - baseM);
      const angulo = -Math.atan2(dz, dx);
      const px = conv.x((a.x + b.x) / 2); const pz = conv.z((a.z + b.z) / 2);
      const pared = new THREE.BoxGeometry(largo, alto, conv.x(0.008));
      pared.rotateY(angulo);
      incluir(pared, piedra, px, conv.y(baseM) + alto / 2, pz);
      // Almenas a lo largo del paseo de ronda, sin objetos/draws adicionales.
      const n = Math.max(1, Math.floor(largo / conv.x(0.012)));
      for (let j = 0; j <= n; j += 1) {
        const t = j / n;
        const almena = new THREE.BoxGeometry(conv.x(0.004), conv.y(2.5), conv.x(0.009));
        almena.rotateY(angulo);
        incluir(almena, piedra, conv.x(a.x) + dx * t, conv.y(muro.alturaM + 1.25), conv.z(a.z) + dz * t);
      }
    }
  }
  for (const torre of config.torres || []) {
    const [lat, lon, radioKm] = torre.eje[0]; const p = proy.aKm(lat, lon);
    const base = torre.id === 'fuerte_lovrijenac' ? 37 : baseM;
    const radio = conv.x(radioKm); const alto = conv.y(torre.alturaM - base);
    incluir(new THREE.CylinderGeometry(radio, radio, alto, 20), piedra, conv.x(p.x), conv.y(base) + alto / 2, conv.z(p.z));
    for (let j = 0; j < 12; j += 1) {
      const ang = j * Math.PI / 6;
      const almena = new THREE.BoxGeometry(conv.x(0.004), conv.y(3), conv.x(0.005));
      almena.rotateY(-ang);
      incluir(almena, piedra, conv.x(p.x) + Math.cos(ang) * radio * 0.92, conv.y(torre.alturaM + 1.5), conv.z(p.z) + Math.sin(ang) * radio * 0.92);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }));
}

export function construirMundo(escena, horneado) {
  const datos = datosDeEscena(escena, horneado);
  const conv = crearConversor(escena);
  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(
    geometriaTerreno(datos, conv, escena),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 }),
  ));
  grupo.add(crearAguas(datos, conv, escena));
  const arquitectura = crearArquitectura(datos, conv, escena);
  if (arquitectura) grupo.add(arquitectura);
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
// La escena puede indicar separación en unidades; sin ella conserva los 22 m
// del recorrido original, incluida su exageración vertical.
const ALTURA_RUTA_M = 22;

function sobreTerreno(conv, x, h, z) {
  const elevacion = conv.elevacionRutaUnidades;
  const v = conv.pos(x, h + (elevacion == null ? ALTURA_RUTA_M : 0), z);
  if (elevacion != null) v.y += elevacion;
  return v;
}

function puntosRuta(datos, conv, kmDesde, kmHasta) {
  const pts = [];
  const ruta = datos.ruta;
  pts.push(puntoEnKm(ruta, kmDesde));
  ruta.forEach((p) => { if (p.km > kmDesde && p.km < kmHasta) pts.push(p); });
  pts.push(puntoEnKm(ruta, kmHasta));
  return pts.map((p) => sobreTerreno(conv, p.x, p.h, p.z));
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
  return sobreTerreno(conv, p.x, p.h + elevacionExtraM, p.z);
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
