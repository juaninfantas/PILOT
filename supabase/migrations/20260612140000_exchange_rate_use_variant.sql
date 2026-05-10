-- Qué valor del par usar para esa fila vigente: compra, venta o promedio.
ALTER TABLE public."ExchangeRate"
  ADD COLUMN IF NOT EXISTS use_variant text NOT NULL DEFAULT 'MID';

ALTER TABLE public."ExchangeRate" DROP CONSTRAINT IF EXISTS exchange_rate_use_variant_ck;
ALTER TABLE public."ExchangeRate"
  ADD CONSTRAINT exchange_rate_use_variant_ck CHECK (use_variant IN ('BUY', 'SELL', 'MID'));

COMMENT ON COLUMN public."ExchangeRate".use_variant IS 'BUY=compra, SELL=venta, MID=promedio — valor usado al convertir cuando esta fila es la vigente para la fecha del dato.';
