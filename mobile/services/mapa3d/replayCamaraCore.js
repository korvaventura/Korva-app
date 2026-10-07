const { AJUSTES_MAPA } = require('./ajustesInteraccion');
function duracionReplay(km, escenaId) {
  if (escenaId === 'san_andres') {
    const distancia=Math.min(57,Math.max(0,Number(km)||0));
    return distancia ? 5000+13000*Math.sqrt(distancia/57) : 0;
  }
  if (escenaId === 'islandia') {
    const distancia = Math.min(1400, Math.max(0, Number(km) || 0));
    if (!distancia) return 0;
    if (distancia <= 48) return 6000 + 4000 * distancia / 48;
    if (distancia <= 350) return 10000 + 6000 * (distancia - 48) / 302;
    return 16000 + 9000 * (distancia - 350) / 1050;
  }
  return AJUSTES_MAPA.replayMs;
}
function controlInicialReplay(objetivo) {
  return {azimut:0,elevacion:0,zoom:1,objetivo:[...objetivo]};
}
function seguirReplay(control,punto,base,dt,permitido,peso = AJUSTES_MAPA.seguimientoPeso) {
  if(!permitido)return control;
  const actual=control.objetivo || base;
  const factor=1-Math.exp(-Math.max(0,dt)/AJUSTES_MAPA.seguimientoAmortiguacionMs);
  const destino=base.map((v,i)=>v+(punto[i]-v)*peso);
  return {...control,objetivo:actual.map((v,i)=>v+(destino[i]-v)*factor)};
}
module.exports={duracionReplay,controlInicialReplay,seguirReplay};
