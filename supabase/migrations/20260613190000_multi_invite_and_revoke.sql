-- Multi-invite: múltiples códigos activos simultáneos (uno por persona + uno genérico).
-- Agrega revoke_organization_invite(id) y extiende list_organization_invites con nombre de persona.

-- ─── 1. generate_organization_invite: ya no revoca todo, solo evita duplicados por persona ───
CREATE OR REPLACE FUNCTION public.generate_organization_invite(
  p_target_access text DEFAULT 'agente',
  p_target_person_id uuid DEFAULT NULL
)
RETURNS TABLE (
  invite_id uuid,
  code text,
  expires_at timestamptz,
  target_access text,
  target_person_id uuid
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
  v_access text := lower(trim(COALESCE(p_target_access, 'agente')));
BEGIN
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT (
    public.has_permission('manage_users')
    OR public.has_permission('invites.create')
    OR public.has_permission('users.create')
  ) THEN
    RAISE EXCEPTION 'Sin permisos para generar invitaciones';
  END IF;
  IF v_access NOT IN ('admin', 'agente', 'consulta') THEN
    RAISE EXCEPTION 'target_access inválido';
  END IF;

  v_oid := public.user_organization_id();
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Sin organización';
  END IF;

  IF p_target_person_id IS NOT NULL THEN
    IF v_access <> 'agente' THEN
      RAISE EXCEPTION 'target_person_id sólo aplica con target_access agente';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public."Person" per
      WHERE per.id = p_target_person_id
        AND per.organization_id = v_oid
    ) THEN
      RAISE EXCEPTION 'Persona no encontrada en esta inmobiliaria';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public."Person" per
      WHERE per.id = p_target_person_id AND per.linked_user_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Esa persona agente ya tiene un usuario vinculado';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public."PersonProfile" pp
      WHERE pp.person_id = p_target_person_id
        AND pp.profile IN ('agente', 'referral')
    ) THEN
      RAISE EXCEPTION 'La persona debe tener perfil Agente antes de vincularla a una invitación';
    END IF;

    -- Solo revocar invitaciones previas activas para ESA misma persona
    UPDATE public."OrganizationInvite" iv
    SET revoked_at = now()
    WHERE iv.organization_id = v_oid
      AND iv.target_person_id = p_target_person_id
      AND iv.revoked_at IS NULL
      AND iv.used_at IS NULL;

  ELSE
    -- Sin persona: revocar solo los códigos genéricos previos (sin persona asignada)
    UPDATE public."OrganizationInvite" iv
    SET revoked_at = now()
    WHERE iv.organization_id = v_oid
      AND iv.target_person_id IS NULL
      AND iv.revoked_at IS NULL
      AND iv.used_at IS NULL;
  END IF;

  FOR i IN 1..10 LOOP
    v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
  END LOOP;

  LOOP
    BEGIN
      INSERT INTO public."OrganizationInvite" (
        organization_id, code, expires_at, created_by_user_id, target_access, target_person_id
      )
      VALUES (v_oid, v_code, v_expires, v_creator, v_access, p_target_person_id)
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
  target_access := v_access;
  target_person_id := p_target_person_id;
  RETURN NEXT;
END;
$$;

-- ─── 2. revoke_organization_invite: revocar un código individual por ID ───
CREATE OR REPLACE FUNCTION public.revoke_organization_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oid uuid := public.user_organization_id();
BEGIN
  IF NOT (
    public.has_permission('manage_users')
    OR public.has_permission('invites.create')
    OR public.has_permission('users.create')
  ) THEN
    RAISE EXCEPTION 'Sin permisos para revocar invitaciones';
  END IF;

  UPDATE public."OrganizationInvite"
  SET revoked_at = now()
  WHERE id = p_invite_id
    AND organization_id = v_oid
    AND revoked_at IS NULL
    AND used_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitación no encontrada o ya revocada/utilizada';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_organization_invite(uuid) TO authenticated;

-- ─── 3. list_organization_invites: extiende retorno con nombre de persona ───
DROP FUNCTION IF EXISTS public.list_organization_invites();

CREATE OR REPLACE FUNCTION public.list_organization_invites()
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  code text,
  expires_at timestamptz,
  created_at timestamptz,
  created_by_user_id uuid,
  used_at timestamptz,
  used_by_user_id uuid,
  revoked_at timestamptz,
  target_access text,
  target_person_id uuid,
  reserved_email text,
  target_person_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    iv.id,
    iv.organization_id,
    iv.code,
    iv.expires_at,
    iv.created_at,
    iv.created_by_user_id,
    iv.used_at,
    iv.used_by_user_id,
    iv.revoked_at,
    iv.target_access,
    iv.target_person_id,
    iv.reserved_email,
    p.name AS target_person_name
  FROM public."OrganizationInvite" iv
  LEFT JOIN public."Person" p ON p.id = iv.target_person_id
  WHERE iv.organization_id = public.user_organization_id()
    AND (
      public.has_permission('manage_users')
      OR public.has_permission('invites.view')
      OR public.has_permission('users.view')
    )
  ORDER BY iv.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_organization_invites() TO authenticated;
