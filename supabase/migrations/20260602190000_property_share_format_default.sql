-- Formato predeterminado al compartir (un marcador por organización).

ALTER TABLE public."PropertyShareFormat"
  ADD COLUMN IF NOT EXISTS is_default_share boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public."PropertyShareFormat".is_default_share IS 'Si es true, este formato se preselecciona en el modal de compartir; solo uno por organización.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_share_format_one_default_per_org
  ON public."PropertyShareFormat" (organization_id)
  WHERE is_default_share = true;

-- Un solo predeterminado por org: preferir nombre «Completa», si no el primero alfabético.
UPDATE public."PropertyShareFormat" SET is_default_share = false;

WITH pick AS (
  SELECT DISTINCT ON (organization_id) id
  FROM public."PropertyShareFormat"
  ORDER BY
    organization_id,
    CASE WHEN lower(trim(name)) = 'completa' THEN 0 ELSE 1 END,
    name
)
UPDATE public."PropertyShareFormat" f
SET is_default_share = true
FROM pick
WHERE f.id = pick.id;

CREATE OR REPLACE FUNCTION public.property_share_format_single_default()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_default_share THEN
    UPDATE public."PropertyShareFormat"
    SET is_default_share = false
    WHERE organization_id = NEW.organization_id
      AND id IS DISTINCT FROM NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_share_format_single_default ON public."PropertyShareFormat";
CREATE TRIGGER property_share_format_single_default
  BEFORE INSERT OR UPDATE ON public."PropertyShareFormat"
  FOR EACH ROW
  WHEN (NEW.is_default_share = true)
  EXECUTE FUNCTION public.property_share_format_single_default();

CREATE OR REPLACE FUNCTION public.property_share_format_after_delete_redefault()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_default_share THEN
    UPDATE public."PropertyShareFormat" f
    SET is_default_share = true
    WHERE f.id = (
      SELECT id
      FROM public."PropertyShareFormat"
      WHERE organization_id = OLD.organization_id
      ORDER BY
        CASE WHEN lower(trim(name)) = 'completa' THEN 0 ELSE 1 END,
        name
      LIMIT 1
    );
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS property_share_format_after_delete_redefault ON public."PropertyShareFormat";
CREATE TRIGGER property_share_format_after_delete_redefault
  AFTER DELETE ON public."PropertyShareFormat"
  FOR EACH ROW
  EXECUTE FUNCTION public.property_share_format_after_delete_redefault();
