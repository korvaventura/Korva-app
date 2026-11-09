-- Preparada, NO aplicada en producción. Ejecutar antes de desplegar el backend.
BEGIN;

CREATE TABLE IF NOT EXISTS public.desafio_dorsal_contadores (
  challenge_id uuid PRIMARY KEY REFERENCES public.challenges(id),
  ultimo_numero integer NOT NULL CHECK (ultimo_numero > 0)
);
ALTER TABLE public.desafio_dorsal_contadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.desafio_dorsal_contadores FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.desafio_dorsal_contadores TO service_role;

CREATE OR REPLACE FUNCTION public.asignar_dorsal_desafio(p_inscripcion_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_challenge uuid;
  v_numero integer;
  v_siguiente integer;
BEGIN
  -- Serializa también reintentos sobre la misma inscripción.
  SELECT challenge_id, numero_bib INTO v_challenge, v_numero
    FROM public.user_challenges WHERE id = p_inscripcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inscripción inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF v_numero IS NOT NULL THEN RETURN v_numero; END IF;

  SELECT coalesce(max(numero_bib), 0) + 1 INTO v_siguiente
    FROM public.user_challenges WHERE challenge_id = v_challenge;

  -- El conflicto del contador serializa compradores distintos del mismo desafío.
  -- Se respeta el máximo histórico; el contador nunca retrocede al borrar una fila.
  INSERT INTO public.desafio_dorsal_contadores AS cont (challenge_id, ultimo_numero)
    VALUES (v_challenge, v_siguiente)
    ON CONFLICT (challenge_id) DO UPDATE
      SET ultimo_numero = greatest(cont.ultimo_numero + 1, EXCLUDED.ultimo_numero)
    RETURNING ultimo_numero INTO v_numero;

  UPDATE public.user_challenges SET numero_bib = v_numero WHERE id = p_inscripcion_id;
  RETURN v_numero;
END;
$$;
REVOKE ALL ON FUNCTION public.asignar_dorsal_desafio(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_dorsal_desafio(uuid) TO service_role;

COMMIT;
