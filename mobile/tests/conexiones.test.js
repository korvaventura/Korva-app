const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../services/conexionesCore');

test('Garmin solo se muestra si el servidor la habilita para la cuenta', () => {
  assert.equal(c.filaGarmin(null), null);
  assert.equal(c.filaGarmin({ available: false, connected: false }), null);
  assert.equal(c.filaGarmin({ available: false, connected: true }), null);
  assert.equal(c.filaGarmin({ available: true, connected: false }).accion, 'conectar');
});

test('vinculada no es lo mismo que sincronizando', () => {
  const v = c.filaGarmin({ available: true, connected: true, activities_enabled: false });
  assert.equal(v.estado, 'vinculada');
  assert.equal(v.accion, null);
  assert.match(v.detalle, /todavía no suman/);
  assert.doesNotMatch(v.detalle, /sincroniz/i);
  // Sin el campo, tampoco se promete que sume.
  assert.equal(c.filaGarmin({ available: true, connected: true }).estado, 'vinculada');
  assert.equal(c.filaGarmin({ available: true, connected: true, activities_enabled: true }).estado, 'sincroniza');
});

test('Strava conserva su texto', () => {
  assert.equal(c.filaStrava(true).estado, 'sincroniza');
  assert.equal(c.filaStrava(false).estado, 'sin_conectar');
});

test('mensajes al volver de Garmin', () => {
  assert.equal(c.mensajeGarmin({ conectado: true }).titulo, 'Garmin vinculado');
  assert.equal(c.mensajeGarmin({ conectado: false, tipo: 'cancel' }), null);
  assert.equal(c.mensajeGarmin({ conectado: false, tipo: 'dismiss' }), null);
  assert.equal(c.mensajeGarmin({ conectado: false, tipo: 'success', resultado: 'cancelled' }), null);
  assert.match(c.mensajeGarmin({ conectado: false, tipo: 'success', resultado: 'permission_required' }).texto, /autorizá/);
  assert.match(c.mensajeGarmin({ conectado: false, tipo: 'success', resultado: 'account_in_use' }).texto, /otra cuenta/);
  assert.match(c.mensajeGarmin({ conectado: false, tipo: 'success', resultado: 'raro' }).texto, /Intentá nuevamente/);
  // Un "connected" en el link sin estado del servidor no es éxito.
  assert.notEqual(c.mensajeGarmin({ conectado: false, tipo: 'success', resultado: 'connected' }).titulo, 'Garmin vinculado');
});

test('resultado del link de regreso', () => {
  assert.equal(c.resultadoDeUrl('korva://garmin-connected?result=cancelled'), 'cancelled');
  assert.equal(c.resultadoDeUrl('no es url'), null);
});

test('solo se abre la autorización de Korva', () => {
  assert.equal(c.urlAutorizacionValida('https://korva-app-production.up.railway.app/garmin/authorize?ticket=abc'), true);
  assert.equal(c.urlAutorizacionValida('https://evil.com/garmin/authorize?ticket=abc'), false);
  assert.equal(c.urlAutorizacionValida('https://korva-app-production.up.railway.app.evil.com/garmin/authorize?x'), false);
  assert.equal(c.urlAutorizacionValida(null), false);
});
