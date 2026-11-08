const test = require('node:test');
const assert = require('node:assert/strict');
const escena = require('../services/mapa3d/escenas/caminoSantiago');
const { conRelieveReal, meta } = require('../scripts/mapa3d/caminoSantiago.relieveReal');
const muestrear = conRelieveReal(escena).relieve.real.muestrear;

test('Camino: el contexto exterior varía en ambos ejes, no extruye el borde del MDT', () => {
  const sur = meta.minZ + (meta.nz - 1) * meta.pasoKm + 80;
  const xs = [0, 30, 60, 90].map(x => muestrear(x, sur).h);
  const zs = [sur, sur + 20, sur + 40, sur + 60].map(z => muestrear(30, z).h);
  assert(Math.max(...xs) - Math.min(...xs) > 10, 'variación longitudinal del contexto');
  assert(Math.max(...zs) - Math.min(...zs) > 10, 'variación transversal del contexto');
});

test('Camino: fuera del MDT, la costa distingue tierra y océano', () => {
  const tierra = muestrear(382, -92);
  const golfo = muestrear(-10, -300);
  const atlantico = muestrear(-450, 0);
  assert(tierra.h > 0 && tierra.agua === -Infinity, 'la tierra no acaba en el rectángulo del MDT');
  assert(golfo.h < 0 && golfo.agua === 0);
  assert(atlantico.h < 0 && atlantico.agua === 0);
});

test('Camino: el paso del MDT al contexto terrestre no introduce un escalón', () => {
  const sur = meta.minZ + (meta.nz - 1) * meta.pasoKm;
  for (const x of [0, 30, 60]) {
    const dentro = muestrear(x, sur - .01);
    const fuera = muestrear(x, sur + .01);
    assert(Math.abs(dentro.h - fuera.h) < 5, `unión en x=${x}`);
  }
});

test('Camino: la costa exterior cruza el nivel del mar sin saltos entre tierra y agua', () => {
  const alturas = [];
  for (let x = -60; x <= 500; x += .2) alturas.push(muestrear(x, -470).h);
  assert(alturas.some(h => h < 0) && alturas.some(h => h > 20), 'el tramo cruza una costa');
  const salto = Math.max(...alturas.slice(1).map((h, i) => Math.abs(h - alturas[i])));
  assert(salto < 30, `salto costero de ${salto} m cada 200 m`);
});
