const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SECRET ||= 'test';
const express = require('express');
const { crearGarminRoutes } = require('../routes/garmin');
const { configuracionGarmin, hash, cifrar, descifrar, REDIRECT_URI } = require('../lib/garminOAuth');
const env = { GARMIN_CLIENT_ID: 'test-client', GARMIN_CLIENT_SECRET: 'test-secret',
  GARMIN_TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  GARMIN_OAUTH_ENABLED: '1', GARMIN_OAUTH_TEST_USER_IDS: 'owner' };
const states = () => ({ attempts: new Map(), connections: new Map(),
  async estado(id) { return this.connections.get(id) || null; },
  async iniciar(userId, attempt, launchHash) {
    if (this.connections.has(userId)) return null;
    const row = { user_id: userId, state_hash: attempt.stateHash, launch_hash: launchHash,
      binding_hash: attempt.bindingHash, payload_ciphertext: attempt.payload, expires: Date.now() + 600000 };
    this.attempts.set(attempt.stateHash, row); return row;
  },
  async lanzar(ticket) {
    const row = [...this.attempts.values()].find((v) => v.launch_hash === ticket);
    if (!row || row.launched || row.expires <= Date.now()) return null;
    row.launched = true; return row;
  },
  async consumir(state, binding) {
    const row = this.attempts.get(state);
    if (!row?.launched || row.binding_hash !== binding || row.expires <= Date.now()) return null;
    this.attempts.delete(state); return row;
  },
  async conectar(userId, connection, ciphertext) {
    if (this.connections.has(userId) || [...this.connections.values()].some((v) => v.garminUserId === connection.garminUserId)) {
      throw Object.assign(new Error('conflict'), { code: '23505' });
    }
    this.connections.set(userId, { ...connection, token_ciphertext: ciphertext, connected_at: new Date().toISOString() });
  },
});
async function server(fn, options = {}) {
  const repo = options.repo || states(); const requests = []; const logs = [];
  const fetchImpl = options.fetchImpl || (async (url, init) => {
    requests.push({ url, init });
    const data = url.endsWith('/token') ? { access_token: 'access-private', refresh_token: 'refresh-private',
      expires_in: 86400, refresh_token_expires_in: 7776000, token_type: 'Bearer' }
      : url.endsWith('/id') ? { userId: 'garmin-different-email' } : ['ACTIVITY_EXPORT'];
    return { ok: true, json: async () => data };
  });
  const app = express(); app.use(express.json());
  app.use('/garmin', crearGarminRoutes({ repo, env: { ...env, ...options.env }, fetchImpl, log: (entry) => logs.push(entry),
    auth: (req, res, next) => {
      if (!req.headers.authorization) return res.sendStatus(401);
      req.userId = req.headers.authorization.slice(7); next();
    } }));
  const listener = app.listen(0, '127.0.0.1');
  await new Promise((r) => listener.once('listening', r));
  const request = async (path, init = {}) => {
    const r = await fetch(`http://127.0.0.1:${listener.address().port}/garmin/${path}`, { redirect: 'manual', ...init });
    return { status: r.status, headers: r.headers, text: await r.text() };
  };
  const begin = async (userId = 'owner') => {
    const start = await request('auth?userId=intruder', { method: 'POST', headers: { Authorization: `Bearer ${userId}` } });
    if (start.status !== 200) return { start };
    const launchUrl = new URL(JSON.parse(start.text).authorization_url);
    const launchPath = launchUrl.pathname.split('/garmin/')[1] + launchUrl.search;
    const launched = await request(launchPath);
    return { start, launchPath, launched, state: new URL(launched.headers.get('location')).searchParams.get('state'),
      cookie: launched.headers.get('set-cookie').split(';')[0] };
  };
  try { await fn({ repo, requests, request, begin, logs }); }
  finally { listener.closeAllConnections(); await new Promise((r) => listener.close(r)); }
}
const callback = (flow, code = 'a-code') => `callback?state=${flow.state}&code=${code}`;

test('Garmin start requires authentication, configured keys and the test account', async () => {
  await server(async ({ request }) => {
    assert.equal((await request('auth', { method: 'POST' })).status, 401);
    assert.equal((await request('auth', { method: 'POST', headers: { Authorization: 'Bearer other' } })).status, 404);
    assert.deepEqual(JSON.parse((await request('status', { headers: { Authorization: 'Bearer other' } })).text), { available: false, connected: false });
  });
  for (const config of [{ GARMIN_OAUTH_ENABLED: '0' }, { GARMIN_TOKEN_ENCRYPTION_KEY: '' }]) {
    await server(async ({ begin, repo }) => { assert.equal((await begin()).start.status, 404); assert.equal(repo.attempts.size, 0); }, { env: config });
  }
});

