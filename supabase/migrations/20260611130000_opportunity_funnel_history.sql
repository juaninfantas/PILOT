-- Historial de movimientos embudo / etapa / estado de oportunidad (auditoría).

CREATE TABLE IF NOT EXISTS public."OpportunityFunnelHistory" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public."Opportunity" (id) ON DELETE CASCADE,
  from_funnel_id uuid REFERENCES public."Funnel" (id) ON DELETE SET NULL,
  to_funnel_id uuid REFERENCES public."Funnel" (id) ON DELETE SET NULL,
  from_stage_id uuid REFERENCES public."FunnelStage" (id) ON DELETE SET NULL,
  to_stage_id uuid REFERENCES public."FunnelStage" (id) ON DELETE SET NULL,
  from_status public."OpportunityStatus" NOT NULL,
  to_status public."OpportunityStatus" NOT NULL,
  reason text,
  changed_by_id uuid REFERENCES public."User" (id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opp_funnel_hist_opp_changed
  ON public."OpportunityFunnelHistory" (opportunity_id, changed_at DESC);

ALTER TABLE public."OpportunityFunnelHistory" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opp_funnel_hist_select" ON public."OpportunityFunnelHistory";
CREATE POLICY "opp_funnel_hist_select" ON public."OpportunityFunnelHistory" FOR SELECT TO authenticated
  USING (
    public.has_permission('view_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o
      WHERE o.id = opportunity_id AND o.organization_id = public.user_organization_id()
    )
  );

DROP POLICY IF EXISTS "opp_funnel_hist_insert" ON public."OpportunityFunnelHistory";
CREATE POLICY "opp_funnel_hist_insert" ON public."OpportunityFunnelHistory" FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('manage_opportunities')
    AND EXISTS (
      SELECT 1 FROM public."Opportunity" o
      WHERE o.id = opportunity_id AND o.organization_id = public.user_organization_id()
    )
  );

GRANT SELECT, INSERT ON public."OpportunityFunnelHistory" TO authenticated;
