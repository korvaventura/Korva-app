// Escena 3D propia de la Vía Appia: traza real, km virtuales, relieve, agua,
// encuadre, etiquetas, cámaras y horneado reproducible.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const THREE = require('three');
const terreno = require('../services/mapa3d/terrenoCore');
const hc = require('../services/mapa3d/horneadoCore');
const escena = require('../services/mapa3d/escenas/viaAppia');
const horneado = require('../services/mapa3d/escenas/viaAppia.horneado');
const trazado = require('../services/mapa3d/escenas/viaAppia.recorrido');
const historia = require('../services/desafios/viaAppia');
const { conRelieveReal, cargar, meta } = require('../scripts/mapa3d/viaAppia.relieveReal');
const { resolverGeneralCamino, limitarVistaCamino } = require('../services/mapa3d/vistaCaminoCore');
const { separarPinesCamino } = require('../services/mapa3d/pinesCaminoCore');
const { ubicarEtiquetas, cajasDePines, seSuperponen, separarPinesCercanos } = require('../services/mapa3d/etiquetasCore');
const { buscarAncla, anclaLlegada, controlAncla, interpolarLlegada } = require('../services/mapa3d/anclasCore');
const { estadoJourney } = require('../services/mapa3d/journeyCore');

const fuente = fs.readFileSync(path.join(__dirname, '../components/mapa3d/construirMundo.js'), 'utf8').replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
const motor = new Function('THREE', 'crearObjetosCamino', 'construirModeloMeshy', 'crearAmbienteIslandia', 'crearRutaVisualModelo', 'construirDatosDiorama', 'puntoEnKm', 'indiceCercano', 'deserializarDiorama',
  fuente + ';return {construirMundo, configurarCamara, actualizarAtmosfera, posicionEnKm, posicionGeo, profundidadBordeVisible};')(
  THREE, () => null, () => null, () => null, () => null, terreno.construirDatosDiorama, terreno.puntoEnKm, terreno.indiceCercano, hc.deserializarDiorama);
const mundo = motor.construirMundo(escena, horneado);
const deco = mundo.datos;
const KM_LON = 111.2 * Math.cos(41.2 * Math.PI / 180);
const distKm = (a, b) => Math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * KM_LON);
const distTraza = (lat, lon) => Math.min(...trazado.puntos.slice(1).map((b, i) => {
  const a = trazado.puntos[i];
  const bx = (b[1] - a[1]) * KM_LON, bz = (b[0] - a[0]) * 111.2, px = (lon - a[1]) * KM_LON, pz = (lat - a[0]) * 111.2;
  const t = Math.max(0, Math.min(1, (px * bx + pz * bz) / ((bx * bx + bz * bz) || 1e-9)));
  return Math.hypot(bx * t - px, bz * t - pz);
}));
const VISORES = [[320, 480], [360, 480], [360, 560], [375, 560], [375, 667], [390, 560], [390, 640], [393, 700], [412, 700], [414, 780], [430, 720], [430, 932], [700, 500], [600, 400]];
function general(w, h) {
  const camera = new THREE.PerspectiveCamera(); const puntos = [];
  for (let km = 0; km <= 611; km += 5) { const p = motor.posicionEnKm(deco, mundo.conv, km, 0); puntos.push(p, p.clone().add(new THREE.Vector3(0, escena.alturaPinUnidades, 0))); }
  const fin = motor.posicionEnKm(deco, mundo.conv, 611, 0); puntos.push(fin, fin.clone().add(new THREE.Vector3(0, escena.alturaPinUnidades, 0)));
  const proyectar = (c) => { motor.configurarCamara(camera, escena, w / h, c, mundo); return puntos.map((p) => p.clone().project(camera)); };
  const control = resolverGeneralCamino(proyectar, { azimut: 0, elevacion: 0, zoom: escena.camara.zoomGeneral, objetivo: escena.camara.objetivoGeneral }, w, h);
  motor.configurarCamara(camera, escena, w / h, control, mundo);
  return { control, camera, proyectar };
}
const aPx = (camera, v, w, h) => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, visible: p.z > -1 && p.z < 1 }; };

