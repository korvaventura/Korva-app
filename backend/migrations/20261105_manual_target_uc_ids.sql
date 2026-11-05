-- Preparación de asignación explícita de actividades manuales.
-- Aplicar ANTES de desplegar backend que lee manual_target_uc_ids.
-- NULL conserva el comportamiento histórico y toda integración automática.
-- Array no vacío restringe la acreditación a las participaciones elegidas.
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS manual_target_uc_ids uuid[] NULL;

ALTER TABLE public.activities
  ADD CONSTRAINT activities_manual_target_uc_ids_validos
  CHECK (
    manual_target_uc_ids IS NULL
    OR (
      source = 'manual'
      AND cardinality(manual_target_uc_ids) BETWEEN 1 AND 20
      AND array_position(manual_target_uc_ids, NULL) IS NULL
    )
  );

COMMENT ON COLUMN public.activities.manual_target_uc_ids IS
  'NULL: reparto histórico según pausas; uuid[] no vacío: asignación explícita a participaciones del propio usuario, validada en backend. No se aplica a Strava/GPS/Health.';

-- La columna no modifica actividades anteriores ni requiere backfill.
