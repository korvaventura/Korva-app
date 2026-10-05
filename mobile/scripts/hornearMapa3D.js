// Genera el terreno horneado de los dioramas 3D (alturas, colores, sombras, ruta).
// Uso: node scripts/hornearMapa3D.js monteFuji (o sanAndres; finDelMundo explícitamente)
// Volver a correrlo cada vez que cambie terrenoCore.js o una escena en services/mapa3d/escenas.

const fs = require('fs');
const path = require('path');
const { construirDatosDiorama } = require('../services/mapa3d/terrenoCore');
const { serializarDiorama } = require('../services/mapa3d/horneadoCore');

const DISPONIBLES = ['finDelMundo', 'monteFuji', 'sanAndres', 'dubrovnik'];
const ESCENAS = process.argv.slice(2);
if (!ESCENAS.length || ESCENAS.some((nombre) => !DISPONIBLES.includes(nombre))) {
  throw new Error('Indicá una escena: node scripts/hornearMapa3D.js monteFuji (finDelMundo, sanAndres o dubrovnik)');
}

for (const nombre of ESCENAS) {
  const escena = require(`../services/mapa3d/escenas/${nombre}`);
  const t0 = Date.now();
  const datos = serializarDiorama(construirDatosDiorama(escena));
  const destino = path.join(__dirname, '..', 'services', 'mapa3d', 'escenas', `${nombre}.horneado.js`);
  const cuerpo = `// GENERADO por scripts/hornearMapa3D.js — no editar a mano.\n/* eslint-disable */\nmodule.exports = ${JSON.stringify(datos)};\n`;
  fs.writeFileSync(destino, cuerpo);
  console.log(`${nombre}: ${datos.nx}x${datos.nz} en ${Date.now() - t0} ms -> ${(cuerpo.length / 1024).toFixed(0)} KB`);
}