// ── Traza e hitos ────────────────────────────────────────────────────────
test('[via_appia] traza Itiner-e continua, sin rectas entre ciudades, Brindisi → Porta Capena', () => {
  assert.ok(trazado.puntos.length >= 800, 'traza densa, no 13 segmentos rectos');
  // Sólo las rectas reales de la Appia (tramo pontino, ~42 km) superan 12 km entre vértices.
  for (let i = 1; i < trazado.puntos.length; i += 1) {
    const d = distKm(trazado.puntos[i - 1], trazado.puntos[i]);
    assert.ok(d < 12 || (trazado.puntos[i][0] > 41.3 && trazado.puntos[i][0] < 41.6 && d < 23), `salto de traza en ${i}: ${d.toFixed(1)} km`);
  }
  const ids = historia.checkpoints.map((c) => c.id);
  ids.slice(1).forEach((id, k) => {
    if (k === 0) return; // Porta Capena → Cecilia Metella: 4,5 km de ciudad
    assert.ok(trazado.anclas[id] - trazado.anclas[ids[k]] >= 4, `${ids[k]} → ${id} unido por una recta`);
  });
  assert.ok(distKm(trazado.puntos.at(-1), [41.8847, 12.4895]) < 0.15, 'termina en Piazza di Porta Capena');
  assert.ok(distKm(trazado.puntos.at(-1), [41.8902, 12.4922]) > 0.5, 'el Coliseo es un símbolo, no el extremo histórico');
  assert.ok(distKm(trazado.puntos[0], [40.6414, 17.9458]) < 0.2, 'empieza en las columnas de Brindisi');
  assert.match(trazado.fuente, /Itiner-e.*CC BY 4\.0/);
});

test('[via_appia] Appia Antica por Venosa, Gravina y Taranto; no la variante Traiana', () => {
  for (const [nombre, lat, lon] of [['Benevento', 41.1316, 14.7786], ['Venosa', 40.9664, 15.8217], ['Gravina', 40.8193, 16.4204], ['Taranto', 40.4735, 17.2296], ['Oria', 40.4995, 17.6405]]) {
    assert.ok(distTraza(lat, lon) < 1.2, `debe pasar por ${nombre}`);
  }
  for (const [nombre, lat, lon] of [['Canosa', 41.2236, 16.0655], ['Bari', 41.1171, 16.8719], ['Egnazia', 40.8875, 17.3917]]) {
    assert.ok(distTraza(lat, lon) > 15, `no debe desviarse por ${nombre} (Traiana)`);
  }
  assert.ok(distTraza(41.8578, 12.5157) < 0.5, 'Porta San Sebastiano queda sobre el recorrido, no como inicio');
});

test('[via_appia] los 13 hitos conservan IDs, orden y km, y caen sobre la traza', () => {
  assert.deepEqual(historia.checkpoints.map((c) => c.id), ['brindisi', 'oria', 'taranto', 'gravina', 'venosa', 'aeclanum', 'benevento', 'capua', 'formia', 'terracina', 'albano', 'cecilia_metella', 'roma']);
  assert.deepEqual(historia.checkpoints.map((c) => c.kmFisico), [0, 31, 81, 156, 216, 311, 346, 406, 461, 506, 586, 604, 611]);
  const indices = historia.checkpoints.map((cp) => trazado.anclas[cp.id]);
  indices.forEach((v, i) => i && assert.ok(v > indices[i - 1], 'anclas en orden de marcha'));
  const kmReal = historia.checkpoints.map((cp) => trazado.kmRealAnclas[cp.id]);
  kmReal.forEach((v, i) => i && assert.ok(v > kmReal[i - 1]));
  for (const cp of historia.checkpoints) {
    const w = escena.ruta[trazado.anclas[cp.id]];
    assert.equal(w.km, cp.kmFisico, `${cp.id}: km virtual`);
    assert.ok(distKm([w.lat, w.lon], [cp.lat, cp.lon]) < 1.2, `${cp.id}: a ${distKm([w.lat, w.lon], [cp.lat, cp.lon]).toFixed(2)} km`);
    const e = mundo.datos.campo.geo.proy.aKm(w.lat, w.lon); const p = terreno.puntoEnKm(deco.ruta, cp.kmFisico);
    assert.ok(Math.hypot(p.x - e.x, p.z - e.z) < 0.8, `${cp.id}: pin desplazado del ancla`);
  }
});

