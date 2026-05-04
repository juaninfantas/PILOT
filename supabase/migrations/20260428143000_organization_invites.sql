-- Invitaciones de un solo uso por fila (código legible para administradores manage_users).
-- Semilla: copia signup_invite_code por org desde el primer miembro; primer consumo marca used_at.

CREATE TABLE IF NOT EXISTS public."OrganizationInvite" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public."Organization" (id) ON DELETE CASCADE,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  used_at timestamptz NULL,
  used_by_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  revoked_at timestamptz NULL
);

COMMENT ON COLUMN public."OrganizationInvite".used_by_user_id IS 'Usuario que consumió esta invitación al registrarse.';
COMMENT ON COLUMN public."OrganizationInvite".revoked_at IS 'Invalidada por un código nuevo aún sin usar.';

DROP INDEX IF EXISTS uq_org_invite_code_ci;
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_invite_org_code_pending
  ON public."OrganizationInvite" (organization_id, lower(trim(code)))
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_org_invite_org_unused ON public."OrganizationInvite" (organization_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public."OrganizationInvite" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oi_select_manage" ON public."OrganizationInvite";
CREATE POLICY "oi_select_manage" ON public."OrganizationInvite" FOR SELECT TO authenticated USING (
  organization_id IN (
    SELECT m.organization_id FROM public."OrganizationMembership" m WHERE m.user_id = auth.uid()
  )
  AND public.has_permission('manage_users')
);

INSERT INTO public."OrganizationInvite" (organization_id, code, expires_at, created_by_user_id)
SELECT DISTINCT ON (o.id)
  o.id,
  trim(o.signup_invite_code),
  now() + interval '10 years',
  om.user_id
FROM public."Organization" o
INNER JOIN public."OrganizationMembership" om ON om.organization_id = o.id
WHERE NOT EXISTS (SELECT 1 FROM public."OrganizationInvite" iv WHERE iv.organization_id = o.id)
ORDER BY o.id, om.created_at ASC;

CREATE OR REPLACE FUNCTION public.generate_organization_invite()
RETURNS TABLE (
  invite_id uuid,
  code text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oid uuid;
  v_creator uuid := auth.uid();
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := 'PIL-';
  i int;
  v_id uuid;
  v_expires timestamptz := now() + interval '5 days';
BEGIN
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT public.has_permission('manage_users') THEN
    RAISE EXCEPTION 'Sin permisos para generar invitaciones';
  END IF;

  SELECT m.organization_id INTO v_oid FROM public."OrganizationMembership" m WHERE m.user_id = v_creator LIMIT 1;
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Sin organización';
  END IF;

  UPDATE public."OrganizationInvite" iv
  SET revoked_at = now()
  WHERE iv.organization_id = v_oid
    AND iv.revoked_at IS NULL
    AND iv.used_at IS NULL;

  FOR i IN 1..10 LOOP
    v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
  END LOOP;

  LOOP
    BEGIN
      INSERT INTO public."OrganizationInvite" (organization_id, code, expires_at, created_by_user_id)
      VALUES (v_oid, v_code, v_expires, v_creator)
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_code := 'PIL-';
      FOR i IN 1..10 LOOP
        v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
      END LOOP;
    END;
  END LOOP;

  UPDATE public."Organization"
  SET signup_invite_code = v_code,
      updated_at = now()
  WHERE id = v_oid;

  invite_id := v_id;
  code := v_code;
  expires_at := v_expires;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_organization_invite() TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_organization_membership(p_slug text, p_invite text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public."Organization"%ROWTYPE;
  v_inv public."OrganizationInvite"%ROWTYPE;
  v_n int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF EXISTS (SELECT 1 FROM public."OrganizationMembership" WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'El usuario ya tiene una inmobiliaria asignada';
  END IF;

  SELECT * INTO v_org FROM public."Organization" o WHERE o.slug = lower(trim(p_slug));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inmobiliaria no encontrada';
  END IF;

  SELECT iv.* INTO v_inv
  FROM public."OrganizationInvite" iv
  WHERE iv.organization_id = v_org.id
    AND lower(trim(iv.code)) = lower(trim(p_invite))
    AND iv.used_at IS NULL
    AND iv.revoked_at IS NULL
    AND iv.expires_at > now()
  FOR UPDATE;

  IF FOUND THEN
    INSERT INTO public."OrganizationMembership" (user_id, organization_id)
    VALUES (auth.uid(), v_org.id);

    UPDATE public."OrganizationInvite"
    SET used_at = now(),
        used_by_user_id = auth.uid()
    WHERE id = v_inv.id AND used_at IS NULL AND revoked_at IS NULL;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Código de invitación ya utilizado';
    END IF;

    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."OrganizationInvite" iv
    WHERE iv.organization_id = v_org.id
      AND iv.used_at IS NULL
      AND iv.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Código de invitación inválido o caducado';
  END IF;

  IF trim(p_invite) IS DISTINCT FROM trim(v_org.signup_invite_code) THEN
    RAISE EXCEPTION 'Código de invitación inválido';
  END IF;

  INSERT INTO public."OrganizationMembership" (user_id, organization_id)
  VALUES (auth.uid(), v_org.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.attach_organization_membership(text, text) TO authenticated;
