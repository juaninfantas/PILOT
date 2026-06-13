-- Permisos granulares por recurso/acción, roles editables y asignación por rol (grupo 1:1).

ALTER TABLE public."Role"
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

ALTER TABLE public."Permission"
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS resource text,
  ADD COLUMN IF NOT EXISTS action text;

COMMENT ON COLUMN public."Role".is_system IS 'true: rol seed del sistema; no se elimina.';
COMMENT ON COLUMN public."Permission".module IS 'Módulo UI: general, crm, admin.';
COMMENT ON COLUMN public."Permission".resource IS 'Recurso lógico: properties, people, …';
COMMENT ON COLUMN public."Permission".action IS 'view | create | update | delete';

UPDATE public."Role" SET is_system = true WHERE slug IN ('admin', 'agente', 'consulta');

-- ─── Seed permisos granulares (idempotente por slug) ───
INSERT INTO public."Permission" (name, slug, description, module, resource, action)
VALUES
  ('Ver dashboard', 'dashboard.view', 'Control Tower', 'general', 'dashboard', 'view'),
  ('Ver reportes', 'reports.view', 'Overview, pipeline, KPIs', 'general', 'reports', 'view'),
  ('Ver notas', 'notes.view', 'MyPilot notas', 'general', 'notes', 'view'),
  ('Crear notas', 'notes.create', 'MyPilot notas', 'general', 'notes', 'create'),
  ('Modificar notas', 'notes.update', 'MyPilot notas', 'general', 'notes', 'update'),
  ('Eliminar notas', 'notes.delete', 'MyPilot notas', 'general', 'notes', 'delete'),
  ('Ver propiedades', 'properties.view', 'Listado y fichas', 'crm', 'properties', 'view'),
  ('Crear propiedades', 'properties.create', 'Alta propiedades', 'crm', 'properties', 'create'),
  ('Modificar propiedades', 'properties.update', 'Edición propiedades', 'crm', 'properties', 'update'),
  ('Eliminar propiedades', 'properties.delete', 'Baja propiedades', 'crm', 'properties', 'delete'),
  ('Ver personas', 'people.view', 'Contactos CRM', 'crm', 'people', 'view'),
  ('Crear personas', 'people.create', 'Alta personas', 'crm', 'people', 'create'),
  ('Modificar personas', 'people.update', 'Edición personas', 'crm', 'people', 'update'),
  ('Eliminar personas', 'people.delete', 'Baja personas', 'crm', 'people', 'delete'),
  ('Ver oportunidades', 'opportunities.view', 'Pipeline comercial', 'crm', 'opportunities', 'view'),
  ('Crear oportunidades', 'opportunities.create', 'Alta oportunidades', 'crm', 'opportunities', 'create'),
  ('Modificar oportunidades', 'opportunities.update', 'Edición oportunidades', 'crm', 'opportunities', 'update'),
  ('Eliminar oportunidades', 'opportunities.delete', 'Baja oportunidades', 'crm', 'opportunities', 'delete'),
  ('Ver funnels', 'funnels.view', 'Etapas pipeline', 'crm', 'funnels', 'view'),
  ('Crear funnels', 'funnels.create', 'Alta funnels', 'crm', 'funnels', 'create'),
  ('Modificar funnels', 'funnels.update', 'Edición funnels', 'crm', 'funnels', 'update'),
  ('Eliminar funnels', 'funnels.delete', 'Baja funnels', 'crm', 'funnels', 'delete'),
  ('Ver calendario', 'calendar.view', 'Eventos', 'crm', 'calendar', 'view'),
  ('Crear calendario', 'calendar.create', 'Alta eventos', 'crm', 'calendar', 'create'),
  ('Modificar calendario', 'calendar.update', 'Edición eventos', 'crm', 'calendar', 'update'),
  ('Eliminar calendario', 'calendar.delete', 'Baja eventos', 'crm', 'calendar', 'delete'),
  ('Ver inmobiliaria', 'organization.view', 'Datos de la org', 'admin', 'organization', 'view'),
  ('Modificar inmobiliaria', 'organization.update', 'Marca y fiscal', 'admin', 'organization', 'update'),
  ('Ver usuarios', 'users.view', 'Equipo', 'admin', 'users', 'view'),
  ('Invitar usuarios', 'users.create', 'Invitaciones', 'admin', 'users', 'create'),
  ('Modificar usuarios', 'users.update', 'Roles y estado', 'admin', 'users', 'update'),
  ('Eliminar usuarios', 'users.delete', 'Desactivar/baja', 'admin', 'users', 'delete'),
  ('Ver roles', 'roles.view', 'Listado roles', 'admin', 'roles', 'view'),
  ('Crear roles', 'roles.create', 'Alta roles', 'admin', 'roles', 'create'),
  ('Modificar roles', 'roles.update', 'Permisos del rol', 'admin', 'roles', 'update'),
  ('Eliminar roles', 'roles.delete', 'Baja roles custom', 'admin', 'roles', 'delete'),
  ('Ver invitaciones', 'invites.view', 'Códigos', 'admin', 'invites', 'view'),
  ('Generar invitaciones', 'invites.create', 'Nuevo código', 'admin', 'invites', 'create'),
  ('Modificar invitaciones', 'invites.update', 'Revocar', 'admin', 'invites', 'update'),
  ('Eliminar invitaciones', 'invites.delete', 'Historial', 'admin', 'invites', 'delete'),
  ('Ver tipos de cambio', 'exchange_rates.view', 'FX', 'admin', 'exchange_rates', 'view'),
  ('Crear tipos de cambio', 'exchange_rates.create', 'FX', 'admin', 'exchange_rates', 'create'),
  ('Modificar tipos de cambio', 'exchange_rates.update', 'FX', 'admin', 'exchange_rates', 'update'),
  ('Eliminar tipos de cambio', 'exchange_rates.delete', 'FX', 'admin', 'exchange_rates', 'delete'),
  ('Ver formatos share', 'share_formats.view', 'Plantillas', 'admin', 'share_formats', 'view'),
  ('Crear formatos share', 'share_formats.create', 'Plantillas', 'admin', 'share_formats', 'create'),
  ('Modificar formatos share', 'share_formats.update', 'Plantillas', 'admin', 'share_formats', 'update'),
  ('Eliminar formatos share', 'share_formats.delete', 'Plantillas', 'admin', 'share_formats', 'delete')
