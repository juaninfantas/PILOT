-- generate_organization_invite: usar tenant efectivo (user_organization_id) y permiso invites.create.

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
