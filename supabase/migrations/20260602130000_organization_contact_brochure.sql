-- Teléfono y matrícula para membrete (fichas / PDF); dirección visible en PDF usa domicilio fiscal existente.
ALTER TABLE public."Organization"
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS broker_matricula text;

COMMENT ON COLUMN public."Organization".contact_phone IS 'Teléfono de contacto (público / brochure)';
COMMENT ON COLUMN public."Organization".broker_matricula IS 'Número de matrícula o registro profesional';

DROP FUNCTION IF EXISTS public.get_my_organization ();

CREATE OR REPLACE FUNCTION public.get_my_organization ()
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
  contact_phone text,
  broker_matricula text,
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
    o.contact_phone,
    o.broker_matricula,
    o.subscription_tier,
    o.subscription_expires_at
  FROM public."Organization" o
  WHERE o.id = public.user_organization_id ()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organization () TO authenticated;

DROP FUNCTION IF EXISTS public.update_my_organization_profile (text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.update_my_organization_profile (
  p_display_name text,
  p_logo_url text,
  p_fiscal_legal_name text,
  p_fiscal_address text,
  p_fiscal_cuit text,
  p_fiscal_iva_condition text,
  p_contact_phone text,
  p_broker_matricula text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oid uuid := public.user_organization_id ();
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Sin organización';
  END IF;
  IF NOT public.has_permission ('manage_users') THEN
    RAISE EXCEPTION 'Sin permisos para editar datos de la inmobiliaria';
  END IF;
  UPDATE public."Organization"
  SET
    display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
    logo_url = COALESCE(NULLIF(trim(p_logo_url), ''), logo_url),
    fiscal_legal_name = COALESCE(NULLIF(trim(p_fiscal_legal_name), ''), fiscal_legal_name),
    fiscal_address = COALESCE(NULLIF(trim(p_fiscal_address), ''), fiscal_address),
    fiscal_cuit = COALESCE(NULLIF(trim(p_fiscal_cuit), ''), fiscal_cuit),
    fiscal_iva_condition = COALESCE(NULLIF(trim(p_fiscal_iva_condition), ''), fiscal_iva_condition),
    contact_phone = COALESCE(NULLIF(trim(p_contact_phone), ''), contact_phone),
    broker_matricula = COALESCE(NULLIF(trim(p_broker_matricula), ''), broker_matricula),
    updated_at = now ()
  WHERE id = v_oid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_organization_profile (text, text, text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_property_via_share_token (p_token_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid;
  v_row RECORD;
  v_prop RECORD;
  v_org_name text;
  v_org_logo text;
  v_org_fiscal_address text;
  v_org_phone text;
  v_org_matricula text;
  v_price_amt text;
  v_price_cur text;
  v_photos jsonb;
BEGIN
  BEGIN
    v_token := p_token_text::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object ('error', 'invalid_token');
  END;

  SELECT s.property_id,
    s.organization_id
  INTO v_row
  FROM public."PropertyPublicShare" s
  WHERE s.token_uuid = v_token
    AND s.revoked_at IS NULL
    AND s.expires_at > now ();

  IF NOT FOUND THEN
    RETURN jsonb_build_object ('error', 'expired_or_invalid');
  END IF;

  SELECT pr.*
  INTO v_prop
  FROM public."Property" pr
  WHERE pr.id = v_row.property_id
    AND pr.organization_id = v_row.organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object ('error', 'not_found');
  END IF;

  SELECT og.display_name,
    og.logo_url,
    og.fiscal_address,
    og.contact_phone,
    og.broker_matricula
  INTO v_org_name,
    v_org_logo,
    v_org_fiscal_address,
    v_org_phone,
    v_org_matricula
  FROM public."Organization" og
  WHERE og.id = v_row.organization_id;

  SELECT pq.amount::text,
    pq.currency
  INTO v_price_amt,
    v_price_cur
  FROM public."PropertyPrice" pq
  WHERE pq.property_id = v_prop.id
    AND pq.kind = 'LISTING_PUBLIC'
  ORDER BY pq.amount DESC NULLS LAST,
    pq.effective_at DESC
  LIMIT 1;

  SELECT COALESCE(
    (
      SELECT jsonb_agg (t.url ORDER BY t.ord, t.created_at)
      FROM (
        SELECT url,
          created_at,
          CASE kind WHEN 'cover' THEN 1 ELSE 2 END AS ord
        FROM public."PropertyFile"
        WHERE property_id = v_prop.id
          AND kind IN ('cover', 'photo')
          AND (mime_type IS NULL OR mime_type LIKE 'image%')
      ) t
    ),
    '[]'::jsonb
  )
  INTO v_photos;

  RETURN jsonb_build_object (
    'property',
    jsonb_build_object (
      'id', v_prop.id,
      'title', v_prop.title,
      'city_zone', v_prop.city_zone,
      'address', v_prop.address,
      'kind', v_prop.kind,
      'covered_m2', v_prop.covered_m2,
      'total_m2', v_prop.total_m2,
      'rooms', v_prop.rooms,
      'bathrooms', v_prop.bathrooms,
      'parking', v_prop.parking,
      'condition', v_prop.condition,
      'listing_status', v_prop.listing_status,
      'description', v_prop.description,
      'amenity_tags', v_prop.amenity_tags,
      'is_exclusive', v_prop.is_exclusive
    ),
    'organization',
    jsonb_build_object (
      'display_name', COALESCE(v_org_name, ''),
      'logo_url', v_org_logo,
      'fiscal_address', v_org_fiscal_address,
      'contact_phone', v_org_phone,
      'broker_matricula', v_org_matricula
    ),
    'public_price',
    CASE WHEN v_price_amt IS NULL THEN
      NULL::jsonb
    ELSE jsonb_build_object (
      'amount', v_price_amt,
      'currency', COALESCE(v_price_cur, 'USD')
    )
    END,
    'photos', COALESCE(v_photos, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_property_via_share_token (text) FROM public;
GRANT EXECUTE ON FUNCTION public.fetch_property_via_share_token (text) TO anon;
GRANT EXECUTE ON FUNCTION public.fetch_property_via_share_token (text) TO authenticated;
