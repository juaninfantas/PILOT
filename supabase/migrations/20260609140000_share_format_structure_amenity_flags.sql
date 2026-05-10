-- Flags por campo en formatos de compartir (además de show_spec_amenities = tags libres).

ALTER TABLE public."Property"
  ADD COLUMN IF NOT EXISTS has_laundry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_balcony boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_garden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_service_room boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_elevator boolean NOT NULL DEFAULT false;

ALTER TABLE public."PropertyShareFormat"
  ADD COLUMN IF NOT EXISTS show_spec_quincho boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_spec_pool boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_spec_floor_count boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_spec_patio boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_spec_terrace boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_spec_laundry boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_spec_balcony boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_spec_garden boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_spec_service_room boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_spec_elevator boolean NOT NULL DEFAULT true;

UPDATE public."PropertyShareFormat" SET
  show_spec_quincho = show_spec_amenities,
  show_spec_pool = show_spec_amenities,
  show_spec_floor_count = show_spec_amenities,
  show_spec_patio = show_spec_amenities,
  show_spec_terrace = show_spec_amenities,
  show_spec_laundry = show_spec_amenities,
  show_spec_balcony = show_spec_amenities,
  show_spec_garden = show_spec_amenities,
  show_spec_service_room = show_spec_amenities,
  show_spec_elevator = show_spec_amenities;

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
  fsk boolean;
  fsls boolean;
  fsex boolean;
  fscm boolean;
  fstm boolean;
  fsrm boolean;
  fsba boolean;
  fspk boolean;
  fscd boolean;
  fsam boolean;
  fsqc boolean;
  fspl boolean;
  fsfc boolean;
  fspa boolean;
  fstz boolean;
  fsla boolean;
  fsbl boolean;
  fsgn boolean;
  fssv boolean;
  fsel boolean;
  fd boolean;
  fph boolean;
  fgpath boolean;
  fcoord boolean;
  fmapl boolean;
  v_geo_labeled text;
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
  ftit := true; fcz := true; fsa := true; fp := true;
  fsk := true; fsls := true; fsex := true; fscm := true; fstm := true;
  fsrm := true; fsba := true; fspk := true; fscd := true; fsam := true;
  fsqc := true; fspl := true; fsfc := true; fspa := true; fstz := true;
  fsla := true; fsbl := true; fsgn := true; fssv := true; fsel := true;
  fd := true; fph := true;
  fgpath := true;
  fcoord := false;
  fmapl := false;

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
      fsk := f.show_spec_kind;
      fsls := f.show_spec_listing_status;
      fsex := f.show_spec_exclusive;
      fscm := f.show_spec_covered_m2;
      fstm := f.show_spec_total_m2;
      fsrm := f.show_spec_rooms;
      fsba := f.show_spec_bathrooms;
      fspk := f.show_spec_parking;
      fscd := f.show_spec_condition;
      fsam := f.show_spec_amenities;
      fsqc := f.show_spec_quincho;
      fspl := f.show_spec_pool;
      fsfc := f.show_spec_floor_count;
      fspa := f.show_spec_patio;
      fstz := f.show_spec_terrace;
      fsla := f.show_spec_laundry;
      fsbl := f.show_spec_balcony;
      fsgn := f.show_spec_garden;
      fssv := f.show_spec_service_room;
      fsel := f.show_spec_elevator;
      fd := f.show_description;
      fph := f.show_photos;
      fgpath := f.show_geo_path;
      fcoord := f.show_coordinates;
      fmapl := f.show_external_map_link;
    END IF;
  END IF;

  v_geo_labeled := NULL;
  IF v_prop.geo_unit_id IS NOT NULL THEN
    v_geo_labeled := public.geo_unit_path_labeled(v_prop.geo_unit_id, 'es');
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
      'amenity_tags', CASE WHEN fsam THEN v_prop.amenity_tags ELSE NULL END,
      'is_exclusive', v_prop.is_exclusive,
      'geo_path', CASE WHEN fgpath THEN v_geo_labeled ELSE NULL END,
      'lat', CASE WHEN fcoord THEN v_prop.lat ELSE NULL END,
      'lng', CASE WHEN fcoord THEN v_prop.lng ELSE NULL END,
      'show_map_link', fmapl,
      'has_quincho', CASE WHEN fsqc THEN v_prop.has_quincho ELSE NULL END,
      'has_pool', CASE WHEN fspl THEN v_prop.has_pool ELSE NULL END,
      'floor_count', CASE WHEN fsfc THEN v_prop.floor_count ELSE NULL END,
      'has_patio', CASE WHEN fspa THEN v_prop.has_patio ELSE NULL END,
      'has_terrace', CASE WHEN fstz THEN v_prop.has_terrace ELSE NULL END,
      'has_laundry', CASE WHEN fsla THEN v_prop.has_laundry ELSE NULL END,
      'has_balcony', CASE WHEN fsbl THEN v_prop.has_balcony ELSE NULL END,
      'has_garden', CASE WHEN fsgn THEN v_prop.has_garden ELSE NULL END,
      'has_service_room', CASE WHEN fssv THEN v_prop.has_service_room ELSE NULL END,
      'has_elevator', CASE WHEN fsel THEN v_prop.has_elevator ELSE NULL END
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
      'show_spec_kind', fsk,
      'show_spec_listing_status', fsls,
      'show_spec_exclusive', fsex,
      'show_spec_covered_m2', fscm,
      'show_spec_total_m2', fstm,
      'show_spec_rooms', fsrm,
      'show_spec_bathrooms', fsba,
      'show_spec_parking', fspk,
      'show_spec_condition', fscd,
      'show_spec_amenities', fsam,
      'show_spec_quincho', fsqc,
      'show_spec_pool', fspl,
      'show_spec_floor_count', fsfc,
      'show_spec_patio', fspa,
      'show_spec_terrace', fstz,
      'show_spec_laundry', fsla,
      'show_spec_balcony', fsbl,
      'show_spec_garden', fsgn,
      'show_spec_service_room', fssv,
      'show_spec_elevator', fsel,
      'show_description', fd,
      'show_photos', fph,
      'show_geo_path', fgpath,
      'show_coordinates', fcoord,
      'show_external_map_link', fmapl
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_property_via_share_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_property_via_share_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.fetch_property_via_share_token(text) TO authenticated;
