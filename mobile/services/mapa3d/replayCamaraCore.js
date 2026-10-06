const { AJUSTES_MAPA } = require('./ajustesInteraccion');
function duracionReplay() {
  return AJUSTES_MAPA.replayMs;
}
function controlInicialReplay(objetivo) {
  return {azimut:0,elevacion:0,zoom:1,objetivo:[...objetivo]};
}
function seguirReplay(control,punto,base,dt,permitido) {
  if(!permitido)return control;
  const actual=control.objetivo || base;
  const factor=1-Math.exp(-Math.max(0,dt)/AJUSTES_MAPA.seguimientoAmortiguacionMs);
  const destino=base.map((v,i)=>v+(punto[i]-v)*AJUSTES_MAPA.seguimientoPeso);
  return {...control,objetivo:actual.map((v,i)=>v+(destino[i]-v)*factor)};
}
module.exports={duracionReplay,controlInicialReplay,seguirReplay};
