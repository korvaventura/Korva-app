BEGIN;
ALTER TABLE public.garmin_connections
  ADD COLUMN operation_owner uuid,
  ADD COLUMN operation_until timestamptz;
CREATE FUNCTION public.korva_garmin_claim(p_user_id uuid, p_owner uuid)
RETURNS SETOF public.garmin_connections
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.garmin_connections c
  SET operation_owner = p_owner, operation_until = clock_timestamp() + interval '90 seconds'
  WHERE c.user_id = p_user_id AND (c.operation_until IS NULL OR c.operation_until < clock_timestamp())
  RETURNING c.*;
$$;
REVOKE ALL ON FUNCTION public.korva_garmin_claim(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.korva_garmin_claim(uuid,uuid) TO service_role;
COMMIT;
