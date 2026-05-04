-- Funnel/Kanban support for opportunities

CREATE TABLE IF NOT EXISTS public."Funnel" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."FunnelStage" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public."Funnel" (id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  color text
);

ALTER TABLE public."Opportunity"
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public."Funnel" (id),
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public."FunnelStage" (id);

CREATE INDEX IF NOT EXISTS idx_funnel_stage_funnel ON public."FunnelStage" (funnel_id, position);
CREATE INDEX IF NOT EXISTS idx_opp_funnel_stage ON public."Opportunity" (funnel_id, stage_id);

-- Seed a default funnel/stages
INSERT INTO public."Funnel" (name, slug)
VALUES ('Comercial', 'comercial')
ON CONFLICT (slug) DO NOTHING;

WITH f AS (
  SELECT id FROM public."Funnel" WHERE slug = 'comercial'
)
INSERT INTO public."FunnelStage" (funnel_id, name, position, color)
SELECT f.id, s.name, s.position, s.color
FROM f
JOIN (
  VALUES
    ('Nuevo', 1, '#2e7d32'),
    ('Contacto', 2, '#4caf50'),
    ('Visita', 3, '#ffb74d'),
    ('Negociacion', 4, '#f57c00'),
    ('Cerrado', 5, '#9e9e9e')
) AS s(name, position, color) ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public."FunnelStage" fs WHERE fs.funnel_id = f.id
);

-- Backfill existing opportunities into default funnel first stage
WITH default_funnel AS (
  SELECT id FROM public."Funnel" WHERE slug = 'comercial' LIMIT 1
),
default_stage AS (
  SELECT fs.id, fs.funnel_id
  FROM public."FunnelStage" fs
  JOIN default_funnel df ON df.id = fs.funnel_id
  ORDER BY fs.position ASC
  LIMIT 1
)
UPDATE public."Opportunity" o
SET funnel_id = ds.funnel_id,
    stage_id = ds.id
FROM default_stage ds
WHERE o.funnel_id IS NULL OR o.stage_id IS NULL;

ALTER TABLE public."Funnel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FunnelStage" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "funnel_select" ON public."Funnel";
DROP POLICY IF EXISTS "funnel_mutate" ON public."Funnel";
DROP POLICY IF EXISTS "funnel_stage_select" ON public."FunnelStage";
DROP POLICY IF EXISTS "funnel_stage_mutate" ON public."FunnelStage";

CREATE POLICY "funnel_select" ON public."Funnel" FOR SELECT TO authenticated
  USING (public.has_permission('view_opportunities'));
CREATE POLICY "funnel_mutate" ON public."Funnel" FOR ALL TO authenticated
  USING (public.has_permission('manage_opportunities'))
  WITH CHECK (public.has_permission('manage_opportunities'));

CREATE POLICY "funnel_stage_select" ON public."FunnelStage" FOR SELECT TO authenticated
  USING (public.has_permission('view_opportunities'));
CREATE POLICY "funnel_stage_mutate" ON public."FunnelStage" FOR ALL TO authenticated
  USING (public.has_permission('manage_opportunities'))
  WITH CHECK (public.has_permission('manage_opportunities'));
