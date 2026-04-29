const express = require('express');
const router = express.Router();

const REDIRECT_URI = 'http://localhost:3000/strava/callback';

// Paso 1 — Redirigir al usuario a Strava para autorizar
router.get('/auth', (req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
 const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=232688&response_type=code&redirect_uri=${REDIRECT_URI}&approval_prompt=force&scope=activity:read_all`;
  res.redirect(stravaAuthUrl);
});

// Paso 2 — Strava nos manda de vuelta con un codigo
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code'
      })
    });

    const data = await response.json();

    res.json({
      mensaje: 'Strava conectado exitosamente 🎉',
      atleta: data.athlete?.firstname + ' ' + data.athlete?.lastname,
      token: data.access_token
    });

  } catch (error) {
    res.json({ error: 'Error conectando con Strava', detalle: error.message });
  }
});

module.exports = router;