-- Maestro geográfico: niveles con etiquetas por país (GeoLevelDef.labels),
-- unidades jerárquicas (GeoUnit), Property.geo_unit_id, visibilidad al compartir.

CREATE TABLE IF NOT EXISTS public."GeoCountryConfig" (
  country_code text PRIMARY KEY CHECK (char_length(country_code) = 2 AND country_code = upper(country_code)),
  dial_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."GeoLevelDef" (
  country_code text NOT NULL REFERENCES public."GeoCountryConfig" (country_code) ON DELETE CASCADE,
  level_index int NOT NULL CHECK (level_index >= 0),
  level_key text NOT NULL,
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  optional_level boolean NOT NULL DEFAULT false,
  PRIMARY KEY (country_code, level_index)
);

COMMENT ON COLUMN public."GeoLevelDef".labels IS 'Etiquetas UI por idioma, p. ej. {"es":"Provincia","en":"Province"}; el supervisor las define por país.';

CREATE TABLE IF NOT EXISTS public."GeoUnit" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES public."GeoCountryConfig" (country_code) ON DELETE CASCADE,
  parent_id uuid REFERENCES public."GeoUnit" (id) ON DELETE CASCADE,
  level_index int NOT NULL CHECK (level_index >= 0),
  code text NOT NULL,
  name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_unit_parent_level CHECK (parent_id IS NULL OR level_index > 0),
  CONSTRAINT geo_unit_code_unique UNIQUE (country_code, parent_id, code)
);

CREATE INDEX IF NOT EXISTS idx_geo_unit_country_parent ON public."GeoUnit" (country_code, parent_id);
CREATE INDEX IF NOT EXISTS idx_geo_unit_name ON public."GeoUnit" (country_code, name);

ALTER TABLE public."Property"
  ADD COLUMN IF NOT EXISTS geo_unit_id uuid REFERENCES public."GeoUnit" (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_property_geo_unit ON public."Property" (geo_unit_id);

ALTER TABLE public."PropertyShareFormat"
  ADD COLUMN IF NOT EXISTS show_geo_path boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_coordinates boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_external_map_link boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public."PropertyShareFormat".show_geo_path IS 'Incluir ubicación maestro (etiquetas de nivel + valores).';
COMMENT ON COLUMN public."PropertyShareFormat".show_coordinates IS 'Incluir lat/lng en compartidos.';
COMMENT ON COLUMN public."PropertyShareFormat".show_external_map_link IS 'Incluir enlace externo a mapa si hay coordenadas.';

-- RLS
ALTER TABLE public."GeoCountryConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GeoLevelDef" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GeoUnit" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geo_country_select" ON public."GeoCountryConfig";
CREATE POLICY "geo_country_select" ON public."GeoCountryConfig" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "geo_country_write" ON public."GeoCountryConfig";
CREATE POLICY "geo_country_write" ON public."GeoCountryConfig" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false)));

DROP POLICY IF EXISTS "geo_level_select" ON public."GeoLevelDef";
CREATE POLICY "geo_level_select" ON public."GeoLevelDef" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "geo_level_write" ON public."GeoLevelDef";
CREATE POLICY "geo_level_write" ON public."GeoLevelDef" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false)));

DROP POLICY IF EXISTS "geo_unit_select" ON public."GeoUnit";
CREATE POLICY "geo_unit_select" ON public."GeoUnit" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "geo_unit_insert" ON public."GeoUnit";
CREATE POLICY "geo_unit_insert" ON public."GeoUnit" FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false)));

DROP POLICY IF EXISTS "geo_unit_update" ON public."GeoUnit";
CREATE POLICY "geo_unit_update" ON public."GeoUnit" FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false)));

DROP POLICY IF EXISTS "geo_unit_delete" ON public."GeoUnit";
CREATE POLICY "geo_unit_delete" ON public."GeoUnit" FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false)));

GRANT SELECT ON public."GeoCountryConfig" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."GeoCountryConfig" TO authenticated;
GRANT SELECT ON public."GeoLevelDef" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."GeoLevelDef" TO authenticated;
GRANT SELECT ON public."GeoUnit" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."GeoUnit" TO authenticated;

