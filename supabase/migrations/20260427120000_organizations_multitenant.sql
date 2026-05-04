-- Multitenant: Organization, membership (1 usuario = 1 inmobiliaria en MVP),
-- organization_id en entidades CRM, notas por usuario, RLS endurecido.
-- Migración datos existentes → organización default 'default'.

CREATE TABLE IF NOT EXISTS public."Organization" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  display_name text NOT NULL,
  logo_url text,
  legal_json text,
  signup_invite_code text NOT NULL DEFAULT 'CHANGE-ME',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_slug_normalized_chk CHECK (slug = lower(trim(slug)))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_slug_ci ON public."Organization" (lower(trim(slug)));

CREATE TABLE IF NOT EXISTS public."OrganizationMembership" (
  user_id uuid PRIMARY KEY REFERENCES public."User" (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public."Organization" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_membership_org ON public."OrganizationMembership" (organization_id);

CREATE TABLE IF NOT EXISTS public."UserNote" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public."Organization" (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public."User" (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Sin título',
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usernote_org_user_updated ON public."UserNote" (organization_id, user_id, updated_at DESC);

-- ─── Organización default y membresías para usuarios ya existentes ───
INSERT INTO public."Organization" (slug, display_name, signup_invite_code)
SELECT 'default', 'Organización principal', 'PILOT-DEV-OPEN'
WHERE NOT EXISTS (SELECT 1 FROM public."Organization" WHERE slug = 'default');

UPDATE public."Organization"
SET signup_invite_code = COALESCE(NULLIF(trim(signup_invite_code), ''), 'PILOT-DEV-OPEN'),
    display_name = COALESCE(NULLIF(trim(display_name), ''), display_name)
WHERE slug = 'default';

INSERT INTO public."OrganizationMembership" (user_id, organization_id)
SELECT u.id, o.id
FROM public."User" u
CROSS JOIN (SELECT id FROM public."Organization" WHERE slug = 'default' LIMIT 1) o
ON CONFLICT (user_id) DO NOTHING;

-- ─── Columnas organization_id ───
ALTER TABLE public."Property" ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public."Organization" (id);
ALTER TABLE public."Person" ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public."Organization" (id);
ALTER TABLE public."Opportunity" ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public."Organization" (id);
ALTER TABLE public."Funnel" ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public."Organization" (id);
ALTER TABLE public."CalendarEvent" ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public."Organization" (id);
ALTER TABLE public."AuditLog" ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public."Organization" (id);

DO $$
DECLARE
  v_default uuid;
BEGIN
  SELECT id INTO v_default FROM public."Organization" WHERE slug = 'default' LIMIT 1;
  IF v_default IS NULL THEN
    RAISE EXCEPTION 'Missing default organization';
  END IF;
  UPDATE public."Property" SET organization_id = v_default WHERE organization_id IS NULL;
  UPDATE public."Person" SET organization_id = v_default WHERE organization_id IS NULL;
  UPDATE public."Opportunity" SET organization_id = v_default WHERE organization_id IS NULL;
  UPDATE public."Funnel" SET organization_id = v_default WHERE organization_id IS NULL;
  UPDATE public."CalendarEvent" SET organization_id = v_default WHERE organization_id IS NULL;
  UPDATE public."AuditLog" SET organization_id = v_default WHERE organization_id IS NULL;
END $$;

ALTER TABLE public."Property" ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public."Person" ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public."Opportunity" ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public."Funnel" ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public."CalendarEvent" ALTER COLUMN organization_id SET NOT NULL;

-- Calendario: eventos ligados a oportunidad heredan org de la oportunidad si quedó default erróneo
UPDATE public."CalendarEvent" ce
SET organization_id = o.organization_id
FROM public."Opportunity" o
WHERE ce.opportunity_id = o.id
  AND ce.organization_id IS DISTINCT FROM o.organization_id;

-- Funnel slug único por organización
ALTER TABLE public."Funnel" DROP CONSTRAINT IF EXISTS "Funnel_slug_key";
DROP INDEX IF EXISTS public.uq_funnel_system_type;
CREATE UNIQUE INDEX IF NOT EXISTS uq_funnel_org_slug ON public."Funnel" (organization_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_funnel_org_system_type ON public."Funnel" (organization_id, system_type) WHERE is_system = true;

CREATE INDEX IF NOT EXISTS idx_property_org ON public."Property" (organization_id);
CREATE INDEX IF NOT EXISTS idx_person_org ON public."Person" (organization_id);
CREATE INDEX IF NOT EXISTS idx_opp_org ON public."Opportunity" (organization_id);
CREATE INDEX IF NOT EXISTS idx_funnel_org ON public."Funnel" (organization_id);
CREATE INDEX IF NOT EXISTS idx_calendar_org ON public."CalendarEvent" (organization_id);

-- ─── Helpers RLS ───
CREATE OR REPLACE FUNCTION public.user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.organization_id
  FROM public."OrganizationMembership" m
  WHERE m.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.user_organization_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_organization()
RETURNS TABLE (
  id uuid,
  slug text,
  display_name text,
  logo_url text,
  legal_json text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.slug, o.display_name, o.logo_url, o.legal_json
  FROM public."Organization" o
  JOIN public."OrganizationMembership" m ON m.organization_id = o.id AND m.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organization() TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_organization_slug_matches_membership(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Organization" o
    JOIN public."OrganizationMembership" m ON m.organization_id = o.id AND m.user_id = auth.uid()
    WHERE o.slug = lower(trim(p_slug))
  );
$$;

GRANT EXECUTE ON FUNCTION public.assert_organization_slug_matches_membership(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_organization_membership(p_slug text, p_invite text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public."Organization"%ROWTYPE;
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

  INSERT INTO public."OrganizationMembership" (user_id, organization_id)
  VALUES (auth.uid(), v_org.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.attach_organization_membership(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_organization_profile(
  p_display_name text,
  p_logo_url text,
  p_legal_json text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oid uuid := public.user_organization_id();
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Sin organización';
  END IF;
  IF NOT public.has_permission('manage_users') THEN
    RAISE EXCEPTION 'Sin permisos para editar datos de la inmobiliaria';
  END IF;
  UPDATE public."Organization"
  SET
    display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
    logo_url = COALESCE(NULLIF(trim(p_logo_url), ''), logo_url),
    legal_json = COALESCE(p_legal_json, legal_json),
    updated_at = now()
  WHERE id = v_oid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_organization_profile(text, text, text) TO authenticated;

-- ─── Trigger User: nombre desde metadata ───
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NULLIF(trim(concat_ws(' ', NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'last_name')), ''),
    NEW.raw_user_meta_data->>'name'
  );

  INSERT INTO public."User" (id, name, email, image)
  VALUES (
    NEW.id,
    v_name,
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, public."User".name),
    email = EXCLUDED.email,
    image = COALESCE(EXCLUDED.image, public."User".image);
  RETURN NEW;
END;
$$;

-- ─── RLS: Organization & Membership & Notes ───
ALTER TABLE public."Organization" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organization_select_members" ON public."Organization";
CREATE POLICY "organization_select_members" ON public."Organization" FOR SELECT TO authenticated
  USING (id IN (SELECT m.organization_id FROM public."OrganizationMembership" m WHERE m.user_id = auth.uid()));

DROP POLICY IF EXISTS "organization_update_manage" ON public."Organization";
CREATE POLICY "organization_update_manage" ON public."Organization" FOR UPDATE TO authenticated
  USING (
    id = public.user_organization_id()
    AND public.has_permission('manage_users')
  )
  WITH CHECK (
    id = public.user_organization_id()
    AND public.has_permission('manage_users')
  );

ALTER TABLE public."OrganizationMembership" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_membership_select_own" ON public."OrganizationMembership";
CREATE POLICY "org_membership_select_own" ON public."OrganizationMembership" FOR SELECT TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public."UserNote" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usernote_select" ON public."UserNote";
CREATE POLICY "usernote_select" ON public."UserNote" FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND organization_id = public.user_organization_id()
  );

DROP POLICY IF EXISTS "usernote_insert" ON public."UserNote";
CREATE POLICY "usernote_insert" ON public."UserNote" FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = public.user_organization_id()
  );

DROP POLICY IF EXISTS "usernote_update" ON public."UserNote";
CREATE POLICY "usernote_update" ON public."UserNote" FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND organization_id = public.user_organization_id())
  WITH CHECK (user_id = auth.uid() AND organization_id = public.user_organization_id());

DROP POLICY IF EXISTS "usernote_delete" ON public."UserNote";
CREATE POLICY "usernote_delete" ON public."UserNote" FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND organization_id = public.user_organization_id());

-- ─── Sustituir políticas CRM (aislamiento por organización) ───
DROP POLICY IF EXISTS "prop_select" ON public."Property";
DROP POLICY IF EXISTS "prop_insert" ON public."Property";
DROP POLICY IF EXISTS "prop_update" ON public."Property";
DROP POLICY IF EXISTS "prop_delete" ON public."Property";

CREATE POLICY "prop_select" ON public."Property" FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('view_properties')
  );
CREATE POLICY "prop_insert" ON public."Property" FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_properties')
  );
CREATE POLICY "prop_update" ON public."Property" FOR UPDATE TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_properties')
  )
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_properties')
  );
CREATE POLICY "prop_delete" ON public."Property" FOR DELETE TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_properties')
  );

DROP POLICY IF EXISTS "pp_select" ON public."PropertyPrice";
DROP POLICY IF EXISTS "pp_mutate" ON public."PropertyPrice";

CREATE POLICY "pp_select" ON public."PropertyPrice" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id AND p.organization_id = public.user_organization_id()
    )
  );

