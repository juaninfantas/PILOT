-- Catálogo global de monedas (código ISO 4217 3 letras + nombre).
CREATE TABLE IF NOT EXISTS public."CurrencyCatalog" (
  code text PRIMARY KEY CHECK (char_length(trim(code)) = 3 AND trim(code) = upper(trim(code))),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public."CurrencyCatalog" IS 'Monedas disponibles en selects y tipos de cambio; código ISO 4217 tres letras.';

INSERT INTO public."CurrencyCatalog" (code, name, sort_order) VALUES
  ('USD', 'Dólar estadounidense', 10),
  ('ARS', 'Peso argentino', 20),
  ('EUR', 'Euro', 30)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public."CurrencyCatalog" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "currency_catalog_select" ON public."CurrencyCatalog";
CREATE POLICY "currency_catalog_select" ON public."CurrencyCatalog" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "currency_catalog_mutate" ON public."CurrencyCatalog";
CREATE POLICY "currency_catalog_mutate" ON public."CurrencyCatalog" FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false))
    OR public.has_permission('manage_users')
    OR public.has_permission('manage_properties')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false))
    OR public.has_permission('manage_users')
    OR public.has_permission('manage_properties')
  );

GRANT SELECT ON public."CurrencyCatalog" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."CurrencyCatalog" TO authenticated;

-- Maestro GEO: permite editar usuarios Pilot staff o admins de la inmobiliaria (manage_users).
DROP POLICY IF EXISTS "geo_country_write" ON public."GeoCountryConfig";
CREATE POLICY "geo_country_write" ON public."GeoCountryConfig" FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false))
    OR public.has_permission('manage_users')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false))
    OR public.has_permission('manage_users')
  );

DROP POLICY IF EXISTS "geo_level_write" ON public."GeoLevelDef";
CREATE POLICY "geo_level_write" ON public."GeoLevelDef" FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false))
    OR public.has_permission('manage_users')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false))
    OR public.has_permission('manage_users')
  );

DROP POLICY IF EXISTS "geo_unit_insert" ON public."GeoUnit";
DROP POLICY IF EXISTS "geo_unit_update" ON public."GeoUnit";
DROP POLICY IF EXISTS "geo_unit_delete" ON public."GeoUnit";

CREATE POLICY "geo_unit_insert" ON public."GeoUnit" FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false))
    OR public.has_permission('manage_users')
  );

CREATE POLICY "geo_unit_update" ON public."GeoUnit" FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false))
    OR public.has_permission('manage_users')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false))
    OR public.has_permission('manage_users')
  );

CREATE POLICY "geo_unit_delete" ON public."GeoUnit" FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false))
    OR public.has_permission('manage_users')
  );
