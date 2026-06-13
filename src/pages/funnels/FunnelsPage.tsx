import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { Label } from "../../components/ui/label";
import type { Database } from "../../types/database";
import { opportunityStatusLabel, OPP_PROPERTY_LINK_STATUS_LABEL } from "../../lib/crm-labels";

type OppPropertyLinkStatus = Database["public"]["Tables"]["OpportunityProperty"]["Row"]["link_status"];

type OppCardPropertyLine = {
  property_id: string;
  title: string;
  link_status: OppPropertyLinkStatus;
  priceLine: string | null;
};

type Opp = Database["public"]["Tables"]["Opportunity"]["Row"] & { person_name?: string };
type Funnel = Database["public"]["Tables"]["Funnel"]["Row"];
type Stage = Database["public"]["Tables"]["FunnelStage"]["Row"];
type OppStatus = Database["public"]["Tables"]["Opportunity"]["Row"]["status"];

export function FunnelsPage({ embedded = false }: { embedded?: boolean }) {
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
  /** opportunity_id → propiedades activas con precio listado más reciente */
  const [oppCardProps, setOppCardProps] = useState<Record<string, OppCardPropertyLine[]>>({});
  const [cardTarget, setCardTarget] = useState<Record<string, { funnelId: string; stageId: string }>>({});
  const selectedFunnelRow = useMemo(() => funnels.find((f) => f.id === selectedFunnel) ?? null, [funnels, selectedFunnel]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [moveModal, setMoveModal] = useState<null | { opp: Opp; sourceStageId: string }>(null);
  const [modalFunnelId, setModalFunnelId] = useState("");
  const [modalStageId, setModalStageId] = useState("");
  const modalOperationalFunnels = useMemo(() => funnels.filter((f) => f.is_system !== true), [funnels]);
  const modalStagesForPicked = useMemo(() => {
    if (!modalFunnelId) return [];
    return stages.filter((s) => s.funnel_id === modalFunnelId).sort((a, b) => a.position - b.position);
  }, [stages, modalFunnelId]);

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

    const oppIds = hydrated.map((x) => x.id);
    const nextCard: Record<string, OppCardPropertyLine[]> = {};
    if (oppIds.length) {
      const { data: linkRows } = await supabase
        .from("OpportunityProperty")
        .select("opportunity_id, property_id, link_status")
        .in("opportunity_id", oppIds)
        .is("archived_at", null);
      const links = (linkRows ?? []) as {
        opportunity_id: string;
        property_id: string;
        link_status: OppPropertyLinkStatus;
      }[];
      const propIds = [...new Set(links.map((l) => l.property_id))];
      const titleById: Record<string, string> = {};
      if (propIds.length) {
        const { data: propRows } = await supabase.from("Property").select("id, title").in("id", propIds);
        for (const p of propRows ?? []) titleById[p.id] = (p.title ?? "").trim() || "Propiedad";
      }
      type PriceRow = Pick<
        Database["public"]["Tables"]["PropertyPrice"]["Row"],
        "property_id" | "amount" | "currency" | "kind" | "effective_at"
      >;
      let latestPriceByProp: Record<
        string,
        { amount: string; currency: string; kind: Database["public"]["Tables"]["PropertyPrice"]["Row"]["kind"] }
      > = {};
      if (propIds.length) {
        const { data: priceRows } = await supabase
          .from("PropertyPrice")
          .select("property_id, amount, currency, kind, effective_at")
          .in("property_id", propIds)
          .in("kind", ["LISTING_PUBLIC", "LISTING_RESERVED"])
          .order("effective_at", { ascending: false });
        const seen = new Set<string>();
        for (const r of (priceRows ?? []) as PriceRow[]) {
          const pid = r.property_id;
          if (seen.has(pid)) continue;
          seen.add(pid);
          latestPriceByProp[pid] = { amount: r.amount, currency: r.currency, kind: r.kind };
        }
      }
      function priceLabel(
        pid: string,
      ): string | null {
        const pr = latestPriceByProp[pid];
        if (!pr) return null;
        const modo = pr.kind === "LISTING_RESERVED" ? "Reservado" : "Público";
        return `${pr.currency} ${Number(pr.amount).toLocaleString()} (${modo})`;
      }
      for (const l of links) {
        const line: OppCardPropertyLine = {
          property_id: l.property_id,
          title: titleById[l.property_id] ?? "Propiedad",
          link_status: l.link_status,
          priceLine: priceLabel(l.property_id),
        };
        if (!nextCard[l.opportunity_id]) nextCard[l.opportunity_id] = [];
        nextCard[l.opportunity_id].push(line);
      }
      for (const k of Object.keys(nextCard)) {
        nextCard[k].sort((a, b) => a.title.localeCompare(b.title, "es"));
      }
    }

    setOppCardProps(nextCard);
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

  async function persistOppFunnelMove(oppId: string, targetFunnelId: string, targetStageId: string): Promise<boolean> {
    if (!targetFunnelId || !targetStageId) {
      setMsg("Elegí funnel y etapa.");
      return false;
    }
    const targetFunnel = funnels.find((f) => f.id === targetFunnelId);
    if (targetFunnel?.is_system) {
      setMsg("No se puede mover manualmente a funnels de sistema.");
      return false;
    }
    const stageOk = stages.some((st) => st.id === targetStageId && st.funnel_id === targetFunnelId);
    if (!stageOk) {
      setMsg("La etapa no corresponde al funnel elegido.");
      return false;
    }
    const { error } = await supabase
      .from("Opportunity")
      .update({ funnel_id: targetFunnelId, stage_id: targetStageId, status: "OPEN" })
      .eq("id", oppId);
    if (error) {
      setMsg(error.message);
      return false;
    }
    setMsg("Oportunidad movida de funnel.");
    setCardTarget((prev) => ({ ...prev, [oppId]: { funnelId: targetFunnelId, stageId: targetStageId } }));
    setRows((prev) =>
      prev.map((x) => (x.id === oppId ? { ...x, funnel_id: targetFunnelId, stage_id: targetStageId, status: "OPEN" } : x)),
    );
    return true;
  }

  async function closeOpportunity(oppId: string, status: OppStatus): Promise<boolean> {
    const row = rows.find((x) => x.id === oppId);
    if (!row) return false;
    const label =
      status === "WON" ? "ganada" : status === "LOST" ? "perdida" : opportunityStatusLabel("ONHOLD").toLowerCase();
    const ok = window.confirm(`¿Seguro que querés marcar esta oportunidad como ${label}?`);
    if (!ok) return false;
    const systemFunnel = funnels.find((f) => f.is_system && f.system_type === status);
    const systemStage = stages
      .filter((s) => s.funnel_id === systemFunnel?.id)
      .sort((a, b) => a.position - b.position)[0];
    if (!systemFunnel || !systemStage) {
      setMsg("No se encontró el funnel de sistema para ese estado.");
      return false;
    }
    const { error } = await supabase
      .from("Opportunity")
      .update({ status, funnel_id: systemFunnel.id, stage_id: systemStage.id })
      .eq("id", oppId);
    if (error) {
      setMsg(error.message);
      return false;
    }
    setMsg(`Oportunidad marcada como ${label}.`);
    setRows((prev) =>
      prev.map((x) => (x.id === oppId ? { ...x, status, funnel_id: systemFunnel.id, stage_id: systemStage.id } : x)),
    );
    return true;
  }

  function openMoveModal(o: Opp, sourceStageId: string) {
    const currentFunnel = funnels.find((f) => f.id === o.funnel_id);
    const fallbackOperationalFunnel = funnels.find((f) => f.is_system !== true)?.id ?? "";
    const baseTargetFunnelId = cardTarget[o.id]?.funnelId ?? o.funnel_id ?? selectedFunnel;
    const fid = currentFunnel?.is_system ? fallbackOperationalFunnel : baseTargetFunnelId;
    const nextStages = stages.filter((s) => s.funnel_id === fid).sort((a, b) => a.position - b.position);
    const sid = cardTarget[o.id]?.stageId ?? o.stage_id ?? nextStages[0]?.id ?? "";
    setModalFunnelId(fid);
    setModalStageId(nextStages.some((s) => s.id === sid) ? sid : (nextStages[0]?.id ?? ""));
    setMoveModal({ opp: o, sourceStageId });
  }

  function closeMoveModal() {
    setMoveModal(null);
  }

  async function submitMoveModalAction() {
    if (!moveModal) return;
    const ok = await persistOppFunnelMove(moveModal.opp.id, modalFunnelId, modalStageId);
    if (ok) closeMoveModal();
  }

  const moveModalShowsCloseRow =
    moveModal &&
    !selectedFunnelRow?.is_system &&
    selectedStages.length > 0 &&
    selectedStages[selectedStages.length - 1]?.id === moveModal.sourceStageId;

  return (
    <RequirePermission slug="view_funnels">
      <>
      <div
        className={
          embedded ? "scroll-mt-10 space-y-4 border-t border-[var(--jif-line)] pt-10" : "jif-page space-y-8"
        }
      >
        <header className={embedded ? "flex flex-wrap items-end justify-between gap-4 border-b border-[var(--jif-line)] pb-4" : "border-b border-[var(--jif-line)] pb-6"}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className={embedded ? "min-w-0 flex-1" : ""}>
              {embedded ? (
                <>
                  <h2 className="font-neo text-xl font-semibold text-[var(--foreground)]">Funnels</h2>
                  <p className="jif-caps jif-dim mt-1 text-[0.65rem]">
                    Tablero por etapa. Configuración en{" "}
                    <Link to="/dashboard/admin?tab=configuracion" className="text-[var(--jif-gold)] hover:underline">
                      Administración
                    </Link>
                    .
                  </p>
                  <Link
                    to="/dashboard/reports/funnels"
                    className="mt-2 inline-block jif-caps text-[0.6rem] text-[var(--accent)] hover:underline"
                  >
                    Ver pantalla completa →
                  </Link>
                </>
              ) : (
                <>
                  <h1 className="jif-hero">Funnels</h1>
                  <p className="jif-caps jif-dim mt-1">
                    Gestioná funnels y etapas en{" "}
                    <Link to="/dashboard/admin?tab=configuracion" className="text-[var(--jif-gold)] hover:underline">
                      Administración → Configuración
                    </Link>
                    .
                  </p>
                </>
              )}
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

        <div
          className={[
            "jif-panel p-4 md:p-5",
            embedded ? "max-h-[min(70vh,680px)] overflow-y-auto overscroll-contain" : "",
          ].join(" ")}
        >
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
                    {(byStage.get(stage.id) ?? []).map((o) => (
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
                        {(oppCardProps[o.id] ?? []).length > 0 ? (
                          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t border-[var(--jif-line)]/80 pt-2 text-[10px] leading-snug text-[var(--muted)]">
                            {oppCardProps[o.id].map((ln) => (
                              <li key={ln.property_id}>
                                <Link
                                  to={`/dashboard/properties/${ln.property_id}`}
                                  className="font-medium text-[var(--foreground)] hover:underline"
                                >
                                  {ln.title}
                                </Link>
                                <span className="text-[var(--muted)]">
                                  {" "}
                                  · {OPP_PROPERTY_LINK_STATUS_LABEL[ln.link_status]}
                                  {ln.priceLine ? ` · ${ln.priceLine}` : " · Sin listado"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-[var(--muted)]">{opportunityStatusLabel(o.status)}</span>
                          <Link
                            to={`/dashboard/opportunities/${o.id}`}
                            className="jif-caps text-[10px] text-[var(--jif-gold)] hover:underline"
                          >
                            Ver
                          </Link>
                        </div>
                        {canManage ? (
                          <div className="mt-3 space-y-2 border-t border-[var(--jif-line)] pt-3">
                            <Button
                              type="button"
                              size="sm"
                              className="jif-btn-ghost w-full"
                              onClick={() => openMoveModal(o, stage.id)}
                            >
                              Cambiar funnel
                            </Button>
                            {!selectedFunnelRow?.is_system && selectedStages[selectedStages.length - 1]?.id === stage.id ? (
                              <div className="grid grid-cols-3 gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="jif-btn-primary text-[10px]"
                                  onClick={() => void closeOpportunity(o.id, "WON")}
                                >
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
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(moveModal)}
        title="Cambiar funnel"
        panelClassName="max-w-md"
        onClose={closeMoveModal}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={closeMoveModal}>
              Cancelar
            </Button>
            <Button type="button" className="jif-btn-primary" onClick={() => void submitMoveModalAction()}>
              Aplicar
            </Button>
          </>
        }
      >
        {moveModal ? (
          <>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]/50 p-3">
              <p className="font-medium text-[var(--foreground)]">{moveModal.opp.title ?? "Sin título"}</p>
              <p className="jif-caps mt-1 text-[10px] text-[var(--muted)]">{moveModal.opp.person_name ?? "—"}</p>
              <p className="mt-2 text-xs text-[var(--muted)]">Estado: {opportunityStatusLabel(moveModal.opp.status)}</p>
            </div>
            <div>
              <Label htmlFor="mv-funnel">Funnel destino</Label>
              <select
                id="mv-funnel"
                className="jif-input mt-1 h-9 w-full text-sm"
                value={modalFunnelId}
                onChange={(e) => {
                  const v = e.target.value;
                  setModalFunnelId(v);
                  const ns = stages.filter((s) => s.funnel_id === v).sort((a, b) => a.position - b.position);
                  setModalStageId(ns[0]?.id ?? "");
                }}
              >
                {modalOperationalFunnels.map((funnel) => (
                  <option key={funnel.id} value={funnel.id}>
                    {funnel.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="mv-stage">Etapa destino</Label>
              <select
                id="mv-stage"
                className="jif-input mt-1 h-9 w-full text-sm"
                value={modalStageId}
                onChange={(e) => setModalStageId(e.target.value)}
                disabled={!modalFunnelId}
              >
                {modalStagesForPicked.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
            {moveModalShowsCloseRow ? (
              <div className="space-y-2 border-t border-[var(--border)] pt-4">
                <p className="text-xs text-[var(--muted)]">Estás en la última etapa del tablero: cierre rápido</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="jif-btn-primary text-[10px]"
                    onClick={() =>
                      void (async () => {
                        if (!moveModal) return;
                        if (await closeOpportunity(moveModal.opp.id, "WON")) closeMoveModal();
                      })()
                    }
                  >
                    Ganada
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="jif-btn-ghost text-[10px]"
                    onClick={() =>
                      void (async () => {
                        if (!moveModal) return;
                        if (await closeOpportunity(moveModal.opp.id, "LOST")) closeMoveModal();
                      })()
                    }
                  >
                    Perdida
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="jif-btn-ghost text-[10px]"
                    onClick={() =>
                      void (async () => {
                        if (!moveModal) return;
                        if (await closeOpportunity(moveModal.opp.id, "ONHOLD")) closeMoveModal();
                      })()
                    }
                  >
                    En pausa
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>
      </>
    </RequirePermission>
  );
}
