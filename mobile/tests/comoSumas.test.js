const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { estadoSaludTarjeta, numerosHoy, textoPasos, listaNombres } = require('../services/comoSumasCore');

const leer = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('Salud: cada estado dice qué pasa y ofrece una sola acción', () => {
  assert.equal(estadoSaludTarjeta({ soportada: false }), null);
  const sin = estadoSaludTarjeta({ soportada: true, conectada: false, aportes: null });
  assert.equal(sin.accion.tipo, 'conectarSalud');
  assert.match(sin.texto, /Sin conectar/);
  const noDisp = estadoSaludTarjeta({ soportada: true, conectada: true, aportes: { disponible: false, desafios: [] } });
  assert.equal(noDisp.accion, null);
  const ninguno = estadoSaludTarjeta({ soportada: true, conectada: true, aportes: { disponible: true, desafios: [{ titulo: 'Islandia', activo: false }] } });
  assert.equal(ninguno.accion.tipo, 'elegirDesafios');
  assert.match(ninguno.texto, /no suma a desafíos/);
  const sinDesafios = estadoSaludTarjeta({ soportada: true, conectada: true, aportes: { disponible: true, desafios: [] } });
  assert.equal(sinDesafios.accion, null);
  const suma = estadoSaludTarjeta({ soportada: true, conectada: true, aportes: { disponible: true, desafios: [{ titulo: 'Islandia', activo: true }, { titulo: 'Monte Fuji 68K', activo: true }] } });
  assert.equal(suma.texto, 'Suma a Islandia y Monte Fuji 68K');
  assert.equal(suma.accion, null);
  assert.equal(listaNombres(['A', 'B', 'C']), 'A, B y C');
});

test('números de hoy y pasos', () => {
  assert.equal(numerosHoy({ status: 'cargando' }), null);
  assert.deepEqual(numerosHoy({ status: 'disponible', datos: { hoy: { km_actividades: 5, km_health_adicional: 0.4, pasos: 8412 } } }), { actividades: 5, salud: 0.4, pasos: 8412 });
  assert.match(textoPasos(8412), /pasos hoy · los pasos no se convierten en km/);
  assert.equal(textoPasos(null), 'Sin lectura de pasos hoy');
});

test('el Home usa la tarjeta nueva, sin la píldora de Strava ni el botón grande de actualizar', () => {
  const home = leer('screens/HomeScreen.js');
  assert.match(home, /<ComoSumasKmCard userId=\{userId\}/);
  assert.doesNotMatch(home, /✓ Strava/);
  assert.doesNotMatch(home, /↻ Actualizar progreso/);
  assert.match(home, /Tu progreso se actualiza solo/);
  assert.match(leer('components/SaludAportesDesafios.js'), /if \(abiertoInicial\) \{ setAbierto\(true\); operar\(cargar\); \}/);
});
