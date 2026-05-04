-- Formatos de compartir (visibilidad por campo) + vínculo en token público.

CREATE TABLE IF NOT EXISTS public."PropertyShareFormat" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public."Organization" (id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  show_org_logo boolean NOT NULL DEFAULT true,
  show_org_name boolean NOT NULL DEFAULT true,
  show_org_fiscal_address boolean NOT NULL DEFAULT true,
  show_org_contact boolean NOT NULL DEFAULT true,
  show_property_title boolean NOT NULL DEFAULT true,
  show_city_zone boolean NOT NULL DEFAULT true,
  show_street_address boolean NOT NULL DEFAULT true,
  show_price boolean NOT NULL DEFAULT true,
  show_specs boolean NOT NULL DEFAULT true,
  show_description boolean NOT NULL DEFAULT true,
  show_photos boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_share_format_org ON public."PropertyShareFormat" (organization_id, sort_order);

CREATE OR REPLACE FUNCTION public.property_share_format_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_share_format_updated_at ON public."PropertyShareFormat";
CREATE TRIGGER property_share_format_updated_at
  BEFORE INSERT OR UPDATE ON public."PropertyShareFormat"
  FOR EACH ROW EXECUTE FUNCTION public.property_share_format_touch_updated_at();

ALTER TABLE public."PropertyShareFormat" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "psf_select" ON public."PropertyShareFormat";
CREATE POLICY "psf_select" ON public."PropertyShareFormat" FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('view_properties')
  );

DROP POLICY IF EXISTS "psf_write" ON public."PropertyShareFormat";
CREATE POLICY "psf_write" ON public."PropertyShareFormat" FOR ALL TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND (
      public.has_permission('manage_users')
      OR public.has_permission('manage_properties')
    )
  )
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND (
      public.has_permission('manage_users')
      OR public.has_permission('manage_properties')
    )
  );

INSERT INTO public."PropertyShareFormat" (
  organization_id, name, sort_order,
  show_org_logo, show_org_name, show_org_fiscal_address, show_org_contact,
  show_property_title, show_city_zone, show_street_address, show_price, show_specs, show_description, show_photos
)
SELECT
  o.id,
  'Completa',
  0,
  true, true, true, true,
  true, true, true, true, true, true, true
FROM public."Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM public."PropertyShareFormat" f WHERE f.organization_id = o.id
);

INSERT INTO public."PropertyShareFormat" (
  organization_id, name, sort_order,
  show_org_logo, show_org_name, show_org_fiscal_address, show_org_contact,
  show_property_title, show_city_zone, show_street_address, show_price, show_specs, show_description, show_photos
)
SELECT
  o.id,
  'Reducida (sin dirección ni fotos)',
  1,
  true, true, false, true,
  true, true, false, true, true, true, false
FROM public."Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM public."PropertyShareFormat" f2
  WHERE f2.organization_id = o.id AND f2.sort_order = 1
);

ALTER TABLE public."PropertyPublicShare"
  ADD COLUMN IF NOT EXISTS share_format_id uuid REFERENCES public."PropertyShareFormat" (id) ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.create_property_public_share(uuid, integer);