test('[via_appia] km virtuales crecientes 0-611; la geografía no se estira (573,6 km reales)', () => {
  assert.equal(deco.ruta[0].km, 0); assert.equal(deco.ruta.at(-1).km, 611);
  for (let i = 1; i < deco.ruta.length; i += 1) assert.ok(deco.ruta[i].km >= deco.ruta[i - 1].km);
  const real = trazado.kmRealAnclas.roma;
  assert.ok(real > 565 && real < 580, `largo geográfico ${real}`);
  // La ruta dibujada suaviza ondulaciones menores de la traza (<1 km), sin atajos.
  let largo = 0; for (let i = 1; i < deco.ruta.length; i += 1) largo += Math.hypot(deco.ruta[i].x - deco.ruta[i - 1].x, deco.ruta[i].z - deco.ruta[i - 1].z);
  assert.ok(largo > real * 0.93 && largo <= real + 1, `la ruta horneada mide ${largo.toFixed(1)} km`);
  const proy = mundo.datos.campo.geo.proy; const pts = trazado.puntos.map(([la, lo]) => proy.aKm(la, lo));
  for (const p of deco.ruta.filter((_, i) => i % 3 === 0)) {
    assert.ok(terreno.distanciaPolilinea(p.x, p.z, pts).d < 1, `la ruta se aparta de la traza en km ${p.km.toFixed(1)}`);
  }
});

// ── Relieve, agua y cobertura ───────────────────────────────────────────
test('[via_appia] horneado sincronizado con el generador (regeneración reproducible)', () => {
  assert.deepEqual(horneado, hc.serializarDiorama(terreno.construirDatosDiorama(conRelieveReal(escena))), 'regenerar con: node scripts/hornearMapa3D.js viaAppia');
  const bin = fs.readFileSync(path.join(__dirname, '../scripts/mapa3d/viaAppia.relieve.bin'));
  assert.equal(require('node:crypto').createHash('sha256').update(bin).digest('hex'), meta.sha256Bin, 'relieve preparado sin cambios manuales');
});

test('[via_appia] la ruta nunca queda enterrada ni sobre el mar', () => {
  const { campo } = deco;
  for (const p of deco.ruta) {
    const agua = campo.agua[terreno.indiceCercano(campo, p.x, p.z)];
    assert.ok(!(agua > -Infinity && p.h < agua), `ruta bajo el agua en km ${p.km.toFixed(1)}`);
    assert.ok(p.h >= campo.muestrear(p.x, p.z) - 0.5, `ruta enterrada en km ${p.km.toFixed(1)}`);
    assert.ok(p.h > 0, `ruta bajo el nivel del mar en km ${p.km.toFixed(1)}`);
  }
});

test('[via_appia] costa reconocible: mar, islas y lagos reales; sin celdas vacías', () => {
  const { campo } = deco;
  for (let k = 0; k < campo.alturas.length; k += 1) assert.ok(Number.isFinite(campo.alturas[k]));
  const m = conRelieveReal(escena).relieve.real.muestrear;
  const geo = (lat, lon) => m((lon - 15.2) * KM_LON, -(lat - 41.2) * 111.2);
  for (const [nombre, lat, lon] of [['golfo de Taranto', 40.0, 17.0], ['Tirreno', 40.6, 13.0], ['Adriático', 41.9, 17.2], ['Jónico', 39.2, 18.2]]) {
    const p = geo(lat, lon); assert.ok(p.agua === 0 && p.h < -50, `${nombre} debe ser mar`);
  }
  for (const [nombre, lat, lon, min] of [['Matese', 41.45, 14.4, 1200], ['Vulture', 40.955, 15.633, 900], ['Gran Sasso', 42.45, 13.57, 1800], ['Murgia', 40.85, 16.55, 350], ['Etna (contexto a 2 km, promediado por distancia)', 37.75, 14.99, 2000], ['Albania', 40.4, 20.4, 800]]) {
    const p = geo(lat, lon); assert.ok(p.h > min && p.agua === -Infinity, `${nombre}: ${p.h}`);
  }
  for (const [nombre, lat, lon] of [['Capri', 40.55, 14.23], ['Ischia', 40.73, 13.9]]) assert.ok(geo(lat, lon).h > 50, `${nombre} existe`);
  const bolsena = geo(42.59, 11.94); assert.ok(bolsena.agua > 250 && bolsena.agua < 330, 'Lago di Bolsena a su nivel');
});

