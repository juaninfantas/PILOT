-- Adds postal code to property location.
ALTER TABLE public."Property"
ADD COLUMN IF NOT EXISTS postal_code text;

