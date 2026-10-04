// Barrido estático de las pantallas: la VERSIÓN del desafío ya no se presenta como deporte.
// Lo que sigue siendo deporte de una ACTIVIDAD (sport_type, íconos de actividades, Registro manual)
// queda permitido explícitamente abajo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'screens');
const leer = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const PANTALLAS = ['HomeScreen.js', 'PerfilScreen.js', 'CatalogoScreen.js', 'DetalleScreen.js', 'DetalleRetoScreen.js', 'RankingScreen.js', 'AdminScreen.js'];

// Usos legítimos de deporte (actividades), por archivo.
const PERMITIDOS = {
  'DetalleRetoScreen.js': [/^const iconoDeporte = .*$/m], // Iconos de actividades, no de la versión.
  'PerfilScreen.js': [/if \(tipo === 'run'\) return '🏃';/, /if \(tipo === 'ride'\) return '🚴';/], // deporteEmoji(act.sport_type)
};

test('sin límite diario por run/ride (15/40 km)', () => {
  for (const f of PANTALLAS) assert.doesNotMatch(leer(f), /LIMITE_KM_DIA|Ritmo elevado/, f);
});

test('la versión no se muestra como Running/Ciclismo ni con íconos de deporte', () => {
  const prohibidos = [
    /RUNNING|CICLISMO/,
    /'Running'|'Ciclismo'|"Running"|"Ciclismo"/,
    /(modalidad|tipo)\s*===\s*'(run|ride)'/,
    /walk-outline|bicycle-outline/,
    /Extendida 🚴|Distancia extendida 🚴/,
    /entre Running y Ciclismo/,
  ];
  for (const f of PANTALLAS) {
    let texto = leer(f);
    for (const ok of PERMITIDOS[f] || []) texto = texto.replace(ok, '');
    for (const re of prohibidos) assert.doesNotMatch(texto, re, `${f}: ${re}`);
  }
});

test('las pantallas usan el helper de versión', () => {
  for (const f of PANTALLAS) assert.match(leer(f), /from '\.\.\/utils\/versionDesafio'/, f);
});

test('el cambio de versión manda `version` (y modalidad legacy) al backend', () => {
  const perfil = leer('PerfilScreen.js');
  assert.match(perfil, /version: nuevaVersion, modalidad: modalidadLegacy\(nuevaVersion\)/);
  assert.match(perfil, /if \(!res\.ok\)/);
  const catalogo = leer('CatalogoScreen.js');
  assert.match(catalogo, /version, modalidad: modalidadLegacy\(version\)/);
});

test('los deportes de ACTIVIDADES se presentan desde sport_type, separados de la versión', () => {
  assert.match(leer('HomeScreen.js'), /nombreDeporteActividad\(actividadReciente\.sport_type\)/);
  assert.match(leer('PerfilScreen.js'), /iconoDeporteActividad\(act\.sport_type\)/);
  const historia = leer('DetalleRetoScreen.js');
  assert.match(historia, /deporteHistoria\(act\.sport_type\)/);
  assert.match(historia, /nombreDeporteActividad\(tipo\)/);
  assert.match(historia, /iconoDeporte\(actividad\.sport_type\)/);
});
