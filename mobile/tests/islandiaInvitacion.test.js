const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { debeInvitar, ocultarHasta, DIAS_OCULTA } = require('../services/islandiaInvitacionCore');

const leer = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('se invita a quien no empezó Islandia o la dejó, salvo que la haya ocultado', () => {
  const ahora = Date.UTC(2026, 10, 19);
  assert.equal(debeInvitar({ participacion: null, ahora }), true);
  assert.equal(debeInvitar({ participacion: { abandonado: true }, ahora }), true);
  assert.equal(debeInvitar({ participacion: { abandonado: false }, ahora }), false);
  const hasta = ocultarHasta(ahora);
  assert.equal(hasta - ahora, DIAS_OCULTA * 86400000);
  assert.equal(debeInvitar({ participacion: null, ocultaHasta: hasta, ahora: ahora + 1000 }), false);
  assert.equal(debeInvitar({ participacion: null, ocultaHasta: hasta, ahora: hasta + 1 }), true);
});

test('Inicio y Catálogo muestran la invitación; el link viejo del fondo ya no está', () => {
  const home = leer('screens/HomeScreen.js');
  assert.equal((home.match(/<IslandiaInvitacion /g) || []).length, 2);
  assert.doesNotMatch(home, /Descubrir Islandia · ruta gratuita/);
  const catalogo = leer('screens/CatalogoScreen.js');
  assert.match(catalogo, /<IslandiaInvitacion [^>]*lugar="catalogo"/);
  assert.match(catalogo, /const navigation = useNavigation\(\);/);
  const comp = leer('components/IslandiaInvitacion.js');
  assert.match(comp, /navigation\.navigate\('RutaLibre'\)/);
  assert.match(comp, /lugar === 'inicio' && \(/);
  assert.match(comp, /tus próximas salidas suman/);
  assert.match(comp, /RUTA LIBRE · SIN COSTO/);
  assert.match(comp, /Por ahora no tiene medalla\. En el futuro va a existir una, y vas a poder comprarla con tu recorrido validado\./);
  assert.doesNotMatch(comp, /en preparación/);
  assert.doesNotMatch(comp, /GRATIS|Empezar gratis|Animated\.loop/);
});

test('Registrar lista Islandia entre tus desafíos y permite pausarla', () => {
  const src = leer('screens/RegistroManualScreen.js');
  assert.match(src, /Islandia · Ring Road/);
  assert.match(src, /accion: islandia\.pausado \? 'reanudar' : 'pausar'/);
  assert.match(src, /`\$\{totalActivos\} activos · Gestionar pausas`/);
  assert.match(src, /totalActivos === 0 &&/);
});

test('Islandia se puede empezar desde Registrar sin salir, con el mismo texto que en su pantalla', () => {
  const { TEXTO_ACEPTAR } = require('../services/islandiaInvitacionCore');
  assert.match(TEXTO_ACEPTAR, /Por ahora no tiene medalla: en el futuro va a existir una/);
  assert.match(TEXTO_ACEPTAR, /Lo anterior no cuenta/);
  const registrar = leer('screens/RegistroManualScreen.js');
  assert.match(registrar, /accion: 'aceptar', body: \{ acepto: true, version: rutaLibre\.datos\?\.ruta\?\.aceptacion_version \}/);
  assert.match(registrar, /Ruta libre, sin costo\. Por ahora sin medalla\./);
  assert.match(registrar, /\{invitarIslandia && totalActivos > 0 && filaInvitacionIslandia\}/);
  assert.match(leer('screens/RutaLibreScreen.js'), /Alert\.alert\('Empezar Islandia', TEXTO_ACEPTAR,/);
});
