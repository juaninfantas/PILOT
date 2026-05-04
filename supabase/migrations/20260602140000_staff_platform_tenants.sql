-- Tenants para platform_staff: membresía activa, rol consulta, RBAC real, RPCs de gestión.

-- ─── Membresía activa (desactivar acceso sin borrar usuario) ───
ALTER TABLE public."OrganizationMembership"
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public."OrganizationMembership".is_active IS 'false: usuario no accede al tenant (equipo Pilot o admin inmobiliaria).';

-- ─── Rol + grupo solo lectura (consulta) ───
INSERT INTO public."Role" (name, slug, description)
VALUES ('Solo consulta', 'consulta', 'Lectura de CRM sin administración')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public."Group" (name, slug, description)
VALUES ('Consulta', 'consulta', 'Usuarios con permisos de solo lectura')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public."RolePermission" (role_id, permission_id)
SELECT r.id, p.id
FROM public."Role" r
JOIN public."Permission" p ON p.slug IN (
  'view_dashboard',
  'view_properties',
  'view_people',
  'view_opportunities',
  'view_reports'
)
WHERE r.slug = 'consulta'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public."GroupRole" (group_id, role_id)
SELECT g.id, r.id
FROM public."Group" g
JOIN public."Role" r ON r.slug = 'consulta'
WHERE g.slug = 'consulta'
ON CONFLICT (group_id, role_id) DO NOTHING;

