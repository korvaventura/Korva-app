BEGIN;
ALTER TABLE public.garmin_connections ADD COLUMN permissions_changed_at timestamptz;
CREATE OR REPLACE FUNCTION public.korva_garmin_capture_push(p_rows jsonb, p_allowed_ids uuid[])
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
    WHERE (p_allowed_ids IS NULL OR c.user_id = ANY(p_allowed_ids)) AND 'ACTIVITY_EXPORT' = ANY(c.permissions)
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

CREATE OR REPLACE FUNCTION public.korva_garmin_import_event(p_event_id uuid,p_allowed_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.garmin_push_events; p jsonb; marks jsonb; stamp timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO e FROM public.garmin_push_events WHERE id=p_event_id FOR UPDATE;
 IF NOT FOUND OR e.state<>'capturado' OR (p_allowed_ids IS NOT NULL AND NOT(e.user_id=ANY(p_allowed_ids))) THEN RETURN jsonb_build_object('result','omitido'); END IF;
 PERFORM 1 FROM public.garmin_connections c WHERE c.user_id=e.user_id AND 'ACTIVITY_EXPORT'=ANY(c.permissions) FOR UPDATE;
 IF NOT FOUND THEN UPDATE public.garmin_push_events SET state='ignorado' WHERE id=e.id; RETURN jsonb_build_object('result','sin_permiso'); END IF;
 p:=e.payload;
 IF coalesce((p->>'manual')::boolean,false) OR p->>'parent_summary_id' IS NOT NULL THEN
  UPDATE public.garmin_push_events SET state='ignorado' WHERE id=e.id;
  RETURN jsonb_build_object('result','ignorado');
 END IF;
 -- Mark before insertion in the same transaction. Crashes are handled by recovery.
 WITH previous AS MATERIALIZED (
  SELECT id,recalculo_pendiente_desde AS old_mark FROM public.user_challenges
  WHERE user_id=e.user_id AND status='active' ORDER BY id FOR UPDATE
 ), m AS (
  UPDATE public.user_challenges u SET recalculo_pendiente_desde=
   greatest(stamp,coalesce(previous.old_mark + interval '1 microsecond',stamp))
  FROM previous WHERE u.id=previous.id
  RETURNING u.id,u.recalculo_pendiente_desde AS marca,previous.old_mark IS NULL AS propia
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'marca',marca)) FILTER (WHERE propia),'[]'::jsonb) INTO marks FROM m;
 INSERT INTO public.activities(user_id,source,external_id,sport_type,distance_km,duration_seconds,recorded_at)
 VALUES(e.user_id,'garmin',p->>'external_id',p->>'sport_type',(p->>'distance_km')::double precision,
 (p->>'duration_seconds')::integer,(p->>'recorded_at')::timestamptz AT TIME ZONE 'UTC')
 ON CONFLICT(external_id) DO NOTHING;
 RETURN jsonb_build_object('result','importado','marcas',marks);
END $$;

CREATE FUNCTION public.korva_garmin_consent(p_type text,p_rows jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb; uid uuid; changed timestamptz;
BEGIN
 IF p_type NOT IN ('deregistration','permissions') OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>1000 THEN RAISE EXCEPTION 'invalid_payload'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY value->>'garmin_user_id' LOOP
  SELECT user_id INTO uid FROM public.garmin_connections WHERE garmin_user_id=r->>'garmin_user_id' FOR UPDATE;
  IF uid IS NULL THEN CONTINUE; END IF;
  IF p_type='deregistration' THEN
   DELETE FROM public.garmin_connections WHERE user_id=uid;
   DELETE FROM public.garmin_oauth_states WHERE user_id=uid;
  ELSE
   changed:=(r->>'changed_at')::timestamptz;
   UPDATE public.garmin_connections SET permissions=ARRAY(SELECT jsonb_array_elements_text(r->'permissions')),permissions_changed_at=changed
    WHERE user_id=uid AND changed>=date_trunc('second',connected_at)
    AND (permissions_changed_at IS NULL OR changed>permissions_changed_at);
   IF FOUND AND NOT EXISTS(SELECT 1 FROM public.garmin_connections WHERE user_id=uid AND 'ACTIVITY_EXPORT'=ANY(permissions)) THEN
    UPDATE public.garmin_push_events SET state='ignorado' WHERE user_id=uid AND state IN ('capturado','error');
   END IF;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.korva_garmin_consent(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.korva_garmin_consent(text,jsonb) TO service_role;
COMMIT;
