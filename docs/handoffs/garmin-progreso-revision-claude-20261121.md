# Garmin progreso: revisión y aplicación (Claude, 21 nov 2026)

Base: `main` @ 492affc + parche `docs/handoffs/garmin-progreso-20261121.patch` (aplicó sin conflictos).

## Cambios sobre el parche
1. **Trigger de duplicados acotado** (`korva_activity_provider_dedup`):
   - Una fila **garmin** se descarta si ya existe la misma salida desde **strava o korva_gps**.
   - Una fila **strava** se descarta si ya existe desde **garmin**.
   - Inserciones **korva_gps** y **manual** nunca se descartan (el GPS usa `insert().select().single()`
     y un descarte silencioso lo haría fallar; además ya chequea equivalentes ±45 min antes de insertar).
2. **Prueba PostgreSQL corregida**: `garmin_import_postgres.py` creaba `user_challenges` con
   `CREATE TABLE`, pero el paso anterior del CI (dorsales) ya la crea → habría fallado en CI.
   Ahora extiende la tabla existente. Se sumaron casos: Garmin después de Korva GPS (se descarta),
   GPS/manual nunca descartados, otro usuario no afectado, deporte distinto no es duplicado.

## Compatibilidad verificada
- `guardar_actividad_strava` (RPC de producción) con una fila descartada por el trigger:
  devuelve `insertada: null` sin error → el webhook la trata como no insertada.
- Upserts PostgREST de Strava (sin `select`) no fallan si el trigger descarta.
- El motor de progreso no filtra por `source`: `garmin` suma igual que el resto.
- `recorded_at` (timestamp sin zona) se guarda en UTC, igual que Strava.

## Pruebas ejecutadas (cluster PostgreSQL 16 nuevo, mismo orden que el CI)
- dorsales_postgres, garmin_postgres, garmin_push_postgres, garmin_import_postgres: OK.
- `npm test` backend: 486/486.
- `node --check`, `git diff --check`: OK.

## Producción
- Migración `20261121223000_garmin_import.sql` (versión acotada) **aplicada en Supabase**.
- Falta: desplegar este código (merge a `main`) y `GARMIN_ACTIVITIES_ENABLED=1` en Railway.
  `GARMIN_OAUTH_TEST_USER_IDS` sigue limitando a la cuenta de prueba.

## Pendiente (no bloquea la prueba privada)
- Push de progreso para Garmin (`notificarProgresoMotor` es solo Strava).
- `activities_enabled` en `/garmin/status` sigue en false hasta validar.
- Eventos `sin_permiso` quedan en `capturado` y se reintentan cada 30 s; con >25 atascados
  podrían tapar eventos nuevos (orden por `received_at`, límite 25). Revisar antes de abrir.
- Garmin vs **manual** no se deduplica (la carga manual no tiene hora exacta).
