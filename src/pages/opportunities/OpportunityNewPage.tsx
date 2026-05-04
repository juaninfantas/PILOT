import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { recomputeMatchingForPerson } from "../../lib/recompute-matching";
import { rankPropertiesForPerson } from "../../lib/compute-opportunity-scores";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import type { Database, OpportunityCreationMode } from "../../types/database";
import { OPPORTUNITY_CREATION_MODE_LABEL } from "../../lib/crm-labels";
import { useActiveOrganization } from "../../contexts/OrganizationContext";
import { ChevronDown, X } from "lucide-react";
import { MatchExplainBreakdown } from "../../components/scoring/MatchExplainBreakdown";
import { cn } from "../../lib/utils";

type Funnel = Database["public"]["Tables"]["Funnel"]["Row"];
type Stage = Database["public"]["Tables"]["FunnelStage"]["Row"];

export function OpportunityNewPage() {
  const org = useActiveOrganization();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();

  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [properties, setProperties] = useState<{ id: string; title: string }[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [funnelId, setFunnelId] = useState("");
  const [stageId, setStageId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [creationMode, setCreationMode] = useState<OpportunityCreationMode>("MANUAL");
  const [personId, setPersonId] = useState("");
  const [propFilter, setPropFilter] = useState("");
  const [selectedPropIds, setSelectedPropIds] = useState<string[]>([]);

  const [ranked, setRanked] = useState<Awaited<ReturnType<typeof rankPropertiesForPerson>>["ranked"]>([]);
  const [rankBusy, setRankBusy] = useState(false);
  const [rankExplainOpen, setRankExplainOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void supabase.from("Person").select("id, name").order("name").then(({ data }) => {
      setPeople((data as { id: string; name: string }[]) ?? []);
    });
    void supabase.from("Property").select("id, title").eq("organization_id", org.id).order("title").then(({ data }) => {
      setProperties((data as { id: string; title: string }[]) ?? []);
    });
    void supabase.from("Funnel").select("*").order("name").then(({ data }) => {
      const list = (data as Funnel[]) ?? [];
      setFunnels(list);
      if (list[0]?.id) setFunnelId(list[0].id);
    });
    void supabase.from("FunnelStage").select("*").order("position").then(({ data }) => {
      setStages((data as Stage[]) ?? []);
    });
  }, [org.id]);

  useEffect(() => {
    const pid = searchParams.get("person_id");
    const mode = searchParams.get("mode") as OpportunityCreationMode | null;
    const propsParam = searchParams.get("property_ids");
    if (pid) setPersonId(pid);
    if (mode === "MANUAL" || mode === "SCORING") setCreationMode(mode);
    if (propsParam) {
      const ids = propsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length) setSelectedPropIds(ids);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!funnelId) return;
    const inFunnel = stages.filter((s) => s.funnel_id === funnelId).sort((a, b) => a.position - b.position);
    if (!stageId || !inFunnel.some((s) => s.id === stageId)) {
      setStageId(inFunnel[0]?.id ?? "");
    }
  }, [funnelId, stageId, stages]);

  const filteredProps = useMemo(() => {
    const q = propFilter.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((p) => p.title.toLowerCase().includes(q));
  }, [properties, propFilter]);

  const rankedPositive = useMemo(() => ranked.filter((r) => r.score > 0), [ranked]);

  const filteredRanked = useMemo(() => {
    const q = propFilter.trim().toLowerCase();
    if (!q) return rankedPositive;
    return rankedPositive.filter((r) => r.title.toLowerCase().includes(q));
  }, [rankedPositive, propFilter]);

  const loadRanking = useCallback(async () => {
    if (!personId) {
      setError("Elegí una persona para calcular el ranking.");
      return;
    }
    setRankBusy(true);
    setError(null);
    const { ranked: list, error: re } = await rankPropertiesForPerson(org.id, personId);
    setRankBusy(false);
    if (re) setError(re);
    setRanked(list);
  }, [org.id, personId]);

  useEffect(() => {
    if (creationMode !== "SCORING" || !personId) return;
    void loadRanking();
  }, [creationMode, personId, loadRanking]);

  useEffect(() => {
    setRankExplainOpen({});
  }, [personId, creationMode]);

  function addProperty(id: string) {
    setSelectedPropIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function removeProperty(id: string) {
    setSelectedPropIds((prev) => prev.filter((x) => x !== id));
  }

  function selectTop(n: number) {
    const ids = rankedPositive.slice(0, n).map((r) => r.property_id);
    setSelectedPropIds(ids);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!personId) {
      setError("Elegí una persona");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim() || null;
    const mode = creationMode;
    const propIds = selectedPropIds;

    const { data: opp, error: oe } = await supabase
      .from("Opportunity")
      .insert({
        organization_id: org.id,
        person_id: personId,
        title,
        status: "OPEN",
        funnel_id: funnelId || null,
        stage_id: stageId || null,
        creation_mode: mode,
      })
      .select("id")
      .single();
    if (oe || !opp) {
      setError(oe?.message ?? "Error");
      return;
    }
    if (propIds.length) {
      await supabase.from("OpportunityProperty").insert(
        propIds.map((property_id) => ({
          opportunity_id: opp.id,
          property_id,
        })),
      );
      await recomputeMatchingForPerson(personId);
    }
    nav(`/dashboard/opportunities/${opp.id}`);
  }

  const selectedPropsDisplay = useMemo(() => {
    const byId = Object.fromEntries(properties.map((p) => [p.id, p.title]));
    return selectedPropIds.map((id) => ({ id, title: byId[id] ?? id }));
  }, [properties, selectedPropIds]);

  return (
    <RequirePermission slug="manage_opportunities">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Nueva oportunidad</h1>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div>
            <Label className="text-base">Modo de armado</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["MANUAL", "SCORING"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setCreationMode(m);
                    if (m === "MANUAL") setRanked([]);
                  }}
                  className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                    creationMode === m
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[#fffcf7] text-[var(--muted)] hover:border-[var(--accent)]/50"
                  }`}
                >
                  {OPPORTUNITY_CREATION_MODE_LABEL[m]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Manual: elegís propiedades con búsqueda y chips. Por scoring: ranking por coincidencia con preferencias de la
              persona.
            </p>
          </div>

          <div>
            <Label htmlFor="person_id">Persona *</Label>
            <select
              id="person_id"
              name="person_id"
              required
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
            >
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="title">Título</Label>
            <Input id="title" name="title" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="funnel_id">Funnel</Label>
              <select
                id="funnel_id"
                value={funnelId}
                onChange={(e) => setFunnelId(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
              >
                {funnels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="stage_id">Etapa</Label>
              <select
                id="stage_id"
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
              >
                {stages
                  .filter((s) => s.funnel_id === funnelId)
                  .sort((a, b) => a.position - b.position)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Propiedades</Label>
            {selectedPropsDisplay.length ? (
              <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--jif-line)]/40 bg-[#fffcf7]/40 px-3 py-2.5">
                {selectedPropsDisplay.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--jif-line)]/50 bg-[var(--card)] px-2.5 py-1 text-xs"
                  >
                    {p.title}
                    <button
                      type="button"
                      className="rounded p-0.5 hover:bg-stone-900/10"
                      onClick={() => removeProperty(p.id)}
                      aria-label="Quitar"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)]">Ninguna propiedad seleccionada todavía.</p>
            )}
            {creationMode === "SCORING" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={rankBusy || !personId} onClick={() => void loadRanking()}>
                  {rankBusy ? "Calculando…" : "Recalcular ranking"}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => selectTop(5)} disabled={!rankedPositive.length}>
                  Seleccionar top 5
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => selectTop(10)} disabled={!rankedPositive.length}>
                  Top 10
                </Button>
              </div>
            ) : null}
            <Input
              placeholder={creationMode === "SCORING" ? "Filtrar ranking por título…" : "Filtrar por título…"}
              value={propFilter}
              onChange={(e) => setPropFilter(e.target.value)}
            />
            <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--jif-line)]/40 bg-[#fffcf7]/25">
              {creationMode === "MANUAL" ? (
                filteredProps.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 border-b border-[var(--jif-line)]/50 px-3 py-2.5 text-sm last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-[var(--foreground)]">{p.title}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="shrink-0 text-[11px]"
                      disabled={selectedPropIds.includes(p.id)}
                      onClick={() => addProperty(p.id)}
                    >
                      {selectedPropIds.includes(p.id) ? "Agregada" : "Agregar"}
                    </Button>
                  </div>
                ))
              ) : !personId ? (
                <p className="px-3 py-4 text-xs text-[var(--muted)]">Elegí una persona para ver el ranking.</p>
              ) : rankBusy ? (
                <p className="px-3 py-4 text-xs text-[var(--muted)]">Calculando scores…</p>
              ) : filteredRanked.length === 0 ? (
                <p className="px-3 py-4 text-xs text-[var(--muted)]">
                  No hay propiedades con score mayor a 0 para esta persona. Revisá preferencias y datos de la cartera (precio público,
                  zona, etc.).
                </p>
              ) : (
                filteredRanked.map((r) => {
                  const exp = rankExplainOpen[r.property_id] ?? false;
                  return (
                    <div key={r.property_id} className="border-b border-[var(--jif-line)]/50 last:border-b-0">
                      <div className="flex items-start gap-1 px-2 py-2">
                        <button
                          type="button"
                          className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:bg-stone-900/5 hover:text-[var(--foreground)]"
                          aria-expanded={exp}
                          aria-label={exp ? "Ocultar detalle del score" : "Ver por qué este score"}
                          onClick={() =>
                            setRankExplainOpen((prev) => ({
                              ...prev,
                              [r.property_id]: !prev[r.property_id],
                            }))
                          }
                        >
                          <ChevronDown className={cn("size-4 transition-transform", exp && "rotate-180")} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--foreground)]">{r.title}</span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--jif-gold)]">{r.score.toFixed(1)}</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="shrink-0 text-[11px]"
                              disabled={selectedPropIds.includes(r.property_id)}
                              onClick={() => addProperty(r.property_id)}
                            >
                              {selectedPropIds.includes(r.property_id) ? "Agregada" : "Agregar"}
                            </Button>
                          </div>
                          {exp ? (
                            <div className="mt-2 rounded-md border border-[var(--jif-line)]/35 bg-[#fffcf7]/60 px-2 py-2">
                              <MatchExplainBreakdown
                                explain={r.explain}
                                intro="Resumen de coincidencias con las preferencias de la persona (pesos por zona, precio, m², tipo, tags y criterios extra)."
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button type="submit">Crear</Button>
        </form>
      </div>
    </RequirePermission>
  );
}
