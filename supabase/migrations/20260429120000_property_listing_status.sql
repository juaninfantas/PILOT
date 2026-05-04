-- Estado comercial de publicación (filtro y grilla)
ALTER TABLE public."Property"
  ADD COLUMN IF NOT EXISTS listing_status text NOT NULL DEFAULT 'AVAILABLE';

ALTER TABLE public."Property" DROP CONSTRAINT IF EXISTS property_listing_status_chk;
ALTER TABLE public."Property" ADD CONSTRAINT property_listing_status_chk
  CHECK (listing_status IN ('ARCHIVED', 'AVAILABLE', 'OTHER', 'URGENT'));

COMMENT ON COLUMN public."Property".listing_status IS 'Disponible, Urgente, Archivado, Otro (claves en inglés).';