CREATE POLICY "pp_mutate_insert" ON public."PropertyPrice" FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id AND p.organization_id = public.user_organization_id()
    )
  );

CREATE POLICY "pp_mutate_update" ON public."PropertyPrice" FOR UPDATE TO authenticated
  USING (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id AND p.organization_id = public.user_organization_id()
    )
  )
  WITH CHECK (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id AND p.organization_id = public.user_organization_id()
    )
  );

CREATE POLICY "pp_mutate_delete" ON public."PropertyPrice" FOR DELETE TO authenticated
  USING (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id AND p.organization_id = public.user_organization_id()
    )
  );

DROP POLICY IF EXISTS "pa_select" ON public."PropertyAppraisal";
DROP POLICY IF EXISTS "pa_mutate" ON public."PropertyAppraisal";

CREATE POLICY "pa_select" ON public."PropertyAppraisal" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p WHERE p.id = property_id AND p.organization_id = public.user_organization_id()
    )
  );
CREATE POLICY "pa_mutate" ON public."PropertyAppraisal" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p WHERE p.id = property_id AND p.organization_id = public.user_organization_id()
    )
  )
  WITH CHECK (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p WHERE p.id = property_id AND p.organization_id = public.user_organization_id()
    )
  );

DROP POLICY IF EXISTS "pf_select" ON public."PropertyFile";
DROP POLICY IF EXISTS "pf_mutate" ON public."PropertyFile";

