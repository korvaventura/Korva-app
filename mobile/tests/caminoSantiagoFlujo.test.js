const test = require('node:test');
const assert = require('node:assert/strict');
const { CHALLENGE_ID, config } = require('../services/desafios/caminoSantiagoMapa');
const { escenaParaConfig } = require('../services/mapa3d/escenas');
const trazado = require('../services/mapa3d/escenas/caminoSantiago.trazado');

test('Camino: 13 hitos ordenados, narrativa y coordenadas iguales al mapa aprobado', () => {
  assert.equal(CHALLENGE_ID, 'e6424df6-3949-4503-8af0-69408b4b34a2');
  assert.equal(config.distanciaFisica, 775);
  assert.equal(config.checkpoints.length, 13);
  assert.equal(config.checkpoints[0].kmFisico, 0);
  assert.equal(config.checkpoints.at(-1).kmFisico, 775);
  for (const [i, cp] of config.checkpoints.entries()) {
    assert.deepEqual([cp.lat, cp.lon], trazado.puntos[trazado.anclas[cp.id]]);
    assert.ok(cp.desc && cp.pista && cp.datoRaro && cp.fuentes.length);
    if (i) assert.ok(cp.kmFisico > config.checkpoints[i - 1].kmFisico);
    const punto = config.segmentos.find(p => Math.abs(p.km - cp.kmFisico) < 0.0001);
    assert.deepEqual([punto.x, punto.y], [cp.x, cp.y]);
  }
});

test('Camino: respaldo 2D continuo de 0 a 775 y escena 3D registrada', () => {
  assert.equal(config.segmentos[0].km, 0);
  assert.equal(config.segmentos.at(-1).km, 775);
  assert.ok(config.segmentos.length > 100);
  config.segmentos.forEach((p, i) => {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    if (i) assert.ok(p.km > config.segmentos[i - 1].km);
  });
  const escena = escenaParaConfig('camino_santiago');
  assert.equal(escena.escena.distanciaKm, 775);
  assert.equal(escena.horneado, require('../services/mapa3d/escenas/caminoSantiago.horneado'));
});
