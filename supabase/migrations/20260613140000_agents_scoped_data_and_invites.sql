-- Agentes: rol CRM acotado por created_by_id, invitaciones con rol/persona, vínculo Person↔User (perfil agente).

-- ─── Rol y grupo agente ───
INSERT INTO public."Role" (name, slug, description)
VALUES ('Agente', 'agente', 'ABM de propiedades, personas y oportunidades propias')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public."Group" (name, slug, description)
VALUES ('Agentes', 'agentes', 'Usuarios agentes con datos acotados')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public."RolePermission" (role_id, permission_id)
SELECT r.id, p.id
FROM public."Role" r
JOIN public."Permission" p ON p.slug IN (
  'view_dashboard',
  'view_properties',
  'manage_properties',
  'view_people',
  'manage_people',
  'view_opportunities',
  'manage_opportunities',
  'view_reports'
)
WHERE r.slug = 'agente'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public."GroupRole" (group_id, role_id)
SELECT g.id, r.id
FROM public."Group" g
JOIN public."Role" r ON r.slug = 'agente'
WHERE g.slug = 'agentes'
ON CONFLICT (group_id, role_id) DO NOTHING;

-- ─── Autoría en Person y Opportunity ───
ALTER TABLE public."Person"
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES public."User" (id) ON DELETE SET NULL;

ALTER TABLE public."Opportunity"
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES public."User" (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_person_created_by ON public."Person" (organization_id, created_by_id)
  WHERE created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opp_created_by ON public."Opportunity" (organization_id, created_by_id)
  WHERE created_by_id IS NOT NULL;

COMMENT ON COLUMN public."Person".created_by_id IS 'Usuario que cargó la ficha; agentes solo ven las propias.';
COMMENT ON COLUMN public."Opportunity".created_by_id IS 'Usuario que creó la oportunidad; agentes solo ven las propias.';

-- ─── Invitaciones: rol destino y persona agente opcional ───
ALTER TABLE public."OrganizationInvite"
  ADD COLUMN IF NOT EXISTS target_access text NOT NULL DEFAULT 'agente',
  ADD COLUMN IF NOT EXISTS target_person_id uuid NULL REFERENCES public."Person" (id) ON DELETE SET NULL;

ALTER TABLE public."OrganizationInvite" DROP CONSTRAINT IF EXISTS organization_invite_target_access_ck;
ALTER TABLE public."OrganizationInvite"
  ADD CONSTRAINT organization_invite_target_access_ck
  CHECK (target_access IN ('admin', 'agente', 'consulta'));

COMMENT ON COLUMN public."OrganizationInvite".target_access IS 'Grupo asignado al consumir: admin, agente o consulta.';
COMMENT ON COLUMN public."OrganizationInvite".target_person_id IS 'Persona CRM (perfil agente) vinculada al usuario que consuma la invitación.';

-- ─── Helpers visibilidad CRM ───
CREATE OR REPLACE FUNCTION public.current_user_is_agent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."UserGroup" ug
    JOIN public."Group" g ON g.id = ug.group_id
    WHERE ug.user_id = auth.uid()
      AND g.slug = 'agentes'
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_agent() TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_record_visible(p_created_by_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_permission('manage_users')
    OR NOT public.current_user_is_agent()
    OR p_created_by_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.crm_record_visible(uuid) TO authenticated;

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
      SELECT id FROM public."Group" WHERE slug IN ('admins', 'agentes', 'consulta')
    );

  INSERT INTO public."UserGroup" (user_id, group_id) VALUES (p_user_id, v_group_id);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_org_access_group(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_org_access_group(uuid, text) TO authenticated;

-- ─── Auto created_by_id en altas CRM ───
CREATE OR REPLACE FUNCTION public.crm_set_created_by_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.created_by_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_property_created_by ON public."Property";
CREATE TRIGGER trg_property_created_by
  BEFORE INSERT ON public."Property"
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_created_by_id();

DROP TRIGGER IF EXISTS trg_person_created_by ON public."Person";
CREATE TRIGGER trg_person_created_by
  BEFORE INSERT ON public."Person"
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_created_by_id();

DROP TRIGGER IF EXISTS trg_opportunity_created_by ON public."Opportunity";
CREATE TRIGGER trg_opportunity_created_by
  BEFORE INSERT ON public."Opportunity"
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_created_by_id();

-- ─── Person↔User: solo perfil agente, 1:1 por org ───
-- Datos previos: varias Person pueden compartir linked_user_id; conservar una por par (org, user).
WITH ranked AS (
  SELECT
    p.id,
    ROW_NUMBER() OVER (
      PARTITION BY p.organization_id, p.linked_user_id
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1 FROM public."PersonProfile" pp
          WHERE pp.person_id = p.id AND pp.profile IN ('agente', 'referral')
        ) THEN 0 ELSE 1 END,
        p.created_at ASC,
        p.id ASC
    ) AS rn
  FROM public."Person" p
  WHERE p.linked_user_id IS NOT NULL
)
UPDATE public."Person" p
SET linked_user_id = NULL,
    updated_at = now()
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

DROP INDEX IF EXISTS uq_person_org_linked_user;
CREATE UNIQUE INDEX uq_person_org_linked_user
  ON public."Person" (organization_id, linked_user_id)
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

  IF NOT EXISTS (
    SELECT 1
    FROM public."PersonProfile" pp
    WHERE pp.person_id = NEW.id
      AND pp.profile IN ('agente', 'referral')
  ) THEN
    RAISE EXCEPTION 'person_linked_user_requires_agente_profile';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── RLS Property ───
DROP POLICY IF EXISTS "prop_select" ON public."Property";
DROP POLICY IF EXISTS "prop_insert" ON public."Property";
DROP POLICY IF EXISTS "prop_update" ON public."Property";
DROP POLICY IF EXISTS "prop_delete" ON public."Property";

CREATE POLICY "prop_select" ON public."Property" FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('view_properties')
    AND public.crm_record_visible(created_by_id)
  );

