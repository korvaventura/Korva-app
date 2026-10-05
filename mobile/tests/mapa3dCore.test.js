const test = require('node:test');
const assert = require('node:assert/strict');
const escena = require('../services/mapa3d/escenas/finDelMundo');
const horneado = require('../services/mapa3d/escenas/finDelMundo.horneado');
const {
  construirDatosDiorama, crearFuncionAltura, puntoEnKm, kmDeProgreso, crearGrilla, indiceCercano,
} = require('../services/mapa3d/terrenoCore');
const {
  bytesABase64, base64ABytes, serializarDiorama, deserializarDiorama,
} = require('../services/mapa3d/horneadoCore');
const { ubicarEtiquetas, seSuperponen } = require('../services/mapa3d/etiquetasCore');

const datos = construirDatosDiorama(escena);
const CHECKPOINTS_KM = { tolhuin: 0, lago_fagnano: 20, paso_garibaldi: 45, monte_olivia: 80, ushuaia: 103 };

test('la ruta cubre exactamente los 103 km del desafío', () => {
  assert.equal(datos.ruta[0].km, 0);
  assert.equal(datos.ruta.at(-1).km, escena.distanciaKm);
  for (let i = 1; i < datos.ruta.length; i += 1) assert.ok(datos.ruta[i].km >= datos.ruta[i - 1].km);
});

test('cada checkpoint cae sobre su ancla geográfica', () => {
  const { proy } = crearFuncionAltura(escena);
  for (const km of Object.values(CHECKPOINTS_KM)) {
    const ancla = escena.ruta.find((w) => w.km === km);
    const esperado = proy.aKm(ancla.lat, ancla.lon);
    const p = puntoEnKm(datos.ruta, km);
    assert.ok(Math.hypot(p.x - esperado.x, p.z - esperado.z) < 0.6, `km ${km} desplazado`);
  }
});

test('la ruta nunca queda bajo el agua y el paso es el punto alto del corredor', () => {
  const { campo } = datos;
  for (const p of datos.ruta) {
    const nivel = campo.agua[indiceCercano(campo, p.x, p.z)];
    assert.ok(!(nivel > -Infinity && p.h < nivel - 1), `km ${p.km.toFixed(1)} bajo el agua`);
  }
  const garibaldi = puntoEnKm(datos.ruta, 45).h;
  assert.ok(garibaldi > 350 && garibaldi < 520, `Garibaldi ${garibaldi}`);
  assert.ok(puntoEnKm(datos.ruta, 0).h < 120 && puntoEnKm(datos.ruta, 103).h < 60);
});

test('el terreno tiene cordillera real, lagos y canal', () => {
  const { alturas, agua, xs, zs, nx } = datos.campo;
  const { minX, maxX, minZ, maxZ } = escena.limitesKm;
  let max = -Infinity;
  let celdas = 0;
  let celdasAgua = 0;
  for (let j = 0; j < zs.length; j += 1) {
    for (let i = 0; i < xs.length; i += 1) {
      if (xs[i] < minX || xs[i] > maxX || zs[j] < minZ || zs[j] > maxZ) continue;
      const k = j * nx + i;
      celdas += 1;
      max = Math.max(max, alturas[k]);
      if (agua[k] > -Infinity && alturas[k] < agua[k]) celdasAgua += 1;
    }
  }
  assert.ok(max > 1100, `cumbre máxima ${max}`);
  assert.ok(celdasAgua / celdas > 0.08, 'faltan Fagnano/Beagle en el área de la ruta');
});

test('progreso: completado muestra 100% y activos solo lo alcanzado', () => {
  assert.equal(kmDeProgreso(0.4, 103), 41.2);
  assert.equal(kmDeProgreso(0.97, 103, true), 103);
  assert.equal(kmDeProgreso(1.7, 103), 103);
  assert.equal(kmDeProgreso(-1, 103), 0);
  assert.equal(kmDeProgreso(NaN, 103), 0);
});

test('base64 ida y vuelta conserva bytes', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
  for (let n = 0; n <= bytes.length; n += 1) {
    assert.deepEqual(Array.from(base64ABytes(bytesABase64(bytes.subarray(0, n)))), Array.from(bytes.subarray(0, n)));
  }
  assert.equal(bytesABase64(new TextEncoder().encode('Korva!')), Buffer.from('Korva!').toString('base64'));
});

test('el horneado incluido en la app está sincronizado con el generador', () => {
  const fresco = serializarDiorama(datos);
  assert.equal(horneado.nx, fresco.nx);
  assert.equal(horneado.nz, fresco.nz);
  assert.equal(horneado.alturas, fresco.alturas, 'regenerar con: node scripts/hornearMapa3D.js');
  assert.equal(horneado.colores, fresco.colores, 'regenerar con: node scripts/hornearMapa3D.js');
  const deco = deserializarDiorama(escena, horneado);
  assert.equal(deco.ruta.length, datos.ruta.length);
  const k = Math.floor(deco.campo.alturas.length / 2);
  assert.ok(Math.abs(deco.campo.alturas[k] - datos.campo.alturas[k]) <= 0.5);
});

