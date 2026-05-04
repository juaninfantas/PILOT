-- Datos fiscales explícitos (sustituyen la edición por JSON en UI)
ALTER TABLE public."Organization" ADD COLUMN IF NOT EXISTS fiscal_legal_name text;
ALTER TABLE public."Organization" ADD COLUMN IF NOT EXISTS fiscal_address text;
ALTER TABLE public."Organization" ADD COLUMN IF NOT EXISTS fiscal_cuit text;
ALTER TABLE public."Organization" ADD COLUMN IF NOT EXISTS fiscal_iva_condition text;

COMMENT ON COLUMN public."Organization".fiscal_legal_name IS 'Razón social / nombre fiscal';
COMMENT ON COLUMN public."Organization".fiscal_address IS 'Domicilio fiscal';
COMMENT ON COLUMN public."Organization".fiscal_cuit IS 'CUIT / identificación fiscal';
COMMENT ON COLUMN public."Organization".fiscal_iva_condition IS 'Condición IVA u observación fiscal corta';

DROP FUNCTION IF EXISTS public.get_my_organization();

CREATE OR REPLACE FUNCTION public.get_my_organization()
RETURNS TABLE (
  id uuid,
  slug text,
  display_name text,
  logo_url text,
  legal_json text,
  fiscal_legal_name text,
  fiscal_address text,
  fiscal_cuit text,
  fiscal_iva_condition text,
  subscription_tier text,
  subscription_expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.slug,
    o.display_name,
    o.logo_url,
    o.legal_json,
    o.fiscal_legal_name,
    o.fiscal_address,
    o.fiscal_cuit,
    o.fiscal_iva_condition,
    o.subscription_tier,
    o.subscription_expires_at
  FROM public."Organization" o
  JOIN public."OrganizationMembership" m ON m.organization_id = o.id AND m.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organization() TO authenticated;

DROP FUNCTION IF EXISTS public.update_my_organization_profile(text, text, text);

CREATE OR REPLACE FUNCTION public.update_my_organization_profile(
  p_display_name text,
  p_logo_url text,
  p_fiscal_legal_name text,
  p_fiscal_address text,
  p_fiscal_cuit text,
  p_fiscal_iva_condition text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oid uuid := public.user_organization_id();
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Sin organización';
  END IF;
  IF NOT public.has_permission('manage_users') THEN
    RAISE EXCEPTION 'Sin permisos para editar datos de la inmobiliaria';
  END IF;
  UPDATE public."Organization"
  SET
    display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
    logo_url = COALESCE(NULLIF(trim(p_logo_url), ''), logo_url),
    fiscal_legal_name = COALESCE(NULLIF(trim(p_fiscal_legal_name), ''), fiscal_legal_name),
    fiscal_address = COALESCE(NULLIF(trim(p_fiscal_address), ''), fiscal_address),
    fiscal_cuit = COALESCE(NULLIF(trim(p_fiscal_cuit), ''), fiscal_cuit),
    fiscal_iva_condition = COALESCE(NULLIF(trim(p_fiscal_iva_condition), ''), fiscal_iva_condition),
    updated_at = now()
  WHERE id = v_oid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_organization_profile(text, text, text, text, text, text) TO authenticated;
