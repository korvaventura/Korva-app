// La app está fija en vertical ("orientation": "portrait"). Google Play deduce de eso
// que el celular TIENE que tener pantalla vertical (android.hardware.screen.portrait)
// y deja afuera tablets, Chromebooks y Android XR. Lo declaramos opcional.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withPantallaVerticalOpcional(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const otras = (manifest['uses-feature'] || []).filter((f) => f?.$?.['android:name'] !== 'android.hardware.screen.portrait');
    manifest['uses-feature'] = [...otras, { $: { 'android:name': 'android.hardware.screen.portrait', 'android:required': 'false' } }];
    return cfg;
  });
};
