-- Personas vinculadas a una propiedad (dueño/familiar/tutor) + perfiles en PersonProfile (propiedad_*)

CREATE TABLE IF NOT EXISTS public."PropertyPersonContact" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public."Property" (id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public."Person" (id) ON DELETE CASCADE,
  is_owner boolean NOT NULL DEFAULT false,
  is_family boolean NOT NULL DEFAULT false,
  family_relation text,
  is_guardian boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, person_id),
  CONSTRAINT property_person_contact_one_role CHECK (is_owner OR is_family OR is_guardian),
  CONSTRAINT property_person_contact_relation_family CHECK (
    (NOT is_family AND family_relation IS NULL)
    OR (is_family AND family_relation IS NOT NULL AND trim(family_relation) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_property_person_contact_prop ON public."PropertyPersonContact" (property_id);
CREATE INDEX IF NOT EXISTS idx_property_person_contact_person ON public."PropertyPersonContact" (person_id);

CREATE OR REPLACE FUNCTION public.property_person_contact_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_person_contact_updated_at ON public."PropertyPersonContact";
CREATE TRIGGER property_person_contact_updated_at
  BEFORE INSERT OR UPDATE ON public."PropertyPersonContact"
  FOR EACH ROW EXECUTE FUNCTION public.property_person_contact_touch_updated_at();

CREATE OR REPLACE FUNCTION public.property_person_contact_same_org()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  vo uuid;
  peo uuid;
BEGIN
  SELECT organization_id INTO vo FROM public."Property" WHERE id = NEW.property_id;
  SELECT organization_id INTO peo FROM public."Person" WHERE id = NEW.person_id;
  IF vo IS DISTINCT FROM peo OR vo IS NULL THEN
    RAISE EXCEPTION 'person_property_org_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_person_contact_org_chk ON public."PropertyPersonContact";
CREATE TRIGGER property_person_contact_org_chk
  BEFORE INSERT OR UPDATE OF property_id, person_id ON public."PropertyPersonContact"
  FOR EACH ROW EXECUTE FUNCTION public.property_person_contact_same_org();

ALTER TABLE public."PropertyPersonContact" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ppc_select" ON public."PropertyPersonContact";
CREATE POLICY "ppc_select" ON public."PropertyPersonContact" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_properties')
    AND EXISTS (
      SELECT 1 FROM public."Property" p
      WHERE p.id = property_id AND p.organization_id = public.user_organization_id()
    )
  );

CREATE OR REPLACE FUNCTION public.sync_person_property_profiles(p_person_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vo boolean;
  vf boolean;
  vg boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Person" per
    WHERE per.id = p_person_id AND per.organization_id = public.user_organization_id()
    AND (
      public.has_permission('manage_properties')
      OR public.has_permission('manage_people')
    )
  ) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  SELECT
    COALESCE((SELECT bool_or(is_owner) FROM public."PropertyPersonContact" WHERE person_id = p_person_id), false),
    COALESCE((SELECT bool_or(is_family) FROM public."PropertyPersonContact" WHERE person_id = p_person_id), false),
    COALESCE((SELECT bool_or(is_guardian) FROM public."PropertyPersonContact" WHERE person_id = p_person_id), false)
  INTO vo, vf, vg;

  IF vo THEN
    INSERT INTO public."PersonProfile" (person_id, profile) VALUES (p_person_id, 'propiedad_dueno')
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public."PersonProfile"
    WHERE person_id = p_person_id AND profile = 'propiedad_dueno';
  END IF;

  IF vf THEN
    INSERT INTO public."PersonProfile" (person_id, profile) VALUES (p_person_id, 'propiedad_familiar')
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public."PersonProfile"
    WHERE person_id = p_person_id AND profile = 'propiedad_familiar';
  END IF;

  IF vg THEN
    INSERT INTO public."PersonProfile" (person_id, profile) VALUES (p_person_id, 'propiedad_tutor')
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public."PersonProfile"
    WHERE person_id = p_person_id AND profile = 'propiedad_tutor';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_person_property_profiles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_person_property_profiles(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_property_person_contact(
  p_property_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_owner boolean DEFAULT false,
  p_is_family boolean DEFAULT false,
  p_family_relation text DEFAULT NULL,
  p_is_guardian boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_person_id uuid;
  vn text := trim(coalesce(p_name, ''));
  ve text := nullif(trim(coalesce(p_email, '')), '');
  vt text := nullif(trim(coalesce(p_phone, '')), '');
  vnotes text := nullif(trim(coalesce(p_notes, '')), '');
BEGIN
  IF NOT public.has_permission('manage_properties') THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  SELECT organization_id INTO v_org
  FROM public."Property"
  WHERE id = p_property_id AND organization_id = public.user_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'property_not_found';
  END IF;

  IF vn = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  IF NOT (p_is_owner OR p_is_family OR p_is_guardian) THEN
    RAISE EXCEPTION 'role_required';
  END IF;

  IF p_is_family AND trim(coalesce(p_family_relation, '')) = '' THEN
    RAISE EXCEPTION 'relation_required_when_family';
  END IF;

  INSERT INTO public."Person" (organization_id, name, email, phone, notes)
  VALUES (v_org, vn, ve, vt, vnotes)
  RETURNING id INTO v_person_id;

  INSERT INTO public."PersonPreference" (person_id) VALUES (v_person_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public."PropertyPersonContact" (
    property_id,
    person_id,
    is_owner,
    is_family,
    family_relation,
    is_guardian
  ) VALUES (
    p_property_id,
    v_person_id,
    p_is_owner,
    p_is_family,
    CASE WHEN p_is_family THEN trim(p_family_relation) ELSE NULL END,
    p_is_guardian
  );

  PERFORM public.sync_person_property_profiles(v_person_id);

  RETURN v_person_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_property_person_contact(uuid, text, text, text, text, boolean, boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_property_person_contact(uuid, text, text, text, text, boolean, boolean, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_property_person_contact(
  p_contact_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_owner boolean DEFAULT false,
  p_is_family boolean DEFAULT false,
  p_family_relation text DEFAULT NULL,
  p_is_guardian boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vn text := trim(coalesce(p_name, ''));
  ve text := nullif(trim(coalesce(p_email, '')), '');
  vt text := nullif(trim(coalesce(p_phone, '')), '');
  vnotes text := nullif(trim(coalesce(p_notes, '')), '');
  v_person_id uuid;
BEGIN
  IF NOT public.has_permission('manage_properties') THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  SELECT pc.person_id INTO v_person_id
  FROM public."PropertyPersonContact" pc
  JOIN public."Property" pr ON pr.id = pc.property_id
  WHERE pc.id = p_contact_id
    AND pr.organization_id = public.user_organization_id();

  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'contact_not_found';
  END IF;

  IF vn = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  IF NOT (p_is_owner OR p_is_family OR p_is_guardian) THEN
    RAISE EXCEPTION 'role_required';
  END IF;

  IF p_is_family AND trim(coalesce(p_family_relation, '')) = '' THEN
    RAISE EXCEPTION 'relation_required_when_family';
  END IF;

  UPDATE public."Person"
  SET name = vn, email = ve, phone = vt, notes = vnotes
  WHERE id = v_person_id;

  UPDATE public."PropertyPersonContact"
  SET is_owner = p_is_owner,
      is_family = p_is_family,
      family_relation = CASE WHEN p_is_family THEN trim(p_family_relation) ELSE NULL END,
      is_guardian = p_is_guardian
  WHERE id = p_contact_id;

  PERFORM public.sync_person_property_profiles(v_person_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_property_person_contact(uuid, text, text, text, text, boolean, boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_property_person_contact(uuid, text, text, text, text, boolean, boolean, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_property_person_contact(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF NOT public.has_permission('manage_properties') THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  SELECT pc.person_id INTO v_person_id
  FROM public."PropertyPersonContact" pc
  JOIN public."Property" pr ON pr.id = pc.property_id
  WHERE pc.id = p_contact_id
    AND pr.organization_id = public.user_organization_id();

  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'contact_not_found';
  END IF;

  DELETE FROM public."PropertyPersonContact" WHERE id = p_contact_id;
  PERFORM public.sync_person_property_profiles(v_person_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_property_person_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_property_person_contact(uuid) TO authenticated;

GRANT SELECT ON public."PropertyPersonContact" TO authenticated;

COMMENT ON TABLE public."PropertyPersonContact" IS 'Vincula personas a una propiedad con roles propietario/familiar/tutor; sincroniza perfiles PersonProfile propiedad_*';
