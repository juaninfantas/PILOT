-- Archive flag on opportunity–property links
ALTER TABLE public."OpportunityProperty"
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public."OpportunityProperty".archived_at IS 'Si no es null, la propiedad queda archivada en esa oportunidad (solo UI; sigue vinculada).';

CREATE INDEX IF NOT EXISTS idx_opportunity_property_archived
  ON public."OpportunityProperty" (opportunity_id, archived_at);

-- Signed-style public share tokens (opaque UUID shown once to the user).
CREATE TABLE IF NOT EXISTS public."PropertyPublicShare" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  organization_id uuid NOT NULL REFERENCES public."Organization" (id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public."Property" (id) ON DELETE CASCADE,
  token_uuid uuid NOT NULL UNIQUE DEFAULT gen_random_uuid (),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_public_share_prop ON public."PropertyPublicShare" (property_id);
CREATE INDEX IF NOT EXISTS idx_property_public_share_expires ON public."PropertyPublicShare" (expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public."PropertyPublicShare" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_public_share_select"
  ON public."PropertyPublicShare" FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id()
  );

CREATE POLICY "property_public_share_insert"
  ON public."PropertyPublicShare" FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND EXISTS (
      SELECT 1 FROM public."Property" pr
      WHERE pr.id = property_id
        AND pr.organization_id = public.user_organization_id()
    )
  );

CREATE POLICY "property_public_share_update"
  ON public."PropertyPublicShare" FOR UPDATE TO authenticated
  USING (
    organization_id = public.user_organization_id()
  )
  WITH CHECK (
    organization_id = public.user_organization_id()
  );

CREATE POLICY "property_public_share_delete"
  ON public."PropertyPublicShare" FOR DELETE TO authenticated
  USING (
    organization_id = public.user_organization_id()
  );


CREATE OR REPLACE FUNCTION public.create_property_public_share (
  p_property_id uuid,
  p_days integer DEFAULT 14
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
  IF auth.uid () IS NULL THEN
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

  IF v_org <> public.user_organization_id () THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  INSERT INTO public."PropertyPublicShare" (
    organization_id,
    property_id,
    expires_at,
    created_by_id
  )
  VALUES (
    v_org,
    p_property_id,
    now () + ((p_days::text || ' days')::interval),
    auth.uid ()
  )
  RETURNING token_uuid INTO v_token;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_property_public_share (uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.create_property_public_share (uuid, integer) TO authenticated;


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
    og.logo_url
  INTO v_org_name,
    v_org_logo
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
      'logo_url', v_org_logo
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