CREATE POLICY "prop_insert" ON public."Property" FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_properties')
    AND (
      public.has_permission('manage_users')
      OR created_by_id IS NULL
      OR created_by_id = auth.uid()
    )
  );

CREATE POLICY "prop_update" ON public."Property" FOR UPDATE TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_properties')
    AND public.crm_record_visible(created_by_id)
  )
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_properties')
    AND public.crm_record_visible(created_by_id)
  );

CREATE POLICY "prop_delete" ON public."Property" FOR DELETE TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_properties')
    AND public.crm_record_visible(created_by_id)
  );

-- ─── RLS PropertyPrice / Appraisal / File ───
DROP POLICY IF EXISTS "pp_select" ON public."PropertyPrice";
DROP POLICY IF EXISTS "pp_mutate_insert" ON public."PropertyPrice";
DROP POLICY IF EXISTS "pp_mutate_update" ON public."PropertyPrice";
DROP POLICY IF EXISTS "pp_mutate_delete" ON public."PropertyPrice";

CREATE POLICY "pp_select" ON public."PropertyPrice" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id
        AND p.organization_id = public.user_organization_id()
        AND public.crm_record_visible(p.created_by_id)
    )
  );

CREATE POLICY "pp_mutate_insert" ON public."PropertyPrice" FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id
        AND p.organization_id = public.user_organization_id()
        AND public.crm_record_visible(p.created_by_id)
    )
  );

CREATE POLICY "pp_mutate_update" ON public."PropertyPrice" FOR UPDATE TO authenticated
  USING (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id
        AND p.organization_id = public.user_organization_id()
        AND public.crm_record_visible(p.created_by_id)
    )
  )
  WITH CHECK (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id
        AND p.organization_id = public.user_organization_id()
        AND public.crm_record_visible(p.created_by_id)
    )
  );

CREATE POLICY "pp_mutate_delete" ON public."PropertyPrice" FOR DELETE TO authenticated
  USING (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id
        AND p.organization_id = public.user_organization_id()
        AND public.crm_record_visible(p.created_by_id)
    )
  );

DROP POLICY IF EXISTS "pa_select" ON public."PropertyAppraisal";
DROP POLICY IF EXISTS "pa_mutate" ON public."PropertyAppraisal";

CREATE POLICY "pa_select" ON public."PropertyAppraisal" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id
        AND p.organization_id = public.user_organization_id()
        AND public.crm_record_visible(p.created_by_id)
    )
  );

CREATE POLICY "pa_mutate" ON public."PropertyAppraisal" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id
        AND p.organization_id = public.user_organization_id()
        AND public.crm_record_visible(p.created_by_id)
    )
  )
  WITH CHECK (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id
        AND p.organization_id = public.user_organization_id()
        AND public.crm_record_visible(p.created_by_id)
    )
  );

DROP POLICY IF EXISTS "pf_select" ON public."PropertyFile";
DROP POLICY IF EXISTS "pf_mutate" ON public."PropertyFile";

CREATE POLICY "pf_select" ON public."PropertyFile" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id
        AND p.organization_id = public.user_organization_id()
        AND public.crm_record_visible(p.created_by_id)
    )
  );

