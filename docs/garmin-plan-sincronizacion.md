# Garmin en Korva — estado y pendientes (21 nov 2026)

## Ramas
- Backend: `feat/garmin-oauth-20261121` (desplegado: Garmin habilitado solo para la cuenta de prueba). PR #26: renovación de tokens y desconexión (sin desplegar).
- App: `feat/garmin-conexiones-20261121`, sobre `mundi/globo-santiago-20261116` @ `49ff72f`. Reemplaza al PR #25 (cerrado).
  - `mobile/components/ConexionesSection.js` — Perfil → Conexiones (Strava + Garmin).
  - `mobile/services/conexionesCore.js` (+ `tests/conexiones.test.js`) — textos y reglas puras.
  - `mobile/services/garminApi.js` — `estadoGarmin()` / `iniciarGarmin()`.

## Contrato que usa la app (verificado contra backend/routes/garmin.js)
- `GET /garmin/status` → `{ available, connected, connected_at, permissions, activities_enabled }`; sin habilitar → `{ available:false, connected:false }`. Si falla o la ruta no existe, la app oculta Garmin.
- `POST /garmin/auth` → `{ authorization_url, expires_in }`; 404 = no habilitada; 409 = ya conectada o intento en curso.
- Regreso: `korva://garmin-connected?result=connected|cancelled|invalid_state|permission_required|account_in_use|unavailable|error`. La app decide el éxito solo con `/garmin/status`.
- La app solo abre URLs que empiezan con `https://korva-app-production.up.railway.app/garmin/authorize?`.

## Lo que muestra la app
- Garmin aparece solo si `available`.
- Vinculada y `activities_enabled !== true` → "Cuenta vinculada · Las salidas de Garmin todavía no suman km". Sin "sincronizando", sin última salida, sin desconectar.
- Con `activities_enabled: true` cambia sola a "Tus salidas de Garmin suman a tus desafíos".
- `nombreFuenteActividad('garmin')` → "Garmin".

## Pendiente en backend
1. Activities Push → `activities` con `source: 'garmin'`, `external_id`, `sport_type`, `distance_km`, `duration_seconds`, `recorded_at`.
2. Mismo motor/bandeja que Strava; aviso con `enviarNotificacionProgreso(..., { external_id })` (backend/routes/notificaciones.js) para que el push abra compartir (mobile/services/avisoCompartir.js busca por `external_id` en `GET /actividades`).
3. Duplicados Garmin↔Strava: misma persona, inicio ±10 min, distancia parecida (`backend/lib/toleranciaDuplicados.js`); gana la primera, no se reemplaza.
4. `activities_enabled: true` recién cuando 1–3 funcionen.
5. Desconectar (PR #26) → avisar para agregar el botón en la app con el contrato final.
6. Opcional: `last_activity_at` en `/garmin/status`.
7. Atribución de Garmin según su guía de marca.
