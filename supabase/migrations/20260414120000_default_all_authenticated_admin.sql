-- MVP: cualquier usuario autenticado se trata como "admin" para RLS y UI.
-- has_permission ignora grupos/roles; get_my_permissions devuelve todos los slugs.
-- Cuando definan roles reales, reemplazar estas funciones por la lógica basada en UserGroup.

CREATE OR REPLACE FUNCTION public.has_permission(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN ARRAY[]::text[]
    ELSE COALESCE(
      (SELECT array_agg(p.slug ORDER BY p.slug) FROM public."Permission" p),
      ARRAY[]::text[]
    )
  END;
$$;
