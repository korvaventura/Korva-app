const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { crearGarminLifecycle } = require('../lib/garminLifecycle');
const { cifrar, descifrar } = require('../lib/garminOAuth');
const env = { GARMIN_CLIENT_ID: 'client', GARMIN_CLIENT_SECRET: 'secret',
  GARMIN_TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') };
const key = Buffer.from(env.GARMIN_TOKEN_ENCRYPTION_KEY, 'base64');
function fixture({ expired = false } = {}) {
  let row = { token_ciphertext: cifrar({ access_token: 'old-access', refresh_token: 'old-refresh' }, key, 'garmin-tokens:owner'),
    access_expires_at: new Date(Date.now() + (expired ? -1 : 3600000)).toISOString(),
    refresh_expires_at: new Date(Date.now() + 86400000).toISOString() };
  let lease = null;
  const repo = {
    async estado() { return row; },
    async bloquearConexion(_id, owner) { if (!row || lease) return null; lease = owner; return { ...row }; },
    async actualizarTokens(_id, owner, patch) { assert.equal(owner, lease); row = { ...row, ...patch }; },
    async liberarConexion(_id, owner) { if (owner === lease) lease = null; },
    async borrarConexion(_id, owner) { assert.equal(owner, lease); row = null; },
  };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'DELETE') return { ok: true };
    return { ok: true, json: async () => ({ access_token: 'new-access', refresh_token: 'new-refresh',
      token_type: 'bearer', expires_in: 86400, refresh_token_expires_in: 7776000 }) };
  };
  return { repo, fetchImpl, calls, get row() { return row; }, get lease() { return lease; } };
}

test('disconnect revokes Garmin before deleting local encrypted credentials and is idempotent', async () => {
  const f = fixture(); let deletedProvider = false;
  const original = f.repo.borrarConexion;
  f.repo.borrarConexion = (...args) => { assert.equal(deletedProvider, true); return original(...args); };
  const service = crearGarminLifecycle({ repo: f.repo, env, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://apis.garmin.com/wellness-api/rest/user/registration');
    assert.equal(options.method, 'DELETE'); assert.equal(options.headers.Authorization, 'Bearer old-access');
    deletedProvider = true; return { ok: true };
  } });
  assert.deepEqual(await service.desconectar('owner'), { connected: false });
  assert.equal(f.row, null); assert.equal(f.lease, null);
  assert.deepEqual(await service.desconectar('owner'), { connected: false });
});

test('expired access rotates and persists encrypted refresh token before provider revocation', async () => {
  const f = fixture({ expired: true });
  const service = crearGarminLifecycle({ repo: f.repo, env, fetchImpl: async (url, options) => {
    if (options.method === 'DELETE') {
      const tokens = descifrar(f.row.token_ciphertext, key, 'garmin-tokens:owner');
      assert.equal(tokens.refresh_token, 'new-refresh');
      assert.equal(options.headers.Authorization, 'Bearer new-access');
    } else {
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('grant_type'), 'refresh_token');
      assert.equal(form.get('refresh_token'), 'old-refresh');
      assert.equal(form.get('client_secret'), 'secret');
    }
    return f.fetchImpl(url, options);
  } });
  await service.desconectar('owner');
  assert.equal(f.calls.length, 2); assert.equal(f.row, null);
});

test('failed revocation preserves connection and releases its lease', async () => {
  for (const fail of ['http', 'network']) {
    const f = fixture(); const before = f.row.token_ciphertext;
    const service = crearGarminLifecycle({ repo: f.repo, env, fetchImpl: async () => {
      if (fail === 'network') throw Error('network failure'); return { ok: false };
    } });
    await assert.rejects(service.desconectar('owner'));
    assert.equal(f.row.token_ciphertext, before); assert.equal(f.lease, null);
  }
});

test('failed or invalid refresh never deletes connection or uses stale access', async () => {
  for (const mode of ['http', 'malformed', 'expired-refresh', 'database']) {
    const f = fixture({ expired: true }); const before = f.row.token_ciphertext;
    let calls = 0;
    if (mode === 'expired-refresh') f.row.refresh_expires_at = new Date(0).toISOString();
    if (mode === 'database') f.repo.actualizarTokens = async () => { throw Error('database failure'); };
    const service = crearGarminLifecycle({ repo: f.repo, env, fetchImpl: async (url, options) => {
      calls++; assert.notEqual(options.method, 'DELETE');
      if (mode === 'http') return { ok: false };
      if (mode === 'malformed') return { ok: true, json: async () => ({ access_token: 'broken' }) };
      return f.fetchImpl(url, options);
    } });
    await assert.rejects(service.desconectar('owner'));
    assert.equal(calls, mode === 'expired-refresh' ? 0 : 1);
    assert.equal(f.row.token_ciphertext, before); assert.equal(f.lease, null);
  }
});

test('two service instances cannot simultaneously refresh the same account', async () => {
  const f = fixture({ expired: true }); let unblock;
  const blocked = new Promise((resolve) => { unblock = resolve; });
  const first = crearGarminLifecycle({ repo: f.repo, env, fetchImpl: async (...args) => {
    await blocked; return f.fetchImpl(...args);
  } });
  const second = crearGarminLifecycle({ repo: f.repo, env, fetchImpl: f.fetchImpl });
  const pending = first.conToken('owner', async (token) => { assert.equal(token, 'new-access'); });
  await new Promise((r) => setImmediate(r));
  await assert.rejects(second.desconectar('owner'), /garmin_busy/);
  unblock(); await pending;
  assert.equal(f.calls.length, 1); assert.equal(f.lease, null);
});

test('lost lease prevents using refreshed credentials or deleting a connection', async () => {
  const f = fixture({ expired: true }); let used = false;
  f.repo.actualizarTokens = async () => { throw Error('garmin_lease_lost'); };
  const service = crearGarminLifecycle({ repo: f.repo, env, fetchImpl: f.fetchImpl });
  await assert.rejects(service.conToken('owner', async () => { used = true; }), /garmin_lease_lost/);
  assert.equal(used, false); assert.ok(f.row); assert.equal(f.lease, null);
});
