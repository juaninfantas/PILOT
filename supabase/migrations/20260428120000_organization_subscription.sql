-- Planes Free / Pro por organización. MVP: mismas capacidades; UI y datos listos para límites o pasarela.

ALTER TABLE public."Organization" ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'FREE';
UPDATE public."Organization" SET subscription_tier = 'FREE' WHERE subscription_tier IS NULL;
ALTER TABLE public."Organization" ALTER COLUMN subscription_tier SET NOT NULL;
ALTER TABLE public."Organization" ALTER COLUMN subscription_tier SET DEFAULT 'FREE';

ALTER TABLE public."Organization" DROP CONSTRAINT IF EXISTS organization_subscription_tier_chk;
ALTER TABLE public."Organization"
  ADD CONSTRAINT organization_subscription_tier_chk CHECK (subscription_tier IN ('FREE', 'PRO'));

ALTER TABLE public."Organization" ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz NULL;
UPDATE public."Organization" SET subscription_expires_at = NULL WHERE subscription_tier = 'FREE';

DROP FUNCTION IF EXISTS public.get_my_organization();

CREATE OR REPLACE FUNCTION public.get_my_organization()
RETURNS TABLE (
  id uuid,
  slug text,
  display_name text,
  logo_url text,
  legal_json text,
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
    o.subscription_tier,
    o.subscription_expires_at
  FROM public."Organization" o
  JOIN public."OrganizationMembership" m ON m.organization_id = o.id AND m.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organization() TO authenticated;