test('PKCE S256, one-use launch and browser binding use the authenticated Korva account', async () => {
  await server(async ({ begin, request, repo }) => {
    const flow = await begin();
    const row = [...repo.attempts.values()][0];
    assert.equal(row.user_id, 'owner');
    assert.equal(row.state_hash, hash(flow.state));
    assert.ok(!row.payload_ciphertext.includes(flow.state));
    const authUrl = new URL(flow.launched.headers.get('location'));
    const payload = descifrar(row.payload_ciphertext, configuracionGarmin(env).key, `garmin-state:owner:${row.state_hash}`);
    assert.equal(authUrl.origin, 'https://connect.garmin.com');
    assert.equal(authUrl.searchParams.get('redirect_uri'), REDIRECT_URI);
    assert.equal(authUrl.searchParams.get('code_challenge'), crypto.createHash('sha256').update(payload.verifier).digest('base64url'));
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authUrl.searchParams.has('scope'), false);
    assert.match(flow.launched.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
    assert.equal((await request(flow.launchPath)).status, 400);
    assert.equal((await request(callback(flow))).status, 400);
    assert.equal(repo.attempts.size, 1);
  });
});

test('real route sequence exchanges code, stores encrypted tokens and reports connected without token exposure', async () => {
  await server(async ({ begin, request, repo, requests }) => {
    const flow = await begin();
    const result = await request(callback(flow) + '&userId=intruder', { headers: { Cookie: flow.cookie } });
    assert.match(result.text, /result=connected/);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(repo.connections.has('intruder'), false);
    const stored = repo.connections.get('owner');
    const tokens = descifrar(stored.token_ciphertext, configuracionGarmin(env).key, 'garmin-tokens:owner');
    assert.equal(tokens.access_token, 'access-private');
    const form = new URLSearchParams(requests[0].init.body);
    assert.equal(form.get('client_secret'), 'test-secret');
    assert.equal(form.get('redirect_uri'), REDIRECT_URI);
    assert.equal(form.get('code_verifier').length, 43);
    const status = await request('status', { headers: { Authorization: 'Bearer owner' } });
    assert.equal(JSON.parse(status.text).connected, true);
    assert.equal(JSON.parse(status.text).activities_enabled, false);
    assert.doesNotMatch(status.text + result.text, /access-private|refresh-private|test-secret|token_ciphertext/);
    assert.equal((await request(callback(flow), { headers: { Cookie: flow.cookie } })).status, 400);
    assert.equal(requests.length, 3);
  });
});

test('concurrent callback retries exchange a code exactly once', async () => {
  await server(async ({ begin, request, requests }) => {
    const flow = await begin();
    const results = await Promise.all([1, 2, 3].map(() => request(callback(flow), { headers: { Cookie: flow.cookie } })));
    assert.equal(results.filter((r) => r.text.includes('result=connected')).length, 1);
    assert.equal(requests.length, 3);
  });
});

test('cancel and malformed responses consume the state without creating a connection', async () => {
  for (const query of ['error=access_denied', 'code=x&error=server_error', '', 'code=x&code=y']) {
    await server(async ({ begin, request, repo, requests }) => {
      const flow = await begin();
      const result = await request(`callback?state=${flow.state}&${query}`, { headers: { Cookie: flow.cookie } });
      assert.match(result.text, new RegExp(query === 'error=access_denied' ? 'result=cancelled' : 'result=error'));
      assert.equal(repo.attempts.size, 0); assert.equal(repo.connections.size, 0); assert.equal(requests.length, 0);
    });
  }
});

test('expired state, fake state and wrong browser cannot connect', async () => {
  await server(async ({ begin, request, repo, requests }) => {
    const flow = await begin();
    assert.equal((await request(callback(flow), { headers: { Cookie: flow.cookie.replace(/=.*/, '=' + 'x'.repeat(43)) } })).status, 400);
    assert.equal((await request('callback?state=' + 'x'.repeat(43) + '&code=code', { headers: { Cookie: flow.cookie } })).status, 400);
    [...repo.attempts.values()][0].expires = Date.now() - 1;
    assert.equal((await request(callback(flow), { headers: { Cookie: flow.cookie } })).status, 400);
    assert.equal(requests.length, 0);
  });
});

test('provider errors and absent activity consent leave the previous connection untouched', async () => {
  for (const failure of ['http', 'json', 'missing-refresh', 'permission']) {
    let calls = 0;
    await server(async ({ begin, request, repo }) => {
      const flow = await begin();
      const result = await request(callback(flow), { headers: { Cookie: flow.cookie } });
      assert.match(result.text, new RegExp(failure === 'permission' ? 'permission_required' : 'result=error'));
      assert.equal(repo.connections.size, 0); assert.equal(repo.attempts.size, 0);
      assert.doesNotMatch(result.text, /secret-body|private-token/);
    }, { fetchImpl: async () => {
      calls++;
      if (failure === 'http') return { ok: false };
      if (failure === 'json') throw Error('secret-body');
      return { ok: true, json: async () => calls === 1 ? { access_token: 'private-token',
        refresh_token: failure === 'missing-refresh' ? null : 'refresh', expires_in: 86400,
        refresh_token_expires_in: 7776000, token_type: 'bearer' } : calls === 2 ? { userId: 'garmin' } : [] };
    } });
  }
});