CREATE POLICY "pf_mutate" ON public."PropertyFile" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id
        AND p.organization_id = public.user_organization_id()
        AND public.crm_record_visible(p.created_by_id)
    )
  )
  WITH CHECK (
    public.has_permission('manage_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id
        AND p.organization_id = public.user_organization_id()
        AND public.crm_record_visible(p.created_by_id)
    )
  );

DROP POLICY IF EXISTS "ppc_select" ON public."PropertyPersonContact";
CREATE POLICY "ppc_select" ON public."PropertyPersonContact" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id
        AND p.organization_id = public.user_organization_id()
        AND public.crm_record_visible(p.created_by_id)
    )
  );

-- ─── RLS Person ───
DROP POLICY IF EXISTS "person_select" ON public."Person";
DROP POLICY IF EXISTS "person_mutate" ON public."Person";

CREATE POLICY "person_select" ON public."Person" FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('view_people')
    AND public.crm_record_visible(created_by_id)
  );

CREATE POLICY "person_mutate" ON public."Person" FOR ALL TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_people')
    AND public.crm_record_visible(created_by_id)
  )
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_people')
    AND public.crm_record_visible(created_by_id)
  );

DROP POLICY IF EXISTS "pprof_select" ON public."PersonProfile";
DROP POLICY IF EXISTS "pprof_insert" ON public."PersonProfile";
DROP POLICY IF EXISTS "pprof_update" ON public."PersonProfile";
DROP POLICY IF EXISTS "pprof_delete" ON public."PersonProfile";

CREATE POLICY "pprof_select" ON public."PersonProfile" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per
      WHERE per.id = person_id
        AND per.organization_id = public.user_organization_id()
        AND public.crm_record_visible(per.created_by_id)
    )
  );

CREATE POLICY "pprof_insert" ON public."PersonProfile" FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('manage_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per
      WHERE per.id = person_id
        AND per.organization_id = public.user_organization_id()
        AND public.crm_record_visible(per.created_by_id)
    )
  );

CREATE POLICY "pprof_update" ON public."PersonProfile" FOR UPDATE TO authenticated
  USING (
    public.has_permission('manage_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per
      WHERE per.id = person_id
        AND per.organization_id = public.user_organization_id()
        AND public.crm_record_visible(per.created_by_id)
    )
  )
  WITH CHECK (
    public.has_permission('manage_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per
      WHERE per.id = person_id
        AND per.organization_id = public.user_organization_id()
        AND public.crm_record_visible(per.created_by_id)
    )
  );

CREATE POLICY "pprof_delete" ON public."PersonProfile" FOR DELETE TO authenticated
  USING (
    public.has_permission('manage_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per
      WHERE per.id = person_id
        AND per.organization_id = public.user_organization_id()
        AND public.crm_record_visible(per.created_by_id)
    )
  );

DROP POLICY IF EXISTS "ppref_select" ON public."PersonPreference";
DROP POLICY IF EXISTS "ppref_mutate" ON public."PersonPreference";

CREATE POLICY "ppref_select" ON public."PersonPreference" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per
      WHERE per.id = person_id
        AND per.organization_id = public.user_organization_id()
        AND public.crm_record_visible(per.created_by_id)
    )
  );

CREATE POLICY "ppref_mutate" ON public."PersonPreference" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per
      WHERE per.id = person_id
        AND per.organization_id = public.user_organization_id()
        AND public.crm_record_visible(per.created_by_id)
    )
  )
  WITH CHECK (
    public.has_permission('manage_people')
    AND EXISTS (
      SELECT 1 FROM public."Person" per
      WHERE per.id = person_id
        AND per.organization_id = public.user_organization_id()
        AND public.crm_record_visible(per.created_by_id)
    )
  );

-- ─── RLS Opportunity ───
DROP POLICY IF EXISTS "opp_select" ON public."Opportunity";
DROP POLICY IF EXISTS "opp_mutate" ON public."Opportunity";

CREATE POLICY "opp_select" ON public."Opportunity" FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('view_opportunities')
    AND public.crm_record_visible(created_by_id)
  );

CREATE POLICY "opp_mutate" ON public."Opportunity" FOR ALL TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_opportunities')
    AND public.crm_record_visible(created_by_id)
  )
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_opportunities')
    AND public.crm_record_visible(created_by_id)
  );

DROP POLICY IF EXISTS "oprop_select" ON public."OpportunityProperty";
DROP POLICY IF EXISTS "oprop_mutate" ON public."OpportunityProperty";