test('[via_appia] contexto continuo: relieve en toda la malla, sin bordes estirados ni saltos de resolución', () => {
  const { campo } = deco; const { nx, nz, alturas, agua, xs, zs } = campo;
  // Cada franja del borde de la malla conserva variación de relieve en tierra (no un borde extruido).
  for (const [nombre, celdas] of [['norte', Array.from({ length: nx }, (_, i) => i + nx * 2)], ['sur', Array.from({ length: nx }, (_, i) => i + nx * (nz - 3))],
    ['oeste', Array.from({ length: nz }, (_, j) => j * nx + 2)], ['este', Array.from({ length: nz }, (_, j) => j * nx + nx - 3)]]) {
    const tierra = celdas.filter((k) => !(agua[k] > -Infinity && alturas[k] < agua[k])).map((k) => alturas[k]);
    if (tierra.length < 10) continue;
    const media = tierra.reduce((a, b) => a + b, 0) / tierra.length;
    const desvio = Math.sqrt(tierra.reduce((a, b) => a + (b - media) ** 2, 0) / tierra.length);
    assert.ok(desvio > 40, `borde ${nombre} sin relieve (σ=${desvio.toFixed(1)} m)`);
  }
  // Sin escalones en el fundido corredor -> contexto (cruce del borde del detalle).
  const { detalle } = cargar(); const m = conRelieveReal(escena).relieve.real.muestrear;
  for (const z of [-60, 0, 60, 120]) {
    let previo = null;
    for (let x = detalle.minX - 40; x <= detalle.minX + 40; x += 0.5) {
      const h = m(x, z).h; if (previo != null && h > 5 && previo > 5) assert.ok(Math.abs(h - previo) < 120, `salto en x=${x}, z=${z}`); previo = h;
    }
  }
  // La grilla crece de forma gradual (factor < 1,15 entre celdas vecinas).
  for (const eje of [xs, zs]) for (let i = 2; i < eje.length; i += 1) {
    const r = (eje[i] - eje[i - 1]) / (eje[i - 1] - eje[i - 2]); assert.ok(r < 1.15 && r > 1 / 1.15, 'transición de resolución gradual');
  }
});

test('[via_appia] presupuesto: vértices y triángulos no superan al Camino', () => {
  const { nx, nz } = deco.campo;
  assert.ok(nx * nz <= 227304, `vértices ${nx * nz}`);
  let tri = 0; let draws = 0;
  mundo.grupo.traverse((m) => { if (m.isMesh) { tri += (m.geometry.index?.count || m.geometry.attributes.position.count) / 3; draws += 1; } });
  assert.ok(tri <= 452784, `triángulos de terreno/agua ${tri}`);
  // Terreno, océano continuo y un plano por lago visible (Bolsena, Trasimeno, Bracciano, Skadar...).
  assert.ok(draws <= 8, `draw calls de paisaje ${draws}`);
  const mar = mundo.grupo.children[1].children.find((m) => m.geometry.type === 'PlaneGeometry');
  assert.ok(mar && mar.geometry.index.count === 6, 'océano continuo de dos triángulos');
});

