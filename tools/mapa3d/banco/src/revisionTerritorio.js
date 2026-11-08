// Banco de revisión del modo territorio (Camino, Vía Appia): mismo motor,
// mismo General automático y misma composición de pines/etiquetas/HUD que
// MapaRecorrido3D. No forma parte de la app ni reemplaza la prueba en teléfono.
//
// Parámetros: escena=viaAppia|caminoSantiago, w, h, km, sel, vista=general|
// ancla:<id>|llegada|seguir:<km>, az/el (grados sumados al control), zoom
// (multiplicador), pan=dx,dz (unidades), sinniebla=1.
import * as THREE from 'three';
import { construirMundo, crearLuces, configurarCamara, actualizarAtmosfera, geometriaTramo, materialesRuta, posicionEnKm, posicionGeo } from '../../../../mobile/components/mapa3d/construirMundo';
import { estadoJourney } from '../../../../mobile/services/mapa3d/journeyCore';
import { seguirReplay, controlInicialReplay } from '../../../../mobile/services/mapa3d/replayCamaraCore';
import { ubicarEtiquetas, cajasDePines, guiaEtiqueta, seSuperponen, separarPinesCercanos } from '../../../../mobile/services/mapa3d/etiquetasCore';
import { separarPinesCamino } from '../../../../mobile/services/mapa3d/pinesCaminoCore';
import { resolverGeneralCamino, limitarVistaCamino } from '../../../../mobile/services/mapa3d/vistaCaminoCore';
import { buscarAncla, anclaLlegada, controlAncla } from '../../../../mobile/services/mapa3d/anclasCore';

const ESCENAS = {
  viaAppia: () => ({ escena: require('../../../../mobile/services/mapa3d/escenas/viaAppia'), horneado: require('../../../../mobile/services/mapa3d/escenas/viaAppia.horneado'),
    cps: require('../../../../mobile/services/desafios/viaAppia').checkpoints }),
  caminoSantiago: () => ({ escena: require('../../../../mobile/services/mapa3d/escenas/caminoSantiago'), horneado: require('../../../../mobile/services/mapa3d/escenas/caminoSantiago.horneado'),
    cps: require('../../../../mobile/services/desafios/caminoSantiago').checkpoints }),
};
const q = new URLSearchParams(location.search);
const { escena, horneado, cps } = ESCENAS[q.get('escena') || 'viaAppia']();
// Sólo para explorar composiciones: rumbo/inclinación base de la escena.
if (q.get('azbase')) escena.camara.azimutGrados = +q.get('azbase');
if (q.get('elbase')) escena.camara.elevacionGrados = +q.get('elbase');
const W = +(q.get('w') || 390), H = +(q.get('h') || 560);
const total = escena.distanciaKm;
const kmUser = Math.min(total, +(q.get('km') || 0));
const sel = q.get('sel');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(2); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = escena.exposicion ?? 1.15;
renderer.setClearColor(0x0B1C2D, 1);
document.getElementById('gl').appendChild(renderer.domElement);
const t0 = performance.now();
const mundo = construirMundo(escena, horneado);
const tBuild = performance.now() - t0;
const scene = new THREE.Scene(); scene.add(mundo.cielo); scene.add(mundo.grupo); crearLuces(escena).forEach((l) => scene.add(l));
scene.fog = mundo.niebla;
const camera = new THREE.PerspectiveCamera(escena.camara.fov, W / H, 0.05, 200);

// General: idéntico a MapaRecorrido3D (ruta cada 5 km + altura de pines).
const puntos = [];
for (let km = 0; km <= total; km += 5) { const p = posicionEnKm(mundo.datos, mundo.conv, km, 0); puntos.push(p, p.clone().add(new THREE.Vector3(0, escena.alturaPinUnidades, 0))); }
const fin = posicionEnKm(mundo.datos, mundo.conv, total, 0); puntos.push(fin, fin.clone().add(new THREE.Vector3(0, escena.alturaPinUnidades, 0)));
const camAux = new THREE.PerspectiveCamera();
const general = resolverGeneralCamino((c) => { configurarCamara(camAux, escena, W / H, c, mundo); return puntos.map((p) => p.clone().project(camAux)); },
  { azimut: 0, elevacion: 0, zoom: escena.camara.zoomGeneral ?? 1, objetivo: escena.camara.objetivoGeneral || escena.camara.objetivo }, W, H);