-- Seed AR + definición de niveles (editables por supervisor: España tendrá otros labels)
INSERT INTO public."GeoCountryConfig" (country_code, dial_metadata)
VALUES ('AR', '{"dial": "+54"}'::jsonb)
ON CONFLICT (country_code) DO NOTHING;

INSERT INTO public."GeoLevelDef" (country_code, level_index, level_key, labels, optional_level) VALUES
  ('AR', 0, 'COUNTRY', '{"es": "País"}'::jsonb, false),
  ('AR', 1, 'ADM1', '{"es": "Provincia"}'::jsonb, false),
  ('AR', 2, 'ADM2', '{"es": "Partido / departamento"}'::jsonb, true),
  ('AR', 3, 'LOCALITY', '{"es": "Localidad"}'::jsonb, true)
ON CONFLICT (country_code, level_index) DO NOTHING;

-- Ejemplo España (solo país + niveles; sin unidades hasta que el supervisor cargue)
INSERT INTO public."GeoCountryConfig" (country_code, dial_metadata)
VALUES ('ES', '{"dial": "+34"}'::jsonb)
ON CONFLICT (country_code) DO NOTHING;

INSERT INTO public."GeoLevelDef" (country_code, level_index, level_key, labels, optional_level) VALUES
  ('ES', 0, 'COUNTRY', '{"es": "País"}'::jsonb, false),
  ('ES', 1, 'COMMUNITY', '{"es": "Comunidad autónoma"}'::jsonb, false),
  ('ES', 2, 'PROVINCE', '{"es": "Provincia"}'::jsonb, false),
  ('ES', 3, 'MUNICIPALITY', '{"es": "Ayuntamiento"}'::jsonb, false)
ON CONFLICT (country_code, level_index) DO NOTHING;