test('las etiquetas de checkpoints no se pisan', () => {
  const items = [
    { id: 'a', x: 200, y: 100, texto: 'USHUAIA' },
    { id: 'b', x: 205, y: 112, texto: 'MONTE OLIVIA' },
    { id: 'c', x: 190, y: 160, texto: 'PASO GARIBALDI' },
    { id: 'd', x: 100, y: 300, texto: 'TOLHUIN' },
  ];
  const cajas = Object.values(ubicarEtiquetas(items, 360, 400));
  for (let i = 0; i < cajas.length; i += 1) {
    for (let j = i + 1; j < cajas.length; j += 1) assert.ok(!seSuperponen(cajas[i], cajas[j]));
    assert.ok(cajas[i].x >= 0 && cajas[i].x + cajas[i].w <= 360);
  }
});


test('Journey Engine deriva conquistados, proximo y distancia restante sin conocer la escena', () => {
  const { estadoJourney } = require('../services/mapa3d/journeyCore');
  const estado = estadoJourney({
    distanciaKm: 100,
    kmProgreso: 37,
    checkpoints: [
      { id: 'a', kmFisico: 0 },
      { id: 'b', kmFisico: 20 },
      { id: 'c', kmFisico: 45 },
      { id: 'd', kmFisico: 80 },
    ],
  });
  assert.equal(estado.checkpoints[0].estadoJourney, 'conquistado');
  assert.equal(estado.checkpoints[1].estadoJourney, 'conquistado');
  assert.equal(estado.checkpoints[2].estadoJourney, 'proximo');
  assert.equal(estado.checkpoints[3].estadoJourney, 'bloqueado');
  assert.equal(estado.siguiente.id, 'c');
  assert.equal(estado.kmHastaSiguiente, 8);
});

test('Journey Engine completa cualquier escena usando su distancia', () => {
  const { estadoJourney } = require('../services/mapa3d/journeyCore');
  const estado = estadoJourney({
    distanciaKm: 68,
    kmProgreso: 10,
    completado: true,
    checkpoints: [{ id: 'inicio', kmFisico: 0 }, { id: 'meta', kmFisico: 68 }],
  });
  assert.equal(estado.kmActual, 68);
  assert.equal(estado.porcentaje, 1);
  assert.equal(estado.siguiente, null);
  assert.equal(estado.checkpoints[1].estadoJourney, 'conquistado');
});

test('mundo continuo: el territorio se extiende mucho más allá de la ruta', () => {
  const { campo } = datos;
  for (const p of datos.ruta) {
    const margen = Math.min(p.x - campo.minX, campo.maxX - p.x, p.z - campo.minZ, campo.maxZ - p.z);
    assert.ok(margen > 250, `la ruta queda a ${margen.toFixed(0)} km del borde del mundo`);
  }
});

test('grilla graduada: fina sobre la ruta, creciente hacia afuera y sin saltos bruscos', () => {
  const { xs, zs } = crearGrilla(escena);
  for (const eje of [xs, zs]) {
    for (let i = 1; i < eje.length; i += 1) assert.ok(eje[i] > eje[i - 1], 'eje no monótono');
    for (let i = 2; i < eje.length; i += 1) {
      const a = eje[i - 1] - eje[i - 2];
      const b = eje[i] - eje[i - 1];
      assert.ok(b / a < 1.25 && a / b < 1.25, 'salto de resolución visible');
    }
  }
  const { minX, maxX } = escena.limitesKm;
  const dentro = Array.from(xs).filter((x) => x > minX && x < maxX);
  for (let i = 1; i < dentro.length; i += 1) assert.ok(dentro[i] - dentro[i - 1] <= escena.resolucionKm * 1.02);
});

test('el filtro anisotrópico no altera la geografía de la ruta', () => {
  const geo = crearFuncionAltura(escena);
  for (const km of [0, 20, 45, 80, 103]) {
    const p = puntoEnKm(datos.ruta, km);
    const { h } = geo.altura(p.x, p.z);
    assert.ok(Math.abs(datos.campo.muestrear(p.x, p.z) - h) < 60, `km ${km}: relieve alterado`);
  }
});

test('el agua es geografía: Fagnano y Beagle existen en el mundo y la ruta los bordea', () => {
  const { campo } = datos;
  const { proy } = crearFuncionAltura(escena);
  const enAgua = (lat, lon) => {
    const { x, z } = proy.aKm(lat, lon);
    const k = indiceCercano(campo, x, z);
    return campo.agua[k] > -Infinity && campo.alturas[k] < campo.agua[k];
  };
  assert.ok(enAgua(-54.565, -67.75), 'falta el Lago Fagnano');
  assert.ok(enAgua(-54.590, -68.70), 'el Fagnano debe seguir hacia Chile');
  assert.ok(enAgua(-54.870, -67.80), 'falta el Canal Beagle');
  assert.ok(enAgua(-54.885, -69.25), 'el Beagle debe seguir hacia el oeste');
  assert.ok(!enAgua(-54.807, -68.305), 'Ushuaia no puede quedar bajo el agua');
});