const controlAnclaKm = (ancla, km = ancla.km) => {
  const p = posicionEnKm(mundo.datos, mundo.conv, km, 0);
  const a = posicionEnKm(mundo.datos, mundo.conv, Math.max(0, km - 1), 0); const b = posicionEnKm(mundo.datos, mundo.conv, Math.min(total, km + 1), 0);
  return controlAncla(ancla, p, escena.camara, { x: b.x - a.x, z: b.z - a.z }, escena.kmPorUnidad);
};
const vista = q.get('vista') || 'general';
let control = { ...general, objetivo: [...general.objetivo] };
let inspeccion = false;
if (vista.startsWith('ancla:')) { control = controlAnclaKm(buscarAncla(escena.territorio, { id: vista.slice(6) })); inspeccion = true; }
if (vista === 'llegada') {
  const a = anclaLlegada(escena.territorio);
  // camAncla=zoom,elevación,altura,rumbo: prueba de composición sin tocar la escena.
  if (q.get('camAncla')) { const [z, e, h, r] = q.get('camAncla').split(',').map(Number); a.camara = { ...a.camara, zoom: z, elevacionGrados: e, alturaObjetivoUnidades: h }; a.frenteGrados = r; }
  control = controlAnclaKm(a); inspeccion = true;
}
if (vista.startsWith('seguir:')) {
  const p = posicionEnKm(mundo.datos, mundo.conv, +vista.slice(7), 0).toArray();
  control = controlInicialReplay(escena.camara.objetivo);
  for (let i = 0; i < 400; i += 1) control = seguirReplay(control, p, escena.camara.objetivo, 33, true, escena.seguimientoPeso ?? 0.45);
}
// Gesto manual simulado, con los mismos límites que la app.
if (q.get('az') || q.get('el') || q.get('zoom') || q.get('pan')) {
  control.azimut = (control.azimut || 0) + THREE.MathUtils.degToRad(+(q.get('az') || 0));
  control.elevacion = (control.elevacion || 0) + THREE.MathUtils.degToRad(+(q.get('el') || 0));
  control.zoom *= +(q.get('zoom') || 1);
  if (q.get('pan')) { const [dx, dz] = q.get('pan').split(',').map(Number); control.objetivo = [control.objetivo[0] + dx, control.objetivo[1], control.objetivo[2] + dz]; }
  if (!inspeccion) control = limitarVistaCamino(control, escena.camara, general, escena.territorio.limitesGestos);
}
configurarCamara(camera, escena, W / H, control, mundo);
actualizarAtmosfera(mundo, escena, camera);
if (q.get('sinniebla')) scene.fog = null;
const grosor = (escena.grosorRuta ?? 1) * (inspeccion ? 0.06 : 1);
const add = (g, m, o) => { if (g) { const me = new THREE.Mesh(g, m); me.renderOrder = o; scene.add(me); } };
add(geometriaTramo(mundo.datos, mundo.conv, kmUser, total, 0.013 * grosor), materialesRuta.pendiente(), 5);
add(geometriaTramo(mundo.datos, mundo.conv, 0, kmUser, 0.019 * grosor), materialesRuta.hecho('#F36B0A'), 7);
const t1 = performance.now(); renderer.render(scene, camera); const tRender = performance.now() - t1;

// Overlay: misma lógica que MapaRecorrido3D (pines separados, HUD, etiquetas).
const c2 = document.getElementById('ov'); c2.width = W * 2; c2.height = H * 2; c2.style.width = W + 'px'; c2.style.height = H + 'px';
const g = c2.getContext('2d'); g.scale(2, 2); g.textBaseline = 'middle';
const aPx = (v) => { const p = v.clone().project(camera); const x = (p.x + 1) / 2 * W, y = (1 - p.y) / 2 * H; return { x, y, visible: p.z > -1 && p.z < 1 && x > -20 && x < W + 20 && y > -20 && y < H + 20 }; };
const j = estadoJourney({ checkpoints: cps, kmProgreso: kmUser, distanciaKm: total, completado: kmUser >= total });
let pines = separarPinesCercanos(j.checkpoints.map((cp) => ({ cp, km: cp.kmJourney,
  cabeza: aPx(posicionEnKm(mundo.datos, mundo.conv, cp.kmJourney, 0).add(new THREE.Vector3(0, escena.alturaPinUnidades, 0))),
  base: aPx(posicionEnKm(mundo.datos, mundo.conv, cp.kmJourney, 0)), desbloqueado: cp.estadoJourney === 'conquistado', estadoJourney: cp.estadoJourney })), escena.pinesSeparados, W, H);