-- ─── RBAC real + membresía activa; platform_staff conserva acceso amplio ───
CREATE OR REPLACE FUNCTION public.has_permission(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public."User" u
        WHERE u.id = auth.uid()
          AND COALESCE(u.platform_staff, false)
      )
      OR (
        EXISTS (
          SELECT 1
          FROM public."OrganizationMembership" m
          WHERE m.user_id = auth.uid()
            AND COALESCE(m.is_active, true)
        )
        AND EXISTS (
          SELECT 1
          FROM public."UserGroup" ug
          JOIN public."GroupRole" gr ON gr.group_id = ug.group_id
          JOIN public."RolePermission" rp ON rp.role_id = gr.role_id
          JOIN public."Permission" p ON p.id = rp.permission_id AND p.slug = p_slug
          WHERE ug.user_id = auth.uid()
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN ARRAY[]::text[]
    WHEN EXISTS (
      SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false)
    ) THEN COALESCE(
      (SELECT array_agg(p.slug ORDER BY p.slug) FROM public."Permission" p),
      ARRAY[]::text[]
    )
    WHEN NOT EXISTS (
      SELECT 1
      FROM public."OrganizationMembership" m
      WHERE m.user_id = auth.uid()
        AND COALESCE(m.is_active, true)
    ) THEN ARRAY[]::text[]
    ELSE COALESCE(
      (
        SELECT array_agg(DISTINCT p.slug ORDER BY p.slug)
        FROM public."UserGroup" ug
        JOIN public."GroupRole" gr ON gr.group_id = ug.group_id
        JOIN public."RolePermission" rp ON rp.role_id = gr.role_id
        JOIN public."Permission" p ON p.id = rp.permission_id
        WHERE ug.user_id = auth.uid()
      ),
      ARRAY[]::text[]
    )
  END;
$$;

-- ─── Usuarios con membresía pero sin grupo: administradores por defecto ───
INSERT INTO public."UserGroup" (user_id, group_id)
SELECT m.user_id, g.id
FROM public."OrganizationMembership" m
CROSS JOIN (SELECT id FROM public."Group" WHERE slug = 'admins' LIMIT 1) g
WHERE NOT EXISTS (SELECT 1 FROM public."UserGroup" ug WHERE ug.user_id = m.user_id);

-- ─── Helpers staff (solo platform_staff) ───
CREATE OR REPLACE FUNCTION public.assert_platform_staff()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false)
  ) THEN
    RAISE EXCEPTION 'Solo equipo Pilot';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_clone_funnels_from_template(p_target_org uuid, p_template_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_new_funnel uuid;
BEGIN
  FOR r IN
    SELECT id, name, slug, is_system, system_type
    FROM public."Funnel"
    WHERE organization_id = p_template_org
    ORDER BY is_system DESC, slug
  LOOP
    INSERT INTO public."Funnel" (organization_id, name, slug, is_system, system_type)
    VALUES (p_target_org, r.name, r.slug, r.is_system, r.system_type)
    RETURNING id INTO v_new_funnel;

    INSERT INTO public."FunnelStage" (funnel_id, name, position, color)
    SELECT v_new_funnel, fs.name, fs.position, fs.color
    FROM public."FunnelStage" fs
    WHERE fs.funnel_id = r.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_create_tenant(
  p_slug text,
  p_display_name text,
  p_signup_invite_code text DEFAULT NULL
) RETURNS TABLE (id uuid, slug text, display_name text, signup_invite_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := lower(trim(p_slug));
  v_name text := trim(p_display_name);
  v_invite text;
  v_org_id uuid;
  v_tpl uuid;
BEGIN
  PERFORM public.assert_platform_staff();
  IF v_slug = '' OR v_name = '' THEN
    RAISE EXCEPTION 'slug y nombre obligatorios';
  END IF;
  IF p_signup_invite_code IS NOT NULL AND trim(p_signup_invite_code) <> '' THEN
    v_invite := trim(p_signup_invite_code);
  ELSE
    v_invite := 'PILOT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
  END IF;

  SELECT o.id INTO v_tpl FROM public."Organization" o WHERE o.slug = 'default' LIMIT 1;
  IF v_tpl IS NULL THEN
    RAISE EXCEPTION 'Falta organización template default';
  END IF;

  INSERT INTO public."Organization" (slug, display_name, signup_invite_code)
  VALUES (v_slug, v_name, v_invite)
  RETURNING public."Organization".id INTO v_org_id;

  PERFORM public.staff_clone_funnels_from_template(v_org_id, v_tpl);

  RETURN QUERY
  SELECT o.id, o.slug, o.display_name, o.signup_invite_code
  FROM public."Organization" o
  WHERE o.id = v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_create_tenant(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_create_tenant(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_list_tenants(p_limit int DEFAULT 200)
RETURNS TABLE (
  id uuid,
  slug text,
  display_name text,
  subscription_tier text,
  member_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.slug,
    o.display_name,
    o.subscription_tier,
    (
      SELECT count(*)::bigint
      FROM public."OrganizationMembership" m
      WHERE m.organization_id = o.id AND COALESCE(m.is_active, true)
    ) AS member_count
  FROM public."Organization" o
  WHERE EXISTS (
    SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false)
  )
  ORDER BY o.display_name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.staff_list_tenants(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_list_tenants(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_get_tenant_invite_code(p_organization_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.signup_invite_code
  FROM public."Organization" o
  WHERE o.id = p_organization_id
    AND EXISTS (
      SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false)
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.staff_get_tenant_invite_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_get_tenant_invite_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_list_tenant_members(p_organization_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  name text,
  is_active boolean,
  access_group_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.user_id,
    u.email,
    u.name,
    COALESCE(m.is_active, true) AS is_active,
    COALESCE(
      (
        SELECT g.slug
        FROM public."UserGroup" ug2
        JOIN public."Group" g ON g.id = ug2.group_id
        WHERE ug2.user_id = m.user_id
          AND g.slug IN ('admins', 'consulta')
        ORDER BY CASE WHEN g.slug = 'admins' THEN 1 ELSE 2 END
        LIMIT 1
      ),
      '—'
    ) AS access_group_slug
  FROM public."OrganizationMembership" m
  JOIN public."User" u ON u.id = m.user_id
  WHERE m.organization_id = p_organization_id
    AND EXISTS (
      SELECT 1 FROM public."User" su WHERE su.id = auth.uid() AND COALESCE(su.platform_staff, false)
    )
  ORDER BY u.email NULLS LAST, u.name NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.staff_list_tenant_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_list_tenant_members(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_set_tenant_member_active(
  p_organization_id uuid,
  p_user_id uuid,
  p_is_active boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_staff();
  UPDATE public."OrganizationMembership" m
  SET is_active = p_is_active
  WHERE m.organization_id = p_organization_id
    AND m.user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membresía no encontrada';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_set_tenant_member_active(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_set_tenant_member_active(uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_set_tenant_member_access(
  p_organization_id uuid,
  p_user_id uuid,
  p_access text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  PERFORM public.assert_platform_staff();
  IF NOT EXISTS (
    SELECT 1 FROM public."OrganizationMembership" m
    WHERE m.organization_id = p_organization_id AND m.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Membresía no encontrada';
  END IF;

  IF lower(trim(p_access)) NOT IN ('admin', 'consulta') THEN
    RAISE EXCEPTION 'access debe ser admin o consulta';
  END IF;

  SELECT g.id INTO v_group_id
  FROM public."Group" g
  WHERE g.slug = CASE WHEN lower(trim(p_access)) = 'admin' THEN 'admins' ELSE 'consulta' END
  LIMIT 1;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Grupo no encontrado';
  END IF;

  DELETE FROM public."UserGroup" ug
  WHERE ug.user_id = p_user_id
    AND ug.group_id IN (SELECT id FROM public."Group" WHERE slug IN ('admins', 'consulta'));

  INSERT INTO public."UserGroup" (user_id, group_id) VALUES (p_user_id, v_group_id);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_set_tenant_member_access(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_set_tenant_member_access(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_attach_user_to_tenant(
  p_user_id uuid,
  p_organization_id uuid,
  p_access text DEFAULT 'admin'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  PERFORM public.assert_platform_staff();
  IF lower(trim(p_access)) NOT IN ('admin', 'consulta') THEN
    RAISE EXCEPTION 'access debe ser admin o consulta';
  END IF;

  SELECT g.id INTO v_group_id
  FROM public."Group" g
  WHERE g.slug = CASE WHEN lower(trim(p_access)) = 'admin' THEN 'admins' ELSE 'consulta' END
  LIMIT 1;

  DELETE FROM public."OrganizationMembership" WHERE user_id = p_user_id;
  INSERT INTO public."OrganizationMembership" (user_id, organization_id, is_active)
  VALUES (p_user_id, p_organization_id, true);

  DELETE FROM public."UserGroup" ug
  WHERE ug.user_id = p_user_id
    AND ug.group_id IN (SELECT id FROM public."Group" WHERE slug IN ('admins', 'consulta'));

  INSERT INTO public."UserGroup" (user_id, group_id) VALUES (p_user_id, v_group_id);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_attach_user_to_tenant(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_attach_user_to_tenant(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.staff_create_tenant IS 'Pilot staff: crea inmobiliaria y clona funnels desde default.';
COMMENT ON FUNCTION public.staff_list_tenant_members IS 'Pilot staff: usuarios del tenant con acceso admin/consulta.';

-- ─── Tenant efectivo: ignorar membresía desactivada ───
CREATE OR REPLACE FUNCTION public.user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT pi.organization_id
      FROM public."PilotStaffImpersonation" pi
      INNER JOIN public."User" up ON up.id = pi.staff_user_id AND COALESCE(up.platform_staff, false) = true
      WHERE pi.staff_user_id = auth.uid()
        AND pi.expires_at > now()
      LIMIT 1
    ),
    (
      SELECT m.organization_id
      FROM public."OrganizationMembership" m
      WHERE m.user_id = auth.uid()
        AND COALESCE(m.is_active, true)
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_find_user_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public."User" u
  WHERE lower(trim(COALESCE(u.email, ''))) = lower(trim(COALESCE(p_email, '')))
    AND trim(COALESCE(p_email, '')) <> ''
    AND EXISTS (
      SELECT 1 FROM public."User" su WHERE su.id = auth.uid() AND COALESCE(su.platform_staff, false)
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.staff_find_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_find_user_by_email(text) TO authenticated;

-- ─── Alta por invitación: asignar grupo administradores por defecto ───
CREATE OR REPLACE FUNCTION public.attach_organization_membership(p_slug text, p_invite text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public."Organization"%ROWTYPE;
  v_admins uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF EXISTS (SELECT 1 FROM public."OrganizationMembership" WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'El usuario ya tiene una inmobiliaria asignada';
  END IF;

  SELECT * INTO v_org
  FROM public."Organization" o
  WHERE o.slug = lower(trim(p_slug));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inmobiliaria no encontrada';
  END IF;

  IF trim(p_invite) IS DISTINCT FROM v_org.signup_invite_code THEN
    RAISE EXCEPTION 'Código de invitación inválido';
  END IF;

  INSERT INTO public."OrganizationMembership" (user_id, organization_id, is_active)
  VALUES (auth.uid(), v_org.id, true);

  SELECT id INTO v_admins FROM public."Group" WHERE slug = 'admins' LIMIT 1;
  IF v_admins IS NOT NULL THEN
    INSERT INTO public."UserGroup" (user_id, group_id)
    VALUES (auth.uid(), v_admins)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
