// Sentido del desafío: Brindisi → Roma. La fuente académica se conserva intacta.
// Reutiliza exactamente los vértices WGS84, sin inventar una vía hasta el Coliseo.
const fuente = require('./viaAppia.trazado');
const ultimo = fuente.anclas.brindisi;
const totalReal = fuente.kmRealAnclas.brindisi;
module.exports = {
  ...fuente,
  puntos: fuente.puntos.slice(fuente.anclas.roma, ultimo + 1).reverse(),
  anclas: Object.fromEntries(Object.entries(fuente.anclas).map(([id, i]) => [id, ultimo - i])),
  kmRealAnclas: Object.fromEntries(Object.entries(fuente.kmRealAnclas).map(([id, km]) => [id, +(totalReal - km).toFixed(2)])),
  // Intervalos regionales recorridos en sentido inverso.
  regiones: [...fuente.regiones].reverse().map((r, i) => ({
    region: r.region,
    desdeKmReal: i === 0 ? 0 : +(totalReal - fuente.regiones[fuente.regiones.length - i].desdeKmReal).toFixed(2),
  })),
};
