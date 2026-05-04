-- Rol inmobiliaria/martillero en contacto de propiedad + perfil CRM "martillero" (campo empresa como empresa).

ALTER TABLE public."PropertyPersonContact"
  ADD COLUMN IF NOT EXISTS is_broker boolean NOT NULL DEFAULT false;

ALTER TABLE public."PropertyPersonContact" DROP CONSTRAINT IF EXISTS property_person_contact_one_role;
ALTER TABLE public."PropertyPersonContact" ADD CONSTRAINT property_person_contact_exactly_one_role CHECK (
  (CASE WHEN is_owner THEN 1 ELSE 0 END)
  + (CASE WHEN is_family THEN 1 ELSE 0 END)
  + (CASE WHEN is_guardian THEN 1 ELSE 0 END)
  + (CASE WHEN is_broker THEN 1 ELSE 0 END) = 1
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
  vb boolean;
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
    COALESCE((SELECT bool_or(is_guardian) FROM public."PropertyPersonContact" WHERE person_id = p_person_id), false),
    COALESCE((SELECT bool_or(is_broker) FROM public."PropertyPersonContact" WHERE person_id = p_person_id), false)
  INTO vo, vf, vg, vb;

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

  IF vb THEN
    INSERT INTO public."PersonProfile" (person_id, profile) VALUES (p_person_id, 'propiedad_martillero')
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public."PersonProfile"
    WHERE person_id = p_person_id AND profile = 'propiedad_martillero';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.create_property_person_contact(uuid, text, text, text, text, boolean, boolean, text, boolean);

CREATE OR REPLACE FUNCTION public.create_property_person_contact(
  p_property_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_owner boolean DEFAULT false,
  p_is_family boolean DEFAULT false,
  p_family_relation text DEFAULT NULL,
  p_is_guardian boolean DEFAULT false,
  p_is_broker boolean DEFAULT false,
  p_company text DEFAULT NULL
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
  v_company text;
  v_roles int;
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

  v_roles :=
    (CASE WHEN p_is_owner THEN 1 ELSE 0 END)
    + (CASE WHEN p_is_family THEN 1 ELSE 0 END)
    + (CASE WHEN p_is_guardian THEN 1 ELSE 0 END)
    + (CASE WHEN p_is_broker THEN 1 ELSE 0 END);
  IF v_roles <> 1 THEN
    RAISE EXCEPTION 'role_required';
  END IF;

  IF p_is_family AND trim(coalesce(p_family_relation, '')) = '' THEN
    RAISE EXCEPTION 'relation_required_when_family';
  END IF;

  v_company := CASE
    WHEN p_is_broker THEN nullif(trim(coalesce(p_company, '')), '')
    ELSE NULL
  END;

  INSERT INTO public."Person" (organization_id, name, email, phone, notes, company)
  VALUES (v_org, vn, ve, vt, vnotes, v_company)
  RETURNING id INTO v_person_id;

  INSERT INTO public."PersonPreference" (person_id) VALUES (v_person_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public."PropertyPersonContact" (
    property_id,
    person_id,
    is_owner,
    is_family,
    family_relation,
    is_guardian,
    is_broker
  ) VALUES (
    p_property_id,
    v_person_id,
    p_is_owner,
    p_is_family,
    CASE WHEN p_is_family THEN trim(p_family_relation) ELSE NULL END,
    p_is_guardian,
    p_is_broker
  );

  PERFORM public.sync_person_property_profiles(v_person_id);

  IF p_is_broker THEN
    INSERT INTO public."PersonProfile" (person_id, profile) VALUES (v_person_id, 'martillero')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_person_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_property_person_contact(uuid, text, text, text, text, boolean, boolean, text, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_property_person_contact(uuid, text, text, text, text, boolean, boolean, text, boolean, boolean, text) TO authenticated;

DROP FUNCTION IF EXISTS public.update_property_person_contact(uuid, text, text, text, text, boolean, boolean, text, boolean);

CREATE OR REPLACE FUNCTION public.update_property_person_contact(
  p_contact_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_owner boolean DEFAULT false,
  p_is_family boolean DEFAULT false,
  p_family_relation text DEFAULT NULL,
  p_is_guardian boolean DEFAULT false,
  p_is_broker boolean DEFAULT false,
  p_company text DEFAULT NULL
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
  v_roles int;
  v_company text;
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

  v_roles :=
    (CASE WHEN p_is_owner THEN 1 ELSE 0 END)
    + (CASE WHEN p_is_family THEN 1 ELSE 0 END)
    + (CASE WHEN p_is_guardian THEN 1 ELSE 0 END)
    + (CASE WHEN p_is_broker THEN 1 ELSE 0 END);
  IF v_roles <> 1 THEN
    RAISE EXCEPTION 'role_required';
  END IF;

  IF p_is_family AND trim(coalesce(p_family_relation, '')) = '' THEN
    RAISE EXCEPTION 'relation_required_when_family';
  END IF;

  v_company := CASE
    WHEN p_is_broker THEN nullif(trim(coalesce(p_company, '')), '')
    ELSE NULL
  END;

  UPDATE public."Person"
  SET
    name = vn,
    email = ve,
    phone = vt,
    notes = vnotes,
    company = CASE WHEN p_is_broker THEN v_company ELSE public."Person".company END
  WHERE id = v_person_id;

  UPDATE public."PropertyPersonContact"
  SET is_owner = p_is_owner,
      is_family = p_is_family,
      family_relation = CASE WHEN p_is_family THEN trim(p_family_relation) ELSE NULL END,
      is_guardian = p_is_guardian,
      is_broker = p_is_broker
  WHERE id = p_contact_id;

  PERFORM public.sync_person_property_profiles(v_person_id);

  IF p_is_broker THEN
    INSERT INTO public."PersonProfile" (person_id, profile) VALUES (v_person_id, 'martillero')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_property_person_contact(uuid, text, text, text, text, boolean, boolean, text, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_property_person_contact(uuid, text, text, text, text, boolean, boolean, text, boolean, boolean, text) TO authenticated;

COMMENT ON TABLE public."PropertyPersonContact" IS 'Vincula personas a una propiedad: propietario, familiar, tutor o martillero/inmobiliaria; sincroniza PersonProfile propiedad_*';
