# Garmin · conexión inicial

Backend based on production `main` / `ce0c198`. Railway service `Korva-app` runs `node index.js` in `backend`.

## Routes

- `GET /garmin/status` requires the Korva Supabase bearer JWT and returns availability and connection metadata.
- `POST /garmin/auth` requires the same JWT. It returns a one-use browser launch URL. Identity always comes from `req.userId`.
- `GET /garmin/authorize?ticket=…` consumes that ticket, binds the browser with an HttpOnly Secure SameSite=Lax cookie and redirects to Garmin.
- `GET /garmin/callback` consumes the hashed state and browser binding atomically, exchanges the code using PKCE S256, fetches Garmin's user ID and consent, and saves encrypted server credentials.
- Return URI `korva://garmin-connected?result=connected|cancelled|invalid_state|permission_required|account_in_use|unavailable|error`. The app always checks authenticated `/garmin/status` before showing success.

Every attempt expires after 10 minutes. Beginning a new attempt replaces the previous pending attempt. Double clicks within 3 seconds are rejected. Callback replay, wrong-browser callbacks and expired states cannot save credentials. Garmin identities and Korva users both have unique constraints, so an existing connection cannot be overwritten by another callback.

## Railway variables

| Variable | Value |
| --- | --- |
| `GARMIN_CLIENT_ID` | Garmin portal Consumer Key / Client ID |
| `GARMIN_CLIENT_SECRET` | Garmin portal Consumer Secret / Client Secret |
| `GARMIN_TOKEN_ENCRYPTION_KEY` | Random 32-byte key, Base64, generated once and retained securely |
| `GARMIN_OAUTH_ENABLED` | `1` for the private trial. Any other value disables it |
| `GARMIN_OAUTH_TEST_USER_IDS` | Comma-separated authenticated Korva UUIDs allowed to connect |
| `GARMIN_REDIRECT_URI` | Optional. If supplied, must equal `https://korva-app-production.up.railway.app/garmin/callback` |
| `GARMIN_TOKEN_URL` | Optional. Default `https://diauth.garmin.com/di-oauth2-service/oauth/token` |

Generate the encryption key locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and paste it directly in Railway. The key is server-only and is used for tokens and pending PKCE verifiers. Retain it across deploys. Rotating it requires an explicit credential migration or reconnection.

Availability requires both the enabled flag and membership in the UUID list. An empty list enables nobody. Keep the one-account list for this stage.

## Garmin configuration

Sources consulted on 2026-11-21:
- https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf
- https://developerportal.garmin.com/sites/default/files/OAuth2PKCE.pdf

Garmin's published specifications differ on the token host. The `_1` specification uses `diauth.garmin.com`; the other uses `connectapi.garmin.com`. Both are explicitly allowed by server configuration. Confirm the token endpoint in the portal documentation if Garmin rejects the default. Do not enter a custom arbitrary host.

Authorization URL `https://connect.garmin.com/oauth2Confirm` with PKCE S256. Garmin defines scopes in the app configuration, so the authorization request sends no invented scope. This implementation requires `ACTIVITY_EXPORT` in the returned permissions because this integration is intended for the Activity API. Confirm the permission name if the Starter portal documents a different value.

User ID and permissions endpoints:
`https://apis.garmin.com/wellness-api/rest/user/id`
`https://apis.garmin.com/wellness-api/rest/user/permissions`

Emails may differ between Korva and Garmin. The integration uses their stable user identifiers.

## Install and trial

1. Run backend automated tests. Apply `backend/migrations/20261121185543_garmin_oauth.sql` before deploying the backend. Tables and functions are restricted to `service_role`, with RLS enabled and no client policies.
2. Deploy the backend candidate, then load the three secrets and the private trial flags in Railway. The registered callback hostname must reach this candidate. A preview host requires its own registered callback and an intentional code/config change.
3. Mobile integration is in the companion Garmin branch based on `mundi/globo-santiago-20261116`, preserving its existing UX. It adds `GarminConnection` to Perfil and reuses `openAuthSessionAsync` plus `korva://` from Strava. The additions are JavaScript and use the existing development build.
4. Sign in to Korva as the allowed test account. In Perfil, tap Conectar Garmin. Authorize the intended Garmin account and allow activity sharing. The browser returns to Korva; authenticated status must show connected. The component explicitly says activity synchronization will arrive later.
5. Confirm metadata persistence by reloading Perfil, then closing/reopening the app. Verify a second Korva account cannot see or start Garmin.
6. Before a successful connection, test cancellation, dismissing the browser, expiry, replay and denied activity consent. Automated tests cover these paths. Use a separate test account or revoke the trial registration through Garmin Connect before repeating a successful authorization.
7. Verify credentials never appear in browser redirects, app state, profile responses or logs. Railway request URLs may contain one-use tickets or authorization codes; avoid copying callback query strings into logs or screenshots.

The callback is only claimed after the same browser presents its binding cookie. Preserve cookies while Garmin redirects through the authentication browser.

## Boundaries of this stage

Activities and kilometers are not imported. No Garmin webhook is registered. Token refresh and provider-side disconnect/deletion must be implemented before wider availability; Garmin requires deleting the provider registration when the partner offers disconnect/account deletion. Auth-user deletion cascades local credentials, but provider revocation still needs the next lifecycle change. Keep the explicit private UUID allowlist.

Tests include the complete local HTTP route sequence with mocked Garmin, crypto, errors, denied consent and callback races. A separate disposable PostgreSQL execution verified the migration, grants/RLS, one-use RPCs, expired attempts and unique identities. Live approval in Garmin is a distinct manual acceptance step and requires the actual credentials.
