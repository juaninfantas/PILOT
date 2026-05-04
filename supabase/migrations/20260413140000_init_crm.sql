-- Pilot CRM — schema + RLS + helpers (no Prisma)
-- Run with: supabase db push / migrate, or SQL editor

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
DO $$ BEGIN
  CREATE TYPE "PropertyKind" AS ENUM (
    'APARTMENT', 'HOUSE', 'QUINTA', 'LOT', 'GARAGE', 'COMMERCIAL', 'LAND', 'FIELD', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PriceKind" AS ENUM ('LISTING_PUBLIC', 'LISTING_RESERVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AppraisalSource" AS ENUM ('OWN', 'EXTERNAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN', 'WON', 'LOST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ActivityType" AS ENUM ('CALL', 'VISIT', 'NOTE', 'REMINDER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Core user profile (mirrors auth.users)
CREATE TABLE IF NOT EXISTS public."User" (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name text,
  email text,
  image text
);

-- RBAC
CREATE TABLE IF NOT EXISTS public."Group" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."Role" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."Permission" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."UserGroup" (
  user_id uuid NOT NULL REFERENCES public."User" (id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public."Group" (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS public."GroupRole" (
  group_id uuid NOT NULL REFERENCES public."Group" (id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public."Role" (id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, role_id)
);

CREATE TABLE IF NOT EXISTS public."RolePermission" (
  role_id uuid NOT NULL REFERENCES public."Role" (id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public."Permission" (id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- CRM
CREATE TABLE IF NOT EXISTS public."Property" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  city_zone text NOT NULL,
  address text,
  lat double precision,
  lng double precision,
  kind "PropertyKind" NOT NULL DEFAULT 'OTHER',
  covered_m2 double precision,
  total_m2 double precision,
  rooms integer,
  bathrooms integer,
  parking integer,
  condition text,
  description text,
  is_exclusive boolean NOT NULL DEFAULT false,
  management text,
  amenity_tags text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES public."User" (id)
);

CREATE TABLE IF NOT EXISTS public."PropertyPrice" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public."Property" (id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  kind "PriceKind" NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by_id uuid REFERENCES public."User" (id)
);

CREATE INDEX IF NOT EXISTS idx_property_price_prop ON public."PropertyPrice" (property_id, effective_at DESC);

CREATE TABLE IF NOT EXISTS public."Person" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  notes text,
  company text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."PersonProfile" (
  person_id uuid NOT NULL REFERENCES public."Person" (id) ON DELETE CASCADE,
  profile text NOT NULL,
  PRIMARY KEY (person_id, profile)
);

CREATE INDEX IF NOT EXISTS idx_person_profile ON public."PersonProfile" (profile);

CREATE TABLE IF NOT EXISTS public."PersonPreference" (
  person_id uuid PRIMARY KEY REFERENCES public."Person" (id) ON DELETE CASCADE,
  zones_json text,
  min_m2 double precision,
  max_price numeric,
  price_currency text NOT NULL DEFAULT 'USD',
  property_kinds_json text,
  feature_tags_json text
);

CREATE TABLE IF NOT EXISTS public."PropertyAppraisal" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public."Property" (id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  appraised_at timestamptz NOT NULL DEFAULT now(),
  source "AppraisalSource" NOT NULL DEFAULT 'OWN',
  appraiser_id uuid REFERENCES public."Person" (id),
  appraiser_name text,
  reference_note text
);

CREATE INDEX IF NOT EXISTS idx_property_appraisal ON public."PropertyAppraisal" (property_id, appraised_at DESC);

CREATE TABLE IF NOT EXISTS public."PropertyFile" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public."Property" (id) ON DELETE CASCADE,
  url text NOT NULL,
  mime_type text,
  kind text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_file ON public."PropertyFile" (property_id);

CREATE TABLE IF NOT EXISTS public."Opportunity" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public."Person" (id) ON DELETE CASCADE,
  title text,
  status "OpportunityStatus" NOT NULL DEFAULT 'OPEN',
  lost_reason text,
  estimated_value numeric,
  probability double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."OpportunityProperty" (
  opportunity_id uuid NOT NULL REFERENCES public."Opportunity" (id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public."Property" (id) ON DELETE CASCADE,
  match_score double precision,
  match_explain_json text,
  PRIMARY KEY (opportunity_id, property_id)
);

CREATE TABLE IF NOT EXISTS public."OpportunityActivity" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public."Opportunity" (id) ON DELETE CASCADE,
  type "ActivityType" NOT NULL,
  title text,
  notes text,
  due_at timestamptz,
  remind_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opp_activity ON public."OpportunityActivity" (opportunity_id, due_at);

CREATE TABLE IF NOT EXISTS public."AuditLog" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public."User" (id),
  entity text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  payload_json text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON public."AuditLog" (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public."AuditLog" (created_at DESC);

-- Sync User on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."User" (id, name, email, image)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    image = EXCLUDED.image;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Permissions helper (SECURITY DEFINER — bypasses RLS on RBAC tables)
CREATE OR REPLACE FUNCTION public.has_permission(p_slug text)
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
    WHERE ug.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT p.slug ORDER BY p.slug), ARRAY[]::text[])
  FROM public."UserGroup" ug
  JOIN public."GroupRole" gr ON gr.group_id = ug.group_id
  JOIN public."RolePermission" rp ON rp.role_id = gr.role_id
  JOIN public."Permission" p ON p.id = rp.permission_id
  WHERE ug.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;

-- RLS
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Group" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Permission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GroupRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PropertyPrice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PropertyAppraisal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PropertyFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Person" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PersonProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PersonPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Opportunity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OpportunityProperty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OpportunityActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users with granular permissions

-- User: read self; admins manage_users can read all
CREATE POLICY "user_select_self" ON public."User" FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_permission('manage_users'));
CREATE POLICY "user_update_self" ON public."User" FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- RBAC tables: readers with manage_* 
CREATE POLICY "group_select" ON public."Group" FOR SELECT TO authenticated
  USING (
    public.has_permission('manage_groups')
    OR public.has_permission('view_dashboard')
    OR public.has_permission('manage_users')
  );
CREATE POLICY "group_mutate" ON public."Group" FOR ALL TO authenticated
  USING (public.has_permission('manage_groups'))
  WITH CHECK (public.has_permission('manage_groups'));

CREATE POLICY "role_select" ON public."Role" FOR SELECT TO authenticated
  USING (public.has_permission('manage_roles') OR public.has_permission('view_dashboard'));
CREATE POLICY "role_mutate" ON public."Role" FOR ALL TO authenticated
  USING (public.has_permission('manage_roles'))
  WITH CHECK (public.has_permission('manage_roles'));

CREATE POLICY "perm_select" ON public."Permission" FOR SELECT TO authenticated
  USING (public.has_permission('manage_roles') OR public.has_permission('view_dashboard'));

CREATE POLICY "ug_select" ON public."UserGroup" FOR SELECT TO authenticated
  USING (public.has_permission('manage_users') OR public.has_permission('manage_groups') OR user_id = auth.uid());
CREATE POLICY "ug_mutate" ON public."UserGroup" FOR ALL TO authenticated
  USING (public.has_permission('manage_users'))
  WITH CHECK (public.has_permission('manage_users'));

CREATE POLICY "gr_select" ON public."GroupRole" FOR SELECT TO authenticated
  USING (public.has_permission('manage_groups') OR public.has_permission('manage_roles'));
CREATE POLICY "gr_mutate" ON public."GroupRole" FOR ALL TO authenticated
  USING (public.has_permission('manage_groups'))
  WITH CHECK (public.has_permission('manage_groups'));

CREATE POLICY "rp_select" ON public."RolePermission" FOR SELECT TO authenticated
  USING (public.has_permission('manage_roles'));
CREATE POLICY "rp_mutate" ON public."RolePermission" FOR ALL TO authenticated
  USING (public.has_permission('manage_roles'))
  WITH CHECK (public.has_permission('manage_roles'));

-- Property
CREATE POLICY "prop_select" ON public."Property" FOR SELECT TO authenticated
  USING (public.has_permission('view_properties'));
CREATE POLICY "prop_insert" ON public."Property" FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('manage_properties'));
CREATE POLICY "prop_update" ON public."Property" FOR UPDATE TO authenticated
  USING (public.has_permission('manage_properties'))
  WITH CHECK (public.has_permission('manage_properties'));
CREATE POLICY "prop_delete" ON public."Property" FOR DELETE TO authenticated
  USING (public.has_permission('manage_properties'));

CREATE POLICY "pp_select" ON public."PropertyPrice" FOR SELECT TO authenticated
  USING (public.has_permission('view_properties'));
CREATE POLICY "pp_mutate" ON public."PropertyPrice" FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('manage_properties'));

CREATE POLICY "pa_select" ON public."PropertyAppraisal" FOR SELECT TO authenticated
  USING (public.has_permission('view_properties'));
CREATE POLICY "pa_mutate" ON public."PropertyAppraisal" FOR ALL TO authenticated
  USING (public.has_permission('manage_properties'))
  WITH CHECK (public.has_permission('manage_properties'));

CREATE POLICY "pf_select" ON public."PropertyFile" FOR SELECT TO authenticated
  USING (public.has_permission('view_properties'));
CREATE POLICY "pf_mutate" ON public."PropertyFile" FOR ALL TO authenticated
  USING (public.has_permission('manage_properties'))
  WITH CHECK (public.has_permission('manage_properties'));

-- Person
CREATE POLICY "person_select" ON public."Person" FOR SELECT TO authenticated
  USING (public.has_permission('view_people'));
CREATE POLICY "person_mutate" ON public."Person" FOR ALL TO authenticated
  USING (public.has_permission('manage_people'))
  WITH CHECK (public.has_permission('manage_people'));

CREATE POLICY "pprof_select" ON public."PersonProfile" FOR SELECT TO authenticated
  USING (public.has_permission('view_people'));
CREATE POLICY "pprof_insert" ON public."PersonProfile" FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('manage_people'));
CREATE POLICY "pprof_update" ON public."PersonProfile" FOR UPDATE TO authenticated
  USING (public.has_permission('manage_people'))
  WITH CHECK (public.has_permission('manage_people'));
CREATE POLICY "pprof_delete" ON public."PersonProfile" FOR DELETE TO authenticated
  USING (public.has_permission('manage_people'));

CREATE POLICY "ppref_select" ON public."PersonPreference" FOR SELECT TO authenticated
  USING (public.has_permission('view_people'));
CREATE POLICY "ppref_mutate" ON public."PersonPreference" FOR ALL TO authenticated
  USING (public.has_permission('manage_people'))
  WITH CHECK (public.has_permission('manage_people'));

-- Opportunity
CREATE POLICY "opp_select" ON public."Opportunity" FOR SELECT TO authenticated
  USING (public.has_permission('view_opportunities'));
CREATE POLICY "opp_mutate" ON public."Opportunity" FOR ALL TO authenticated
  USING (public.has_permission('manage_opportunities'))
  WITH CHECK (public.has_permission('manage_opportunities'));

CREATE POLICY "oprop_select" ON public."OpportunityProperty" FOR SELECT TO authenticated
  USING (public.has_permission('view_opportunities'));
CREATE POLICY "oprop_mutate" ON public."OpportunityProperty" FOR ALL TO authenticated
  USING (public.has_permission('manage_opportunities'))
  WITH CHECK (public.has_permission('manage_opportunities'));

CREATE POLICY "oact_select" ON public."OpportunityActivity" FOR SELECT TO authenticated
  USING (public.has_permission('view_opportunities'));
CREATE POLICY "oact_mutate" ON public."OpportunityActivity" FOR ALL TO authenticated
  USING (public.has_permission('manage_opportunities'))
  WITH CHECK (public.has_permission('manage_opportunities'));

CREATE POLICY "audit_select" ON public."AuditLog" FOR SELECT TO authenticated
  USING (public.has_permission('manage_roles') OR public.has_permission('manage_users'));
CREATE POLICY "audit_insert" ON public."AuditLog" FOR INSERT TO authenticated
  WITH CHECK (true);

-- Storage bucket (run in SQL or dashboard)
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-files', 'property-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "storage_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'property-files');
CREATE POLICY "storage_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'property-files' AND auth.role() = 'authenticated');
CREATE POLICY "storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'property-files');
CREATE POLICY "storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'property-files');
