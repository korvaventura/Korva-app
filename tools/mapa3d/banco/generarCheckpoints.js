// Escribe dist/checkpoints.js con los 13 hitos de la escena (nombres provisorios;
// los textos definitivos llegan desde el flujo de contenidos/Supabase).
const fs = require('fs');
const path = require('path');
const escena = require('../../../mobile/services/mapa3d/escenas/caminoSantiago');
const trazado = require('../../../mobile/services/mapa3d/escenas/caminoSantiago.trazado');
const NOMBRES = {
  roncesvalles: 'Roncesvalles', pamplona: 'Pamplona', puente_la_reina: 'Puente la Reina', irache: 'Irache',
  santo_domingo: 'Santo Domingo de la Calzada', burgos: 'Burgos', fromista: 'Frómista', leon: 'León', astorga: 'Astorga',
  ponferrada: 'Ponferrada', o_cebreiro: 'O Cebreiro', portomarin: 'Portomarín', santiago: 'Santiago de Compostela',
};
const cps = Object.keys(trazado.anclas).map((id) => {
  const km = escena.ruta.find((w, i) => w.km != null && Math.abs(w.lat - trazado.puntos[trazado.anclas[id]][0]) < 1e-6 && Math.abs(w.lon - trazado.puntos[trazado.anclas[id]][1]) < 1e-6)?.km;
  return { id, nombre: NOMBRES[id], kmFisico: km, km };
});
fs.writeFileSync(path.join(__dirname, 'dist', 'checkpoints.js'), `window.CHECKPOINTS=${JSON.stringify(cps)};\n`);
console.log(cps.map((c) => `${c.id}:${c.km}`).join(' '));
