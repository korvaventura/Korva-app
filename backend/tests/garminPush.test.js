const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { crearGarminPushRoutes } = require('../routes/garminPush');
const { ipGarmin, ipDePeticion, normalizarActividad, normalizarLote, equivalenteGarminStrava } = require('../lib/garminPushCore');
const USER = '11111111-1111-4111-8111-111111111111';
const env = { GARMIN_PUSH_CAPTURE_ENABLED: '1', GARMIN_OAUTH_ENABLED: '1', GARMIN_OAUTH_TEST_USER_IDS: USER };
const activity = (extra = {}) => ({ userId: 'garmin-fixture', summaryId: 'summary-1', activityId: 5001968355,
  activityType: 'RUNNING', startTimeInSeconds: 1512234126, startTimeOffsetInSeconds: -25200,
  durationInSeconds: 1789, distanceInMeters: 1976.83, deviceName: 'forerunner935', ...extra });
async function server(fn, options = {}) {
  const stored = new Map(), logs = [];
  let throwDb = false;
  const repo = { async registrar(rows, ids) {
    if (throwDb) throw Error('private database message');
    assert.deepEqual(ids, options.env?.GARMIN_PUBLIC_BETA_ENABLED === '1' ? null : [USER]);
    let eligible = 0, inserted = 0;
    for (const row of rows) {
      if (row.garmin_user_id !== 'garmin-fixture') continue;
      eligible++;
      const key = row.summary_id + ':' + row.fingerprint;
      if (!stored.has(key)) { inserted++; stored.set(key, row); }
    }
    return { received: rows.length, eligible, inserted };
  } };
  const app = express();
  app.use('/garmin', crearGarminPushRoutes({ repo, env: { ...env, ...options.env },
    obtenerIp: options.obtenerIp || (() => '204.77.162.1'), log: (entry) => logs.push(entry) }));
  const listener = app.listen(0, '127.0.0.1');
  await new Promise((r) => listener.once('listening', r));
  const post = async (body = { activities: [activity()] }, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${listener.address().port}/garmin/webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: response.status, text: await response.text() };
  };
  try { await fn({ post, stored, logs, failDb: () => { throwDb = true; } }); }
  finally { listener.closeAllConnections(); await new Promise((r) => listener.close(r)); }
}

