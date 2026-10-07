const test = require('node:test');
const assert = require('node:assert/strict');
const { crearObjetivosDiarios, leerObjetivoTexto, progresoObjetivo } = require('../services/objetivoDiarioCore');

test('objetivo: cada cuenta conserva su propia meta y puede quitarla sin borrar otra', async () => {
  const datos = new Map();
  const objetivos = crearObjetivosDiarios({
    getItem: async (k) => datos.get(k) ?? null,
    setItem: async (k, v) => { datos.set(k, v); },
    removeItem: async (k) => { datos.delete(k); },
  });
  assert.equal(await objetivos.leer('a'), null);
  await objetivos.guardar('a', 6000); await objetivos.guardar('b', 8000);
  assert.equal(await objetivos.leer('a'), 6000);
  assert.equal(await objetivos.leer('b'), 8000);
  await objetivos.guardar('a', null);
  assert.equal(await objetivos.leer('a'), null);
  assert.equal(await objetivos.leer('b'), 8000);
  await assert.rejects(objetivos.guardar('', 6000));
});

test('objetivo: acepta enteros positivos; rechaza números parciales, decimales y valores imposibles', () => {
  assert.equal(leerObjetivoTexto(' 6000 '), 6000);
  for (const texto of ['', '0', '-1', '6000x', '6.5', '6,5', 'Infinity', '100001']) {
    assert.throws(() => leerObjetivoTexto(texto));
  }
});

test('objetivo: ausencia de lectura es pendiente; cero medido es progreso real; excedente no desborda', () => {
  assert.equal(progresoObjetivo(6000, null), null);
  assert.equal(progresoObjetivo(null, 3000), null);
  assert.deepEqual(progresoObjetivo(6000, 0), { fraccion: 0, restantes: 6000, cumplido: false });
  assert.deepEqual(progresoObjetivo(6000, 3000), { fraccion: 0.5, restantes: 3000, cumplido: false });
  assert.deepEqual(progresoObjetivo(6000, 6500), { fraccion: 1, restantes: 0, cumplido: true });
  // Al comenzar otro día, compara únicamente con los pasos de ese día.
  assert.equal(progresoObjetivo(6000, 100).cumplido, false);
});

test('objetivo: lectura corrupta y fallos de guardado se propagan sin éxito ficticio', async () => {
  for (const texto of ['no-json', 'null', '"6000"', '-1']) {
    await assert.rejects(crearObjetivosDiarios({ getItem: async () => texto }).leer('a'));
  }
  await assert.rejects(crearObjetivosDiarios({ setItem: async () => { throw new Error('disco'); } }).guardar('a', 6000));
});
