const historia = require('../../desafios/islandia');
module.exports = {
  id: 'islandia', modeloMeshy: true, distanciaKm: 1400,
  presentacion: { eyebrow: 'ISLANDIA · RUTA GRATUITA', titulo: 'Ring Road · Fuego, hielo y auroras' },
  capitulos: historia.capitulos,
  centro: { lat: 65, lon: -19 }, kmPorUnidad: .3, exageracion: 1.2,
  elevacionRutaUnidades: .01, alturaPinUnidades: .075, grosorRuta: .65,
  colorRuta: '#44F2DC', mostrarRelacionRecorrido: false,
  camara: { objetivo: [0,.25,0], elevacionGrados: 48, azimutGrados: 0, distancia: 9.6, fov: 42, aspectoReferencia: .82 },
  atmosfera: { horizonte: '#29485B', medio: '#142A43', cenit: '#080F24', resplandor: '#447B80', cerca: 1.8, lejos: 4 },
  luz: { solDir: [-.6,.9,.3], colorSol: '#D5E9F5', intensidadSol: 1.55,
    intensidadHemi: 1.65, colorCielo: '#B9D5E8', colorSuelo: '#738998', intensidadRelleno: .55 },
  etiquetas: [], exposicion: 1.25,
};
