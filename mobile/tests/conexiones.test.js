const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../services/conexionesCore');

test('Garmin solo se muestra si el servidor la habilita para la cuenta', () => {
  assert.equal(c.filaGarmin(null), null);
  assert.equal(c.filaGarmin({ available: false, connected: false }), null);
  // Conectada pero con Garmin cerrado: se ve para poder desconectarla, sin prometer km.
  const cerrada = c.filaGarmin({ available: false, connected: true });
  assert.equal(cerrada.accion, 'desconectar');
  assert.match(cerrada.detalle, /no se están sumando/);
  assert.equal(c.filaGarmin({ available: true, connected: false }).accion, 'conectar');
});

test('vinculada no es lo mismo que sincronizando', () => {
  const v = c.filaGarmin({ available: true, connected: true, activities_enabled: false });
  assert.equal(v.estado, 'vinculada');
  assert.equal(v.accion, 'desconectar');
  assert.match(v.detalle, /todavía no suman/);
  assert.doesNotMatch(v.detalle, /sincroniz/i);
  // Sin el campo, tampoco se promete que sume.
  assert.equal(c.filaGarmin({ available: true, connected: true }).estado, 'vinculada');
  assert.equal(c.filaGarmin({ available: true, connected: true, activities_enabled: true }).estado, 'sincroniza');
  assert.match(c.filaGarmin({ available: true, connected: true, activities_enabled: true }).detalle, /suman solas/);
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

test('aviso beta: una sola vez y solo cuando Garmin ya suma', () => {
  const suma = c.filaGarmin({ available: true, connected: true, activities_enabled: true });
  const vinculada = c.filaGarmin({ available: true, connected: true, activities_enabled: false });
  assert.equal(c.debeMostrarAvisoBeta(suma, false), true);
  assert.equal(c.debeMostrarAvisoBeta(suma, true), false);
  assert.equal(c.debeMostrarAvisoBeta(vinculada, false), false);
  assert.equal(c.debeMostrarAvisoBeta(null, false), false);
  assert.equal(c.CLAVE_AVISO_BETA('u1'), 'korva:garmin-beta-visto:v1:u1');
  assert.match(c.AVISO_BETA_GARMIN.texto, /avisanos/);
});

test('contacto de soporte', () => {
  assert.match(c.urlWhatsappSoporte(), /^https:\/\/wa\.me\/61474024238\?text=Hola%20Korva/);
  assert.equal(c.urlMailSoporte('x y'), 'mailto:korvaventura@gmail.com?subject=x%20y');
});

test('mensajes al desconectar Garmin', () => {
  assert.equal(c.mensajeDesconectarGarmin(null).titulo, 'Garmin desconectado');
  assert.match(c.mensajeDesconectarGarmin(null).texto, /Lo que ya sumaste queda/);
  const e = Object.assign(new Error('Revocá el acceso desde Garmin Connect para completar la desconexión.'), { status: 409 });
  assert.match(c.mensajeDesconectarGarmin(e).texto, /Garmin Connect/);
  assert.match(c.mensajeDesconectarGarmin(new Error('x')).texto, /Intentá nuevamente/);
});
