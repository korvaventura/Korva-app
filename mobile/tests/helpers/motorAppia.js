const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');
const terreno = require('../../services/mapa3d/terrenoCore');
const hc = require('../../services/mapa3d/horneadoCore');
const fuente = fs.readFileSync(path.join(__dirname, '../../components/mapa3d/construirMundo.js'), 'utf8').replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
const motor = new Function('THREE', 'crearObjetosAppia', 'crearObjetosCamino', 'construirModeloMeshy', 'crearAmbienteIslandia', 'crearRutaVisualModelo', 'construirDatosDiorama', 'puntoEnKm', 'indiceCercano', 'deserializarDiorama',
  fuente + ';return {construirMundo, configurarCamara, actualizarAtmosfera, posicionEnKm, posicionGeo, profundidadBordeVisible};')(
  THREE, require('./objetosAppia'), () => null, () => null, () => null, () => null, terreno.construirDatosDiorama, terreno.puntoEnKm, terreno.indiceCercano, hc.deserializarDiorama);
const camara = fs.readFileSync(path.join(__dirname, '../../components/mapa3d/camaraMonumento.js'), 'utf8').replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
motor.controlMonumento = new Function('THREE', 'controlAncla', 'resolverGeneralCamino', 'configurarCamara', camara + ';return controlMonumento;')(
  THREE, require('../../services/mapa3d/anclasCore').controlAncla, require('../../services/mapa3d/vistaCaminoCore').resolverGeneralCamino, motor.configurarCamara);
module.exports = motor;
