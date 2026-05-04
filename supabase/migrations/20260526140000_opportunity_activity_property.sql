-- Optional link from opportunity activity to a property (e.g. visit on a specific listing).
ALTER TABLE public."OpportunityActivity"
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public."Property" (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opp_activity_property ON public."OpportunityActivity" (property_id);