ON CONFLICT (slug) DO UPDATE SET
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- Grupos 1:1 para roles custom futuros (prefijo role_)
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_role_slug ON public."Group" (slug);

-- ─── Resolver permisos (legacy + granular) ───
CREATE OR REPLACE FUNCTION public.user_has_permission_slug(p_user_id uuid, p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."UserGroup" ug
    JOIN public."GroupRole" gr ON gr.group_id = ug.group_id
    JOIN public."RolePermission" rp ON rp.role_id = gr.role_id
    JOIN public."Permission" p ON p.id = rp.permission_id AND p.slug = p_slug
    WHERE ug.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_slug text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."User" u WHERE u.id = v_uid AND COALESCE(u.platform_staff, false)
  ) THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."OrganizationMembership" m
    WHERE m.user_id = v_uid AND COALESCE(m.is_active, true)
  ) THEN
    RETURN false;
  END IF;

  IF public.user_has_permission_slug(v_uid, p_slug) THEN
    RETURN true;
  END IF;

  CASE p_slug
    WHEN 'view_dashboard' THEN
      RETURN public.user_has_permission_slug(v_uid, 'dashboard.view');
    WHEN 'view_reports' THEN
      RETURN public.user_has_permission_slug(v_uid, 'reports.view');
    WHEN 'view_properties' THEN
      RETURN public.user_has_permission_slug(v_uid, 'properties.view');
    WHEN 'manage_properties' THEN
      RETURN public.user_has_permission_slug(v_uid, 'properties.create')
        OR public.user_has_permission_slug(v_uid, 'properties.update')
        OR public.user_has_permission_slug(v_uid, 'properties.delete');
    WHEN 'view_people' THEN
      RETURN public.user_has_permission_slug(v_uid, 'people.view');
    WHEN 'manage_people' THEN
      RETURN public.user_has_permission_slug(v_uid, 'people.create')
        OR public.user_has_permission_slug(v_uid, 'people.update')
        OR public.user_has_permission_slug(v_uid, 'people.delete');
    WHEN 'view_opportunities' THEN
      RETURN public.user_has_permission_slug(v_uid, 'opportunities.view');
    WHEN 'manage_opportunities' THEN
      RETURN public.user_has_permission_slug(v_uid, 'opportunities.create')
        OR public.user_has_permission_slug(v_uid, 'opportunities.update')
        OR public.user_has_permission_slug(v_uid, 'opportunities.delete');
    WHEN 'manage_users' THEN
      RETURN public.user_has_permission_slug(v_uid, 'users.view')
        OR public.user_has_permission_slug(v_uid, 'users.create')
        OR public.user_has_permission_slug(v_uid, 'users.update')
        OR public.user_has_permission_slug(v_uid, 'users.delete');
    WHEN 'manage_groups' THEN
      RETURN public.user_has_permission_slug(v_uid, 'roles.view')
        OR public.user_has_permission_slug(v_uid, 'roles.update');
    WHEN 'manage_roles' THEN
      RETURN public.user_has_permission_slug(v_uid, 'roles.view')
        OR public.user_has_permission_slug(v_uid, 'roles.create')
        OR public.user_has_permission_slug(v_uid, 'roles.update')
        OR public.user_has_permission_slug(v_uid, 'roles.delete');
    ELSE
      RETURN false;
  END CASE;
