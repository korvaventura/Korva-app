function duracionReplay(km) {
  return Math.max(44000,Math.min(65000,42000+Math.max(0,km)*120))*.75;
}
function controlInicialReplay(objetivo) {
  return {azimut:0,elevacion:0,zoom:1,objetivo:[...objetivo]};
}
function seguirReplay(control,punto,base,dt,permitido) {
  if(!permitido)return control;
  const actual=control.objetivo || base;
  const factor=1-Math.exp(-Math.max(0,dt)/750);
  const destino=base.map((v,i)=>v+(punto[i]-v)*.45);
  return {...control,objetivo:actual.map((v,i)=>v+(destino[i]-v)*factor)};
}
module.exports={duracionReplay,controlInicialReplay,seguirReplay};
