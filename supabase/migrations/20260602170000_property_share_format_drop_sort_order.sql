-- Orden de formatos solo por nombre (alfabético en cliente); sin sort_order.

DROP INDEX IF EXISTS public.idx_property_share_format_org;

ALTER TABLE public."PropertyShareFormat"
  DROP COLUMN IF EXISTS sort_order;

CREATE INDEX IF NOT EXISTS idx_property_share_format_org_name
  ON public."PropertyShareFormat" (organization_id, name);