END;
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
      SELECT 1 FROM public."OrganizationMembership" m
      WHERE m.user_id = auth.uid() AND COALESCE(m.is_active, true)
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

-- ─── Migrar RolePermission de roles sistema a granular ───
DELETE FROM public."RolePermission" rp
USING public."Role" r
WHERE rp.role_id = r.id AND r.slug = 'admin';

INSERT INTO public."RolePermission" (role_id, permission_id)
SELECT r.id, p.id
FROM public."Role" r
CROSS JOIN public."Permission" p
WHERE r.slug = 'admin'
  AND p.resource IS NOT NULL
ON CONFLICT DO NOTHING;

DELETE FROM public."RolePermission" rp
USING public."Role" r
WHERE rp.role_id = r.id AND r.slug = 'agente';

INSERT INTO public."RolePermission" (role_id, permission_id)
SELECT r.id, p.id
FROM public."Role" r
JOIN public."Permission" p ON p.slug IN (
  'dashboard.view', 'reports.view',
  'notes.view', 'notes.create', 'notes.update', 'notes.delete',
  'properties.view', 'properties.create', 'properties.update', 'properties.delete',
  'people.view', 'people.create', 'people.update', 'people.delete',
  'opportunities.view', 'opportunities.create', 'opportunities.update', 'opportunities.delete',
  'funnels.view', 'funnels.create', 'funnels.update', 'funnels.delete',
  'calendar.view', 'calendar.create', 'calendar.update', 'calendar.delete'
)
WHERE r.slug = 'agente'
ON CONFLICT DO NOTHING;

DELETE FROM public."RolePermission" rp
USING public."Role" r
WHERE rp.role_id = r.id AND r.slug = 'consulta';

INSERT INTO public."RolePermission" (role_id, permission_id)
SELECT r.id, p.id
FROM public."Role" r
JOIN public."Permission" p ON p.slug IN (
  'dashboard.view',
  'reports.view',
  'properties.view',
  'people.view',
  'opportunities.view',
  'funnels.view',
  'calendar.view',
  'notes.view'
)
WHERE r.slug = 'consulta'
ON CONFLICT DO NOTHING;

-- ─── RPCs gestión roles ───
CREATE OR REPLACE FUNCTION public.list_roles_admin()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  description text,
  is_system boolean,
  member_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.name,
    r.slug,
    r.description,
    COALESCE(r.is_system, false) AS is_system,
    (
      SELECT count(DISTINCT ug.user_id)::bigint
      FROM public."GroupRole" gr
      JOIN public."UserGroup" ug ON ug.group_id = gr.group_id
      WHERE gr.role_id = r.id
    ) AS member_count
  FROM public."Role" r
  WHERE public.has_permission('manage_roles')
     OR public.has_permission('roles.view')
     OR public.has_permission('manage_users')
     OR public.has_permission('users.view')
  ORDER BY r.is_system DESC, r.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_roles_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_role_permission_slugs(p_role_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(p.slug ORDER BY p.slug), ARRAY[]::text[])
  FROM public."RolePermission" rp
  JOIN public."Permission" p ON p.id = rp.permission_id
  WHERE rp.role_id = p_role_id
    AND (public.has_permission('manage_roles') OR public.has_permission('roles.view'));
