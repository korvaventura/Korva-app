const crypto = require('node:crypto');
const { BlockList, isIP } = require('node:net');

// Activity API 2.1, Push Service (p. 6). Revisit when Garmin updates its guide.
const GARMIN_NETWORKS = ['204.77.162.0/23', '204.77.163.0/24', '98.199.124.0/23',
  '185.132.79.0/24', '208.65.206.0/23', '185.207.94.0/23', '198.233.176.0/24'];
const ranges = new BlockList();
for (const range of GARMIN_NETWORKS) { const [ip, bits] = range.split('/'); ranges.addSubnet(ip, Number(bits), 'ipv4'); }
function ipGarmin(ip) {
  if (typeof ip !== 'string') return false;
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return isIP(normalized) === 4 && ranges.check(normalized, 'ipv4');
}
function ipDePeticion(req, env) {
  // Only trust Railway's edge header in the deployed Railway environment. Never X-Forwarded-For.
  return env.RAILWAY_ENVIRONMENT_ID ? req.get('x-real-ip') : req.socket.remoteAddress;
}
function text(value, max = 256) { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f]/.test(value); }
function number(value, max) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max; }
function sport(type) {
  if (['RUNNING', 'TRAIL_RUNNING', 'TREADMILL_RUNNING', 'TRACK_RUNNING', 'INDOOR_RUNNING', 'VIRTUAL_RUNNING'].includes(type)) return 'run';
  if (['WALKING', 'INDOOR_WALKING', 'CASUAL_WALKING', 'SPEED_WALKING'].includes(type)) return 'walk';
  if (['HIKING', 'MOUNTAINEERING'].includes(type)) return 'hike';
  if (['CYCLING', 'MOUNTAIN_BIKING', 'ROAD_BIKING', 'INDOOR_CYCLING', 'VIRTUAL_RIDE', 'GRAVEL_CYCLING', 'E_BIKE_FITNESS', 'E_BIKE_MOUNTAIN'].includes(type)) return 'ride';
  if (['LAP_SWIMMING', 'OPEN_WATER_SWIMMING', 'SWIMMING'].includes(type)) return 'swim';
  return type.toLowerCase();
}
function normalizarActividad(a, now = Date.now()) {
  if (!a || typeof a !== 'object' || Array.isArray(a) || !text(a.userId) || !text(a.summaryId)
    || !text(a.activityType, 80) || !Number.isSafeInteger(a.startTimeInSeconds) || a.startTimeInSeconds < 0
    || a.startTimeInSeconds * 1000 > now + 86400000
    || !Number.isSafeInteger(a.durationInSeconds) || !number(a.durationInSeconds, 2147483647)
    || !number(a.distanceInMeters, 1e9)) throw Error('invalid_activity');
  const activityId = a.activityId == null ? null : typeof a.activityId === 'string' && /^\d{1,128}$/.test(a.activityId)
    ? a.activityId : Number.isSafeInteger(a.activityId) && a.activityId > 0 ? String(a.activityId) : null;
  if (a.activityId != null && !activityId) throw Error('invalid_activity');
  for (const key of ['isParent', 'manual', 'isWebUpload']) if (a[key] != null && typeof a[key] !== 'boolean') throw Error('invalid_activity');
  if (a.parentSummaryId != null && !text(a.parentSummaryId)) throw Error('invalid_activity');
  if (a.deviceName != null && !text(a.deviceName, 128)) throw Error('invalid_activity');
  // Whitelist only fields needed for import. No heart rate, coordinates or raw provider body.
  const payload = { external_id: `garmin:${activityId || a.summaryId}`, sport_type: sport(a.activityType),
    activity_type: a.activityType, distance_km: a.distanceInMeters / 1000,
    duration_seconds: a.durationInSeconds, recorded_at: new Date(a.startTimeInSeconds * 1000).toISOString(),
    device_name: a.deviceName || null, is_parent: a.isParent ?? null, parent_summary_id: a.parentSummaryId ?? null,
    manual: a.manual ?? null, is_web_upload: a.isWebUpload ?? null };
  return { garmin_user_id: a.userId, summary_id: a.summaryId, payload,
    fingerprint: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
function normalizarLote(body, now = Date.now()) {
  if (!body || Array.isArray(body) || typeof body !== 'object' || !Array.isArray(body.activities)
    || Object.keys(body).some((key) => key !== 'activities') || body.activities.length > 1000) throw Error('invalid_batch');
  return body.activities.map((a) => normalizarActividad(a, now));
}
function utc(value) {
  if (typeof value !== 'string') return NaN;
  const iso = value.replace(' ', 'T');
  return Date.parse(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z');
}
// Preview only. The eventual writer must repeat this check atomically in PostgreSQL in BOTH directions.
function equivalenteGarminStrava(a, b) {
  if (!a || !b || a.user_id !== b.user_id || a.excluida || b.excluida
    || !((a.source === 'garmin' && b.source === 'strava') || (a.source === 'strava' && b.source === 'garmin'))) return false;
  const foot = ['run', 'walk', 'hike'];
  if (a.sport_type !== b.sport_type && !(foot.includes(a.sport_type) && foot.includes(b.sport_type))) return false;
  const timeA = utc(a.recorded_at), timeB = utc(b.recorded_at);
  const dA = a.distance_km, dB = b.distance_km;
  if (!Number.isFinite(timeA) || !Number.isFinite(timeB) || !number(dA, 1e6) || !number(dB, 1e6) || dA <= 0 || dB <= 0) return false;
  return Math.abs(timeA - timeB) <= 600000 && Math.abs(dA - dB) <= Math.max(0.3, Math.max(dA, dB) * 0.05) + 1e-9;
}
module.exports = { GARMIN_NETWORKS, ipGarmin, ipDePeticion, normalizarActividad, normalizarLote, equivalenteGarminStrava };
