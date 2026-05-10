-- Actualización atómica de moneda del catálogo (nombre y/o código), propagando código en tablas que lo referencian.

CREATE OR REPLACE FUNCTION public.mutate_currency_catalog(p_old_code text, p_new_code text, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
  v_new text;
  v_name text;
  v_so int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ERR_AUTH';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid() AND COALESCE(u.platform_staff, false))
    OR public.has_permission('manage_users')
    OR public.has_permission('manage_properties')
  ) THEN
    RAISE EXCEPTION 'ERR_DENIED';
  END IF;

  v_old := upper(trim(COALESCE(p_old_code, '')));
  v_new := upper(trim(COALESCE(p_new_code, '')));
  v_name := trim(COALESCE(p_name, ''));

  IF char_length(v_old) <> 3 OR v_old !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'ERR_INVALID_CODE';
  END IF;
  IF char_length(v_new) <> 3 OR v_new !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'ERR_INVALID_CODE';
  END IF;
  IF length(v_name) < 1 THEN
    RAISE EXCEPTION 'ERR_NAME_REQUIRED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."CurrencyCatalog" WHERE code = v_old) THEN
    RAISE EXCEPTION 'ERR_NOT_FOUND';
  END IF;

  IF v_old = v_new THEN
    UPDATE public."CurrencyCatalog" SET name = v_name WHERE code = v_old;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public."CurrencyCatalog" WHERE code = v_new) THEN
    RAISE EXCEPTION 'ERR_DUPLICATE_CODE';
  END IF;

  SELECT sort_order INTO v_so FROM public."CurrencyCatalog" WHERE code = v_old;

  INSERT INTO public."CurrencyCatalog" (code, name, sort_order)
  VALUES (v_new, v_name, COALESCE(v_so, 100));

  UPDATE public."ExchangeRate" SET currency_from = v_new WHERE currency_from = v_old;
  UPDATE public."ExchangeRate" SET currency_to = v_new WHERE currency_to = v_old;
  UPDATE public."PropertyPrice" SET currency = v_new WHERE currency = v_old;
  UPDATE public."PropertyAppraisal" SET currency = v_new WHERE currency = v_old;
  UPDATE public."PersonPreference" SET price_currency = v_new WHERE price_currency = v_old;
  UPDATE public."OpportunityPropertyOffer" SET currency = v_new WHERE currency = v_old;

  DELETE FROM public."CurrencyCatalog" WHERE code = v_old;
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_currency_catalog(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mutate_currency_catalog(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.mutate_currency_catalog(text, text, text) IS 'Actualiza nombre o código ISO de CurrencyCatalog y propaga código en tasas/precios/ofertas.';
