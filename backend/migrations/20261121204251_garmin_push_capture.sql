BEGIN;
CREATE TABLE public.garmin_push_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.garmin_connections(user_id) ON DELETE CASCADE,
  summary_id text NOT NULL CHECK (length(summary_id) BETWEEN 1 AND 256),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  state text NOT NULL DEFAULT 'capturado' CHECK (state IN ('capturado','procesando','hecho','ignorado','error')),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id, summary_id, fingerprint)
);
ALTER TABLE public.garmin_push_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.garmin_push_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.garmin_push_events TO service_role;
CREATE INDEX garmin_push_events_pending_idx ON public.garmin_push_events(received_at) WHERE state='capturado';

-- One transaction: preserve every eligible summary before acknowledging delivery.
-- Repeated/concurrent deliveries never overwrite an earlier revision.
CREATE FUNCTION public.korva_garmin_capture_push(p_rows jsonb, p_allowed_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_eligible integer; v_inserted integer;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'invalid_batch';
  END IF;
  WITH eligible AS MATERIALIZED (
    SELECT c.user_id, r.summary_id, r.fingerprint, r.payload
    FROM jsonb_to_recordset(p_rows) AS r(garmin_user_id text, summary_id text, fingerprint text, payload jsonb)
    JOIN public.garmin_connections c ON c.garmin_user_id = r.garmin_user_id
    WHERE c.user_id = ANY(p_allowed_ids) AND 'ACTIVITY_EXPORT' = ANY(c.permissions)
  ), inserted AS (
    INSERT INTO public.garmin_push_events(user_id,summary_id,fingerprint,payload)
    SELECT user_id,summary_id,fingerprint,payload FROM eligible
    ON CONFLICT (user_id,summary_id,fingerprint) DO NOTHING
    RETURNING id
  ) SELECT (SELECT count(*) FROM eligible), (SELECT count(*) FROM inserted)
    INTO v_eligible,v_inserted;
  RETURN jsonb_build_object('received',jsonb_array_length(p_rows),'eligible',v_eligible,'inserted',v_inserted);
END;
$$;
REVOKE ALL ON FUNCTION public.korva_garmin_capture_push(jsonb,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.korva_garmin_capture_push(jsonb,uuid[]) TO service_role;
COMMIT;
