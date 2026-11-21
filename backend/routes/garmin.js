const express = require('express');
const requireUser = require('../middleware/requireUser');
const { crearGarminRepositorio } = require('../lib/garminRepositorio');
const { REDIRECT_URI, TTL_SECONDS, hash, configuracionGarmin, permitidoGarmin, actividadesGarminActivas, cifrar, descifrar,
  nuevoIntento, urlAutorizacion, intercambiarCodigo } = require('../lib/garminOAuth');

const validRandom = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const cookieName = (stateHash) => `korva_garmin_${stateHash.slice(0, 16)}`;
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/garmin/callback' };
function leerCookie(req, name) {
  const entry = (req.headers.cookie || '').split(';').map((v) => v.trim()).find((v) => v.startsWith(`${name}=`));
  return entry?.slice(name.length + 1) || '';
}

function respuestaCallback(res, result) {
  const mensajes = { connected: 'Garmin conectado. Volvé a Korva.', cancelled: 'Cancelaste la conexión con Garmin.',
    invalid_state: 'Este enlace venció o ya fue utilizado. Iniciá la conexión desde Korva.',
    permission_required: 'Para conectar Garmin, autorizá compartir tus actividades.',
    account_in_use: 'Esta cuenta ya tiene una conexión. Revisala desde Korva.',
    unavailable: 'La conexión con Garmin no está disponible.', error: 'No pudimos conectar Garmin. Intentá nuevamente desde Korva.' };
  const message = mensajes[result] || mensajes.error;
  const url = `korva://garmin-connected?result=${result}`;
  const nonce = require('node:crypto').randomBytes(16).toString('base64');
  res.set('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
  return res.status(result === 'invalid_state' ? 400 : 200).type('html').send(`<!doctype html><html lang="es"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Korva · Garmin</title>
    <style nonce="${nonce}">body{background:#101e2c;color:white;font-family:system-ui;text-align:center;padding:48px 24px}a{color:#fc4c02}</style>
    </head><body><p>${message}</p><a href="${url}">Volver a Korva</a>
    <script nonce="${nonce}">window.location.replace(${JSON.stringify(url)});</script></body></html>`);
}

function crearGarminRoutes({ supabase, repo = crearGarminRepositorio(supabase), auth = requireUser,
  env = process.env, fetchImpl = fetch, log = (entry) => console.info('korva_garmin_callback', JSON.stringify(entry)) }) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff' }); res.vary('Authorization'); next(); });
  const disponible = (id) => !!configuracionGarmin(env) && permitidoGarmin(id, env);
  const fallar = (res) => res.status(503).json({ error: 'No pudimos conectar con Garmin. Intentá nuevamente.' });

  router.get('/status', auth, async (req, res) => {
    if (!disponible(req.userId)) return res.json({ available: false, connected: false });
    try {
      const row = await repo.estado(req.userId);
      return res.json({ available: true, connected: !!row,
        connected_at: row?.connected_at || null, permissions: row?.permissions || [],
        activities_enabled: !!row && actividadesGarminActivas(env) });
    } catch { return fallar(res); }
  });

  // Authenticated JSON request first; a one-use browser ticket avoids putting a Korva JWT in a URL.
  router.post('/auth', auth, async (req, res) => {
    const config = configuracionGarmin(env);
    if (!disponible(req.userId)) return res.status(404).json({ error: 'Garmin todavía no está habilitado para esta cuenta.' });
    try {
      const attempt = nuevoIntento(req.userId, config);
      const started = await repo.iniciar(req.userId, attempt, hash(attempt.ticket));
      if (!started) return res.status(409).json({ error: 'Ya tenés Garmin conectado o una conexión en proceso. Revisá tu perfil.' });
      const url = new URL('/garmin/authorize', REDIRECT_URI);
      url.searchParams.set('ticket', attempt.ticket);
      return res.json({ authorization_url: url.toString(), expires_in: TTL_SECONDS });
    } catch { return fallar(res); }
  });

  router.get('/authorize', async (req, res) => {
    if (!validRandom(req.query.ticket)) return respuestaCallback(res, 'invalid_state');
    try {
      const row = await repo.lanzar(hash(req.query.ticket));
      if (!row) return respuestaCallback(res, 'invalid_state');
      if (!disponible(row.user_id)) return respuestaCallback(res, 'unavailable');
      const config = configuracionGarmin(env);
      const payload = descifrar(row.payload_ciphertext, config.key, `garmin-state:${row.user_id}:${row.state_hash}`);
      res.cookie(cookieName(row.state_hash), payload.binding, { ...cookieOptions, maxAge: TTL_SECONDS * 1000 });
      return res.redirect(303, urlAutorizacion(config, payload));
    } catch { return respuestaCallback(res, 'error'); }
  });

  router.get('/callback', async (req, res) => {
    const traceId = require('node:crypto').randomUUID();
    const diagnosticar = (entry) => { try { log({ trace_id: traceId, ...entry }); } catch {} };
    const finish = (result) => { diagnosticar({ stage: 'callback', event: 'result', result }); return respuestaCallback(res, result); };
    const state = req.query.state;
    if (!validRandom(state)) return finish('invalid_state');
    const stateHash = hash(state);
    const binding = leerCookie(req, cookieName(stateHash));
    if (!validRandom(binding)) return finish('invalid_state');
    try {
      // DELETE ... RETURNING is atomic, durable, expiring and shared across workers.
      diagnosticar({ stage: 'state', event: 'consume' });
      const row = await repo.consumir(stateHash, hash(binding));
      res.clearCookie(cookieName(stateHash), cookieOptions);
      if (!row) return finish('invalid_state');
      if (!disponible(row.user_id)) return finish('unavailable');
      if (req.query.error === 'access_denied' && !req.query.code) return finish('cancelled');
      if (req.query.error || typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 4096) {
        return finish('error');
      }
      const config = configuracionGarmin(env);
      diagnosticar({ stage: 'state', event: 'decrypt' });
      const payload = descifrar(row.payload_ciphertext, config.key, `garmin-state:${row.user_id}:${stateHash}`);
      diagnosticar({ stage: 'token', event: 'endpoint', token_host: new URL(config.tokenUrl).hostname });
      const connection = await intercambiarCodigo(config, req.query.code, payload.verifier, fetchImpl, diagnosticar);
      diagnosticar({ stage: 'database', event: 'insert' });
      await repo.conectar(row.user_id, connection, cifrar(connection.tokens, config.key, `garmin-tokens:${row.user_id}`));
      return finish('connected');
    } catch (error) {
      // Provider bodies, codes, tokens and encryption material never reach logs or the app.
      const result = error.message === 'activity_permission_required' ? 'permission_required'
        : error.code === '23505' ? 'account_in_use' : 'error';
      const knownDbCodes = ['23505', '23503', '42501', '42P01', '42703', '22P02', 'PGRST202', 'PGRST204'];
      if (knownDbCodes.includes(error.code)) diagnosticar({ stage: 'database', event: 'error', database_code: error.code });
      return finish(result);
    }
  });
  return router;
}
module.exports = { crearGarminRoutes };
