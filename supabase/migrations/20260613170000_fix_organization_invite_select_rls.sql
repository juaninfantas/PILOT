-- OrganizationInvite: lectura alineada al tenant efectivo y permisos granulares.

DROP POLICY IF EXISTS "oi_select_manage" ON public."OrganizationInvite";

CREATE POLICY "oi_select_manage" ON public."OrganizationInvite" FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND (
      public.has_permission('manage_users')
      OR public.has_permission('invites.view')
      OR public.has_permission('users.view')
    )
  );

CREATE OR REPLACE FUNCTION public.list_organization_invites()
RETURNS SETOF public."OrganizationInvite"
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT iv.*
  FROM public."OrganizationInvite" iv
  WHERE iv.organization_id = public.user_organization_id()
    AND (
      public.has_permission('manage_users')
      OR public.has_permission('invites.view')
      OR public.has_permission('users.view')
    )
  ORDER BY iv.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_organization_invites() TO authenticated;