test('origin allows only Garmin documented IPv4 ranges; malformed chains and IPv6 fail closed', () => {
  for (const ip of ['204.77.162.0', '204.77.163.255', '98.199.125.254', '185.132.79.1', '208.65.207.1', '185.207.95.1', '198.233.176.1', '::ffff:204.77.162.1']) assert.equal(ipGarmin(ip), true, ip);
  for (const ip of ['204.77.164.0', '98.199.126.0', '185.132.80.1', '208.65.208.1', '127.0.0.1', '::1', '204.77.162.1, 8.8.8.8', undefined]) assert.equal(ipGarmin(ip), false, String(ip));
  const req = { get: (header) => header === 'x-real-ip' ? '8.8.8.8' : '204.77.162.1', socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(ipDePeticion(req, { RAILWAY_ENVIRONMENT_ID: 'production' }), '8.8.8.8');
  assert.equal(ipDePeticion(req, {}), '127.0.0.1');
});

test('canonical fields use UTC without device offset, preserve parent flags, omit sensitive extras and fingerprint consistently', () => {
  const a = normalizarActividad(activity({ isParent: true, parentSummaryId: 'parent', manual: false,
    isWebUpload: false, averageHeartRateInBeatsPerMinute: 144, startingLatitudeInDegree: 51 }));
  assert.equal(a.payload.recorded_at, '2017-12-02T17:02:06.000Z');
  assert.ok(Math.abs(a.payload.distance_km - 1.97683) < 1e-9); assert.equal(a.payload.sport_type, 'run');
  assert.equal(a.payload.external_id, 'garmin:5001968355'); assert.equal(a.payload.device_name, 'forerunner935');
  assert.equal(a.payload.is_parent, true); assert.equal(a.payload.manual, false);
  assert.doesNotMatch(JSON.stringify(a), /HeartRate|Latitude|averageHeart|startingLatitude/);
  const b = normalizarActividad(activity({ activityId: undefined }));
  assert.equal(b.payload.external_id, 'garmin:summary-1');
  assert.equal(normalizarActividad(activity()).fingerprint, normalizarActividad(activity({ unknownField: 'ignored' })).fingerprint);
  assert.notEqual(normalizarActividad(activity()).fingerprint, normalizarActividad(activity({ distanceInMeters: 2000 })).fingerprint);
});

test('rejects malformed, unsafe integer, negative, nonfinite, future, oversized or mixed payloads', () => {
  for (const change of [{ userId: '' }, { summaryId: '' }, { distanceInMeters: -1 }, { distanceInMeters: Infinity },
    { distanceInMeters: '100' }, { durationInSeconds: 1.5 }, { startTimeInSeconds: Date.now() },
    { activityId: Number.MAX_SAFE_INTEGER + 1 }, { isParent: 'false' }, { activityType: null }, { deviceName: 'x'.repeat(129) }]) {
    assert.throws(() => normalizarActividad(activity(change)), /invalid_activity/);
  }
  for (const body of [null, [], { activities: null }, { activities: [activity()], dailies: [] }, { activities: Array(1001).fill(activity()) }]) assert.throws(() => normalizarLote(body), /invalid_batch/);
  assert.deepEqual(normalizarLote({ activities: [] }), []);
});

test('durable capture ACK, repeated concurrent packets and revised summary preserve first record without logging payload', async () => {
  await server(async ({ post, stored, logs }) => {
    const requests = await Promise.all(Array.from({ length: 12 }, () => post()));
    assert.ok(requests.every((r) => r.status === 200)); assert.equal(stored.size, 1);
    assert.equal(logs.filter((log) => log.result === 'captured').reduce((sum, log) => sum + log.inserted, 0), 1);
    assert.ok(logs.every((log) => log.activities_enabled === false));
    await post({ activities: [activity({ distanceInMeters: 2000 })] });
    assert.equal(stored.size, 2); assert.ok(Math.abs([...stored.values()][0].payload.distance_km - 1.97683) < 1e-9);
    assert.doesNotMatch(JSON.stringify(logs), /garmin-fixture|summary-1|forerunner935|1.97683|recorded_at/);
  });
});

test('missing flags/list keep capture off; disallowed origin cannot use forwarded header to bypass gate', async () => {
  for (const overrides of [{ GARMIN_PUSH_CAPTURE_ENABLED: '0' }, { GARMIN_OAUTH_ENABLED: '0' }, { GARMIN_OAUTH_TEST_USER_IDS: '' }, { GARMIN_OAUTH_TEST_USER_IDS: 'not-a-uuid' }]) {
    await server(async ({ post, stored }) => { assert.equal((await post()).status, 404); assert.equal(stored.size, 0); }, { env: overrides });
  }
  await server(async ({ post, stored }) => {
    assert.equal((await post('{broken', { 'X-Forwarded-For': '204.77.162.1', 'X-Real-IP': '204.77.162.1' })).status, 403);
    assert.equal(stored.size, 0);
  }, { obtenerIp: () => '8.8.8.8' });
});

test('DB failure returns 503 (retry), malformed JSON returns 400, body limit 413, unknown account ACKs without capture', async () => {
  await server(async ({ post, failDb, stored }) => {
    assert.equal((await post('{broken')).status, 400);
    assert.equal((await post({ activities: [activity({ distanceInMeters: -1 })] })).status, 400);
    assert.equal((await post(JSON.stringify({ activities: [], padding: 'x'.repeat(2 * 1024 * 1024) }))).status, 413);
    assert.equal((await post({ activities: [activity({ userId: 'unknown-user' })] })).status, 200);
    assert.equal(stored.size, 0); failDb();
    const failed = await post(); assert.equal(failed.status, 503); assert.doesNotMatch(failed.text, /private/);
  });
});

test('Garmin/Strava duplicate preview is symmetric, midnight-safe and respects time, distance, person and sport', () => {
  const a = { user_id: USER, source: 'garmin', sport_type: 'run', distance_km: 10, recorded_at: '2026-11-20T23:58:00Z' };
  const b = { ...a, source: 'strava', distance_km: 10.5, recorded_at: '2026-11-21 00:08:00' };
  assert.equal(equivalenteGarminStrava(a, b), true); assert.equal(equivalenteGarminStrava(b, a), true);
  for (const change of [{ recorded_at: '2026-11-21T00:08:01Z' }, { distance_km: 11 }, { user_id: 'other' },
    { source: 'garmin' }, { sport_type: 'ride' }, { excluida: true }, { distance_km: 0 }]) assert.equal(equivalenteGarminStrava(a, { ...b, ...change }), false);
  // Same distance, separate workouts on the same day must remain separate.
  assert.equal(equivalenteGarminStrava(a, { ...b, recorded_at: '2026-11-20T12:00:00Z', distance_km: 10 }), false);
  assert.equal(equivalenteGarminStrava({ ...a, distance_km: 1 }, { ...b, distance_km: 1.3 }), true);
});

test('public capture explicitly passes null scope; absent private list still denies',async()=>{
 await server(async({post})=>assert.equal((await post()).status,200),{env:{GARMIN_PUBLIC_BETA_ENABLED:'1',GARMIN_OAUTH_TEST_USER_IDS:''}});
});