test('one Garmin account cannot overwrite another Korva account', async () => {
  const repo = states(); repo.connections.set('other', { garminUserId: 'garmin-different-email', token_ciphertext: 'existing' });
  await server(async ({ begin, request }) => {
    const flow = await begin();
    const result = await request(callback(flow), { headers: { Cookie: flow.cookie } });
    assert.match(result.text, /result=account_in_use/); assert.equal(repo.connections.get('other').token_ciphertext, 'existing');
    assert.equal(repo.connections.has('owner'), false);
  }, { repo });
});

test('encryption rejects tampering and moving credentials to another account', () => {
  const key = configuracionGarmin(env).key;
  const value = cifrar({ secret: 'private' }, key, 'owner');
  assert.throws(() => descifrar(value, key, 'other'));
  const parts = value.split('.'); parts[2] = crypto.randomBytes(16).toString('base64url');
  assert.throws(() => descifrar(parts.join('.'), key, 'owner'));
  assert.equal(configuracionGarmin({ ...env, GARMIN_TOKEN_URL: 'https://attacker.invalid' }), null);
  assert.equal(configuracionGarmin({ ...env, GARMIN_REDIRECT_URI: 'https://attacker.invalid' }), null);
});


test('callback diagnostics identify token, identity, permissions and storage stages without credentials', async () => {
  for (const failure of ['token', 'user_id', 'permissions', 'permissions-shape', 'missing-permission', 'database', 'none']) {
    let calls = 0;
    const repo = states();
    if (failure === 'database') repo.conectar = async () => { throw Object.assign(Error('private-database-body'), { code: '23505' }); };
    await server(async ({ begin, request, logs }) => {
      const flow = await begin();
      const result = await request(callback(flow, 'secret-auth-code'), { headers: { Cookie: flow.cookie } });
      const serialized = JSON.stringify(logs);
      assert.doesNotMatch(serialized, /secret-auth-code|private-access|private-refresh|test-secret|private-database-body/);
      assert.equal(serialized.includes(flow.state), false);
      assert.equal(serialized.includes(flow.cookie), false);
      assert.equal(new Set(logs.map((entry) => entry.trace_id)).size, 1);
      assert.equal(logs.at(-1).event, 'result');
      const expected = failure === 'none' ? 'connected' : failure === 'database' ? 'account_in_use'
        : failure === 'missing-permission' ? 'permission_required' : 'error';
      assert.equal(logs.at(-1).result, expected);
      assert.match(result.text, new RegExp('result=' + expected));
      if (['token', 'user_id', 'permissions'].includes(failure)) {
        assert.ok(logs.some((entry) => entry.stage === failure && entry.event === 'response' && entry.http_status === 403));
      }
      if (failure === 'permissions-shape') assert.ok(logs.some((entry) => entry.stage === 'permissions'
        && entry.event === 'invalid_schema' && entry.root_type === 'object' && entry.permissions_field_array === false));
      if (failure === 'database') assert.ok(logs.some((entry) => entry.database_code === '23505'));
    }, { repo, fetchImpl: async () => {
      calls++;
      const stage = calls === 1 ? 'token' : calls === 2 ? 'user_id' : 'permissions';
      return { ok: failure !== stage, status: failure === stage ? 403 : 200, json: async () => calls === 1
        ? { access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 86400,
          refresh_token_expires_in: 7776000, token_type: 'bearer' }
        : calls === 2 ? { userId: 'garmin' }
          : failure === 'permissions-shape' ? { permissions: 'malformed' }
            : failure === 'missing-permission' ? [] : ['ACTIVITY_EXPORT'] };
    } });
  }
});

test('real Garmin wrapped permissions connect only with valid ACTIVITY_EXPORT consent', async () => {
  const cases = [
    { payload: { permissions: ['ACTIVITY_EXPORT'] }, result: 'connected' },
    { payload: { permissions: ['WORKOUT_IMPORT'] }, result: 'permission_required' },
    { payload: { permissions: [] }, result: 'permission_required' },
    { payload: { permissions: ['ACTIVITY_EXPORT', 1] }, result: 'error' },
    { payload: { permissions: { ACTIVITY_EXPORT: true } }, result: 'error' },
    { payload: null, result: 'error' },
  ];
  for (const { payload, result } of cases) {
    let calls = 0;
    await server(async ({ begin, request, repo, logs }) => {
      const flow = await begin();
      const response = await request(callback(flow), { headers: { Cookie: flow.cookie } });
      assert.match(response.text, new RegExp('result=' + result));
      assert.equal(logs.at(-1).result, result);
      assert.equal(repo.connections.size, result === 'connected' ? 1 : 0);
      if (result === 'connected') {
        assert.deepEqual(repo.connections.get('owner').permissions, ['ACTIVITY_EXPORT']);
        const status = JSON.parse((await request('status', { headers: { Authorization: 'Bearer owner' } })).text);
        assert.equal(status.connected, true); assert.equal(status.activities_enabled, false);
        assert.equal((await request(callback(flow), { headers: { Cookie: flow.cookie } })).status, 400);
      }
    }, { fetchImpl: async () => {
      calls++;
      return { ok: true, status: 200, json: async () => calls === 1
        ? { access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 86400,
          refresh_token_expires_in: 7776000, token_type: 'bearer' }
        : calls === 2 ? { userId: 'garmin' } : payload };
    } });
  }
});