if (escena.territorio?.separarCabezasPin) pines = separarPinesCamino(pines, W, H);
const visibles = pines.filter((p) => p.cabeza.visible && p.base.visible);
const zonasHud = [{ x: 0, y: 0, w: W, h: 64 }, { x: 0, y: 64, w: 205, h: escena.capitulos?.length ? 100 : 72 }, { x: 0, y: H - 124, w: 200, h: 124 }, { x: W - 56, y: H - 92, w: 56, h: 92 }, { x: 0, y: H - 32, w: W, h: 32 }];
const ultimoConq = j.checkpoints.filter((c) => c.estadoJourney === 'conquistado').at(-1)?.id;
const ocupados = [...zonasHud, ...(escena.etiquetasSeparadas ? cajasDePines(visibles.map((p) => p.cabeza)) : [])];
const etiquetas = inspeccion ? {} : ubicarEtiquetas(visibles.filter((p) => !escena.capitulos?.length || p.cp.id === sel || p.cp.id === j.checkpoints[0].id || p.estadoJourney === 'proximo'
  || (escena.etiquetaFinal && p.cp.id === j.checkpoints.at(-1).id) || p.cp.id === ultimoConq)
  .map((p) => ({ id: p.cp.id, x: p.cabeza.x, y: p.cabeza.y, texto: p.cp.nombre.toUpperCase(), prioridad: p.cp.id === sel ? 4 : p.estadoJourney === 'proximo' ? 3 : p.desbloqueado ? 2 : 1 })), W, H, { ocupados, ocultarSiNoCabe: true });
const tomadas = [...Object.values(etiquetas), ...visibles.map((p) => ({ x: p.cabeza.x - 10, y: p.cabeza.y - 10, w: 20, h: 20 })), ...ocupados];
const nombres = inspeccion ? [] : (escena.etiquetas || []).map((e) => ({ ...e, ...aPx(posicionGeo(mundo.datos, mundo.conv, e.lat, e.lon, e.tipo === 'agua' ? escena.mar?.nivelM : undefined)) }))
  .filter((e) => { const caja = { x: e.x - 80, y: e.y - 7, w: 160, h: 16 }; return e.visible && caja.x >= 6 && caja.x + caja.w <= W - 6 && !zonasHud.some((z) => seSuperponen(caja, z)); })
  .filter((e) => { const caja = { x: e.x - 80, y: e.y - 7, w: 160, h: 16 }; if (tomadas.some((o) => seSuperponen(caja, o))) return false; tomadas.push(caja); return true; });
