-- Seed permissions, admin role, default group (idempotent)

INSERT INTO public."Permission" (name, slug, description)
VALUES
  ('Ver dashboard', 'view_dashboard', 'Acceso al panel'),
  ('Ver propiedades', 'view_properties', 'Listar propiedades'),
  ('Gestionar propiedades', 'manage_properties', 'Alta/edición propiedades y precios'),
  ('Ver personas', 'view_people', 'Ver contactos'),
  ('Gestionar personas', 'manage_people', 'ABM personas y preferencias'),
  ('Ver oportunidades', 'view_opportunities', 'Ver pipeline'),
  ('Gestionar oportunidades', 'manage_opportunities', 'Oportunidades y actividades'),
  ('Ver reportes', 'view_reports', 'KPIs'),
  ('Gestionar usuarios', 'manage_users', 'ABM usuarios'),
  ('Gestionar grupos', 'manage_groups', 'ABM grupos'),
  ('Gestionar roles', 'manage_roles', 'ABM roles y permisos')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public."Role" (name, slug, description)
VALUES ('Administrador', 'admin', 'Acceso completo')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public."Group" (name, slug, description)
VALUES ('Administradores', 'admins', 'Grupo con rol admin')
ON CONFLICT (slug) DO NOTHING;

-- Link admin role to all permissions
INSERT INTO public."RolePermission" (role_id, permission_id)
SELECT r.id, p.id
FROM public."Role" r
CROSS JOIN public."Permission" p
WHERE r.slug = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Link group to admin role
INSERT INTO public."GroupRole" (group_id, role_id)
SELECT g.id, r.id
FROM public."Group" g
JOIN public."Role" r ON r.slug = 'admin'
WHERE g.slug = 'admins'
ON CONFLICT (group_id, role_id) DO NOTHING;

-- Asignar tu usuario: reemplazá USER_UUID por auth.users.id
-- INSERT INTO public."UserGroup" (user_id, group_id)
-- SELECT 'USER_UUID'::uuid, g.id FROM public."Group" g WHERE g.slug = 'admins'
-- ON CONFLICT DO NOTHING;
