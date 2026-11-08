const test = require('node:test');
const assert = require('node:assert/strict');
const { CHALLENGE_ID, config, fichaPrueba } = require('../services/desafios/viaAppiaMapa');
const historia = require('../services/desafios/viaAppia');
const { escenaParaConfig } = require('../services/mapa3d/escenas');

test('Vía Appia: 13 hitos con historia y fuentes, de Roma 0 a Brindisi 611', () => {
  assert.equal(config.checkpoints.length, 13);
  assert.equal(config.checkpoints[0].id, 'roma');
  assert.equal(config.checkpoints[0].kmFisico, 0);
  assert.equal(config.checkpoints.at(-1).id, 'brindisi');
  assert.equal(config.checkpoints.at(-1).kmFisico, 611);
  assert.equal(new Set(config.checkpoints.map(c => c.id)).size, 13);
  for (const [i, cp] of config.checkpoints.entries()) {
    assert.ok(cp.desc && cp.pista && cp.datoRaro && cp.fuentes.length);
    assert.ok(Number.isFinite(cp.lat) && Number.isFinite(cp.lon));
    if (i) assert.ok(cp.kmFisico > config.checkpoints[i - 1].kmFisico);
  }
});

test('Vía Appia: ficha propia, oculta, sin imágenes prestadas ni traza 3D inventada', () => {
  assert.equal(fichaPrueba.id, CHALLENGE_ID);
  assert.equal(CHALLENGE_ID, '54865c93-6b1b-4d2b-8324-71d705133998');
  assert.equal(fichaPrueba.is_active, false);
  assert.equal(fichaPrueba.medal_code, '1001-ry-006');
  assert.deepEqual(fichaPrueba.modalidades.map(m => m.distancia_km), [611, 1833]);
  assert.deepEqual([fichaPrueba.medal_image_url, fichaPrueba.imagen_portada, fichaPrueba.galeria], [null, null, []]);
  assert.equal(historia.estadoMapa, 'esquema_pendiente_traza_3d');
  assert.equal(escenaParaConfig('via_appia'), null);
});

test('Vía Appia: progreso sobre el esquema y checkpoints usan los mismos kilómetros', () => {
  config.segmentos.forEach((p, i) => {
    const cp = config.checkpoints[i];
    assert.deepEqual([p.km, p.x, p.y], [cp.kmFisico, cp.x, cp.y]);
    assert.ok(p.x >= 40 && p.x <= 760);
  });
});
