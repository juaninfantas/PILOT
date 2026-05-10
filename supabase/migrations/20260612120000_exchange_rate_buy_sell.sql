-- Cotización por par con compra y venta (unidades de currency_to por 1 currency_from).
-- Los reportes usan el promedio (compra+venta)/2 para compatibilidad con la cotización única anterior.

ALTER TABLE public."ExchangeRate"
  ADD COLUMN IF NOT EXISTS quote_buy numeric,
  ADD COLUMN IF NOT EXISTS quote_sell numeric;

UPDATE public."ExchangeRate"
SET
  quote_buy = quote_per_base,
  quote_sell = quote_per_base
WHERE quote_buy IS NULL OR quote_sell IS NULL;

ALTER TABLE public."ExchangeRate" ALTER COLUMN quote_buy SET NOT NULL;
ALTER TABLE public."ExchangeRate" ALTER COLUMN quote_sell SET NOT NULL;

ALTER TABLE public."ExchangeRate" DROP CONSTRAINT IF EXISTS exchange_rate_quote_pos;

ALTER TABLE public."ExchangeRate" DROP COLUMN IF EXISTS quote_per_base;

ALTER TABLE public."ExchangeRate" ADD CONSTRAINT exchange_rate_quote_buy_pos CHECK (quote_buy > 0);
ALTER TABLE public."ExchangeRate" ADD CONSTRAINT exchange_rate_quote_sell_pos CHECK (quote_sell > 0);

COMMENT ON TABLE public."ExchangeRate" IS 'Cotización por par: 1 currency_from se cotiza en currency_to con compra y venta (ARS/USD típico: compra < venta).';
COMMENT ON COLUMN public."ExchangeRate".quote_buy IS 'Precio compra: unidades de currency_to por 1 currency_from.';
COMMENT ON COLUMN public."ExchangeRate".quote_sell IS 'Precio venta: unidades de currency_to por 1 currency_from.';
