// Banco de pruebas web: misma construcción que la app (construirMundo + configurarCamara + tubos de ruta).
import * as THREE from 'three';
import { construirMundo, crearLuces, configurarCamara, actualizarAtmosfera, geometriaTramo, materialesRuta, posicionEnKm } from '../../../../mobile/components/mapa3d/construirMundo';
import { estadoJourney } from '../../../../mobile/services/mapa3d/journeyCore';
import { seguirReplay, controlInicialReplay } from '../../../../mobile/services/mapa3d/replayCamaraCore';
const escena = require('../../../../mobile/services/mapa3d/escenas/caminoSantiago');
const horneado = require('../../../../mobile/services/mapa3d/escenas/caminoSantiago.horneado');
const CPS = window.CHECKPOINTS;

const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 390), H = +(q.get('h') || 560);
const kmUser = +(q.get('km') || 0);
const sel = q.get('sel');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(2); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = escena.exposicion ?? 1.15;
renderer.setClearColor(0x07131f, 1);
document.getElementById('gl').appendChild(renderer.domElement);
const t0 = performance.now();
const mundo = construirMundo(escena, horneado);
const tBuild = performance.now() - t0;
const scene = new THREE.Scene(); scene.add(mundo.cielo); scene.add(mundo.grupo); crearLuces(escena).forEach((l) => scene.add(l));
scene.fog = mundo.niebla;
const camera = new THREE.PerspectiveCamera(escena.camara.fov, W / H, 0.05, 200);
let control = controlInicialReplay(escena.camara.objetivo);
if (q.get('zoom')) control.zoom = +q.get('zoom');
if (q.get('az')) control.azimut = THREE.MathUtils.degToRad(+q.get('az'));
if (q.get('el')) control.elevacion = THREE.MathUtils.degToRad(+q.get('el'));
// Simula el seguimiento del replay hasta el km dado (mismo seguirReplay, 60 s de pasos de 33 ms).
if (q.get('seguir')) {
  const p = posicionEnKm(mundo.datos, mundo.conv, +q.get('seguir'), 0).toArray();
  for (let i = 0; i < 400; i += 1) control = seguirReplay(control, p, escena.camara.objetivo, 33, true, escena.seguimientoPeso ?? 0.45);
}
if (q.get('foco')) { // "Estás acá": objetivo en la posición, zoom 0.72 (o el pedido)
  const p = posicionEnKm(mundo.datos, mundo.conv, +q.get('foco'), 0);
  control.objetivo = [p.x, p.y, p.z]; control.zoom = +(q.get('zoom') || 0.72);
}
configurarCamara(camera, escena, W / H, control, mundo);
actualizarAtmosfera(mundo, escena, camera);
if (q.get('sinniebla')) { scene.fog = null; }
if (q.get('cam')) { const [a,e,d] = q.get('cam').split(',').map(Number); escena.camara.azimutGrados=a; escena.camara.elevacionGrados=e; escena.camara.distancia=d; configurarCamara(camera, escena, W / H, control, mundo); actualizarAtmosfera(mundo, escena, camera); }
const grosor = escena.grosorRuta ?? 1, total = escena.distanciaKm;
const color = escena.colorRuta || '#F36B0A';
const add = (g, m, o) => { if (g) { const me = new THREE.Mesh(g, m); me.renderOrder = o; scene.add(me); } };
const kmMapa = Math.min(total, kmUser);
add(geometriaTramo(mundo.datos, mundo.conv, kmMapa, total, 0.013 * grosor), materialesRuta.pendiente(), 5);
add(geometriaTramo(mundo.datos, mundo.conv, 0, kmMapa, 0.044 * grosor), materialesRuta.brillo(color), 6);
add(geometriaTramo(mundo.datos, mundo.conv, 0, kmMapa, 0.019 * grosor), materialesRuta.hecho(color), 7);
const t1 = performance.now(); renderer.render(scene, camera); const tRender = performance.now() - t1;
// Overlay 2D equivalente al de la app (pines, etiquetas de capítulo, HUD).
const c2 = document.getElementById('ov'); c2.width = W * 2; c2.height = H * 2; c2.style.width = W + 'px'; c2.style.height = H + 'px';
const g = c2.getContext('2d'); g.scale(2, 2);
const px = (v) => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, ok: p.z < 1 }; };
const j = estadoJourney({ checkpoints: CPS, kmProgreso: kmUser, distanciaKm: total, completado: kmUser >= total });
const ultimo = j.checkpoints.filter((c) => c.estadoJourney === 'conquistado').at(-1);
g.font = '800 10px -apple-system, Helvetica, Arial'; g.textBaseline = 'middle';
for (const cp of j.checkpoints) {
  const base = px(posicionEnKm(mundo.datos, mundo.conv, cp.kmJourney, 0));
  const cab = px(posicionEnKm(mundo.datos, mundo.conv, cp.kmJourney, 0).add(new THREE.Vector3(0, escena.alturaPinUnidades, 0)));
  if (!cab.ok) continue;
  const on = cp.estadoJourney === 'conquistado';
  g.strokeStyle = on ? 'rgba(255,190,140,0.6)' : 'rgba(214,228,240,0.38)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(cab.x, cab.y); g.lineTo(base.x, base.y); g.stroke();
  const s = cp.id === sel;
  g.beginPath(); g.arc(cab.x, cab.y, s ? 11 : 8, 0, 7);
  g.fillStyle = on ? '#F36B0A' : '#13283D'; g.fill(); g.lineWidth = on ? 2 : 1.5;
  g.strokeStyle = cp.estadoJourney === 'proximo' ? '#FFB078' : on ? '#fff' : '#8DA4B8'; g.stroke();
  const etiqueta = s || cp.id === j.checkpoints[0].id || cp.estadoJourney === 'proximo' || cp.id === ultimo?.id;
  if (etiqueta) {
    g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 4;
    const txt = cp.nombre.toUpperCase(); const x = cab.x + 14;
    g.font = '800 10px Helvetica, Arial'; g.fillText(txt, x, cab.y - 5);
    g.font = '600 9px Helvetica, Arial'; g.fillStyle = '#B9C7D6';
    g.fillText(on ? `${cp.km} km` : cp.estadoJourney === 'proximo' ? `PRÓXIMO · ${cp.km} km` : `🔒 ${cp.km} km`, x, cab.y + 7);
    g.shadowBlur = 0;
  }
}
for (const e of escena.etiquetas) {
  const p = px(mundo.datos.campo.geo.proy ? new THREE.Vector3(...posGeo(e.lat, e.lon)) : null);
  if (p.ok && p.x > 60 && p.x < W - 60 && p.y > 70 && p.y < H - 40) {
    g.font = (e.tipo === 'agua' ? 'italic 600 9px' : '700 9px') + ' Helvetica, Arial'; g.fillStyle = e.tipo === 'agua' ? 'rgba(170,215,240,.8)' : 'rgba(235,225,205,.7)';
    g.textAlign = 'center'; g.fillText(e.texto.split('').join(String.fromCharCode(8202)), p.x, p.y); g.textAlign = 'left';
  }
}
function posGeo(lat, lon) { const k = mundo.datos.campo.geo.proy.aKm(lat, lon); return [mundo.conv.x(k.x), mundo.conv.y(Math.max(0, mundo.datos.campo.muestrear(k.x, k.z))), mundo.conv.z(k.z)]; }
// HUD
g.fillStyle = '#F36B0A'; g.font = '900 9px Helvetica, Arial'; g.fillText(escena.presentacion.eyebrow, 14, 20);
g.fillStyle = '#fff'; g.font = '800 13px Helvetica, Arial'; g.fillText(escena.presentacion.titulo, 14, 38);
const capitulo = escena.capitulos.find((c) => kmUser <= c.hastaKm)?.nombre || 'Ruta completada';
g.fillStyle = '#FFB078'; g.font = '700 10px Helvetica, Arial'; g.fillText(capitulo, 14, 54);
g.fillStyle = 'rgba(9,23,37,0.72)'; g.beginPath(); g.roundRect(W - 112, 12, 100, 24, 12); g.fill();
g.fillStyle = '#fff'; g.font = '800 10px Helvetica, Arial'; g.textAlign = 'center';
g.fillText(kmUser >= total ? '✓ CONQUISTADO' : `${kmUser} / ${total} km`, W - 62, 24); g.textAlign = 'left';
if (q.get('ajustar')) {
  const pts = mundo.datos.ruta.filter((_, i) => i % 10 === 0).map((p) => posicionEnKm(mundo.datos, mundo.conv, p.km, 0));
  const pinesAlto = escena.alturaPinUnidades;
  let mejor = null;
  for (let az = 114; az <= 122; az += 4) for (let el = 42; el <= 46; el += 4) for (let ox = -1.5; ox <= 2.5; ox += 0.25) for (let oz = -1.5; oz <= 1.5; oz += 0.25) {
    escena.camara.azimutGrados = az; escena.camara.elevacionGrados = el;
    let lo = 6, hi = 30;
    for (let it = 0; it < 14; it += 1) {
      const d = (lo + hi) / 2; escena.camara.distancia = d;
      configurarCamara(camera, escena, W / H, { azimut: 0, elevacion: 0, zoom: 1, objetivo: [ox, 0, oz] }, null);
      const ok = pts.every((v) => { const a = v.clone().project(camera); const b = v.clone().add(new THREE.Vector3(0, pinesAlto, 0)).project(camera);
        const X = (b.x + 1) / 2 * W, Y = (1 - b.y) / 2 * H, Y0 = (1 - a.y) / 2 * H; return X > 34 && X < W - 34 && Y > 120 && Y0 < H - 80; });
      if (ok) hi = d; else lo = d;
    }
    escena.camara.distancia = hi;
    configurarCamara(camera, escena, W / H, { azimut: 0, elevacion: 0, zoom: 1, objetivo: [ox, 0, oz] }, null);
    let largo = 0; let prev = null;
    for (const v of pts) { const a = v.clone().project(camera); const P = [(a.x + 1) / 2 * W, (1 - a.y) / 2 * H]; if (prev) largo += Math.hypot(P[0] - prev[0], P[1] - prev[1]); prev = P; }
    if (!mejor || largo > mejor.largo) mejor = { az, el, ox, oz, d: hi / Math.max(1, (escena.camara.aspectoReferencia || 1) / (W / H)), largo };
  }
  window.AJUSTE = mejor;
}
window.METRICAS = { tBuild, tRender, triangulos: renderer.info.render.triangles, llamadas: renderer.info.render.calls, nx: mundo.datos.campo.nx, nz: mundo.datos.campo.nz, largoKm: mundo.datos.largoKm };
window.LISTO = true;
