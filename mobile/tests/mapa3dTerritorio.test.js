// Regresión del Camino: el modo territorio por configuración reproduce las
// cámaras, límites y textos que antes estaban fijados por id/km en el código.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const escena = require('../services/mapa3d/escenas/caminoSantiago');
const { limitarVistaCamino, LIMITES_CAMINO } = require('../services/mapa3d/vistaCaminoCore');
const { buscarAncla, anclaLlegada, controlAncla, interpolarLlegada, tituloAncla } = require('../services/mapa3d/anclasCore');

const rad = (g) => g * Math.PI / 180;
const base = { x: 3.2, y: 0.4, z: -1.7 };
// Fórmulas de la versión aprobada (MapaRecorrido3D antes de generalizar).
const aprobado = (km) => ({
  azimut: 0,
  elevacion: km === 775 ? rad(27 - escena.camara.elevacionGrados) : 0,
  zoom: .025,
  objetivo: [base.x + (km === 775 ? -.045 : km === 69 ? .025 : -.025), base.y + .065, base.z],
});

test('Camino: las cámaras de Mojón, Puente y Catedral son idénticas a la versión aprobada', () => {
  for (const km of [0, 69, 775, 312]) {
    const ancla = buscarAncla(escena.territorio, { km });
    assert.deepEqual(controlAncla(ancla, base, escena.camara), aprobado(km), `km ${km}`);
  }
  assert.deepEqual(['Mojón del Camino', 'Puente la Reina', 'Catedral de Santiago', 'Mojón del Camino'],
    [0, 69, 775, 312].map((km) => tituloAncla(buscarAncla(escena.territorio, { km }))));
  assert.equal(buscarAncla(escena.territorio, { general: true }), null);
});

test('Camino: la llegada termina exactamente en la cámara aprobada de la catedral', () => {
  const ancla = anclaLlegada(escena.territorio);
  assert.equal(ancla.km, escena.distanciaKm);
  const destino = controlAncla(ancla, base, escena.camara);
  assert.deepEqual(destino, aprobado(775));
  const inicio = { azimut: 0.4, elevacion: 0.1, zoom: 0.9, objetivo: [0, 0, 0] };
  const fin = interpolarLlegada(inicio, destino, 1);
  assert.deepEqual(fin.objetivo, destino.objetivo);
  assert.equal(fin.elevacion, destino.elevacion);
  assert.ok(Math.abs(fin.zoom - .025) < 1e-12 && Math.abs(fin.azimut) < 1e-12);
  // A mitad de camino coincide con la interpolación aprobada (azimut dentro de ±π).
  const medio = interpolarLlegada(inicio, destino, .5), s = .5;
  assert.ok(Math.abs(medio.azimut - inicio.azimut * (1 - s)) < 1e-12);
  assert.ok(Math.abs(medio.zoom - Math.exp(Math.log(.9) * (1 - s) + Math.log(.025) * s)) < 1e-12);
});

test('Camino: límites de gestos declarados en la escena = límites aprobados', () => {
  assert.deepEqual(escena.territorio.limitesGestos, LIMITES_CAMINO);
  const general = { azimut: 0, elevacion: 0, zoom: .96, objetivo: [0.4, 0, -0.6] };
  for (const c of [{ azimut: 3, elevacion: -1, zoom: 5, objetivo: [40, 0, -40] }, { azimut: 0, elevacion: .2, zoom: .02, objetivo: [-3, .065, 2] }]) {
    assert.deepEqual(limitarVistaCamino(c, escena.camara, general, escena.territorio.limitesGestos), limitarVistaCamino(c, escena.camara, general));
  }
});

test('Camino: los valores antes fijos por id quedan declarados en la escena, sin ramas por id', () => {
  assert.equal(escena.suavizadoColor, 0.12);
  assert.equal(escena.atmosfera.bordePorProfundidad, true);
  assert.deepEqual([escena.territorio.rutaEstatica, escena.territorio.dpr, escena.territorio.separarCabezasPin, escena.territorio.textoCierre], [true, 2, true, 'DESAFÍO COMPLETADO']);
  const comp = fs.readFileSync(path.join(__dirname, '../components/MapaRecorrido3D.js'), 'utf8');
  const mundo = fs.readFileSync(path.join(__dirname, '../components/mapa3d/construirMundo.js'), 'utf8');
  assert.doesNotMatch(comp, /camino_santiago|=== 775|=== 69\b/);
  // La única referencia restante carga las miniaturas propias del Camino.
  assert.equal((mundo.match(/camino_santiago/g) || []).length, 1);
  assert.match(mundo, /escena\.id === 'camino_santiago' \? crearObjetosCamino/);
});