// ── Encuadre, etiquetas y cámara ─────────────────────────────────────────
test('[via_appia] General encuadra todo el recorrido, inicio y llegada completos, en varios visores', () => {
  for (const [w, h] of VISORES) {
    const { control, proyectar, camera } = general(w, h);
    const top = Math.min(138, h * 0.22), bottom = Math.min(90, h * 0.14);
    assert.ok(control.zoom > 0.3 && control.zoom < 1.4, `zoom ${control.zoom} en ${w}x${h}`);
    for (const p of proyectar(control)) {
      const x = (p.x + 1) * w / 2, y = (1 - p.y) * h / 2;
      assert.ok(x >= 30 && x <= w - 30 && y >= top - 1 && y <= h - bottom + 1, `${w}x${h}: ${x.toFixed(0)},${y.toFixed(0)}`);
    }
    for (const km of [0, 611]) {
      const c = aPx(camera, motor.posicionEnKm(deco, mundo.conv, km, 0).add(new THREE.Vector3(0, escena.alturaPinUnidades, 0)), w, h);
      assert.ok(c.x > 12 && c.x < w - 12 && c.y > 12 && c.y < h - 12, `pin de km ${km} cortado en ${w}x${h}`);
    }
    // El recorrido ocupa la vista: no es una ruta minúscula en un mapamundi.
    const a = aPx(camera, motor.posicionEnKm(deco, mundo.conv, 0, 0), w, h), b = aPx(camera, motor.posicionEnKm(deco, mundo.conv, 611, 0), w, h);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > Math.min(w, h) * 0.55, `ruta pequeña en ${w}x${h}`);
  }
});

function overlay(w, h, km) {
  const { camera } = general(w, h);
  const j = estadoJourney({ checkpoints: historia.checkpoints, kmProgreso: km, distanciaKm: 611, completado: km >= 611 });
  let pines = separarPinesCercanos(j.checkpoints.map((cp) => ({ cp, km: cp.kmJourney,
    cabeza: aPx(camera, motor.posicionEnKm(deco, mundo.conv, cp.kmJourney, 0).add(new THREE.Vector3(0, escena.alturaPinUnidades, 0)), w, h),
    base: aPx(camera, motor.posicionEnKm(deco, mundo.conv, cp.kmJourney, 0), w, h), estadoJourney: cp.estadoJourney })), escena.pinesSeparados, w, h);
  pines = separarPinesCamino(pines, w, h);
  const zonasHud = [{ x: 0, y: 0, w, h: 64 }, { x: 0, y: 64, w: 205, h: 100 }, { x: 0, y: h - 124, w: 200, h: 124 }, { x: w - 56, y: h - 92, w: 56, h: 92 }, { x: 0, y: h - 32, w, h: 32 }];
  const ultimo = j.checkpoints.filter((c) => c.estadoJourney === 'conquistado').at(-1)?.id;
  const items = pines.filter((p) => p.cp.id === j.checkpoints[0].id || p.estadoJourney === 'proximo' || p.cp.id === 'roma' || p.cp.id === ultimo)
    .map((p) => ({ id: p.cp.id, x: p.cabeza.x, y: p.cabeza.y, texto: p.cp.nombre.toUpperCase(), prioridad: p.estadoJourney === 'proximo' ? 3 : 2 }));
  const etiquetas = ubicarEtiquetas(items, w, h, { ocupados: [...zonasHud, ...cajasDePines(pines.map((p) => p.cabeza))], ocultarSiNoCabe: true });
  return { pines, zonasHud, etiquetas, camera };
}

test('[via_appia] pines separados en pantalla y etiquetas sin superposición con pines, HUD u otras etiquetas', () => {
  for (const [w, h] of VISORES) for (const km of [0, 305, 611]) {
    const { pines, zonasHud, etiquetas } = overlay(w, h, km);
    for (let i = 0; i < pines.length; i += 1) for (let k = i + 1; k < pines.length; k += 1) {
      assert.ok(Math.hypot(pines[i].cabeza.x - pines[k].cabeza.x, pines[i].cabeza.y - pines[k].cabeza.y) >= 20, `pines apilados ${pines[i].cp.id}/${pines[k].cp.id} en ${w}x${h}`);
    }
    pines.forEach((p) => assert.ok(Math.hypot(p.cabeza.x - p.base.x, p.cabeza.y - p.base.y) < 200, 'la cabeza sigue unida a su base'));
    const cajas = Object.entries(etiquetas);
    assert.ok(cajas.some(([id]) => id === 'roma') && cajas.some(([id]) => id === 'brindisi'), `inicio y llegada rotulados en ${w}x${h}`);
    for (const [id, c] of cajas) {
      assert.ok(!zonasHud.some((z) => seSuperponen(c, z)), `${id} bajo el HUD`);
      assert.ok(!pines.some((p) => seSuperponen(c, { x: p.cabeza.x - 9, y: p.cabeza.y - 9, w: 18, h: 18 })), `${id} tapa un pin`);
      for (const [otro, d] of cajas) if (otro > id) assert.ok(!seSuperponen(c, d), `${id} tapa ${otro}`);
    }
  }
});

