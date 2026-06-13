-- Reservar/consumir invitación al registrarse (sin sesión) y finalizar membresía al primer login.

ALTER TABLE public."OrganizationInvite"
  ADD COLUMN IF NOT EXISTS reserved_email text NULL;

COMMENT ON COLUMN public."OrganizationInvite".reserved_email IS
  'Email que consumió la invitación al registrarse; membresía se completa al confirmar correo e iniciar sesión.';

CREATE INDEX IF NOT EXISTS idx_org_invite_reserved_email_pending
  ON public."OrganizationInvite" (organization_id, lower(trim(reserved_email)))
  WHERE used_by_user_id IS NULL AND reserved_email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_organization_invite_for_signup(
  p_slug text,
  p_invite text,
  p_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public."Organization"%ROWTYPE;
  v_inv public."OrganizationInvite"%ROWTYPE;
  v_email text := lower(trim(p_email));
  v_n int;
BEGIN
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;

  SELECT * INTO v_org FROM public."Organization" o WHERE o.slug = lower(trim(p_slug));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inmobiliaria no encontrada';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."OrganizationInvite" iv
    WHERE iv.organization_id = v_org.id
      AND lower(trim(iv.reserved_email)) = v_email
      AND iv.used_at IS NOT NULL
      AND iv.used_by_user_id IS NULL
      AND iv.revoked_at IS NULL
  ) THEN
    RETURN;
  END IF;

  SELECT iv.* INTO v_inv
  FROM public."OrganizationInvite" iv
  WHERE iv.organization_id = v_org.id
    AND lower(trim(iv.code)) = lower(trim(p_invite))
    AND iv.used_at IS NULL
    AND iv.revoked_at IS NULL
    AND iv.expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public."OrganizationInvite" iv
      WHERE iv.organization_id = v_org.id
        AND iv.used_at IS NULL
        AND iv.revoked_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Código de invitación inválido o caducado';
    END IF;
    RAISE EXCEPTION 'Código de invitación inválido o caducado';
  END IF;

  UPDATE public."OrganizationInvite"
  SET used_at = now(),
      reserved_email = v_email
  WHERE id = v_inv.id
    AND used_at IS NULL
    AND revoked_at IS NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Código de invitación ya utilizado';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_organization_invite_claim(p_slug text, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public."Organization"%ROWTYPE;
  v_email text := lower(trim(p_email));
BEGIN
  IF v_email = '' THEN
    RETURN;
  END IF;

  SELECT * INTO v_org FROM public."Organization" o WHERE o.slug = lower(trim(p_slug));
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public."OrganizationInvite" iv
  SET used_at = NULL,
      reserved_email = NULL
  WHERE iv.organization_id = v_org.id
    AND lower(trim(iv.reserved_email)) = v_email
    AND iv.used_by_user_id IS NULL
    AND iv.used_at IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_organization_membership_from_signup(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public."Organization"%ROWTYPE;
  v_inv public."OrganizationInvite"%ROWTYPE;
  v_uid uuid := auth.uid();
  v_email text;
  v_access text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF EXISTS (SELECT 1 FROM public."OrganizationMembership" WHERE user_id = v_uid) THEN
    RETURN;
  END IF;

  SELECT lower(trim(u.email)) INTO v_email FROM auth.users u WHERE u.id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Usuario sin email';
  END IF;

  SELECT * INTO v_org FROM public."Organization" o WHERE o.slug = lower(trim(p_slug));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inmobiliaria no encontrada';
  END IF;

  SELECT iv.* INTO v_inv
  FROM public."OrganizationInvite" iv
  WHERE iv.organization_id = v_org.id
    AND lower(trim(iv.reserved_email)) = v_email
    AND iv.used_at IS NOT NULL
    AND iv.used_by_user_id IS NULL
    AND iv.revoked_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay invitación pendiente para este usuario. Contactá al administrador.';
  END IF;

  v_access := COALESCE(v_inv.target_access, 'agente');

  INSERT INTO public."OrganizationMembership" (user_id, organization_id, is_active)
  VALUES (v_uid, v_org.id, true);

  PERFORM public.assign_org_access_group(v_uid, v_access);

  IF v_inv.target_person_id IS NOT NULL THEN
    UPDATE public."Person"
    SET linked_user_id = v_uid,
        updated_at = now()
    WHERE id = v_inv.target_person_id
      AND organization_id = v_org.id
      AND linked_user_id IS NULL;
  END IF;

  UPDATE public."OrganizationInvite"
  SET used_by_user_id = v_uid
  WHERE id = v_inv.id AND used_by_user_id IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_organization_invite_for_signup(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_organization_invite_claim(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_organization_membership_from_signup(text) TO authenticated;
