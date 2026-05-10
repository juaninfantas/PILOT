-- Cotización por par: quote_per_base = unidades de currency_to por 1 unidad de currency_from
-- (ej. USD→ARS 1200 ⇒ 1 USD = 1200 ARS; EUR→USD 1.08 ⇒ 1 EUR = 1,08 USD).

ALTER TABLE public."ExchangeRate"
  ADD COLUMN IF NOT EXISTS currency_from text,
  ADD COLUMN IF NOT EXISTS currency_to text,
  ADD COLUMN IF NOT EXISTS quote_per_base numeric;

UPDATE public."ExchangeRate"
SET
  currency_from = currency_code,
  currency_to = 'USD',
  quote_per_base = usd_per_unit
WHERE currency_from IS NULL
  AND currency_code IS NOT NULL
  AND currency_to IS NULL;

DELETE FROM public."ExchangeRate" WHERE currency_from IS NULL OR currency_to IS NULL OR quote_per_base IS NULL;

ALTER TABLE public."ExchangeRate" ALTER COLUMN currency_from SET NOT NULL;
ALTER TABLE public."ExchangeRate" ALTER COLUMN currency_to SET NOT NULL;
ALTER TABLE public."ExchangeRate" ALTER COLUMN quote_per_base SET NOT NULL;

ALTER TABLE public."ExchangeRate" DROP CONSTRAINT IF EXISTS exchange_rate_quote_pos;
ALTER TABLE public."ExchangeRate" ADD CONSTRAINT exchange_rate_quote_pos CHECK (quote_per_base > 0);

ALTER TABLE public."ExchangeRate" DROP CONSTRAINT IF EXISTS exchange_rate_pair_codes;
ALTER TABLE public."ExchangeRate" ADD CONSTRAINT exchange_rate_pair_codes CHECK (
  char_length(currency_from) = 3
  AND currency_from = upper(currency_from)
  AND char_length(currency_to) = 3
  AND currency_to = upper(currency_to)
  AND currency_from IS DISTINCT FROM currency_to
);

DROP INDEX IF EXISTS uq_exchange_rate_org_currency_effective;
DROP INDEX IF EXISTS idx_exchange_rate_org_cur_eff;

ALTER TABLE public."ExchangeRate" DROP COLUMN IF EXISTS currency_code;
ALTER TABLE public."ExchangeRate" DROP COLUMN IF EXISTS usd_per_unit;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_rate_org_pair_effective
  ON public."ExchangeRate" (organization_id, currency_from, currency_to, effective_at);

CREATE INDEX IF NOT EXISTS idx_exchange_rate_org_pair_eff
  ON public."ExchangeRate" (organization_id, currency_from, currency_to, effective_at DESC);

COMMENT ON TABLE public."ExchangeRate" IS 'Cotización por par: 1 currency_from = quote_per_base × currency_to.';
COMMENT ON COLUMN public."ExchangeRate".quote_per_base IS 'Cantidad de currency_to equivalente a 1 unidad de currency_from (ej. USD→ARS: pesos por 1 dólar).';