test('[via_appia] nombres de regiones y mares en ubicaciones verificadas (Natural Earth)', () => {
  const leer = (n) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, `../../tools/mapa3d/datos/appia-${n}-ne10m.geojson.gz`))).toString()).features;
  const dentro = (geom, lon, lat) => (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates).some((poly) => {
    const enAnillo = (r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { if ((r[i][1] > lat) !== (r[j][1] > lat) && lon < (r[j][0] - r[i][0]) * (lat - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; } return c; };
    return enAnillo(poly[0]) && !poly.slice(1).some(enAnillo);
  });
  const regiones = leer('regiones');
  const REGION = { region_lazio: 'Lazio', region_campania: 'Campania', region_basilicata: 'Basilicata', region_puglia: 'Apulia' };
  const tipos = new Set(escena.etiquetas.map((e) => e.texto));
  for (const n of ['LAZIO', 'CAMPANIA', 'BASILICATA', 'PUGLIA', 'MAR TIRRENO', 'MAR ADRIÁTICO', 'MAR JÓNICO']) assert.ok(tipos.has(n), `falta ${n}`);
  assert.ok(escena.etiquetas.length <= 10, 'sin saturar de texto');
  const m = conRelieveReal(escena).relieve.real.muestrear;
  for (const e of escena.etiquetas) {
    const p = m((e.lon - 15.2) * KM_LON, -(e.lat - 41.2) * 111.2);
    if (REGION[e.id]) assert.ok(regiones.some((f) => f.properties.region === REGION[e.id] && dentro(f.geometry, e.lon, e.lat)), `${e.id} fuera de su región`);
    if (e.tipo === 'agua') assert.ok(p.agua === 0 && p.h < -30, `${e.id} no está sobre el mar`);
    else assert.ok(p.agua === -Infinity && p.h > 0, `${e.id} no está sobre tierra`);
  }
});

test('[via_appia] gestos: límites de pan, zoom e inclinación; General recupera el encuadre', () => {
  const { control } = general(390, 640);
  const lim = escena.territorio.limitesGestos;
  for (const entrada of [{ azimut: Math.PI * 7, elevacion: -2, zoom: 9, objetivo: [60, 0, -60] }, { azimut: -3, elevacion: 2, zoom: 0.001, objetivo: [-60, 0, 60] }]) {
    const copia = JSON.parse(JSON.stringify(entrada));
    const c = limitarVistaCamino(entrada, escena.camara, control, lim);
    assert.deepEqual(entrada, copia, 'no muta el control');
    assert.ok(c.objetivo[0] >= lim.caja.minX && c.objetivo[0] <= lim.caja.maxX && c.objetivo[2] >= lim.caja.minZ && c.objetivo[2] <= lim.caja.maxZ);
    assert.ok(c.zoom >= escena.camara.zoomMin && c.zoom <= Math.max(escena.camara.zoomExploracionMax, control.zoom));
    const el = c.elevacion + escena.camara.elevacionGrados * Math.PI / 180;
    assert.ok(el >= 20 * Math.PI / 180 - 1e-9 && el <= 70 * Math.PI / 180 + 1e-9);
  }
  // Acercamiento a monumentos futuros no bloqueado.
  assert.ok(limitarVistaCamino({ ...control, zoom: 0.02 }, escena.camara, control, lim).zoom <= 0.021);
  // El objetivo permitido siempre cae sobre territorio horneado (no se ve el reverso de la malla).
  const { campo } = deco; const u = (km) => km / escena.kmPorUnidad;
  assert.ok(u(campo.minX) < lim.caja.minX - 8 && u(campo.maxX) > lim.caja.maxX + 8 && u(campo.minZ) < lim.caja.minZ - 8 && u(campo.maxZ) > lim.caja.maxZ + 8);
  // General es el mismo aunque el usuario haya explorado antes (depende sólo del visor).
  assert.deepEqual(general(390, 640).control, control);
});

