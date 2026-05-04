import { useEffect, useMemo, useState } from "react";
import { RequirePermission } from "../../components/RequirePermission";
import { FunnelShapeChart, type FunnelShapeRow } from "../../components/charts/FunnelShapeChart";
import { NeoPageHeader, NeoPageShell } from "../../components/ui/neo-brutal";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../types/database";

type Opp = Database["public"]["Tables"]["Opportunity"]["Row"];
type Funnel = Database["public"]["Tables"]["Funnel"]["Row"];
type Stage = Database["public"]["Tables"]["FunnelStage"]["Row"];

export function ReportsPipelinePage() {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [selectedFunnel, setSelectedFunnel] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [f, s, o] = await Promise.all([
        supabase.from("Funnel").select("*").order("name"),
        supabase.from("FunnelStage").select("*").order("position"),
        supabase.from("Opportunity").select("id, funnel_id, stage_id, estimated_value"),
      ]);
      if (f.error) {
        setLoadError(f.error.message);
        console.error(f.error);
      } else {
        setLoadError(null);
      }
      const funnelRows = ((f.data as Funnel[]) ?? []).filter((row) => row.is_system !== true);
      setFunnels(funnelRows);
      setStages((s.data as Stage[]) ?? []);
      setOpps((o.data as Opp[]) ?? []);
      if (funnelRows[0]?.id) setSelectedFunnel(funnelRows[0].id);
    })();
  }, []);

  const selectedStages = useMemo(
    () => stages.filter((x) => x.funnel_id === selectedFunnel).sort((a, b) => a.position - b.position),
    [stages, selectedFunnel],
  );

  const pipelineRows = useMemo(() => {
    const total = opps.filter((o) => o.funnel_id === selectedFunnel).length;
    return selectedStages.map((stage) => {
      const stageOpps = opps.filter((o) => o.funnel_id === selectedFunnel && o.stage_id === stage.id);
      const budgeted = stageOpps.filter((o) => o.estimated_value != null).length;
      const notBudgeted = stageOpps.length - budgeted;
      const pct = total > 0 ? Math.round((stageOpps.length / total) * 1000) / 10 : 0;
      return { stage, total: stageOpps.length, budgeted, notBudgeted, pct };
    });
  }, [opps, selectedFunnel, selectedStages]);

  const shapeRows: FunnelShapeRow[] = useMemo(
    () =>
      pipelineRows.map((r) => ({
        id: r.stage.id,
        label: r.stage.name,
        count: r.total,
        budgeted: r.budgeted,
        notBudgeted: r.notBudgeted,
        pct: r.pct,
      })),
    [pipelineRows],
  );

  return (
    <RequirePermission slug="view_reports">
      <NeoPageShell>
        <NeoPageHeader
          title="Pipeline"
          subtitle="Forma del embudo y reparto de oportunidades por etapa del funnel seleccionado."
        />
        {loadError ? <p className="jif-caps mb-4 text-amber-400">Error: {loadError}</p> : null}
        {funnels.length === 0 && !loadError ? (
          <p className="jif-caps jif-dim mb-6 border border-[var(--jif-line)] p-4">No hay funnels operativos.</p>
        ) : null}
        {funnels.length > 0 ? (
          <div className="mb-8 max-w-xs">
            <label htmlFor="pipeline-funnel" className="jif-caps jif-dim" style={{ fontSize: "0.6rem" }}>
              Funnel
            </label>
            <select
              id="pipeline-funnel"
              className="neo-field mt-2"
              value={selectedFunnel}
              onChange={(e) => setSelectedFunnel(e.target.value)}
            >
              {funnels.map((funnel) => (
                <option key={funnel.id} value={funnel.id}>
                  {funnel.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="rounded border border-[var(--jif-line)] bg-[var(--card)] p-6 shadow-[var(--neo-shadow-sm)]">
          <FunnelShapeChart rows={shapeRows} />
        </div>
      </NeoPageShell>
    </RequirePermission>
  );
}
