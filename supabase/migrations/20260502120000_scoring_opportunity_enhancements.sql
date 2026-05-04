-- Scoring: modo de creación de oportunidad, estado por propiedad, ofertas, precio duplicado, datos persona.

DO $$ BEGIN
  CREATE TYPE public."OpportunityCreationMode" AS ENUM ('MANUAL', 'SCORING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."OppPropertyLinkStatus" AS ENUM ('PROPOSED', 'POSSIBLE', 'INTERESTED', 'DISCARDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."OfferInOpportunityStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DISCARDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public."Opportunity"
  ADD COLUMN IF NOT EXISTS creation_mode public."OpportunityCreationMode" NOT NULL DEFAULT 'MANUAL';

ALTER TABLE public."OpportunityProperty"
  ADD COLUMN IF NOT EXISTS link_status public."OppPropertyLinkStatus" NOT NULL DEFAULT 'PROPOSED';

UPDATE public."OpportunityProperty" SET link_status = 'PROPOSED' WHERE link_status IS NULL;

ALTER TABLE public."Person"
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS trade_name text;

ALTER TABLE public."PersonPreference"
  ADD COLUMN IF NOT EXISTS buyer_extra_json text;

-- Precios: valor para ofertas generadas desde oportunidades
DO $$ BEGIN
  ALTER TYPE public."PriceKind" ADD VALUE 'OFFER_OPPORTUNITY';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public."OpportunityPropertyOffer" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public."Opportunity" (id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public."Property" (id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  offered_at timestamptz NOT NULL DEFAULT now(),
  status public."OfferInOpportunityStatus" NOT NULL DEFAULT 'PROPOSED',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opp_offer_fk_opp_property FOREIGN KEY (opportunity_id, property_id)
    REFERENCES public."OpportunityProperty" (opportunity_id, property_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_opp_property_offer_opp ON public."OpportunityPropertyOffer" (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_property_offer_prop ON public."OpportunityPropertyOffer" (property_id);

ALTER TABLE public."PropertyPrice"
  ADD COLUMN IF NOT EXISTS source_offer_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_price_source_offer_fk'
  ) THEN
    ALTER TABLE public."PropertyPrice"
      ADD CONSTRAINT property_price_source_offer_fk
      FOREIGN KEY (source_offer_id) REFERENCES public."OpportunityPropertyOffer" (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_price_source_offer_id
  ON public."PropertyPrice" (source_offer_id)
  WHERE source_offer_id IS NOT NULL;

-- RLS ofertas: misma organización que la oportunidad
ALTER TABLE public."OpportunityPropertyOffer" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opp_offer_select" ON public."OpportunityPropertyOffer";
DROP POLICY IF EXISTS "opp_offer_mutate" ON public."OpportunityPropertyOffer";

CREATE POLICY "opp_offer_select" ON public."OpportunityPropertyOffer" FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public."Opportunity" o
      WHERE o.id = opportunity_id AND o.organization_id = public.user_organization_id()
    )
  );

CREATE POLICY "opp_offer_mutate" ON public."OpportunityPropertyOffer" FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public."Opportunity" o
      WHERE o.id = opportunity_id AND o.organization_id = public.user_organization_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Opportunity" o
      WHERE o.id = opportunity_id AND o.organization_id = public.user_organization_id()
    )
  );