test('[via_appia] la niebla oculta el borde del mundo en giros completos e inclinaciones extremas', () => {
  const { control } = general(390, 640); const camera = new THREE.PerspectiveCamera();
  const lim = escena.territorio.limitesGestos;
  for (const objetivo of [control.objetivo, [lim.caja.minX, 0, lim.caja.minZ], [lim.caja.maxX, 0, lim.caja.maxZ]]) for (const angulo of [35, 46, 70]) for (let az = 0; az < 360; az += 30) {
    const c = limitarVistaCamino({ ...control, objetivo, zoom: 1.15, azimut: az * Math.PI / 180, elevacion: (angulo - escena.camara.elevacionGrados) * Math.PI / 180 }, escena.camara, control, lim);
    motor.configurarCamara(camera, escena, 390 / 640, c, mundo); motor.actualizarAtmosfera(mundo, escena, camera);
    const borde = motor.profundidadBordeVisible(mundo, camera);
    assert.ok(mundo.niebla.near >= 0 && mundo.niebla.near < mundo.niebla.far);
    if (Number.isFinite(borde)) assert.ok(mundo.niebla.far < borde, `borde visible az ${az} incl ${angulo}`);
  }
  // En General la niebla no tapa la ruta.
  for (const [w, h] of [[390, 640], [360, 480], [430, 932]]) {
    const { camera: cam } = general(w, h); motor.actualizarAtmosfera(mundo, escena, cam);
    for (let km = 0; km <= 611; km += 5) {
      const ojo = motor.posicionEnKm(deco, mundo.conv, km, 0).applyMatrix4(cam.matrixWorldInverse);
      assert.ok(THREE.MathUtils.smoothstep(-ojo.z, mundo.niebla.near, mundo.niebla.far) < 0.15, `niebla en km ${km}`);
    }
  }
});

// ── Anclas, replay y llegada ─────────────────────────────────────────────
test('[via_appia] anclas Meshy por hito, configurables y sin modelos cargados', () => {
  const anclas = escena.territorio.anclas;
  assert.deepEqual(anclas.map((a) => a.hito), historia.checkpoints.map((c) => c.id));
  for (const a of anclas) {
    assert.equal(a.km, historia.checkpoints.find((c) => c.id === a.hito).kmFisico);
    for (const k of ['escala', 'rotacionGrados', 'desplazamientoLateralKm', 'ejeFrenteModelo', 'camara']) assert.ok(k in a, `${a.hito}.${k}`);
    assert.equal(a.modelo, null, 'todavía sin modelo: no se cargan GLB');
  }
  for (const [hito, rumbo] of [['benevento', 45], ['brindisi', 350]]) assert.equal(anclas.find((a) => a.hito === hito).frenteGrados, rumbo);
  // Cámara definida por la orientación del monumento, no por una rotación copiada.
  const c = controlAncla(anclaLlegada(escena.territorio), { x: 0, y: 0, z: 0 }, escena.camara);
  assert.ok(Math.abs(((c.azimut * 180 / Math.PI + escena.camara.azimutGrados) % 360 + 360) % 360 - 225) < 1e-9);
  // Desplazamiento lateral: a la derecha de la marcha, sin tocar la traza.
  const lateral = controlAncla({ ...anclas[6], desplazamientoLateralKm: 5.5 }, { x: 1, y: 0, z: 1 }, escena.camara, { x: 1, z: 0 }, 55);
  assert.ok(Math.abs(lateral.objetivo[2] - 1.1) < 1e-9 && Math.abs(lateral.objetivo[0] - 1) < 1e-9);
  assert.equal(buscarAncla(escena.territorio, { id: 'benevento' }).hito, 'benevento');
  assert.equal(buscarAncla(escena.territorio, { km: 999 }).hito, 'brindisi', 'ancla por defecto');
});

