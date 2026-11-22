const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cuentasGarmin(env = process.env) {
  // null is explicit public mode; an empty allowlist never means public.
  return env.GARMIN_PUBLIC_BETA_ENABLED === '1' ? null : (env.GARMIN_OAUTH_TEST_USER_IDS || '')
    .split(',').map(id => id.trim()).filter(id => UUID.test(id));
}
function usuarioGarminPermitido(id, env = process.env) {
  const ids = cuentasGarmin(env);
  return typeof id === 'string' && id.length > 0 && env.GARMIN_OAUTH_ENABLED === '1' && (ids === null || (env.GARMIN_OAUTH_TEST_USER_IDS || '').split(',').map(s => s.trim()).includes(id));
}
module.exports = { cuentasGarmin, usuarioGarminPermitido };