$$;

GRANT EXECUTE ON FUNCTION public.get_role_permission_slugs(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_role_permissions(p_role_id uuid, p_slugs text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('manage_roles') AND NOT public.has_permission('roles.update') THEN
    RAISE EXCEPTION 'Sin permisos para editar roles';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."Role" WHERE id = p_role_id) THEN
    RAISE EXCEPTION 'Rol no encontrado';
  END IF;

  DELETE FROM public."RolePermission" WHERE role_id = p_role_id;

  INSERT INTO public."RolePermission" (role_id, permission_id)
  SELECT p_role_id, p.id
  FROM public."Permission" p
  WHERE p.slug = ANY (COALESCE(p_slugs, ARRAY[]::text[]))
    AND p.resource IS NOT NULL
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_role_permissions(uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_custom_role(
  p_name text,
  p_slug text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := lower(trim(regexp_replace(trim(p_slug), '[^a-z0-9_-]+', '_', 'g')));
  v_role_id uuid;
  v_group_id uuid;
BEGIN
  IF NOT public.has_permission('manage_roles') AND NOT public.has_permission('roles.create') THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;
  IF v_slug = '' OR p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Nombre y código son obligatorios';
  END IF;
  IF v_slug IN ('admin', 'agente', 'consulta') THEN
    RAISE EXCEPTION 'Código reservado';
  END IF;

  INSERT INTO public."Role" (name, slug, description, is_system)
  VALUES (trim(p_name), v_slug, NULLIF(trim(COALESCE(p_description, '')), ''), false)
  RETURNING id INTO v_role_id;

  INSERT INTO public."Group" (name, slug, description)
  VALUES (trim(p_name), 'role_' || v_slug, 'Grupo del rol ' || trim(p_name))
  RETURNING id INTO v_group_id;

  INSERT INTO public."GroupRole" (group_id, role_id) VALUES (v_group_id, v_role_id);

  RETURN v_role_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_custom_role(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_role_profile(
  p_role_id uuid,
  p_name text,
  p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('manage_roles') AND NOT public.has_permission('roles.update') THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;

  UPDATE public."Role"
  SET name = trim(p_name),
      description = NULLIF(trim(COALESCE(p_description, '')), ''),
      updated_at = now()
  WHERE id = p_role_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rol no encontrado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_role_profile(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_custom_role(p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public."Role"%ROWTYPE;
  v_group_id uuid;
BEGIN
  IF NOT public.has_permission('manage_roles') AND NOT public.has_permission('roles.delete') THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;

  SELECT * INTO v_role FROM public."Role" WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rol no encontrado';
  END IF;
  IF COALESCE(v_role.is_system, false) THEN
    RAISE EXCEPTION 'No se puede eliminar un rol del sistema';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."GroupRole" gr
    JOIN public."UserGroup" ug ON ug.group_id = gr.group_id
    WHERE gr.role_id = p_role_id
  ) THEN
    RAISE EXCEPTION 'El rol tiene usuarios asignados';
  END IF;

  SELECT gr.group_id INTO v_group_id
  FROM public."GroupRole" gr
  WHERE gr.role_id = p_role_id
  LIMIT 1;

  DELETE FROM public."RolePermission" WHERE role_id = p_role_id;
  DELETE FROM public."GroupRole" WHERE role_id = p_role_id;
  DELETE FROM public."Role" WHERE id = p_role_id;
  IF v_group_id IS NOT NULL THEN
    DELETE FROM public."Group" WHERE id = v_group_id AND slug LIKE 'role_%';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_custom_role(uuid) TO authenticated;

-- Asignar rol por id (reemplaza grupos de acceso tenant)
CREATE OR REPLACE FUNCTION public.set_org_member_role(p_user_id uuid, p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  IF NOT public.has_permission('manage_users') AND NOT public.has_permission('users.update') THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No podés cambiar tu propio rol';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."OrganizationMembership" m
    WHERE m.organization_id = public.user_organization_id() AND m.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Usuario no pertenece a la inmobiliaria';
  END IF;

  SELECT gr.group_id INTO v_group_id
  FROM public."GroupRole" gr
  WHERE gr.role_id = p_role_id
  LIMIT 1;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Rol sin grupo vinculado';
  END IF;

  DELETE FROM public."UserGroup" ug
  WHERE ug.user_id = p_user_id
    AND ug.group_id IN (
      SELECT g.id FROM public."Group" g
      WHERE g.slug IN ('admins', 'agentes', 'consulta') OR g.slug LIKE 'role_%'
    );

  INSERT INTO public."UserGroup" (user_id, group_id) VALUES (p_user_id, v_group_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_org_member_role(uuid, uuid) TO authenticated;

-- list_org_members: incluir role_id (DROP necesario: cambió el tipo de retorno)
DROP FUNCTION IF EXISTS public.list_org_members();

CREATE OR REPLACE FUNCTION public.list_org_members()
RETURNS TABLE (
  user_id uuid,
  email text,
  name text,
  is_active boolean,
  access_group_slug text,
  role_id uuid,
  role_name text,
  role_slug text,
  linked_person_id uuid,
  linked_person_name text
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
    COALESCE(g.slug, '—') AS access_group_slug,
    r.id AS role_id,
    r.name AS role_name,
    r.slug AS role_slug,
    lp.id AS linked_person_id,
    lp.name AS linked_person_name
  FROM public."OrganizationMembership" m
  JOIN public."User" u ON u.id = m.user_id
  LEFT JOIN LATERAL (
    SELECT ug.group_id
    FROM public."UserGroup" ug
    JOIN public."Group" g2 ON g2.id = ug.group_id
    WHERE ug.user_id = m.user_id
      AND (g2.slug IN ('admins', 'agentes', 'consulta') OR g2.slug LIKE 'role_%')
    ORDER BY CASE g2.slug WHEN 'admins' THEN 1 WHEN 'agentes' THEN 2 WHEN 'consulta' THEN 3 ELSE 4 END
    LIMIT 1
  ) ugp ON true
  LEFT JOIN public."Group" g ON g.id = ugp.group_id
  LEFT JOIN public."GroupRole" gr ON gr.group_id = g.id
  LEFT JOIN public."Role" r ON r.id = gr.role_id
  LEFT JOIN LATERAL (
    SELECT p.id, p.name
    FROM public."Person" p
    WHERE p.linked_user_id = m.user_id AND p.organization_id = m.organization_id
    LIMIT 1
  ) lp ON true
  WHERE m.organization_id = public.user_organization_id()
    AND (public.has_permission('manage_users') OR public.has_permission('users.view'))
  ORDER BY u.email NULLS LAST, u.name NULLS LAST;
$$;

-- Mantener assign_org_access_group para invitaciones (signup sin manage_users)
CREATE OR REPLACE FUNCTION public.assign_org_access_group(p_user_id uuid, p_access text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
  v_slug text;
BEGIN
  IF lower(trim(p_access)) NOT IN ('admin', 'agente', 'consulta') THEN
    RAISE EXCEPTION 'access debe ser admin, agente o consulta';
  END IF;

  v_slug := CASE lower(trim(p_access))
    WHEN 'admin' THEN 'admins'
    WHEN 'agente' THEN 'agentes'
    ELSE 'consulta'
  END;

  SELECT g.id INTO v_group_id FROM public."Group" g WHERE g.slug = v_slug LIMIT 1;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Grupo no encontrado: %', v_slug;
  END IF;

  DELETE FROM public."UserGroup" ug
  WHERE ug.user_id = p_user_id
    AND ug.group_id IN (
      SELECT id FROM public."Group" WHERE slug IN ('admins', 'agentes', 'consulta') OR slug LIKE 'role_%'
    );

  INSERT INTO public."UserGroup" (user_id, group_id) VALUES (p_user_id, v_group_id);
END;
$$;
