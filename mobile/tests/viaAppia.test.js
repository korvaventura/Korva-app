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

test('Vía Appia: ficha propia, oculta, sin imágenes prestadas y con escena 3D propia registrada', () => {
  assert.equal(fichaPrueba.id, CHALLENGE_ID);
  assert.equal(CHALLENGE_ID, '54865c93-6b1b-4d2b-8324-71d705133998');
  assert.equal(fichaPrueba.is_active, false);
  assert.equal(fichaPrueba.medal_code, '1001-ry-006');
  assert.deepEqual(fichaPrueba.modalidades.map(m => m.distancia_km), [611]);
  assert.deepEqual([fichaPrueba.medal_image_url, fichaPrueba.imagen_portada, fichaPrueba.galeria], [null, null, []]);
  assert.equal(historia.estadoMapa, 'escena_3d');
  const mapa3d = escenaParaConfig('via_appia');
  assert.equal(mapa3d.escena.id, 'via_appia');
  assert.equal(mapa3d.escena.distanciaKm, 611);
  assert.ok(mapa3d.escena.ruta.length > 800, 'traza real, no esquema');
});

test('Vía Appia: el respaldo 2D sigue la traza real con los mismos kilómetros que el 3D', () => {
  assert.ok(config.segmentos.length > 60, 'traza, no una línea entre hitos');
  assert.equal(config.segmentos[0].km, 0);
  assert.equal(config.segmentos.at(-1).km, 611);
  config.segmentos.forEach((p, i) => {
    if (i) assert.ok(p.km >= config.segmentos[i - 1].km, 'km crecientes');
    assert.ok(p.x >= 30 && p.x <= 770 && p.y >= 20 && p.y <= 260);
  });
  for (const cp of config.checkpoints) {
    const seg = config.segmentos.find(s => s.km === cp.kmFisico);
    assert.ok(seg, `${cp.id} sin segmento en su km`);
    assert.deepEqual([seg.x, seg.y], [cp.x, cp.y], `${cp.id}: el pin cae sobre la traza`);
  }
  // No es la línea esquemática horizontal anterior.
  assert.ok(new Set(config.segmentos.map(s => Math.round(s.y))).size > 20);
});
