import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import type { Database } from "../../types/database";
import { opportunityStatusLabel } from "../../lib/crm-labels";

type Opp = Database["public"]["Tables"]["Opportunity"]["Row"] & { person_name?: string };
type Funnel = Database["public"]["Tables"]["Funnel"]["Row"];
type Stage = Database["public"]["Tables"]["FunnelStage"]["Row"];
type OppStatus = Database["public"]["Tables"]["Opportunity"]["Row"]["status"];

export function FunnelsPage() {
  const { permissions } = useAuth();
  const canManage = hasPermission(permissions, "manage_opportunities");
  const [rows, setRows] = useState<Opp[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedFunnel, setSelectedFunnel] = useState<string>("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardTarget, setCardTarget] = useState<Record<string, { funnelId: string; stageId: string }>>({});
  const selectedFunnelRow = useMemo(() => funnels.find((f) => f.id === selectedFunnel) ?? null, [funnels, selectedFunnel]);
  const [searchParams, setSearchParams] = useSearchParams();

  async function loadAll() {
    setLoading(true);
    const [{ data: f }, { data: s }, { data: o }] = await Promise.all([
      supabase.from("Funnel").select("*").order("name"),
      supabase.from("FunnelStage").select("*").order("position"),
      supabase.from("Opportunity").select("*").order("updated_at", { ascending: false }),
    ]);
    const funnelRows = (f as Funnel[]) ?? [];
    const stageRows = (s as Stage[]) ?? [];
    const list = (o as Opp[]) ?? [];
    const ids = [...new Set(list.map((x) => x.person_id))];
    const { data: persons } = ids.length
      ? await supabase.from("Person").select("id, name").in("id", ids)
      : { data: [] as { id: string; name: string }[] };
    const byId = Object.fromEntries((persons ?? []).map((p) => [p.id, p.name]));
    const hydrated = list.map((x) => ({ ...x, person_name: byId[x.person_id] }));

    setFunnels(funnelRows);
    setStages(stageRows);
    setRows(hydrated);
    if (!selectedFunnel && funnelRows[0]?.id) setSelectedFunnel(funnelRows[0].id);
    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const funnelParam = searchParams.get("funnel");
  useEffect(() => {
    if (!funnelParam || !funnels.length) return;
    if (funnels.some((f) => f.id === funnelParam)) {
      setSelectedFunnel(funnelParam);
    }
  }, [funnelParam, funnels]);

  const selectedStages = useMemo(
    () => stages.filter((s) => s.funnel_id === selectedFunnel).sort((a, b) => a.position - b.position),
    [stages, selectedFunnel],
  );

  const byStage = useMemo(() => {
    const map = new Map<string, Opp[]>();
    for (const st of selectedStages) map.set(st.id, []);
    for (const row of rows) {
      if (row.funnel_id !== selectedFunnel || !row.stage_id) continue;
      if (!map.has(row.stage_id)) map.set(row.stage_id, []);
      map.get(row.stage_id)?.push(row);
    }
    return map;
  }, [rows, selectedStages, selectedFunnel]);

  async function onDropStage(stageId: string) {
    if (!dragId) return;
    if (selectedFunnelRow?.is_system) return;
    const row = rows.find((x) => x.id === dragId);
    if (!row || row.stage_id === stageId) return;
    const { error } = await supabase
      .from("Opportunity")
      .update({ stage_id: stageId, funnel_id: selectedFunnel, status: "OPEN" })
      .eq("id", dragId);
    if (error) setMsg(error.message);
    else {
      setMsg("Oportunidad movida.");
      setRows((prev) => prev.map((x) => (x.id === dragId ? { ...x, stage_id: stageId, funnel_id: selectedFunnel } : x)));
    }
    setDragId(null);
    setDragOverStage(null);
  }

  async function moveToAnotherFunnel(oppId: string) {
    const target = cardTarget[oppId];
    if (!target?.funnelId || !target?.stageId) return;
    const targetFunnel = funnels.find((f) => f.id === target.funnelId);
    if (targetFunnel?.is_system) {
      setMsg("No se puede mover manualmente a funnels de sistema.");
      return;
    }
    const { error } = await supabase
      .from("Opportunity")
      .update({ funnel_id: target.funnelId, stage_id: target.stageId, status: "OPEN" })
      .eq("id", oppId);
    if (error) setMsg(error.message);
    else {
      setMsg("Oportunidad movida de funnel.");
      setRows((prev) =>
        prev.map((x) => (x.id === oppId ? { ...x, funnel_id: target.funnelId, stage_id: target.stageId, status: "OPEN" } : x)),
      );
    }
  }

  async function closeOpportunity(oppId: string, status: OppStatus) {
    const row = rows.find((x) => x.id === oppId);
    if (!row) return;
    const label =
      status === "WON" ? "ganada" : status === "LOST" ? "perdida" : opportunityStatusLabel("ONHOLD").toLowerCase();
    const ok = window.confirm(`¿Seguro que querés marcar esta oportunidad como ${label}?`);
    if (!ok) return;
    const systemFunnel = funnels.find((f) => f.is_system && f.system_type === status);
    const systemStage = stages
      .filter((s) => s.funnel_id === systemFunnel?.id)
      .sort((a, b) => a.position - b.position)[0];
    if (!systemFunnel || !systemStage) {
      setMsg("No se encontró el funnel de sistema para ese estado.");
      return;
    }
    const { error } = await supabase
      .from("Opportunity")
      .update({ status, funnel_id: systemFunnel.id, stage_id: systemStage.id })
      .eq("id", oppId);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg(`Oportunidad marcada como ${label}.`);
    setRows((prev) =>
      prev.map((x) => (x.id === oppId ? { ...x, status, funnel_id: systemFunnel.id, stage_id: systemStage.id } : x)),
    );
  }

  return (
    <RequirePermission slug="view_opportunities">
      <div className="jif-page space-y-8">
        <header className="border-b border-[var(--jif-line)] pb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="jif-hero">Funnels</h1>
              <p className="jif-caps jif-dim mt-1">
                Gestioná funnels y etapas en{" "}
                <Link to="/dashboard/admin?tab=configuracion" className="text-[var(--jif-gold)] hover:underline">
                  Administración → Configuración
                </Link>
                .
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <>
                  <Link to="/dashboard/opportunities/new">
                    <Button type="button" className="jif-btn-ghost">
                      Nueva oportunidad
                    </Button>
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </header>
        {msg ? <p className="jif-caps text-[var(--jif-gold)]">{msg}</p> : null}
        {loading ? <p className="jif-caps jif-dim">Cargando…</p> : null}

        <div className="jif-panel p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="funnel-select" className="jif-caps jif-dim">
                Funnel
              </Label>
              <select
                id="funnel-select"
                className="jif-input mt-1 h-10 w-[min(100%,280px)]"
                value={selectedFunnel}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedFunnel(id);
                  setSearchParams(id ? { funnel: id } : {});
                }}
              >
                {funnels.map((funnel) => (
                  <option key={funnel.id} value={funnel.id}>
                    {funnel.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedFunnelRow?.is_system ? <p className="jif-caps jif-dim mt-5">Funnel de sistema: solo lectura.</p> : null}
          </div>

          <div className="flex gap-4 overflow-x-auto pb-2">
            {selectedStages.map((stage) => {
              const isOver = dragOverStage === stage.id && dragId !== null;
              return (
                <div
                  key={stage.id}
                  className={[
                    "jif-kanban-col min-h-[320px] min-w-[280px] p-3",
                    isOver ? "jif-kanban-col-active" : "",
                  ].join(" ")}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverStage(stage.id);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverStage(null);
                    }
                  }}
                  onDrop={() => void onDropStage(stage.id)}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="min-w-0 text-xs font-semibold leading-snug text-[var(--foreground)]">{stage.name}</span>
                    <span className="jif-caps font-mono text-[10px] text-[var(--jif-gold)]">
                      {byStage.get(stage.id)?.length ?? 0}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {isOver && dragId ? <div className="jif-dropzone h-16" /> : null}
                    {(byStage.get(stage.id) ?? []).map((o) => {
                      const fallbackOperationalFunnel = funnels.find((f) => f.is_system !== true)?.id ?? "";
                      const currentFunnel = funnels.find((f) => f.id === o.funnel_id);
                      const baseTargetFunnelId = cardTarget[o.id]?.funnelId ?? o.funnel_id ?? selectedFunnel;
                      const targetFunnelId = currentFunnel?.is_system ? fallbackOperationalFunnel : baseTargetFunnelId;
                      const targetStages = stages
                        .filter((s) => s.funnel_id === targetFunnelId)
                        .sort((a, b) => a.position - b.position);
                      const targetStageId = cardTarget[o.id]?.stageId ?? o.stage_id ?? targetStages[0]?.id ?? "";
                      return (
                        <div
                          key={o.id}
                          className="jif-card p-3"
                          draggable={canManage && !selectedFunnelRow?.is_system}
                          onDragStart={() => setDragId(o.id)}
                          onDragEnd={() => {
                            setDragId(null);
                            setDragOverStage(null);
                          }}
                        >
                          <p className="text-sm font-medium">{o.title ?? "Sin título"}</p>
                          <p className="jif-caps jif-dim mt-1 text-[10px]">{o.person_name ?? "—"}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-[var(--muted)]">{opportunityStatusLabel(o.status)}</span>
                            <Link to={`/dashboard/opportunities/${o.id}`} className="jif-caps text-[10px] text-[var(--jif-gold)] hover:underline">
                              Ver
                            </Link>
                          </div>
                          {canManage ? (
                            <div className="mt-3 space-y-2 border-t border-[var(--jif-line)] pt-2">
                              <p className="jif-caps jif-dim text-[9px]">Mover a otro funnel</p>
                              <select
                                className="jif-input h-8 w-full text-xs"
                                value={targetFunnelId}
                                onChange={(e) =>
                                  setCardTarget((prev) => {
                                    const nextFunnel = e.target.value;
                                    const nextStages = stages
                                      .filter((s) => s.funnel_id === nextFunnel)
                                      .sort((a, b) => a.position - b.position);
                                    return {
                                      ...prev,
                                      [o.id]: { funnelId: nextFunnel, stageId: nextStages[0]?.id ?? "" },
                                    };
                                  })
                                }
                              >
                                {funnels.filter((funnel) => funnel.is_system !== true).map((funnel) => (
                                  <option key={funnel.id} value={funnel.id}>
                                    {funnel.name}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="jif-input h-8 w-full text-xs"
                                value={targetStageId}
                                onChange={(e) =>
                                  setCardTarget((prev) => ({
                                    ...prev,
                                    [o.id]: { funnelId: targetFunnelId, stageId: e.target.value },
                                  }))
                                }
                              >
                                {targetStages.map((st) => (
                                  <option key={st.id} value={st.id}>
                                    {st.name}
                                  </option>
                                ))}
                              </select>
                              <Button
                                type="button"
                                size="sm"
                                className="jif-btn-ghost w-full"
                                onClick={() => void moveToAnotherFunnel(o.id)}
                              >
                                Mover
                              </Button>
                              {!selectedFunnelRow?.is_system && selectedStages[selectedStages.length - 1]?.id === stage.id ? (
                                <div className="grid grid-cols-3 gap-1">
                                  <Button type="button" size="sm" className="jif-btn-primary text-[10px]" onClick={() => void closeOpportunity(o.id, "WON")}>
                                    Ganada
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="jif-btn-ghost text-[10px]"
                                    onClick={() => void closeOpportunity(o.id, "LOST")}
                                  >
                                    Perdida
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="jif-btn-ghost text-[10px]"
                                    onClick={() => void closeOpportunity(o.id, "ONHOLD")}
                                  >
                                    En pausa
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}
