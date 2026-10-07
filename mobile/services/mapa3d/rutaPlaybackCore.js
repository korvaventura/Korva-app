// Map challenge kilometers to a prebuilt tube's arc-length index range.
// Replays change GPU draw ranges instead of rebuilding geometry on the JS thread.
function crearFraccionRuta(ruta, conv) {
  const largos = [0];
  for(let i=1;i<ruta.length;i++) {
    const a=ruta[i-1],b=ruta[i];
    largos[i]=largos[i-1]+Math.hypot(conv.x(b.x-a.x),conv.y(b.h-a.h),conv.z(b.z-a.z));
  }
  const total=largos.at(-1)||1;
  return km => {
    if(km<=ruta[0].km)return 0;
    if(km>=ruta.at(-1).km)return 1;
    let lo=1,hi=ruta.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(ruta[mid].km<km)lo=mid+1;else hi=mid;}
    const t=(km-ruta[lo-1].km)/(ruta[lo].km-ruta[lo-1].km);
    const largo=largos[lo-1]+(largos[lo]-largos[lo-1])*t;
    return largo/total;
  };
}
function crearCorteRuta(ruta, conv, segmentos, indicesPorSegmento = 36) {
  const fraccion=crearFraccionRuta(ruta,conv);
  return km => Math.round(fraccion(km)*segmentos)*indicesPorSegmento;
}
module.exports={crearCorteRuta,crearFraccionRuta};
