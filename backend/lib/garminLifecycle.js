const { randomUUID } = require('node:crypto');
const { configuracionGarmin, cifrar, descifrar } = require('./garminOAuth');
const REGISTRATION_URL = 'https://apis.garmin.com/partner-gateway/rest/user/registration';

// Refresh and disconnect share a database lease, including across Railway workers.
function crearGarminLifecycle({ repo, env = process.env, fetchImpl = fetch, now = Date.now }) {
  async function conToken(userId, operation) {
    const config = configuracionGarmin(env);
    if (!config) throw Error('garmin_unavailable');
    const owner = randomUUID();
    const claimed = await repo.bloquearConexion(userId, owner);
    if (!claimed) {
      if (!(await repo.estado(userId))) return { connected: false };
      throw Error('garmin_busy');
    }
    try {
      let tokens = descifrar(claimed.token_ciphertext, config.key, `garmin-tokens:${userId}`);
      if (Date.parse(claimed.access_expires_at) <= now()) {
        if (!(Date.parse(claimed.refresh_expires_at) > now())) throw Error('garmin_reconnect_required');
        const response = await fetchImpl(config.tokenUrl, { method: 'POST', redirect: 'error',
          signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.clientId,
            client_secret: config.clientSecret, refresh_token: tokens.refresh_token }).toString() });
        if (!response.ok) throw Error('garmin_refresh_failed');
        const next = await response.json();
        if (typeof next.access_token !== 'string' || !next.access_token || typeof next.refresh_token !== 'string'
          || !next.refresh_token || String(next.token_type).toLowerCase() !== 'bearer'
          || !Number.isFinite(next.expires_in) || next.expires_in <= 0
          || !Number.isFinite(next.refresh_token_expires_in) || next.refresh_token_expires_in <= 0) throw Error('garmin_invalid_refresh');
        // Persist the rotated refresh token before using the new access token.
        await repo.actualizarTokens(userId, owner, {
          token_ciphertext: cifrar(next, config.key, `garmin-tokens:${userId}`),
          access_expires_at: new Date(now() + Math.max(0, next.expires_in - 600) * 1000).toISOString(),
          refresh_expires_at: new Date(now() + next.refresh_token_expires_in * 1000).toISOString(),
        });
        tokens = next;
      }
      return await operation(tokens.access_token, owner);
    } finally {
      await repo.liberarConexion(userId, owner);
    }
  }
  return {
    // Internal helper only: never return its token to an HTTP client.
    conToken,
    desconectar(userId) {
      return conToken(userId, async (token, owner) => {
        const response = await fetchImpl(REGISTRATION_URL, { method: 'DELETE', redirect: 'error',
          signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}` } });
        // Never claim revocation or erase local credentials when Garmin refuses it.
        if (!response.ok) throw Error('garmin_revoke_failed');
        await repo.borrarConexion(userId, owner);
        return { connected: false };
      });
    },
  };
}
module.exports = { crearGarminLifecycle };
