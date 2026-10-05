const test = require('node:test');
const assert = require('node:assert/strict');
const escena = require('../services/mapa3d/escenas/finDelMundo');
const horneado = require('../services/mapa3d/escenas/finDelMundo.horneado');
const {
  construirDatosDiorama, crearFuncionAltura, puntoEnKm, kmDeProgreso,
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
    const i = Math.round((p.x - campo.minX) / campo.dx);
    const j = Math.round((p.z - campo.minZ) / campo.dz);
    const nivel = campo.agua[j * campo.nx + i];
    assert.ok(!(nivel > -Infinity && p.h < nivel - 1), `km ${p.km.toFixed(1)} bajo el agua`);
  }
  const garibaldi = puntoEnKm(datos.ruta, 45).h;
  assert.ok(garibaldi > 350 && garibaldi < 520, `Garibaldi ${garibaldi}`);
  assert.ok(puntoEnKm(datos.ruta, 0).h < 120 && puntoEnKm(datos.ruta, 103).h < 60);
});

test('el terreno tiene cordillera real, lagos y canal', () => {
  const { alturas, agua } = datos.campo;
  let max = -Infinity;
  let celdasAgua = 0;
  for (let i = 0; i < alturas.length; i += 1) {
    max = Math.max(max, alturas[i]);
    if (agua[i] > -Infinity && alturas[i] < agua[i]) celdasAgua += 1;
  }
  assert.ok(max > 1100, `cumbre máxima ${max}`);
  assert.ok(celdasAgua / alturas.length > 0.12, 'faltan Fagnano/Beagle');
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
