BEGIN;
CREATE TABLE public.garmin_oauth_states (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  launch_hash text NOT NULL UNIQUE CHECK (launch_hash ~ '^[0-9a-f]{64}$'),
  binding_hash text NOT NULL CHECK (binding_hash ~ '^[0-9a-f]{64}$'),
  payload_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '10 minutes'),
  launched_at timestamptz
);
CREATE TABLE public.garmin_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  garmin_user_id text NOT NULL UNIQUE,
  token_ciphertext text NOT NULL,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  connected_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.garmin_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garmin_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.garmin_oauth_states, public.garmin_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.garmin_oauth_states, public.garmin_connections TO service_role;

CREATE FUNCTION public.korva_garmin_start(p_user_id uuid, p_state_hash text, p_launch_hash text, p_binding_hash text, p_payload text)
RETURNS TABLE (state_hash text) LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('garmin:' || p_user_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.garmin_connections c WHERE c.user_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.garmin_oauth_states s WHERE s.user_id = p_user_id
      AND s.created_at > clock_timestamp() - interval '3 seconds') THEN RETURN; END IF;
  -- A new attempt invalidates the previous URL, including a dismissed browser session.
  DELETE FROM public.garmin_oauth_states s WHERE s.user_id = p_user_id;
  INSERT INTO public.garmin_oauth_states (user_id, state_hash, launch_hash, binding_hash, payload_ciphertext)
    VALUES (p_user_id, p_state_hash, p_launch_hash, p_binding_hash, p_payload);
  RETURN QUERY SELECT p_state_hash;
END;
$$;
CREATE FUNCTION public.korva_garmin_launch(p_launch_hash text)
RETURNS TABLE (user_id uuid, state_hash text, payload_ciphertext text)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.garmin_oauth_states s SET launched_at = clock_timestamp()
  WHERE s.launch_hash = p_launch_hash AND s.launched_at IS NULL AND s.expires_at > clock_timestamp()
  RETURNING s.user_id, s.state_hash, s.payload_ciphertext;
$$;
CREATE FUNCTION public.korva_garmin_consume(p_state_hash text, p_binding_hash text)
RETURNS TABLE (user_id uuid, payload_ciphertext text)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  DELETE FROM public.garmin_oauth_states s
  WHERE s.state_hash = p_state_hash AND s.binding_hash = p_binding_hash
    AND s.launched_at IS NOT NULL AND s.expires_at > clock_timestamp()
  RETURNING s.user_id, s.payload_ciphertext;
$$;
REVOKE ALL ON FUNCTION public.korva_garmin_start(uuid,text,text,text,text),
  public.korva_garmin_launch(text), public.korva_garmin_consume(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.korva_garmin_start(uuid,text,text,text,text),
  public.korva_garmin_launch(text), public.korva_garmin_consume(text,text) TO service_role;
COMMIT;
