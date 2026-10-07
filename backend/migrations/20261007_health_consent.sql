BEGIN;
-- Las rutas gratuitas completadas con Salud conservan su cierre sin crear premios.
ALTER TABLE public.free_route_participations ADD COLUMN IF NOT EXISTS health_completed_at timestamptz;
ALTER TABLE public.free_route_participations ADD COLUMN IF NOT EXISTS health_started_at timestamptz;
-- Historial separado: desactivar no borra los días previamente autorizados.
CREATE TABLE IF NOT EXISTS public.health_challenge_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('pago','libre')),
  participacion_id uuid NOT NULL,
  timezone text NOT NULL,
  version text NOT NULL CHECK (version = 'movimiento-desafios-v1'),
  desde timestamptz NOT NULL,
  hasta timestamptz,
  confirmado_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (hasta IS NULL OR hasta >= desde)
);
CREATE UNIQUE INDEX IF NOT EXISTS health_challenge_consent_abierto
  ON public.health_challenge_consents(user_id,tipo,participacion_id) WHERE hasta IS NULL;
CREATE INDEX IF NOT EXISTS health_challenge_consent_usuario
  ON public.health_challenge_consents(user_id,tipo,participacion_id,desde);
ALTER TABLE public.health_challenge_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.health_challenge_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.health_challenge_consents TO service_role;

CREATE OR REPLACE FUNCTION public.korva_health_consent(
  p_user_id uuid, p_tipo text, p_participacion_id uuid,
  p_activo boolean, p_timezone text, p_version text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE momento timestamptz; comienzo timestamptz; consentimiento_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_participacion_id IS NULL OR p_activo IS NULL
    OR p_tipo IS NULL OR p_tipo NOT IN ('pago','libre')
    OR p_version IS DISTINCT FROM 'movimiento-desafios-v1' THEN
    RAISE EXCEPTION 'Consentimiento inválido';
  END IF;
  IF p_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION 'Zona horaria inválida';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('health:' || p_user_id::text,0));
  -- Bloquea la participación propia; nunca acepta un id de otra cuenta.
  IF p_tipo = 'pago' THEN
    PERFORM 1 FROM public.user_challenges WHERE id = p_participacion_id AND user_id = p_user_id
      AND (NOT p_activo OR status = 'active') FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.free_route_participations WHERE id = p_participacion_id AND user_id = p_user_id
      AND (NOT p_activo OR (left_at IS NULL AND health_completed_at IS NULL)) FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participación no disponible'; END IF;
  momento := clock_timestamp();
  SELECT id INTO consentimiento_id FROM public.health_challenge_consents
    WHERE user_id = p_user_id AND tipo = p_tipo AND participacion_id = p_participacion_id
    AND hasta IS NULL FOR UPDATE;
  IF p_activo THEN
    IF consentimiento_id IS NOT NULL THEN RETURN consentimiento_id; END IF;
    -- Comienza el próximo día local completo, calculado en el servidor (incluye DST).
    comienzo := (date_trunc('day', momento AT TIME ZONE p_timezone) + interval '1 day') AT TIME ZONE p_timezone;
    INSERT INTO public.health_challenge_consents(user_id,tipo,participacion_id,timezone,version,desde)
      VALUES(p_user_id,p_tipo,p_participacion_id,p_timezone,p_version,comienzo)
      RETURNING id INTO consentimiento_id;
  ELSIF consentimiento_id IS NOT NULL THEN
    -- Desactivar antes del comienzo deja una ventana vacía, sin aportar nada.
    UPDATE public.health_challenge_consents SET hasta = greatest(desde,momento)
      WHERE id = consentimiento_id;
  END IF;
  IF p_tipo = 'pago' THEN
    UPDATE public.user_challenges SET recalculo_pendiente_desde = clock_timestamp()
      WHERE id = p_participacion_id AND user_id = p_user_id AND status = 'active';
  END IF;
  RETURN consentimiento_id;
END;
$$;
REVOKE ALL ON FUNCTION public.korva_health_consent(uuid,text,uuid,boolean,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.korva_health_consent(uuid,text,uuid,boolean,text,text) TO service_role;
COMMIT;
