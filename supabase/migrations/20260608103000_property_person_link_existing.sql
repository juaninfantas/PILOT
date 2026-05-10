-- Vincular una persona ya existente del mismo tenant a una propiedad (pestaña Contacto).

CREATE OR REPLACE FUNCTION public.link_property_person_contact_existing(
  p_property_id uuid,
  p_person_id uuid,
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
  v_person_org uuid;
  v_contact_id uuid;
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

  SELECT organization_id INTO v_person_org
  FROM public."Person"
  WHERE id = p_person_id;
  IF v_person_org IS NULL OR v_person_org <> v_org THEN
    RAISE EXCEPTION 'person_not_in_org';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."PropertyPersonContact"
    WHERE property_id = p_property_id AND person_id = p_person_id
  ) THEN
    RAISE EXCEPTION 'already_linked';
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
    p_person_id,
    p_is_owner,
    p_is_family,
    CASE WHEN p_is_family THEN trim(p_family_relation) ELSE NULL END,
    p_is_guardian,
    p_is_broker
  )
  RETURNING id INTO v_contact_id;

  PERFORM public.sync_person_property_profiles(p_person_id);

  IF p_is_broker THEN
    INSERT INTO public."PersonProfile" (person_id, profile) VALUES (p_person_id, 'martillero')
    ON CONFLICT (person_id, profile) DO NOTHING;
    IF v_company IS NOT NULL THEN
      UPDATE public."Person"
      SET company = v_company
      WHERE id = p_person_id;
    END IF;
  END IF;

  RETURN v_contact_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_property_person_contact_existing(uuid, uuid, boolean, boolean, text, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_property_person_contact_existing(uuid, uuid, boolean, boolean, text, boolean, boolean, text) TO authenticated;