CREATE POLICY "pf_select" ON public."PropertyFile" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p WHERE p.id = property_id AND p.organization_id = public.user_organization_id()
    )
  );
CREATE POLICY "pf_mutate" ON public."PropertyFile" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p WHERE p.id = property_id AND p.organization_id = public.user_organization_id()
    )
  )
  WITH CHECK (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p WHERE p.id = property_id AND p.organization_id = public.user_organization_id()
    )
  );

DROP POLICY IF EXISTS "person_select" ON public."Person";
DROP POLICY IF EXISTS "person_mutate" ON public."Person";

CREATE POLICY "person_select" ON public."Person" FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('view_people')
  );
CREATE POLICY "person_mutate" ON public."Person" FOR ALL TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_people')
  )
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_people')
  );

DROP POLICY IF EXISTS "pprof_select" ON public."PersonProfile";
DROP POLICY IF EXISTS "pprof_insert" ON public."PersonProfile";
DROP POLICY IF EXISTS "pprof_update" ON public."PersonProfile";
DROP POLICY IF EXISTS "pprof_delete" ON public."PersonProfile";

CREATE POLICY "pprof_select" ON public."PersonProfile" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per WHERE per.id = person_id AND per.organization_id = public.user_organization_id()
    )
  );
CREATE POLICY "pprof_insert" ON public."PersonProfile" FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('manage_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per WHERE per.id = person_id AND per.organization_id = public.user_organization_id()
    )
  );
CREATE POLICY "pprof_update" ON public."PersonProfile" FOR UPDATE TO authenticated
  USING (
    public.has_permission('manage_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per WHERE per.id = person_id AND per.organization_id = public.user_organization_id()
    )
  )
  WITH CHECK (
    public.has_permission('manage_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per WHERE per.id = person_id AND per.organization_id = public.user_organization_id()
    )
  );
CREATE POLICY "pprof_delete" ON public."PersonProfile" FOR DELETE TO authenticated
  USING (
    public.has_permission('manage_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per WHERE per.id = person_id AND per.organization_id = public.user_organization_id()
    )
  );

DROP POLICY IF EXISTS "ppref_select" ON public."PersonPreference";
DROP POLICY IF EXISTS "ppref_mutate" ON public."PersonPreference";

CREATE POLICY "ppref_select" ON public."PersonPreference" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per WHERE per.id = person_id AND per.organization_id = public.user_organization_id()
    )
  );
CREATE POLICY "ppref_mutate" ON public."PersonPreference" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per WHERE per.id = person_id AND per.organization_id = public.user_organization_id()
    )
  )
  WITH CHECK (
    public.has_permission('manage_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per WHERE per.id = person_id AND per.organization_id = public.user_organization_id()
    )
  );

DROP POLICY IF EXISTS "opp_select" ON public."Opportunity";
DROP POLICY IF EXISTS "opp_mutate" ON public."Opportunity";

CREATE POLICY "opp_select" ON public."Opportunity" FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('view_opportunities')
  );
CREATE POLICY "opp_mutate" ON public."Opportunity" FOR ALL TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_opportunities')
  )
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_opportunities')
  );