CREATE POLICY "oprop_select" ON public."OpportunityProperty" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o
      WHERE o.id = opportunity_id
        AND o.organization_id = public.user_organization_id()
        AND public.crm_record_visible(o.created_by_id)
    )
  );

CREATE POLICY "oprop_mutate" ON public."OpportunityProperty" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o
      WHERE o.id = opportunity_id
        AND o.organization_id = public.user_organization_id()
        AND public.crm_record_visible(o.created_by_id)
    )
  )
  WITH CHECK (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o
      WHERE o.id = opportunity_id
        AND o.organization_id = public.user_organization_id()
        AND public.crm_record_visible(o.created_by_id)
    )
  );

DROP POLICY IF EXISTS "oact_select" ON public."OpportunityActivity";
DROP POLICY IF EXISTS "oact_mutate" ON public."OpportunityActivity";

CREATE POLICY "oact_select" ON public."OpportunityActivity" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o
      WHERE o.id = opportunity_id
        AND o.organization_id = public.user_organization_id()
        AND public.crm_record_visible(o.created_by_id)
    )
  );

CREATE POLICY "oact_mutate" ON public."OpportunityActivity" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o
      WHERE o.id = opportunity_id
        AND o.organization_id = public.user_organization_id()
        AND public.crm_record_visible(o.created_by_id)
    )
  )
  WITH CHECK (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o
      WHERE o.id = opportunity_id
        AND o.organization_id = public.user_organization_id()
        AND public.crm_record_visible(o.created_by_id)
    )
  );

-- ─── Invitación: generar con rol y persona ───
DROP FUNCTION IF EXISTS public.generate_organization_invite();

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

GRANT EXECUTE ON FUNCTION public.generate_organization_invite(text, uuid) TO authenticated;

