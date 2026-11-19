const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../services/mapa3d/lineaCore');

const escena = (id) => [require(`../services/mapa3d/escenas/${id}`), require(`../services/mapa3d/escenas/${id}.horneado`)];

test('ruta del mapa Línea: horneada para el Camino, aproximada por hitos para Islandia', () => {
  const [e, h] = escena('caminoSantiago');
  const cps = require('../services/desafios/caminoSantiagoMapa').config.checkpoints;
  const r = L.rutaLinea(e, h, cps);
  assert.equal(r.aproximada, false);
  assert.equal(r.puntos.at(-1).km, 775);
  const [ei, hi] = escena('islandia');
  const ri = L.rutaLinea(ei, hi, require('../services/desafios/islandia').checkpoints);
  assert.equal(ri.aproximada, true);
  assert.equal(ri.puntos.at(-1).km, 1400);
});

test('punto, dirección y próximo hito sobre la ruta', () => {
  const puntos = [{ x: 0, z: 0, km: 0 }, { x: 10, z: 0, km: 10 }, { x: 10, z: 10, km: 20 }];
  assert.deepEqual(L.puntoEnRuta(puntos, 5), { x: 5, z: 0 });
  assert.deepEqual(L.puntoEnRuta(puntos, 15), { x: 10, z: 5 });
  const d = L.direccionEnRuta(puntos, 2, 1);
  assert.ok(Math.abs(d.dx - 1) < 1e-9 && Math.abs(d.dz) < 1e-9);
  const cps = [{ id: 'a', kmFisico: 0 }, { id: 'b', kmFisico: 12 }, { id: 'c', kmFisico: 20 }];
  assert.equal(L.proximoHito(cps, 5).id, 'b');
  assert.equal(L.proximoHito(cps, 12).id, 'c');
  assert.equal(L.proximoHito(cps, 20), null);
});

test('la cámara queda detrás y arriba, mirando hacia adelante', () => {
  const c = L.camaraLinea({ x: 0, z: 0 }, { dx: 0, dz: 1 }, 10);
  assert.ok(c.posicion[2] < 0 && c.posicion[1] > 0);
  assert.ok(c.mira[2] > 0);
});

test('cinta y curvas de nivel generan geometría válida', () => {
  const puntos = [{ x: 0, z: 0, km: 0 }, { x: 10, z: 0, km: 10 }];
  const cinta = L.cintaRuta(puntos, 0, 10, 1);
  assert.equal(cinta.length, 18);
  assert.ok(cinta.every(Number.isFinite));
  const [e, h] = escena('monteFuji');
  const r = L.rutaLinea(e, h, []);
  const t = L.lineasDeTerreno(r.campo, r.puntos);
  assert.ok(t.curvas.length > 100 && t.curvas.length % 4 === 0);
  assert.ok(t.curvas.every(Number.isFinite));
});

test('el GPS ofrece Línea (por defecto) y Relieve', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'GpsAventura.js'), 'utf8');
  assert.match(src, /useState\('linea'\)/);
  assert.match(src, /\[\['linea', 'Línea'\], \['relieve', 'Relieve'\]\]/);
  assert.match(src, /<MapaLinea/);
});

test('la fila de desafíos no se estira y las etiquetas no se amontonan', () => {
  const aventura = fs.readFileSync(path.join(__dirname, '..', 'components', 'GpsAventura.js'), 'utf8');
  assert.match(aventura, /chipsFila: \{ flexGrow: 0, flexShrink: 0 \}/);
  assert.match(aventura, /style=\{styles\.chipsFila\}/);
  const linea = fs.readFileSync(path.join(__dirname, '..', 'components', 'MapaLinea.js'), 'utf8');
  const fuente = linea.slice(linea.indexOf('function elegirEtiquetas'), linea.indexOf('// Las etiquetas se re-renderizan'));
  const elegirEtiquetas = new Function(`${fuente}; return elegirEtiquetas;`)();
  const r = elegirEtiquetas([
    { id: 'a', nombre: 'Reykjavík', x: 100, y: 400, proximo: false },
    { id: 'b', nombre: 'Reykjavík · Meta', x: 102, y: 402, proximo: false },
    { id: 'c', nombre: 'Hveragerði', x: 200, y: 50, proximo: true },
    { id: 'd', nombre: 'Seljalandsfoss', x: 300, y: 40, proximo: false },
  ], 600);
  assert.equal(r.length, 2);
  assert.ok(r.some((e) => e.id === 'c'));
  assert.equal(r.filter((e) => e.id === 'a' || e.id === 'b').length, 1);
});
