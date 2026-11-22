const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { debeAvisarStrava, claveAvisoStrava, TEXTO_AVISO_STRAVA } = require('../services/gps/avisoStravaCore');

test('avisar sólo con Strava conectado y si no lo silenció', () => {
  assert.equal(debeAvisarStrava({ stravaConectado: true, silenciado: false }), true);
  assert.equal(debeAvisarStrava({ stravaConectado: true, silenciado: true }), false);
  assert.equal(debeAvisarStrava({ stravaConectado: false, silenciado: false }), false);
  assert.equal(claveAvisoStrava('u1'), 'korva:aviso-strava-gps:u1');
  assert.match(TEXTO_AVISO_STRAVA, /una sola app/);
});

test('el GPS avisa antes de iniciar y muestra la línea de Strava', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'GpsTrackerScreen.js'), 'utf8');
  assert.match(src, /onPress=\{iniciarConAviso\}/);
  assert.match(src, /'Abrir Strava'/);
  assert.match(src, /Linking\.openURL\(STRAVA_APP\)/);
  const { tiendaStrava, STRAVA_APP } = require('../services/gps/avisoStravaCore');
  assert.equal(STRAVA_APP, 'strava://');
  assert.match(tiendaStrava('ios'), /apps\.apple\.com/);
  assert.match(tiendaStrava('android'), /id=com\.strava/);
  assert.match(src, /'Grabar y no volver a avisar'/);
  assert.match(src, /Strava conectado · grabá cada salida con una sola app/);
  const { OPCIONES_REGISTRO } = require('../services/comoSumasCore');
  assert.match(OPCIONES_REGISTRO.find((o) => o.id === 'strava').texto, /Usá una sola forma por salida/);
});
