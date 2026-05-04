-- Oferta aceptada → estado comercial "reservada"
ALTER TABLE public."Property" DROP CONSTRAINT IF EXISTS property_listing_status_chk;
ALTER TABLE public."Property" ADD CONSTRAINT property_listing_status_chk
  CHECK (listing_status IN ('ARCHIVED', 'AVAILABLE', 'OTHER', 'URGENT', 'RESERVED'));

COMMENT ON COLUMN public."Property".listing_status IS 'Disponible, Reservada (oferta), Urgente, Otro, Archivado (claves en inglés).';
