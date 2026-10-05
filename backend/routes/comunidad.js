const express = require('express');
const { leerComunidadPaises, crearLecturaCache } = require('../lib/comunidadPaises');
function crearComunidadRoutes({ supabase, log = console.error }) {
  const router = express.Router();
  const leer = crearLecturaCache(() => leerComunidadPaises(supabase));
  router.get('/paises', async (_req, res) => {
    try {
      res.set('Cache-Control', 'public, max-age=30');
      res.json(await leer());
    } catch (error) {
      log('[comunidad-paises] lectura:', error.message);
      res.set('Cache-Control', 'no-store');
      res.status(500).json({ error: 'No pudimos consultar los completados por país.' });
    }
  });
  return router;
}
module.exports = { crearComunidadRoutes };