-- ─── Alta por invitación: consumo único, rol y vínculo persona ───
CREATE OR REPLACE FUNCTION public.attach_organization_membership(p_slug text, p_invite text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public."Organization"%ROWTYPE;
  v_inv public."OrganizationInvite"%ROWTYPE;
  v_n int;
  v_access text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF EXISTS (SELECT 1 FROM public."OrganizationMembership" WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'El usuario ya tiene una inmobiliaria asignada';
  END IF;

  SELECT * INTO v_org FROM public."Organization" o WHERE o.slug = lower(trim(p_slug));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inmobiliaria no encontrada';
  END IF;

  SELECT iv.* INTO v_inv
  FROM public."OrganizationInvite" iv
  WHERE iv.organization_id = v_org.id
    AND lower(trim(iv.code)) = lower(trim(p_invite))
    AND iv.used_at IS NULL
    AND iv.revoked_at IS NULL
    AND iv.expires_at > now()
  FOR UPDATE;

  IF FOUND THEN
    v_access := COALESCE(v_inv.target_access, 'agente');

    INSERT INTO public."OrganizationMembership" (user_id, organization_id, is_active)
    VALUES (v_uid, v_org.id, true);

    PERFORM public.assign_org_access_group(v_uid, v_access);

    IF v_inv.target_person_id IS NOT NULL THEN
      UPDATE public."Person"
      SET linked_user_id = v_uid,
          updated_at = now()
      WHERE id = v_inv.target_person_id
        AND organization_id = v_org.id
        AND linked_user_id IS NULL;
    END IF;

    UPDATE public."OrganizationInvite"
    SET used_at = now(),
        used_by_user_id = v_uid
    WHERE id = v_inv.id AND used_at IS NULL AND revoked_at IS NULL;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Código de invitación ya utilizado';
    END IF;

    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."OrganizationInvite" iv
    WHERE iv.organization_id = v_org.id
      AND iv.used_at IS NULL
      AND iv.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Código de invitación inválido o caducado';
  END IF;

  IF trim(p_invite) IS DISTINCT FROM trim(v_org.signup_invite_code) THEN
    RAISE EXCEPTION 'Código de invitación inválido';
  END IF;

  INSERT INTO public."OrganizationMembership" (user_id, organization_id, is_active)
  VALUES (v_uid, v_org.id, true);

  PERFORM public.assign_org_access_group(v_uid, 'admin');
END;
$$;

-- ─── Gestión de equipo (admin inmobiliaria) ───
CREATE OR REPLACE FUNCTION public.list_org_members()
RETURNS TABLE (
  user_id uuid,
  email text,
  name text,
  is_active boolean,
  access_group_slug text,
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
    COALESCE(
      (
        SELECT g.slug
        FROM public."UserGroup" ug2
        JOIN public."Group" g ON g.id = ug2.group_id
        WHERE ug2.user_id = m.user_id
          AND g.slug IN ('admins', 'agentes', 'consulta')
        ORDER BY CASE g.slug WHEN 'admins' THEN 1 WHEN 'agentes' THEN 2 ELSE 3 END
        LIMIT 1
      ),
      '—'
    ) AS access_group_slug,
    lp.id AS linked_person_id,
    lp.name AS linked_person_name
  FROM public."OrganizationMembership" m
  JOIN public."User" u ON u.id = m.user_id
  LEFT JOIN LATERAL (
    SELECT p.id, p.name
    FROM public."Person" p
    WHERE p.linked_user_id = m.user_id
      AND p.organization_id = m.organization_id
    LIMIT 1
  ) lp ON true
  WHERE m.organization_id = public.user_organization_id()
    AND public.has_permission('manage_users')
  ORDER BY u.email NULLS LAST, u.name NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.list_org_members() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_org_agent_persons_unlinked()
RETURNS TABLE (id uuid, name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT per.id, per.name, per.email
  FROM public."Person" per
  WHERE per.organization_id = public.user_organization_id()
    AND per.linked_user_id IS NULL
    AND public.has_permission('manage_users')
    AND EXISTS (
      SELECT 1 FROM public."PersonProfile" pp
      WHERE pp.person_id = per.id AND pp.profile IN ('agente', 'referral')
    )
  ORDER BY per.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_org_agent_persons_unlinked() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_org_member_active(p_user_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('manage_users') THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No podés desactivarte a vos mismo';
  END IF;

  UPDATE public."OrganizationMembership" m
  SET is_active = p_is_active
  WHERE m.organization_id = public.user_organization_id()
    AND m.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membresía no encontrada';
  END IF;

  IF NOT p_is_active THEN
    UPDATE public."Person" p
    SET linked_user_id = NULL, updated_at = now()
    WHERE p.linked_user_id = p_user_id
      AND p.organization_id = public.user_organization_id();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_org_member_active(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_org_member_access(p_user_id uuid, p_access text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('manage_users') THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No podés cambiar tu propio acceso';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."OrganizationMembership" m
    WHERE m.organization_id = public.user_organization_id()
      AND m.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Membresía no encontrada';
  END IF;

  PERFORM public.assign_org_access_group(p_user_id, p_access);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_org_member_access(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_org_person_to_user(p_person_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oid uuid := public.user_organization_id();
BEGIN
  IF NOT public.has_permission('manage_users') THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;

  IF p_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."OrganizationMembership" m
    WHERE m.user_id = p_user_id AND m.organization_id = v_oid AND COALESCE(m.is_active, true)
  ) THEN
    RAISE EXCEPTION 'Usuario no es miembro activo de la inmobiliaria';
  END IF;

  IF p_user_id IS NOT NULL THEN
    UPDATE public."Person"
    SET linked_user_id = NULL, updated_at = now()
    WHERE organization_id = v_oid AND linked_user_id = p_user_id AND id <> p_person_id;
  END IF;

  UPDATE public."Person"
  SET linked_user_id = p_user_id, updated_at = now()
  WHERE id = p_person_id AND organization_id = v_oid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona no encontrada';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_org_person_to_user(uuid, uuid) TO authenticated;

-- ─── Staff: incluir grupo agentes ───
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
          AND g.slug IN ('admins', 'agentes', 'consulta')
        ORDER BY CASE g.slug WHEN 'admins' THEN 1 WHEN 'agentes' THEN 2 ELSE 3 END
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

CREATE OR REPLACE FUNCTION public.staff_set_tenant_member_access(
  p_organization_id uuid,
  p_user_id uuid,
  p_access text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_staff();
  IF NOT EXISTS (
    SELECT 1 FROM public."OrganizationMembership" m
    WHERE m.organization_id = p_organization_id AND m.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Membresía no encontrada';
  END IF;

  PERFORM public.assign_org_access_group(p_user_id, p_access);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_attach_user_to_tenant(
  p_user_id uuid,
  p_organization_id uuid,
  p_access text DEFAULT 'admin'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_staff();

  DELETE FROM public."OrganizationMembership" WHERE user_id = p_user_id;

  INSERT INTO public."OrganizationMembership" (user_id, organization_id, is_active)
  VALUES (p_user_id, p_organization_id, true);

  PERFORM public.assign_org_access_group(p_user_id, COALESCE(NULLIF(trim(p_access), ''), 'admin'));
END;
$$;
