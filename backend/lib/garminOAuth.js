const crypto = require('node:crypto');

const REDIRECT_URI = 'https://korva-app-production.up.railway.app/garmin/callback';
const AUTHORIZE_URL = 'https://connect.garmin.com/oauth2Confirm';
// Garmin OAuth2PKCE_1.pdf uses diauth for the token exchange.
const TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
const USER_URL = 'https://apis.garmin.com/wellness-api/rest/user/id';
const PERMISSIONS_URL = 'https://apis.garmin.com/wellness-api/rest/user/permissions';
const TTL_SECONDS = 600;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');

function configuracionGarmin(env = process.env) {
  const key = Buffer.from(env.GARMIN_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (!env.GARMIN_CLIENT_ID || !env.GARMIN_CLIENT_SECRET || key.length !== 32) return null;
  const tokenUrl = env.GARMIN_TOKEN_URL || TOKEN_URL;
  // Both hosts occur in Garmin's published specifications. Never accept arbitrary hosts.
  if (![TOKEN_URL, 'https://connectapi.garmin.com/di-oauth2-service/oauth/token'].includes(tokenUrl)) return null;
  if (env.GARMIN_REDIRECT_URI && env.GARMIN_REDIRECT_URI !== REDIRECT_URI) return null;
  return { clientId: env.GARMIN_CLIENT_ID, clientSecret: env.GARMIN_CLIENT_SECRET, key, tokenUrl };
}

function permitidoGarmin(userId, env = process.env) {
  return require('./garminAcceso').usuarioGarminPermitido(userId, env);
}

// Las salidas de Garmin suman km solo con el importador encendido (mismas banderas que
// lib/garminProcesamiento.js). La app usa esto para no prometer km que no se suman.
function actividadesGarminActivas(env = process.env) {
  return env.GARMIN_ACTIVITIES_ENABLED === '1' && env.GARMIN_PUSH_CAPTURE_ENABLED === '1' && env.GARMIN_OAUTH_ENABLED === '1';
}

function cifrar(value, key, context) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const content = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), content.toString('base64url')].join('.');
}

function descifrar(value, key, context) {
  const [version, iv, tag, content] = value.split('.');
  if (version !== 'v1') throw new Error('invalid_ciphertext');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(content, 'base64url')), cipher.final()]).toString('utf8'));
}

function nuevoIntento(userId, config) {
  const state = random();
  const verifier = random();
  const ticket = random();
  const binding = random();
  const stateHash = hash(state);
  return {
    stateHash, ticket, bindingHash: hash(binding),
    payload: cifrar({ state, verifier, binding }, config.key, `garmin-state:${userId}:${stateHash}`),
  };
}

function urlAutorizacion(config, payload) {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId,
    redirect_uri: REDIRECT_URI, state: payload.state,
    code_challenge: crypto.createHash('sha256').update(payload.verifier).digest('base64url'), code_challenge_method: 'S256' });
  return url.toString();
}

async function obtenerJson(url, options, fetchImpl, stage, diagnosticar) {
  diagnosticar({ stage, event: 'request' });
  let response;
  try {
    response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  } catch {
    diagnosticar({ stage, event: 'network_error' });
    throw new Error('garmin_request_failed');
  }
  diagnosticar({ stage, event: 'response', http_status: Number.isInteger(response.status) ? response.status : null });
  if (!response.ok) throw new Error('garmin_request_failed');
  try { return await response.json(); }
  catch {
    diagnosticar({ stage, event: 'invalid_json' });
    throw new Error('garmin_invalid_json');
  }
}

async function intercambiarCodigo(config, code, verifier, fetchImpl = fetch, diagnosticar = () => {}) {
  const tokens = await obtenerJson(config.tokenUrl, { method: 'POST', headers: {
    'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',
  }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId,
    client_secret: config.clientSecret, redirect_uri: REDIRECT_URI, code, code_verifier: verifier }).toString() }, fetchImpl, 'token', diagnosticar);
  if (!tokens || typeof tokens !== 'object') {
    diagnosticar({ stage: 'token', event: 'invalid_schema' });
    throw new Error('invalid_token_response');
  }
  if (typeof tokens.access_token !== 'string' || !tokens.access_token || typeof tokens.refresh_token !== 'string'
    || !tokens.refresh_token || String(tokens.token_type).toLowerCase() !== 'bearer'
    || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0
    || !Number.isFinite(tokens.refresh_token_expires_in) || tokens.refresh_token_expires_in <= 0) {
    diagnosticar({ stage: 'token', event: 'invalid_schema' });
    throw new Error('invalid_token_response');
  }
  const headers = { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' };
  const user = await obtenerJson(USER_URL, { headers }, fetchImpl, 'user_id', diagnosticar);
  if (typeof user?.userId !== 'string' || !user.userId || user.userId.length > 256) {
    diagnosticar({ stage: 'user_id', event: 'invalid_schema' });
    throw new Error('invalid_garmin_identity');
  }
  const permissionResponse = await obtenerJson(PERMISSIONS_URL, { headers }, fetchImpl, 'permissions', diagnosticar);
  // Observed in the private trial: Garmin wraps the list in { permissions: [...] }.
  // Keep the direct-array form compatible, but validate every entry and consent below.
  const permissions = Array.isArray(permissionResponse) ? permissionResponse : permissionResponse?.permissions;
  if (!Array.isArray(permissions) || permissions.some((p) => typeof p !== 'string')) {
    diagnosticar({ stage: 'permissions', event: 'invalid_schema',
      root_type: permissionResponse === null ? 'null' : Array.isArray(permissionResponse) ? 'array' : typeof permissionResponse,
      permissions_field_array: Array.isArray(permissionResponse?.permissions) });
    throw new Error('invalid_garmin_identity');
  }
  if (!permissions.includes('ACTIVITY_EXPORT')) {
    diagnosticar({ stage: 'permissions', event: 'activity_export_missing' });
    throw new Error('activity_permission_required');
  }
  const now = Date.now();
  return { garminUserId: user.userId, permissions, tokens,
    expiresAt: new Date(now + Math.max(0, tokens.expires_in - 600) * 1000).toISOString(),
    refreshExpiresAt: new Date(now + tokens.refresh_token_expires_in * 1000).toISOString() };
}

module.exports = { REDIRECT_URI, TTL_SECONDS, hash, configuracionGarmin, permitidoGarmin, actividadesGarminActivas,
  cifrar, descifrar, nuevoIntento, urlAutorizacion, intercambiarCodigo };
