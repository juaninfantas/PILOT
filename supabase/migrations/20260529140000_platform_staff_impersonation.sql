-- Supervisor Pilot: marca platform_staff en User + impersonación de tenant efectivo en RLS.
-- user_organization_id() prioriza PilotStaffImpersonation vigente; si no hay, membresía.

ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS platform_staff boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public."User".platform_staff IS 'Equipo Pilot: puede buscar todas las orgs y establecer impersonación (ver PilotStaffImpersonation).';

CREATE TABLE IF NOT EXISTS public."PilotStaffImpersonation" (
  staff_user_id uuid PRIMARY KEY REFERENCES public."User" (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public."Organization" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

COMMENT ON TABLE public."PilotStaffImpersonation" IS 'Contexto efectivo de tenant para soporte; expira solo (TTL).';

CREATE INDEX IF NOT EXISTS idx_pilot_staff_imp_exp ON public."PilotStaffImpersonation" (expires_at);

ALTER TABLE public."PilotStaffImpersonation" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pilot_imp_select_own" ON public."PilotStaffImpersonation";
CREATE POLICY "pilot_imp_select_own" ON public."PilotStaffImpersonation" FOR SELECT TO authenticated USING (
  staff_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public."User" u
    WHERE u.id = auth.uid()
      AND COALESCE(u.platform_staff, false)
  )
);

-- Sin políticas INSERT/UPDATE/DELETE para authenticated: mutación solo vía SECURITY DEFINER.

-- ─── Trigger: impedir cambiar platform_staff desde la API ───
CREATE OR REPLACE FUNCTION public.prevent_user_platform_staff_client_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.platform_staff IS DISTINCT FROM OLD.platform_staff THEN
    RAISE EXCEPTION 'platform_staff solo se cambia desde SQL (Supabase)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_platform_staff_guard ON public."User";
CREATE TRIGGER trg_user_platform_staff_guard
  BEFORE UPDATE ON public."User"
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_user_platform_staff_client_mutation();

-- ─── Tenant efectivo para RLS ───
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
      LIMIT 1
    )
  );
$$;

-- ─── Ver org efectiva (incluye impersonación; sin JOIN solo a membresía) ───
DROP FUNCTION IF EXISTS public.get_my_organization();

CREATE OR REPLACE FUNCTION public.get_my_organization()
RETURNS TABLE (
  id uuid,
  slug text,
  display_name text,
  logo_url text,
  legal_json text,
  fiscal_legal_name text,
  fiscal_address text,
  fiscal_cuit text,
  fiscal_iva_condition text,
  subscription_tier text,
  subscription_expires_at timestamptz
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
    o.logo_url,
    o.legal_json,
    o.fiscal_legal_name,
    o.fiscal_address,
    o.fiscal_cuit,
    o.fiscal_iva_condition,
    o.subscription_tier,
    o.subscription_expires_at
  FROM public."Organization" o
  WHERE o.id = public.user_organization_id()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organization() TO authenticated;

-- ─── Lista orgs para buscador soporte ───
CREATE OR REPLACE FUNCTION public.staff_search_organizations(p_query text DEFAULT '', p_limit int DEFAULT 50)
RETURNS TABLE (id uuid, slug text, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.slug, o.display_name
  FROM public."Organization" o
  WHERE EXISTS (
      SELECT 1
      FROM public."User" u
      WHERE u.id = auth.uid()
        AND COALESCE(u.platform_staff, false)
    )
    AND (
      trim(COALESCE(p_query, '')) = ''
      OR lower(o.display_name) LIKE '%' || lower(trim(p_query)) || '%'
      OR lower(o.slug) LIKE '%' || lower(trim(p_query)) || '%'
    )
  ORDER BY o.display_name
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
$$;

GRANT EXECUTE ON FUNCTION public.staff_search_organizations(text, integer) TO authenticated;

-- ─── Establecer / limpiar impersonación ───
CREATE OR REPLACE FUNCTION public.staff_set_impersonation(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT EXISTS (
      SELECT 1
      FROM public."User" u
      WHERE u.id = auth.uid()
        AND COALESCE(u.platform_staff, false)
    ) THEN
    RAISE EXCEPTION 'Solo equipo Pilot puede impersonar';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Organization" o WHERE o.id = p_organization_id) THEN
    RAISE EXCEPTION 'Inmobiliaria no encontrada';
  END IF;

  INSERT INTO public."PilotStaffImpersonation" (staff_user_id, organization_id, expires_at)
  VALUES (auth.uid(), p_organization_id, now() + interval '12 hours')
  ON CONFLICT (staff_user_id) DO UPDATE SET
    organization_id = excluded.organization_id,
    expires_at = excluded.expires_at,
    created_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_set_impersonation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_clear_impersonation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT EXISTS (
      SELECT 1
      FROM public."User" u
      WHERE u.id = auth.uid()
        AND COALESCE(u.platform_staff, false)
    ) THEN
    RAISE EXCEPTION 'Solo equipo Pilot';
  END IF;
  DELETE FROM public."PilotStaffImpersonation" WHERE staff_user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_clear_impersonation() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_staff_context()
RETURNS TABLE (
  platform_staff boolean,
  impersonating boolean,
  impersonation_expires_at timestamptz,
  impersonation_organization_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      (SELECT COALESCE(u.platform_staff, false) FROM public."User" u WHERE u.id = auth.uid()),
      false
    ),
    EXISTS (
      SELECT 1
      FROM public."PilotStaffImpersonation" i
      WHERE i.staff_user_id = auth.uid()
        AND i.expires_at > now()
    ),
    (
      SELECT i.expires_at
      FROM public."PilotStaffImpersonation" i
      WHERE i.staff_user_id = auth.uid()
        AND i.expires_at > now()
      ORDER BY i.created_at DESC
      LIMIT 1
    ),
    (
      SELECT i.organization_id
      FROM public."PilotStaffImpersonation" i
      WHERE i.staff_user_id = auth.uid()
        AND i.expires_at > now()
      ORDER BY i.created_at DESC
      LIMIT 1
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_staff_context() TO authenticated;

-- ─── Permitir SELECT Organization del tenant efectivo (impersonación sin membresía) ───
DROP POLICY IF EXISTS "organization_select_members" ON public."Organization";
CREATE POLICY "organization_select_members" ON public."Organization" FOR SELECT TO authenticated
  USING (id = public.user_organization_id());

-- UPDATE policy sigue usando manage_users + igualdad org (update_my_organization_profile usa user_organization_id internamente).
