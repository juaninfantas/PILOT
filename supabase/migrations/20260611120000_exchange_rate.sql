-- Tipos de cambio por inmobiliaria: 1 unidad de currency_code = usd_per_unit USD.
-- Los reportes históricos eligen la fila vigente con effective_at <= fecha del precio.

CREATE TABLE IF NOT EXISTS public."ExchangeRate" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public."Organization" (id) ON DELETE CASCADE,
  currency_code text NOT NULL CHECK (char_length(currency_code) = 3 AND currency_code = upper(currency_code) AND currency_code <> 'USD'),
  effective_at timestamptz NOT NULL DEFAULT now(),
  usd_per_unit numeric NOT NULL CHECK (usd_per_unit > 0),
  source text NOT NULL DEFAULT 'MANUAL' CHECK (length(trim(source)) > 0),
  created_by_id uuid REFERENCES public."User" (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public."ExchangeRate" IS 'Cotización a USD: monto_en_moneda * usd_per_unit = monto_en_USD.';
COMMENT ON COLUMN public."ExchangeRate".usd_per_unit IS 'Cuántos USD equivale 1 unidad de currency_code (ej. ARS ~0.001; EUR ~1.09).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_rate_org_currency_effective
  ON public."ExchangeRate" (organization_id, currency_code, effective_at);

CREATE INDEX IF NOT EXISTS idx_exchange_rate_org_cur_eff
  ON public."ExchangeRate" (organization_id, currency_code, effective_at DESC);

ALTER TABLE public."ExchangeRate" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exchange_rate_select" ON public."ExchangeRate";
CREATE POLICY "exchange_rate_select" ON public."ExchangeRate" FOR SELECT TO authenticated
  USING (organization_id = public.user_organization_id());

DROP POLICY IF EXISTS "exchange_rate_insert" ON public."ExchangeRate";
CREATE POLICY "exchange_rate_insert" ON public."ExchangeRate" FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_properties')
  );

DROP POLICY IF EXISTS "exchange_rate_update" ON public."ExchangeRate";
CREATE POLICY "exchange_rate_update" ON public."ExchangeRate" FOR UPDATE TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_properties')
  )
  WITH CHECK (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_properties')
  );

DROP POLICY IF EXISTS "exchange_rate_delete" ON public."ExchangeRate";
CREATE POLICY "exchange_rate_delete" ON public."ExchangeRate" FOR DELETE TO authenticated
  USING (
    organization_id = public.user_organization_id()
    AND public.has_permission('manage_properties')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public."ExchangeRate" TO authenticated;