CREATE OR REPLACE FUNCTION public.create_property_public_share(
  p_property_id uuid,
  p_days integer DEFAULT 14,
  p_share_format_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_token uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_days < 1 OR p_days > 90 THEN
    RAISE EXCEPTION 'invalid ttl';
  END IF;

  SELECT pr.organization_id
  INTO v_org
  FROM public."Property" pr
  WHERE pr.id = p_property_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'property not found';
  END IF;

  IF v_org <> public.user_organization_id() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_share_format_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public."PropertyShareFormat" f
      WHERE f.id = p_share_format_id AND f.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'invalid_share_format';
    END IF;
  END IF;

  INSERT INTO public."PropertyPublicShare" (
    organization_id,
    property_id,
    expires_at,
    created_by_id,
    share_format_id
  )
  VALUES (
    v_org,
    p_property_id,
    now() + ((p_days::text || ' days')::interval),
    auth.uid(),
    p_share_format_id
  )
  RETURNING token_uuid INTO v_token;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_property_public_share(uuid, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_property_public_share(uuid, integer, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_property_via_share_token(p_token_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid;
  v_row RECORD;
  v_prop RECORD;
  v_org RECORD;
  v_price_amt text;
  v_price_cur text;
  v_photos jsonb;
  f RECORD;
  fl boolean;
  fn boolean;
  ffa boolean;
  fc boolean;
  ftit boolean;
  fcz boolean;
  fsa boolean;
  fp boolean;
  fsp boolean;
  fd boolean;
  fph boolean;
BEGIN
  BEGIN
    v_token := p_token_text::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object('error', 'invalid_token');
  END;

  SELECT s.property_id, s.organization_id, s.share_format_id
  INTO v_row
  FROM public."PropertyPublicShare" s
  WHERE s.token_uuid = v_token
    AND s.revoked_at IS NULL
    AND s.expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'expired_or_invalid');
  END IF;

  SELECT pr.*
  INTO v_prop
  FROM public."Property" pr
  WHERE pr.id = v_row.property_id
    AND pr.organization_id = v_row.organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT og.display_name, og.logo_url, og.fiscal_address, og.contact_phone, og.broker_matricula
  INTO v_org
  FROM public."Organization" og
  WHERE og.id = v_row.organization_id;

  SELECT pq.amount::text, pq.currency
  INTO v_price_amt, v_price_cur
  FROM public."PropertyPrice" pq
  WHERE pq.property_id = v_prop.id
    AND pq.kind = 'LISTING_PUBLIC'
  ORDER BY pq.amount DESC NULLS LAST, pq.effective_at DESC
  LIMIT 1;

  SELECT COALESCE(
    (
      SELECT jsonb_agg(t.url ORDER BY t.ord, t.created_at)
      FROM (
        SELECT url, created_at,
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

  fl := true; fn := true; ffa := true; fc := true;
  ftit := true; fcz := true; fsa := true; fp := true; fsp := true; fd := true; fph := true;

  IF v_row.share_format_id IS NOT NULL THEN
    SELECT * INTO f FROM public."PropertyShareFormat" WHERE id = v_row.share_format_id AND organization_id = v_row.organization_id;
    IF FOUND THEN
      fl := f.show_org_logo;
      fn := f.show_org_name;
      ffa := f.show_org_fiscal_address;
      fc := f.show_org_contact;
      ftit := f.show_property_title;
      fcz := f.show_city_zone;
      fsa := f.show_street_address;
      fp := f.show_price;
      fsp := f.show_specs;
      fd := f.show_description;
      fph := f.show_photos;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'property',
    jsonb_build_object(
      'id', v_prop.id,
      'title', CASE WHEN ftit THEN v_prop.title ELSE '' END,
      'city_zone', CASE WHEN fcz THEN v_prop.city_zone ELSE '' END,
      'address', CASE WHEN fsa THEN v_prop.address ELSE NULL END,
      'kind', v_prop.kind,
      'covered_m2', v_prop.covered_m2,
      'total_m2', v_prop.total_m2,
      'rooms', v_prop.rooms,
      'bathrooms', v_prop.bathrooms,
      'parking', v_prop.parking,
      'condition', v_prop.condition,
      'listing_status', v_prop.listing_status,
      'description', CASE WHEN fd THEN v_prop.description ELSE NULL END,
      'amenity_tags', v_prop.amenity_tags,
      'is_exclusive', v_prop.is_exclusive
    ),
    'organization',
    jsonb_build_object(
      'display_name', CASE WHEN fn THEN COALESCE(v_org.display_name, '') ELSE '' END,
      'logo_url', CASE WHEN fl THEN v_org.logo_url ELSE NULL END,
      'fiscal_address', CASE WHEN ffa THEN v_org.fiscal_address ELSE NULL END,
      'contact_phone', CASE WHEN fc THEN v_org.contact_phone ELSE NULL END,
      'broker_matricula', CASE WHEN fc THEN v_org.broker_matricula ELSE NULL END
    ),
    'public_price',
    CASE
      WHEN NOT fp OR v_price_amt IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('amount', v_price_amt, 'currency', COALESCE(v_price_cur, 'USD'))
    END,
    'photos', CASE WHEN fph THEN COALESCE(v_photos, '[]'::jsonb) ELSE '[]'::jsonb END,
    'share_visibility',
    jsonb_build_object(
      'show_org_logo', fl,
      'show_org_name', fn,
      'show_org_fiscal_address', ffa,
      'show_org_contact', fc,
      'show_property_title', ftit,
      'show_city_zone', fcz,
      'show_street_address', fsa,
      'show_price', fp,
      'show_specs', fsp,
      'show_description', fd,
      'show_photos', fph
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_property_via_share_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_property_via_share_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.fetch_property_via_share_token(text) TO authenticated;

COMMENT ON TABLE public."PropertyShareFormat" IS 'Plantillas de visibilidad para enlace público / PDF / texto; referenciadas por PropertyPublicShare.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public."PropertyShareFormat" TO authenticated;
