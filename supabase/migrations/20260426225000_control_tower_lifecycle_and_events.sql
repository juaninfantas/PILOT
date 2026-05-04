-- Control Tower lifecycle and calendar events

DO $$ BEGIN
  ALTER TYPE "OpportunityStatus" ADD VALUE IF NOT EXISTS 'ONHOLD';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FunnelSystemType" AS ENUM ('NORMAL', 'WON', 'LOST', 'ONHOLD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public."Funnel"
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_type "FunnelSystemType" NOT NULL DEFAULT 'NORMAL';

DO $$ BEGIN
  ALTER TABLE public."Funnel"
    ADD CONSTRAINT funnel_system_consistency_chk
    CHECK (
      (is_system = false AND system_type = 'NORMAL')
      OR (is_system = true AND system_type <> 'NORMAL')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure only one system funnel per terminal state
CREATE UNIQUE INDEX IF NOT EXISTS uq_funnel_system_type
  ON public."Funnel" (system_type)
  WHERE is_system = true;

INSERT INTO public."Funnel" (name, slug, is_system, system_type)
VALUES
  ('Ganadas', 'system-won', true, 'WON'),
  ('Perdidas', 'system-lost', true, 'LOST'),
  ('On Hold', 'system-onhold', true, 'ONHOLD')
ON CONFLICT (slug) DO UPDATE
SET
  is_system = EXCLUDED.is_system,
  system_type = EXCLUDED.system_type,
  updated_at = now();

WITH system_funnels AS (
  SELECT id, system_type
  FROM public."Funnel"
  WHERE is_system = true
)
INSERT INTO public."FunnelStage" (funnel_id, name, position, color)
SELECT sf.id, 'Finalizadas', 1, '#9e9e9e'
FROM system_funnels sf
WHERE NOT EXISTS (
  SELECT 1
  FROM public."FunnelStage" fs
  WHERE fs.funnel_id = sf.id
);

-- Calendar events (independent from opportunity activities)
CREATE TABLE IF NOT EXISTS public."CalendarEvent" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  type text NOT NULL DEFAULT 'EVENT',
  notes text,
  opportunity_id uuid REFERENCES public."Opportunity" (id) ON DELETE SET NULL,
  created_by_id uuid REFERENCES public."User" (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_event_starts_at
  ON public."CalendarEvent" (starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_event_opportunity
  ON public."CalendarEvent" (opportunity_id);

ALTER TABLE public."CalendarEvent" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_event_select" ON public."CalendarEvent";
DROP POLICY IF EXISTS "calendar_event_mutate" ON public."CalendarEvent";

CREATE POLICY "calendar_event_select" ON public."CalendarEvent" FOR SELECT TO authenticated
  USING (public.has_permission('view_opportunities'));
CREATE POLICY "calendar_event_mutate" ON public."CalendarEvent" FOR ALL TO authenticated
  USING (public.has_permission('manage_opportunities'))
  WITH CHECK (public.has_permission('manage_opportunities'));

-- Make system funnels/stages immutable
DROP POLICY IF EXISTS "funnel_mutate" ON public."Funnel";
CREATE POLICY "funnel_mutate" ON public."Funnel" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_opportunities')
    AND NOT is_system
  )
  WITH CHECK (
    public.has_permission('manage_opportunities')
    AND NOT is_system
    AND system_type = 'NORMAL'
  );

DROP POLICY IF EXISTS "funnel_stage_mutate" ON public."FunnelStage";
CREATE POLICY "funnel_stage_mutate" ON public."FunnelStage" FOR ALL TO authenticated
  USING (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1
      FROM public."Funnel" f
      WHERE f.id = funnel_id
        AND f.is_system = false
    )
  )
  WITH CHECK (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1
      FROM public."Funnel" f
      WHERE f.id = funnel_id
        AND f.is_system = false
    )
  );
