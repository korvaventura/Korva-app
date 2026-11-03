-- PLAN DE BACKFILL, NO EJECUTADO. Revisado 2026-11-03.
-- Solo marca el piso para tres reinicios administrativos respaldados.
-- No altera started_at, km_completed, km_base, status ni actividades.
-- Los filtros por id, user_id y started_at evitan marcar un reinicio posterior por accidente.
BEGIN;
UPDATE public.user_challenges
SET inicio_protegido_at = started_at
WHERE inicio_protegido_at IS NULL AND status = 'active'
  AND (
    (id = 'f2abef3a-0e13-451b-9eab-7a7753ae67ac'::uuid
       AND user_id = 'fb5dce58-a577-4830-86c8-d7ef17904909'::uuid
       AND started_at = '2026-11-02 20:57:33.752611'::timestamp)
    OR
    (id = '106b812b-4777-4dd7-8123-90a63b6e6af0'::uuid
       AND user_id = 'fb5dce58-a577-4830-86c8-d7ef17904909'::uuid
       AND started_at = '2026-11-02 20:57:33.752611'::timestamp)
    OR
    (id = '181425cb-022c-48db-a49f-2734dccd0033'::uuid
       AND user_id = '71daceb0-16f1-45cd-b3c4-ae380fd8a6ea'::uuid
       AND started_at = '2026-10-24 16:09:36.659247'::timestamp)
  );
-- Esperado: exactamente 3 filas. Comprobar manualmente antes de COMMIT en ejecución controlada.
-- En un procedimiento de ejecución usar DO + GET DIAGNOSTICS ROW_COUNT
-- y RAISE EXCEPTION para evitar confirmar un número distinto de 3.
ROLLBACK; -- seguridad: este archivo es una propuesta; nunca aplicarlo como está.
