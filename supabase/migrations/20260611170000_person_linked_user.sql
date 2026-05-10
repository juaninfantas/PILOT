-- Persona CRM vinculada a un usuario de la cuenta (mismo tenant).

ALTER TABLE public."Person"
  ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES public."User" (id) ON DELETE SET NULL;

COMMENT ON COLUMN public."Person".linked_user_id IS 'Usuario Pilot de la cuenta que corresponde a esta persona CRM (mismo organization_id); sin restricción 1:1 por ahora.';

CREATE INDEX IF NOT EXISTS idx_person_linked_user ON public."Person" (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.person_linked_user_tenant_chk()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.linked_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public."OrganizationMembership" m
    WHERE m.user_id = NEW.linked_user_id
      AND m.organization_id = NEW.organization_id
      AND COALESCE(m.is_active, true)
  ) THEN
    RAISE EXCEPTION 'person_linked_user_must_be_active_member_of_org';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_person_linked_user_tenant_chk ON public."Person";
CREATE TRIGGER trg_person_linked_user_tenant_chk
  BEFORE INSERT OR UPDATE OF linked_user_id, organization_id
  ON public."Person"
  FOR EACH ROW
  EXECUTE FUNCTION public.person_linked_user_tenant_chk();

-- Lista de usuarios del tenant para vínculos: quienes gestionan personas o usuarios pueden ver membresías de su organización.

DROP POLICY IF EXISTS "org_membership_select_own" ON public."OrganizationMembership";

CREATE POLICY "org_membership_select_own" ON public."OrganizationMembership" FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      organization_id = public.user_organization_id()
      AND (
        public.has_permission('manage_users')
        OR public.has_permission('manage_people')
      )
    )
  );

-- Lectura User: self/admins; manage_people + miembro activo del mismo tenant; view_people + persona enlazada en el mismo tenant.

DROP POLICY IF EXISTS "user_select_self" ON public."User";

CREATE POLICY "user_select_self" ON public."User" FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_permission('manage_users')
    OR (
      public.has_permission('manage_people')
      AND EXISTS (
        SELECT 1
        FROM public."OrganizationMembership" m
        WHERE m.user_id = id
          AND m.organization_id = public.user_organization_id()
          AND COALESCE(m.is_active, true)
      )
    )
    OR (
      public.has_permission('view_people')
      AND EXISTS (
        SELECT 1
        FROM public."Person" p
        WHERE p.linked_user_id = id
          AND p.organization_id = public.user_organization_id()
      )
    )
  );