for (const e of nombres) {
  g.font = (e.tipo === 'agua' ? 'italic 700 9px' : e.tipo === 'pais' ? '800 10px' : '700 9px') + ' Helvetica, Arial';
  g.fillStyle = e.tipo === 'agua' ? 'rgba(170,215,240,.85)' : 'rgba(235,225,205,.78)'; g.textAlign = 'center';
  g.fillText(e.texto.split('').join(String.fromCharCode(8202)), e.x, e.y); g.textAlign = 'left';
}
if (!inspeccion) for (const p of visibles) {
  const on = p.desbloqueado; const caja = etiquetas[p.cp.id];
  g.strokeStyle = on ? 'rgba(255,190,140,0.6)' : 'rgba(214,228,240,0.38)'; g.lineWidth = 1; g.beginPath(); g.moveTo(p.cabeza.x, p.cabeza.y); g.lineTo(p.base.x, p.base.y); g.stroke();
  if (caja) { const guia = escena.etiquetasSeparadas && guiaEtiqueta(p.cabeza, caja); if (guia) { g.strokeStyle = 'rgba(214,228,240,0.4)'; g.beginPath(); g.moveTo(guia.x, guia.y); g.lineTo(guia.x + Math.cos(guia.angulo) * guia.largo, guia.y + Math.sin(guia.angulo) * guia.largo); g.stroke(); } }
  g.beginPath(); g.arc(p.cabeza.x, p.cabeza.y, p.cp.id === sel ? 11 : 8, 0, 7); g.fillStyle = on ? '#F36B0A' : '#13283D'; g.fill();
  g.lineWidth = on ? 2 : 1.5; g.strokeStyle = p.estadoJourney === 'proximo' ? '#FFB078' : on ? '#fff' : '#8DA4B8'; g.stroke();
  if (caja) {
    g.fillStyle = 'rgba(9,23,37,0.55)'; g.beginPath(); g.roundRect(caja.x, caja.y, caja.w, caja.h, 6); g.fill();
    g.fillStyle = '#fff'; g.font = '800 10px Helvetica, Arial'; g.fillText(p.cp.nombre.toUpperCase(), caja.x + 6, caja.y + 9);
    g.font = '600 9px Helvetica, Arial'; g.fillStyle = '#B9C7D6';
    g.fillText(on ? `${p.km} km` : p.estadoJourney === 'proximo' ? `PRÓXIMO · ${p.km} km` : `🔒 ${p.km} km`, caja.x + 6, caja.y + 19);
  }
}
g.fillStyle = '#F36B0A'; g.font = '900 9px Helvetica, Arial'; g.fillText(escena.presentacion.eyebrow, 14, 20);
g.fillStyle = '#fff'; g.font = '800 13px Helvetica, Arial'; g.fillText(escena.presentacion.titulo, 14, 38);
g.fillStyle = '#FFB078'; g.font = '700 10px Helvetica, Arial'; g.fillText(escena.capitulos.find((c) => kmUser <= c.hastaKm)?.nombre || 'Ruta completada', 14, 54);
g.fillStyle = 'rgba(9,23,37,0.72)'; g.beginPath(); g.roundRect(W - 112, 12, 100, 24, 12); g.fill();
g.fillStyle = '#fff'; g.font = '800 10px Helvetica, Arial'; g.textAlign = 'center'; g.fillText(kmUser >= total ? '✓ CONQUISTADO' : `${kmUser} / ${total} km`, W - 62, 24); g.textAlign = 'left';
const choques = Object.entries(etiquetas).flatMap(([id, c]) => [
  ...visibles.filter((p) => seSuperponen(c, { x: p.cabeza.x - 9, y: p.cabeza.y - 9, w: 18, h: 18 })).map((p) => `${id}~pin:${p.cp.id}`),
  ...zonasHud.filter((z) => seSuperponen(c, z)).map(() => `${id}~hud`),
  ...Object.entries(etiquetas).filter(([o, d]) => o > id && seSuperponen(c, d)).map(([o]) => `${id}~${o}`)]);
// Largo de la ruta en pantalla y menor distancia entre cabezas antes de separarlas.
let rutaPx = 0, previo = null;
for (let km = 0; km <= total; km += 2) { const a = aPx(posicionEnKm(mundo.datos, mundo.conv, km, 0)); if (previo) rutaPx += Math.hypot(a.x - previo.x, a.y - previo.y); previo = a; }
const cabezas = j.checkpoints.map((cp) => aPx(posicionEnKm(mundo.datos, mundo.conv, cp.kmJourney, 0).add(new THREE.Vector3(0, escena.alturaPinUnidades, 0))));
let minCab = Infinity; cabezas.forEach((a, i) => cabezas.slice(i + 1).forEach((b) => { minCab = Math.min(minCab, Math.hypot(a.x - b.x, a.y - b.y)); }));
const finPx = aPx(posicionEnKm(mundo.datos, mundo.conv, total, 0));
const extremo = (p) => p && [p.cp.id, Math.round(p.cabeza.x), Math.round(p.cabeza.y), p.cabeza.x > 11 && p.cabeza.x < W - 11 && p.cabeza.y > 11 && p.cabeza.y < H - 11];
const todos = (escena.etiquetas || []).map((e) => { const a = aPx(posicionGeo(mundo.datos, mundo.conv, e.lat, e.lon, e.tipo === 'agua' ? escena.mar?.nivelM : undefined)); return [e.id, Math.round(a.x), Math.round(a.y), a.visible]; });
window.METRICAS = { nombresTodos: todos, rutaPx: Math.round(rutaPx), minCabezaPx: Math.round(minCab), finPx: [Math.round(finPx.x), Math.round(finPx.y)], general, etiquetas: Object.keys(etiquetas), nombres: nombres.map((e) => e.id), choques, pinesVisibles: visibles.length,
  extremos: [extremo(pines[0]), extremo(pines.at(-1))], tBuild: Math.round(tBuild), tRender: Math.round(tRender),
  triangulos: renderer.info.render.triangles, llamadas: renderer.info.render.calls, nx: mundo.datos.campo.nx, nz: mundo.datos.campo.nz };
window.LISTO = true;
