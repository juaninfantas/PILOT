-- Rango de precio para scoring: mínimo opcional junto al máximo existente.
ALTER TABLE public."PersonPreference"
  ADD COLUMN IF NOT EXISTS min_price text NULL;
