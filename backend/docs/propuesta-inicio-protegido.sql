-- PROPUESTA, NO EJECUTADA. Aplicar y validar antes de desplegar backend.
-- PostgreSQL / Supabase: user_challenges.started_at es TIMESTAMP WITHOUT TIME ZONE.
-- No modifica ninguna fila existente ni activa protección retroactiva automáticamente.
ALTER TABLE public.user_challenges
  ADD COLUMN IF NOT EXISTS inicio_protegido_at timestamp without time zone;

COMMENT ON COLUMN public.user_challenges.inicio_protegido_at IS
  'Piso de inicio para impedir que una actividad manual retroactiva revierta un reinicio administrativo. NULL conserva la regla previa. Establecer únicamente en la operación admin que reinicia.';

-- Verificación de esquema tras aplicar (solo lectura):
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='user_challenges'
-- AND column_name='inicio_protegido_at';

-- Un reinicio administrativo futuro debe cambiar en UNA sola transacción:
--   started_at := momento_reinicio,
--   inicio_protegido_at := momento_reinicio,
--   km_completed := 0, km_base := 0 ...
-- No inferir reinicios históricos desde km_completed=0: hay desafíos legítimos con 0 km.
-- Los reinicios históricos se marcarán selectivamente tras comprobar su respaldo admin.
-- No otorgar permisos nuevos ni exponer este campo como control de usuario.
