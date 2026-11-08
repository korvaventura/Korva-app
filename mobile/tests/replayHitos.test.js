const test = require('node:test');
const assert = require('node:assert/strict');
const { crearReplayHitos, kmEnReplay, rotulosReplay } = require('../services/mapa3d/replayHitosCore');
const { estadoJourney } = require('../services/mapa3d/journeyCore');
const historia = require('../services/desafios/viaAppia');
const ficha = require('../../backend/tests/fixtures/viaAppia.json');
const origen = require('../services/mapa3d/escenas/viaAppia.trazado');
const recorrido = require('../services/mapa3d/escenas/viaAppia.recorrido');

test('replay Appia: todos los nombres en orden, sin saltos a 4 FPS ni progreso que retroceda', () => {
  const plan = crearReplayHitos(historia.checkpoints, 611);
  const vistos = [], tiempos = new Map();
  let anterior = 0;
  for (let t = 0; t <= plan.duracionMs + 250; t += 250) {
    const km = kmEnReplay(plan, t);
    assert.ok(km >= anterior && km <= 611);
    anterior = km;
    const journey = estadoJourney({ checkpoints: historia.checkpoints, kmProgreso: km, distanciaKm: 611 });
    const { actual, siguiente } = rotulosReplay(journey);
    if (actual?.id !== vistos.at(-1)) vistos.push(actual?.id);
    tiempos.set(actual?.id, (tiempos.get(actual?.id) || 0) + 250);
    if (siguiente) assert.ok(siguiente.kmJourney > km, 'el próximo siempre está por delante');
  }
  assert.deepEqual(vistos, ['brindisi', 'oria', 'taranto', 'gravina', 'venosa', 'aeclanum', 'benevento', 'capua', 'formia', 'terracina', 'albano', 'cecilia_metella', 'roma']);
  for (const id of vistos) assert.ok(tiempos.get(id) >= 750, `${id} sin tiempo de lectura`);
  assert.equal(anterior, 611);
  assert.ok(plan.duracionMs < 30000, 'el recorrido completo sigue siendo breve');
});

test('replay parcial: termina en el progreso real, sin adelantar la llegada ni el siguiente hito', () => {
  const plan = crearReplayHitos(historia.checkpoints, 305.5);
  const km = kmEnReplay(plan, Infinity);
  assert.equal(km, 305.5);
  const { actual, siguiente } = rotulosReplay(estadoJourney({ checkpoints: historia.checkpoints, kmProgreso: km, distanciaKm: 611 }));
  assert.equal(actual.id, 'venosa');
  assert.equal(siguiente.id, 'aeclanum');
  assert.equal(siguiente.kmJourney, 311);
  assert.deepEqual(plan.paradas.map(cp => cp.id), ['brindisi', 'oria', 'taranto', 'gravina', 'venosa']);
});

test('repetir un replay reinicia en Brindisi y no conserva el nombre de Roma', () => {
  for (let i = 0; i < 3; i++) {
    const plan = crearReplayHitos(historia.checkpoints, 611);
    const rotulo = t => rotulosReplay(estadoJourney({ checkpoints: historia.checkpoints, kmProgreso: kmEnReplay(plan, t), distanciaKm: 611 })).actual.id;
    assert.equal(rotulo(Infinity), 'roma');
    assert.equal(rotulo(0), 'brindisi');
  }
});

test('datos invertidos: capítulos, historias, ficha backend y ruta comparten el mismo sentido', () => {
  assert.deepEqual(ficha.checkpoints, historia.checkpoints);
  assert.equal(ficha.is_active, false);
  assert.equal(historia.capitulos[0].id, 'puglia');
  assert.equal(historia.capitulos.at(-1).id, 'lazio');
  assert.deepEqual(historia.capitulos.map(c => c.hastaKm), [181, 276, 446, 611]);
  for (const cp of historia.checkpoints) {
    const cap = historia.capitulos.find(c => cp.kmFisico <= c.hastaKm);
    assert.equal(cp.capitulo, cap.numero, cp.id);
  }
  assert.deepEqual(recorrido.puntos[0], origen.puntos[origen.anclas.brindisi]);
  assert.deepEqual(recorrido.puntos.at(-1), origen.puntos[origen.anclas.roma]);
  for (const [i, p] of recorrido.puntos.entries()) assert.deepEqual(p, origen.puntos[origen.anclas.brindisi-i]);
});
