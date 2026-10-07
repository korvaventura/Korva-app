BEGIN;
-- Separado de user_challenges y de los eventos/documentos de compras.
CREATE TABLE IF NOT EXISTS public.free_route_participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id uuid NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  acceptance_version text NOT NULL,
  paused_at timestamptz,
  pause_periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  left_at timestamptz,
  UNIQUE(user_id, route_id),
  CHECK (jsonb_typeof(pause_periods) = 'array')
);
ALTER TABLE public.free_route_participations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_route_participations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.free_route_participations TO service_role;

CREATE OR REPLACE FUNCTION public.korva_free_route_action(
  p_user_id uuid, p_route_id uuid, p_action text, p_acceptance_version text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE fila public.free_route_participations; momento timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_route_id IS DISTINCT FROM '3b211caf-ee16-54c8-a93c-343a5eb2d57e'::uuid
    OR p_action IS NULL OR p_action NOT IN ('aceptar','pausar','reanudar','dejar') THEN
    RAISE EXCEPTION 'Ruta o acción inválida';
  END IF;
  -- Serializa aceptación/pausa incluso antes de que exista la fila.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_route_id::text, 0));
  momento := clock_timestamp();
  SELECT * INTO fila FROM public.free_route_participations
    WHERE user_id = p_user_id AND route_id = p_route_id FOR UPDATE;
  IF p_action = 'aceptar' THEN
    IF p_acceptance_version IS DISTINCT FROM 'ruta-libre-v1' THEN RAISE EXCEPTION 'Aceptación requerida'; END IF;
    IF fila.id IS NULL THEN
      INSERT INTO public.free_route_participations(user_id, route_id, accepted_at, acceptance_version)
      VALUES(p_user_id,p_route_id,momento,p_acceptance_version) RETURNING * INTO fila;
    ELSIF fila.left_at IS NOT NULL THEN
      UPDATE public.free_route_participations SET left_at = NULL, paused_at = NULL,
        pause_periods = pause_periods || jsonb_build_array(jsonb_build_object('desde',fila.paused_at,'hasta',momento))
        WHERE id = fila.id;
    END IF;
  ELSE
    IF fila.id IS NULL THEN RAISE EXCEPTION 'Primero aceptá la ruta'; END IF;
    IF fila.left_at IS NOT NULL THEN RAISE EXCEPTION 'Volvé a aceptar la ruta para retomarla'; END IF;
    IF p_action IN ('pausar','dejar') THEN
      UPDATE public.free_route_participations SET paused_at = COALESCE(paused_at,momento),
        left_at = CASE WHEN p_action = 'dejar' THEN momento ELSE NULL END WHERE id = fila.id;
    ELSIF fila.paused_at IS NOT NULL THEN
      UPDATE public.free_route_participations SET paused_at = NULL,
        pause_periods = pause_periods || jsonb_build_array(jsonb_build_object('desde',fila.paused_at,'hasta',momento))
        WHERE id = fila.id;
    END IF;
  END IF;
  RETURN fila.id;
END;
$$;
REVOKE ALL ON FUNCTION public.korva_free_route_action(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.korva_free_route_action(uuid,uuid,text,text) TO service_role;
COMMIT;