test('[via_appia] llegada: acercamiento suave al final, sin saltos, y el final queda en el encuadre', () => {
  const ancla = anclaLlegada(escena.territorio);
  const fin = motor.posicionEnKm(deco, mundo.conv, 611, 0); const prev = motor.posicionEnKm(deco, mundo.conv, 610, 0);
  const destino = controlAncla(ancla, fin, escena.camara, { x: fin.x - prev.x, z: fin.z - prev.z }, escena.kmPorUnidad);
  const inicio = { azimut: 7.5, elevacion: 0.1, zoom: 0.8, objetivo: [1, 0, 1] };
  let anterior = interpolarLlegada(inicio, destino, 0);
  assert.deepEqual(anterior.objetivo, inicio.objetivo);
  for (let t = 0.02; t <= 1.0001; t += 0.02) {
    const c = interpolarLlegada(inicio, destino, Math.min(1, t));
    assert.ok(Math.hypot(...c.objetivo.map((v, i) => v - anterior.objetivo[i])) < 0.2, 'sin saltos de objetivo');
    assert.ok(Math.abs(c.azimut - anterior.azimut) < 0.2, 'giro corto, sin vueltas completas');
    anterior = c;
  }
  const final = interpolarLlegada(inicio, destino, 1);
  assert.deepEqual(final.objetivo, destino.objetivo); assert.ok(Math.abs(final.zoom - destino.zoom) < 1e-12);
  const camera = new THREE.PerspectiveCamera();
  for (const [w, h] of VISORES) {
    motor.configurarCamara(camera, escena, w / h, destino, mundo);
    const p = aPx(camera, fin, w, h);
    assert.ok(p.visible && Math.abs(p.x - w / 2) < w * 0.1 && p.y > h * 0.3 && p.y < h * 0.7, `final fuera de cuadro en ${w}x${h}`);
  }
});

test('[via_appia] replay: el componente sigue la ruta y el mensaje llega después del movimiento', () => {
  const src = fs.readFileSync(path.join(__dirname, '../components/MapaRecorrido3D.js'), 'utf8');
  assert.match(src, /if \(avance < 1\) playbackRef\.current = requestAnimationFrame\(acercarLlegada\);\s*else mostrarCierre\(\);/);
  assert.match(src, /const ancla = completado \? anclaLlegada\(escena\.territorio\) : null;/);
  assert.doesNotMatch(src, /camino_santiago|=== 775|via_appia/, 'sin condiciones por id o km de un desafío');
  // El replay recorre los puntos de la ruta: avance continuo y monótono.
  let previo = null;
  for (let t = 0; t <= 1; t += 0.01) {
    const s = t * t * (3 - 2 * t); const p = motor.posicionEnKm(deco, mundo.conv, 611 * s, 0);
    if (previo) assert.ok(p.distanceTo(previo) < 0.25, 'el replay no salta entre hitos');
    previo = p;
  }
});

test('[via_appia] carga perezosa: registrar Appia no carga otras escenas ni modelos', () => {
  const claves = (k) => Object.keys(require.cache).filter((f) => f.includes(path.join('escenas', k)));
  const { escenaParaConfig } = require('../services/mapa3d/escenas');
  const antes = new Set(Object.keys(require.cache));
  const r = escenaParaConfig('via_appia');
  assert.equal(r.escena.id, 'via_appia'); assert.ok(r.horneado.nx > 0);
  const nuevos = Object.keys(require.cache).filter((f) => !antes.has(f));
  assert.ok(!nuevos.some((f) => /caminoSantiago|dubrovnik|finDelMundo|monteFuji|sanAndres|islandia/.test(f)), 'no carga otras escenas');
  assert.ok(claves('viaAppia').length >= 1);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../services/mapa3d/escenas/viaAppia.js'), 'utf8'), /require\([^)]*scripts\//, 'la escena no depende de herramientas');
});
