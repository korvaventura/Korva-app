BEGIN;
-- Same-source replays are stable; cross-source insertion is serialized per user.
-- Scope (reviewed): only Garmin and Strava inserts are ever skipped. A Garmin row is
-- skipped if the same outing already exists from Strava or Korva GPS; a Strava row is
-- skipped if it already exists from Garmin. Korva GPS and manual inserts are never
-- touched here (GPS uses insert().select().single() and does its own equivalence check).
CREATE FUNCTION public.korva_activity_provider_dedup() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.source NOT IN ('garmin','strava') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 93217));
 IF EXISTS (SELECT 1 FROM public.activities a WHERE a.user_id=NEW.user_id
   AND ((NEW.source='garmin' AND a.source IN ('strava','korva_gps'))
     OR (NEW.source='strava' AND a.source='garmin'))
   AND NOT coalesce(a.excluida,false) AND a.distance_km>0 AND NEW.distance_km>0
   AND abs(extract(epoch FROM a.recorded_at-NEW.recorded_at))<=600
   AND abs(a.distance_km-NEW.distance_km)<=greatest(0.3,greatest(a.distance_km,NEW.distance_km)*0.05)
   AND (a.sport_type=NEW.sport_type OR (a.sport_type IN ('run','walk','hike') AND NEW.sport_type IN ('run','walk','hike'))))
 THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER korva_activity_provider_dedup BEFORE INSERT ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.korva_activity_provider_dedup();
CREATE FUNCTION public.korva_garmin_import_event(p_event_id uuid,p_allowed_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.garmin_push_events; p jsonb; marks jsonb; stamp timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO e FROM public.garmin_push_events WHERE id=p_event_id FOR UPDATE;
 IF NOT FOUND OR e.state<>'capturado' OR NOT(e.user_id=ANY(p_allowed_ids)) THEN RETURN jsonb_build_object('result','omitido'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.garmin_connections c WHERE c.user_id=e.user_id AND 'ACTIVITY_EXPORT'=ANY(c.permissions)) THEN RETURN jsonb_build_object('result','sin_permiso'); END IF;
 p:=e.payload;
 IF coalesce((p->>'manual')::boolean,false) OR p->>'parent_summary_id' IS NOT NULL THEN
  UPDATE public.garmin_push_events SET state='ignorado' WHERE id=e.id;
  RETURN jsonb_build_object('result','ignorado');
 END IF;
 -- Mark before insertion in the same transaction. Crashes are handled by recovery.
 WITH m AS (UPDATE public.user_challenges SET recalculo_pendiente_desde=stamp
  WHERE user_id=e.user_id AND status='active' AND recalculo_pendiente_desde IS NULL RETURNING id)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'marca',stamp)),'[]'::jsonb) INTO marks FROM m;
 INSERT INTO public.activities(user_id,source,external_id,sport_type,distance_km,duration_seconds,recorded_at)
 VALUES(e.user_id,'garmin',p->>'external_id',p->>'sport_type',(p->>'distance_km')::double precision,
 (p->>'duration_seconds')::integer,(p->>'recorded_at')::timestamptz AT TIME ZONE 'UTC')
 ON CONFLICT(external_id) DO NOTHING;
 RETURN jsonb_build_object('result','importado','marcas',marks);
END $$;
REVOKE ALL ON FUNCTION public.korva_garmin_import_event(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.korva_garmin_import_event(uuid,uuid[]) TO service_role;
COMMIT;
