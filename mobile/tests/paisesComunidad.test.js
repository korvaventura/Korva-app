const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { banderaDe, unirPaises } = require('../services/paisesComunidadCore');

test('Croacia y España tienen bandera, con o sin tilde y en inglés', () => {
  for (const p of ['Croacia', 'croatia', 'Hrvatska']) assert.equal(banderaDe(p), '🇭🇷');
  for (const p of ['España', 'Espana', 'spain', ' SPAIN ']) assert.equal(banderaDe(p), '🇪🇸');
  assert.equal(banderaDe('Argentina'), '🇦🇷');
  assert.equal(banderaDe('Atlántida'), '🏳️');
});

test('las banderas que ya existían siguen igual', () => {
  const antes = { 'México': '🇲🇽', 'Perú': '🇵🇪', 'Estados Unidos': '🇺🇸', 'Corea del Sur': '🇰🇷', 'República Dominicana': '🇩🇴', 'Curacao': '🇨🇼', 'Puerto Rico': '🇵🇷' };
  for (const [p, b] of Object.entries(antes)) assert.equal(banderaDe(p), b);
});

test('Spain se suma a España y la lista queda ordenada', () => {
  const datos = [
    { pais: 'Argentina', cantidad: 167 }, { pais: 'España', cantidad: 31 }, { pais: 'Croacia', cantidad: 3 },
    { pais: 'Guatemala', cantidad: 3 }, { pais: 'Spain', cantidad: 1 },
  ];
  const r = unirPaises(datos);
  assert.deepEqual(r.find((x) => x.pais === 'España'), { pais: 'España', cantidad: 32 });
  assert.equal(r.some((x) => x.pais === 'Spain'), false);
  assert.equal(r.length, 4);
  assert.equal(r.reduce((s, x) => s + x.cantidad, 0), 205);
  assert.deepEqual(r.map((x) => x.pais), ['Argentina', 'España', 'Croacia', 'Guatemala']);
});

test('Comunidad usa las banderas y la unión de países', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'RankingScreen.js'), 'utf8');
  assert.match(src, /setRankingPaises\(unirPaises\(data\.paises\)\)/);
  assert.match(src, /\{banderaDe\(item\.pais\)\}/);
  assert.doesNotMatch(src, /BANDERAS\[/);
});