INSERT INTO public."GeoUnit" (id, country_code, parent_id, level_index, code, name) VALUES
  ('f0000001-0000-4000-8000-000000000001'::uuid, 'AR', NULL, 0, 'AR', 'Argentina')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."GeoUnit" (id, country_code, parent_id, level_index, code, name) VALUES
  ('f0000001-0000-4000-8000-0000000000e1'::uuid, 'ES', NULL, 0, 'ES', 'España')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."GeoUnit" (id, country_code, parent_id, level_index, code, name) VALUES
  ('f0000001-0000-4000-8000-000000000011'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-B', 'Buenos Aires'),
  ('f0000001-0000-4000-8000-000000000012'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-K', 'Catamarca'),
  ('f0000001-0000-4000-8000-000000000013'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-H', 'Chaco'),
  ('f0000001-0000-4000-8000-000000000014'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-U', 'Chubut'),
  ('f0000001-0000-4000-8000-000000000015'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-C', 'Ciudad Autónoma de Buenos Aires'),
  ('f0000001-0000-4000-8000-000000000016'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-X', 'Córdoba'),
  ('f0000001-0000-4000-8000-000000000017'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-W', 'Corrientes'),
  ('f0000001-0000-4000-8000-000000000018'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-E', 'Entre Ríos'),
  ('f0000001-0000-4000-8000-000000000019'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-P', 'Formosa'),
  ('f0000001-0000-4000-8000-00000000001a'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-Y', 'Jujuy'),
  ('f0000001-0000-4000-8000-00000000001b'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-L', 'La Pampa'),
  ('f0000001-0000-4000-8000-00000000001c'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-F', 'La Rioja'),
  ('f0000001-0000-4000-8000-00000000001d'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-M', 'Mendoza'),
  ('f0000001-0000-4000-8000-00000000001e'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-N', 'Misiones'),
  ('f0000001-0000-4000-8000-00000000001f'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-Q', 'Neuquén'),
  ('f0000001-0000-4000-8000-000000000020'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-R', 'Río Negro'),
  ('f0000001-0000-4000-8000-000000000021'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-A', 'Salta'),
  ('f0000001-0000-4000-8000-000000000022'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-J', 'San Juan'),
  ('f0000001-0000-4000-8000-000000000023'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-D', 'San Luis'),
  ('f0000001-0000-4000-8000-000000000024'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-Z', 'Santa Cruz'),
  ('f0000001-0000-4000-8000-000000000025'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-S', 'Santa Fe'),
  ('f0000001-0000-4000-8000-000000000026'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-G', 'Santiago del Estero'),
  ('f0000001-0000-4000-8000-000000000027'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-V', 'Tierra del Fuego'),
  ('f0000001-0000-4000-8000-000000000028'::uuid, 'AR', 'f0000001-0000-4000-8000-000000000001'::uuid, 1, 'AR-T', 'Tucumán')
ON CONFLICT (id) DO NOTHING;

-- Solo nombres unidos (compat)
CREATE OR REPLACE FUNCTION public.geo_unit_path_line(p_unit_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE anc AS (
    SELECT id, parent_id, name, level_index
    FROM public."GeoUnit"
    WHERE id = p_unit_id
    UNION ALL
    SELECT u.id, u.parent_id, u.name, u.level_index
    FROM public."GeoUnit" u
    INNER JOIN anc ON u.id = anc.parent_id
  )
  SELECT string_agg(name, ' › ' ORDER BY level_index)
  FROM anc;
$$;

-- Ruta con etiquetas de nivel (lo que ve el usuario en compartidos / PDF)
CREATE OR REPLACE FUNCTION public.geo_unit_path_labeled(p_unit_id uuid, p_locale text DEFAULT 'es')
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE anc AS (
    SELECT u.id, u.parent_id, u.name, u.level_index, u.country_code
    FROM public."GeoUnit" u
    WHERE u.id = p_unit_id
    UNION ALL
    SELECT u.id, u.parent_id, u.name, u.level_index, u.country_code
    FROM public."GeoUnit" u
    INNER JOIN anc ON u.id = anc.parent_id
  ),
  labeled AS (
    SELECT
      anc.level_index,
      anc.name,
      COALESCE(
        (
          SELECT COALESCE(NULLIF(trim(ld.labels->>p_locale), ''), ld.level_key)
          FROM public."GeoLevelDef" ld
          WHERE ld.country_code = anc.country_code
            AND ld.level_index = anc.level_index
        ),
        'Nivel'
      ) AS lvl_label
    FROM anc
  )
  SELECT string_agg(lvl_label || ': ' || name, ' › ' ORDER BY level_index)
  FROM labeled;
$$;

GRANT EXECUTE ON FUNCTION public.geo_unit_path_line(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geo_unit_path_line(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.geo_unit_path_labeled(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geo_unit_path_labeled(uuid, text) TO anon;

CREATE OR REPLACE FUNCTION public.list_geo_units(p_country text, p_parent_id uuid)
RETURNS SETOF public."GeoUnit"
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public."GeoUnit"
  WHERE country_code = upper(trim(p_country))
    AND (parent_id IS NOT DISTINCT FROM p_parent_id)
  ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.list_geo_units(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_geo_level_defs(p_country text)
RETURNS SETOF public."GeoLevelDef"
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public."GeoLevelDef"
  WHERE country_code = upper(trim(p_country))
  ORDER BY level_index;
$$;

GRANT EXECUTE ON FUNCTION public.list_geo_level_defs(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_geo_country_root_id(p_country text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT id
  FROM public."GeoUnit"
  WHERE country_code = upper(trim(p_country))
    AND parent_id IS NULL
    AND level_index = 0
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_geo_country_root_id(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_geo_unit_chain(p_unit_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE anc AS (
    SELECT id, parent_id, level_index
    FROM public."GeoUnit"
    WHERE id = p_unit_id
    UNION ALL
    SELECT u.id, u.parent_id, u.level_index
    FROM public."GeoUnit" u
    INNER JOIN anc ON u.id = anc.parent_id
  )
  SELECT COALESCE(array_agg(id ORDER BY level_index), ARRAY[]::uuid[])
  FROM anc;
$$;

GRANT EXECUTE ON FUNCTION public.get_geo_unit_chain(uuid) TO authenticated;

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
      'amenity_tags', v_prop.amenity_tags,
      'is_exclusive', v_prop.is_exclusive,
      'geo_path', CASE WHEN fgpath THEN v_geo_labeled ELSE NULL END,
      'lat', CASE WHEN fcoord THEN v_prop.lat ELSE NULL END,
      'lng', CASE WHEN fcoord THEN v_prop.lng ELSE NULL END,
      'show_map_link', fmapl
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
