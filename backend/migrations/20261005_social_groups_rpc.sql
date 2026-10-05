-- Ejecutar completo en Supabase SQL Editor antes de publicar las rutas /grupos.
-- Reutiliza social_groups y social_group_members. No modifica desafíos, compras o kilómetros.
BEGIN;

-- Si hay duplicados previos, el script se detiene y revierte: no elimina miembros.
CREATE UNIQUE INDEX IF NOT EXISTS korva_social_groups_codigo_unique ON public.social_groups (upper(codigo));
CREATE UNIQUE INDEX IF NOT EXISTS korva_social_members_unique ON public.social_group_members (group_id, user_id);
CREATE INDEX IF NOT EXISTS korva_social_members_user ON public.social_group_members (user_id);

CREATE OR REPLACE FUNCTION public.korva_social_group_create(p_user uuid, p_nombre text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE g public.social_groups; intentos integer := 0; codigo_nuevo text;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='P0001'; END IF;
  IF length(btrim(p_nombre)) < 2 OR length(btrim(p_nombre)) > 60 OR p_nombre IS NULL THEN
    RAISE EXCEPTION 'El nombre debe tener entre 2 y 60 caracteres.' USING ERRCODE='P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('korva-social-user:' || p_user::text, 0));
  IF (SELECT count(DISTINCT group_id) FROM public.social_group_members WHERE user_id=p_user) >= 3 THEN
    RAISE EXCEPTION 'Podés participar en hasta 3 grupos.' USING ERRCODE='P0001';
  END IF;
  LOOP
    intentos := intentos + 1;
    codigo_nuevo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    BEGIN
      INSERT INTO public.social_groups(nombre,codigo,creador_id) VALUES(btrim(p_nombre),codigo_nuevo,p_user) RETURNING * INTO g;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF intentos >= 8 THEN RAISE EXCEPTION 'No pudimos generar un código. Intentá nuevamente.' USING ERRCODE='P0001'; END IF;
    END;
  END LOOP;
  INSERT INTO public.social_group_members(group_id,user_id) VALUES(g.id,p_user);
  RETURN jsonb_build_object('grupo',jsonb_build_object('id',g.id,'nombre',g.nombre,'codigo',g.codigo));
END;
$$;

CREATE OR REPLACE FUNCTION public.korva_social_group_join(p_user uuid,p_codigo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE g public.social_groups;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='P0001'; END IF;
  IF p_codigo IS NULL OR upper(btrim(p_codigo)) !~ '^[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'El código debe tener 6 letras o números.' USING ERRCODE='P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('korva-social-user:' || p_user::text, 0));
  SELECT * INTO g FROM public.social_groups WHERE upper(codigo)=upper(btrim(p_codigo)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos un grupo con ese código.' USING ERRCODE='P0001'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.social_group_members WHERE group_id=g.id AND user_id=p_user) THEN
    IF (SELECT count(DISTINCT group_id) FROM public.social_group_members WHERE user_id=p_user) >= 3 THEN
      RAISE EXCEPTION 'Podés participar en hasta 3 grupos.' USING ERRCODE='P0001';
    END IF;
    IF (SELECT count(DISTINCT user_id) FROM public.social_group_members WHERE group_id=g.id) >= 50 THEN
      RAISE EXCEPTION 'El grupo llegó al máximo de 50 personas.' USING ERRCODE='P0001';
    END IF;
    INSERT INTO public.social_group_members(group_id,user_id) VALUES(g.id,p_user);
  END IF;
  RETURN jsonb_build_object('grupo',jsonb_build_object('id',g.id,'nombre',g.nombre,'codigo',g.codigo));
END;
$$;

CREATE OR REPLACE FUNCTION public.korva_social_group_leave(p_user uuid,p_group uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_user IS NULL OR p_group IS NULL THEN RAISE EXCEPTION 'Solicitud inválida.' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('korva-social-user:' || p_user::text, 0));
  PERFORM 1 FROM public.social_groups WHERE id=p_group FOR UPDATE;
  DELETE FROM public.social_group_members WHERE group_id=p_group AND user_id=p_user;
  RETURN jsonb_build_object('ok',true);
END;
$$;

REVOKE ALL ON FUNCTION public.korva_social_group_create(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.korva_social_group_join(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.korva_social_group_leave(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.korva_social_group_create(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.korva_social_group_join(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.korva_social_group_leave(uuid,uuid) TO service_role;
COMMIT;