DROP POLICY IF EXISTS "oprop_select" ON public."OpportunityProperty";
DROP POLICY IF EXISTS "oprop_mutate" ON public."OpportunityProperty";

CREATE POLICY "oprop_select" ON public."OpportunityProperty" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o WHERE o.id = opportunity_id AND o.organization_id = public.user_organization_id()
    )
  );
CREATE POLICY "oprop_mutate" ON public."OpportunityProperty" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o WHERE o.id = opportunity_id AND o.organization_id = public.user_organization_id()
    )
  )
  WITH CHECK (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o WHERE o.id = opportunity_id AND o.organization_id = public.user_organization_id()
    )
  );

DROP POLICY IF EXISTS "oact_select" ON public."OpportunityActivity";
DROP POLICY IF EXISTS "oact_mutate" ON public."OpportunityActivity";

CREATE POLICY "oact_select" ON public."OpportunityActivity" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o WHERE o.id = opportunity_id AND o.organization_id = public.user_organization_id()
    )
  );
CREATE POLICY "oact_mutate" ON public."OpportunityActivity" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o WHERE o.id = opportunity_id AND o.organization_id = public.user_organization_id()
    )
  )
  WITH CHECK (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o WHERE o.id = opportunity_id AND o.organization_id = public.user_organization_id()
    )
  );

DROP POLICY IF EXISTS "funnel_select" ON public."Funnel";
DROP POLICY IF EXISTS "funnel_mutate" ON public."Funnel";

CREATE POLICY "funnel_select" ON public."Funnel" FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('view_opportunities')
  );

DROP POLICY IF EXISTS "funnel_stage_select" ON public."FunnelStage";
DROP POLICY IF EXISTS "funnel_stage_mutate" ON public."FunnelStage";

CREATE POLICY "funnel_stage_select" ON public."FunnelStage" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Funnel" f WHERE f.id = funnel_id AND f.organization_id = public.user_organization_id()
    )
  );
CREATE POLICY "funnel_stage_mutate" ON public."FunnelStage" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Funnel" f
      WHERE f.id = funnel_id
        AND f.organization_id = public.user_organization_id()
        AND f.is_system = false
    )
  )
  WITH CHECK (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Funnel" f
      WHERE f.id = funnel_id
        AND f.organization_id = public.user_organization_id()
        AND f.is_system = false
    )
  );

-- Funnels editables sólo si no son de sistema (los de sistema se insertan sólo desde migraciones/seed backend)
DROP POLICY IF EXISTS "funnel_mutate" ON public."Funnel";

CREATE POLICY "funnel_non_system_insert" ON public."Funnel" FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_opportunities')
    AND is_system = false
    AND system_type = 'NORMAL'
  );

CREATE POLICY "funnel_non_system_update" ON public."Funnel" FOR UPDATE TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_opportunities')
    AND NOT is_system
  )
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_opportunities')
    AND NOT is_system
    AND system_type = 'NORMAL'
  );

CREATE POLICY "funnel_non_system_delete" ON public."Funnel" FOR DELETE TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_opportunities')
    AND NOT is_system
  );

DROP POLICY IF EXISTS "calendar_event_select" ON public."CalendarEvent";
DROP POLICY IF EXISTS "calendar_event_mutate" ON public."CalendarEvent";

CREATE POLICY "calendar_event_select" ON public."CalendarEvent" FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('view_opportunities')
  );
CREATE POLICY "calendar_event_mutate" ON public."CalendarEvent" FOR ALL TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_opportunities')
  )
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_opportunities')
  );

DROP POLICY IF EXISTS "audit_select" ON public."AuditLog";
DROP POLICY IF EXISTS "audit_insert" ON public."AuditLog";

CREATE POLICY "audit_select" ON public."AuditLog" FOR SELECT TO authenticated
  USING (
    (organization_id IS NULL OR organization_id = public.user_organization_id())
    AND (public.has_permission('manage_roles') OR public.has_permission('manage_users'))
  );

CREATE POLICY "audit_insert" ON public."AuditLog" FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.user_organization_id()
    OR organization_id IS NULL
  );

-- Bucket logos inmobiliaria (público lectura; subida sólo usuarios OK para MVP — refiná por prefijo después)
INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-logos', 'organization-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "org_logo_read" ON storage.objects;
DROP POLICY IF EXISTS "org_logo_upload" ON storage.objects;
DROP POLICY IF EXISTS "org_logo_update" ON storage.objects;
DROP POLICY IF EXISTS "org_logo_delete" ON storage.objects;

CREATE POLICY "org_logo_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'organization-logos');
CREATE POLICY "org_logo_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'organization-logos' AND auth.role() = 'authenticated');
CREATE POLICY "org_logo_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'organization-logos');
CREATE POLICY "org_logo_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'organization-logos');
