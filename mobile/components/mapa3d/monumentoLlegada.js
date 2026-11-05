// Monumento de llegada opcional (`escena.monumentoLlegada`): una fachada
// escultórica de bajo polígono sobre el final de la ruta. Es un símbolo de
// mapa, en escala simbólica declarada por la escena, no un edificio a escala.
// Un solo mesh con color por vértice: no agrega texturas ni materiales extra.

import * as THREE from 'three';

const GRANITO = new THREE.Color('#C9B79A');
const GRANITO_SOMBRA = new THREE.Color('#9C8B72');
const PIZARRA = new THREE.Color('#5F6B70');
const PLAZA = new THREE.Color('#B3A58C');

export function crearMonumentoLlegada(datos, conv, escena) {
  const m = escena.monumentoLlegada;
  if (!m) return null;
  const { x, z } = datos.campo.geo.proy.aKm(m.lat, m.lon);
  const suelo = conv.y(datos.campo.muestrear(x, z));
  // Ancho de la fachada en km de mapa; alturas proporcionales (sin exageración).
  const W = conv.x(m.anchoKm ?? 7);
  const piezas = [];
  const caja = (w, h, d, px, py, pz, color) => {
    const g = new THREE.BoxGeometry(w * W, h * W, d * W);
    g.translate(px * W, py * W + (h * W) / 2, pz * W);
    piezas.push([g, color]);
  };
  const piramide = (r, h, px, py, pz, color, lados = 4) => {
    const g = new THREE.ConeGeometry(r * W, h * W, lados);
    g.rotateY(Math.PI / lados);
    g.translate(px * W, py * W + (h * W) / 2, pz * W);
    piezas.push([g, color]);
  };
  // Plaza (Obradoiro) delante de la fachada y escalinata doble.
  caja(1.6, 0.02, 0.9, 0, 0, 0.55, PLAZA);
  caja(0.5, 0.06, 0.14, 0, 0.02, 0.18, GRANITO_SOMBRA);
  // Cuerpo central con frontón escalonado.
  caja(0.5, 0.62, 0.32, 0, 0.02, -0.06, GRANITO);
  caja(0.34, 0.14, 0.3, 0, 0.64, -0.06, GRANITO);
  caja(0.18, 0.12, 0.28, 0, 0.78, -0.06, GRANITO);
  piramide(0.05, 0.1, 0, 0.9, -0.06, GRANITO_SOMBRA);
  // Nave detrás (cubierta de pizarra) para que se lea como catedral y no como muro.
  caja(0.42, 0.42, 0.5, 0, 0.02, -0.45, GRANITO_SOMBRA);
  piramide(0.3, 0.14, 0, 0.44, -0.45, PIZARRA);
  // Dos torres barrocas: fuste, dos cuerpos de campanas y remate.
  for (const lado of [-1, 1]) {
    const px = lado * 0.37;
    caja(0.22, 0.78, 0.24, px, 0.02, -0.04, GRANITO);
    caja(0.19, 0.2, 0.21, px, 0.8, -0.04, GRANITO);
    caja(0.15, 0.16, 0.17, px, 1.0, -0.04, GRANITO);
    caja(0.1, 0.07, 0.11, px, 1.16, -0.04, GRANITO_SOMBRA);
    piramide(0.06, 0.16, px, 1.23, -0.04, GRANITO, 8);
  }
  const posiciones = []; const colores = [];
  for (const [g, color] of piezas) {
    const plano = g.toNonIndexed();
    const p = plano.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      posiciones.push(p.getX(i), p.getY(i), p.getZ(i));
      const luz = 0.82 + 0.18 * THREE.MathUtils.clamp(p.getY(i) / (1.2 * W), 0, 1);
      colores.push(color.r * luz, color.g * luz, color.b * luz);
    }
    plano.dispose(); g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
  // La plaza (no el centro del edificio) queda sobre la coordenada de la escena.
  geo.translate(0, 0, -0.55 * W);
  // La fachada (+z local) mira hacia `orientacionGrados` (270 = oeste).
  geo.rotateY(THREE.MathUtils.degToRad(180 - (m.orientacionGrados ?? 270)));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  mesh.position.set(conv.x(x), suelo + conv.y(5), conv.z(z));
  return mesh;
}
