import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { RequirePermission } from "../../components/RequirePermission";
import { supabase } from "../../lib/supabase";
import { rankPropertiesForPerson } from "../../lib/compute-opportunity-scores";
import type { RankedProperty } from "../../lib/compute-opportunity-scores";
import { useActiveOrganization } from "../../contexts/OrganizationContext";
import { MatchExplainBreakdown } from "../../components/scoring/MatchExplainBreakdown";
import { cn } from "../../lib/utils";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

type Row = {
  person_id: string;
  person_name: string;
  property_id: string;
  property_title: string;
  score: number;
  explain: RankedProperty["explain"];
};

type ScoreOp = "any" | "gt" | "gte" | "lt" | "lte" | "eq";

function scoreMatches(op: ScoreOp, score: number, value: number): boolean {
  switch (op) {
    case "any":
      return true;
    case "gt":
      return score > value;
    case "gte":
      return score >= value;
    case "lt":
      return score < value;
    case "lte":
      return score <= value;
    case "eq":
      return Math.abs(score - value) < 1e-6;
    default:
      return true;
  }
}

export function ReportsScoringPage() {
  const org = useActiveOrganization();
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

  const [search, setSearch] = useState("");
  const [personId, setPersonId] = useState<string>("");
  const [propertyId, setPropertyId] = useState<string>("");
  const [scoreOp, setScoreOp] = useState<ScoreOp>("any");
  const [scoreValue, setScoreValue] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setMsg(null);
      const { data: profiles, error: pe } = await supabase.from("PersonProfile").select("person_id").eq("profile", "interesado");
      if (pe) {
        setMsg(pe.message);
        setBusy(false);
        return;
      }
      const personIds = [...new Set((profiles as { person_id: string }[])?.map((p) => p.person_id) ?? [])];
      if (!personIds.length) {
        if (!cancelled) {
          setAllRows([]);
          setBusy(false);
        }
        return;
      }

      const { data: people, error: he } = await supabase
        .from("Person")
        .select("id, name")
        .eq("organization_id", org.id)
        .in("id", personIds)
        .order("name");
      if (he || !people?.length) {
        if (!cancelled) {
          if (he) setMsg(he.message);
          setAllRows([]);
          setBusy(false);
        }
        return;
      }

      const { data: openOpps } = await supabase
        .from("Opportunity")
        .select("id, person_id")
        .eq("organization_id", org.id)
        .eq("status", "OPEN");
      const oppList = (openOpps as { id: string; person_id: string }[]) ?? [];
      const personByOpp = Object.fromEntries(oppList.map((o) => [o.id, o.person_id]));
      const exclude = new Set<string>();
      if (oppList.length) {
        const { data: opLinks } = await supabase
          .from("OpportunityProperty")
          .select("opportunity_id, property_id")
          .in(
            "opportunity_id",
            oppList.map((o) => o.id),
          );
        for (const l of opLinks ?? []) {
          const pid = personByOpp[(l as { opportunity_id: string }).opportunity_id];
          if (pid) exclude.add(`${pid}:${(l as { property_id: string }).property_id}`);
        }
      }

      const out: Row[] = [];
      for (const p of people) {
        const { ranked, error: re } = await rankPropertiesForPerson(org.id, p.id);
        if (re) continue;
        const positive = ranked.filter((r) => r.score > 0);
        for (const r of positive.slice(0, 25)) {
          if (exclude.has(`${p.id}:${r.property_id}`)) continue;
          out.push({
            person_id: p.id,
            person_name: p.name,
            property_id: r.property_id,
            property_title: r.title,
            score: r.score,
            explain: r.explain,
          });
        }
      }
      out.sort((a, b) => b.score - a.score);
      if (!cancelled) {
        setAllRows(out.slice(0, 200));
        setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org.id]);

  const personOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) m.set(r.person_id, r.person_name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [allRows]);

  const propertyOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) m.set(r.property_id, r.property_title);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [allRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const numScore = scoreValue.trim() === "" ? NaN : Number(scoreValue);
    return allRows.filter((r) => {
      if (personId && r.person_id !== personId) return false;
      if (propertyId && r.property_id !== propertyId) return false;
      if (
        scoreOp !== "any" &&
        (Number.isNaN(numScore) || !scoreMatches(scoreOp, r.score, numScore))
      ) {
        return false;
      }
      if (!q) return true;
      return (
        r.person_name.toLowerCase().includes(q) ||
        r.property_title.toLowerCase().includes(q) ||
        r.score.toFixed(1).includes(q)
      );
    });
  }, [allRows, search, personId, propertyId, scoreOp, scoreValue]);

  function toggleRow(key: string) {
    setOpenRows((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <RequirePermission slug="view_opportunities">
      <div className="jif-page space-y-8">
        <header className="border-b border-[var(--jif-line)] pb-6">
          <div>
            <h1 className="jif-hero">Scoring</h1>
            <p className="jif-caps jif-dim mt-1">
              Personas con perfil «interesado», ordenadas por coincidencia con tu cartera (solo score mayor que 0). No se listan
              pares que ya figuran en una oportunidad abierta. Desplegá cada fila para ver el detalle del match.
            </p>
          </div>
        </header>
        {msg ? <p className="jif-caps border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-amber-200">{msg}</p> : null}

        {!busy && allRows.length > 0 ? (
          <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="md:col-span-2 xl:col-span-1">
                <Label htmlFor="scoring-q">Buscar</Label>
                <Input
                  id="scoring-q"
                  placeholder="Nombre, propiedad…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="scoring-person">Persona</Label>
                <select
                  id="scoring-person"
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  className="jif-input mt-1 h-10 w-full"
                >
                  <option value="">Todas</option>
                  {personOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="scoring-property">Propiedad</Label>
                <select
                  id="scoring-property"
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className="jif-input mt-1 h-10 w-full"
                >
                  <option value="">Todas</option>
                  {propertyOptions.map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-1">
                <div className="min-w-[120px] flex-1">
                  <Label htmlFor="scoring-op">Score</Label>
                  <select
                    id="scoring-op"
                    value={scoreOp}
                    onChange={(e) => setScoreOp(e.target.value as ScoreOp)}
                    className="jif-input mt-1 h-10 w-full"
                  >
                    <option value="any">Cualquier</option>
                    <option value="gt">Mayor que</option>
                    <option value="gte">Mayor o igual que</option>
                    <option value="lt">Menor que</option>
                    <option value="lte">Menor o igual que</option>
                    <option value="eq">Igual a</option>
                  </select>
                </div>
                <div className="min-w-[6rem] flex-1">
                  <Label htmlFor="scoring-val" className="opacity-90">
                    Valor
                  </Label>
                  <Input
                    id="scoring-val"
                    type="number"
                    step="any"
                    disabled={scoreOp === "any"}
                    value={scoreValue}
                    onChange={(e) => setScoreValue(e.target.value)}
                    className="mt-1 font-mono tabular-nums"
                    placeholder="—"
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Mostrando {filteredRows.length} de {allRows.length} recomendaciones (máx. 200 cargadas).
            </p>
          </div>
        ) : null}

        {busy ? (
          <p className="jif-caps jif-dim">Cargando…</p>
        ) : filteredRows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No hay filas para mostrar con los filtros actuales, o sin sugerencias con score positivo. Revisá criterios o sumá datos
            de preferencias / propiedad.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="jif-table w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="jif-caps jif-dim border-b border-[var(--jif-line)]">
                  <th className="w-10 py-3 pr-2 font-medium" aria-hidden />
                  <th className="py-3 pr-4 font-medium">Score</th>
                  <th className="py-3 pr-4 font-medium">Persona</th>
                  <th className="py-3 pr-4 font-medium">Propiedad</th>
                  <th className="w-44 py-3 text-right font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const rowKey = `${r.person_id}-${r.property_id}`;
                  const expanded = openRows[rowKey] ?? false;
                  return (
                    <Fragment key={rowKey}>
                      <tr className="border-b border-[var(--jif-line)]/60">
                        <td className="py-3 pr-2 align-middle">
                          <button
                            type="button"
                            className="inline-flex size-9 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-stone-900/5 hover:text-[var(--foreground)]"
                            aria-expanded={expanded}
                            aria-label={expanded ? "Ocultar detalle del scoring" : "Ver detalle del scoring"}
                            onClick={() => toggleRow(rowKey)}
                          >
                            <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                          </button>
                        </td>
                        <td className="py-3 pr-4 align-middle font-mono tabular-nums text-[var(--jif-gold)]">
                          {r.score.toFixed(1)}
                        </td>
                        <td className="py-3 pr-4 align-middle text-[var(--foreground)]">{r.person_name}</td>
                        <td className="py-3 pr-4 align-middle text-[var(--muted)]">{r.property_title}</td>
                        <td className="py-3 align-middle text-right">
                          <Link
                            className="inline-flex h-9 items-center rounded-md border border-[var(--jif-line)] bg-[#fffcf7] px-3 text-xs font-medium text-[var(--foreground)] transition-colors hover:border-[var(--jif-gold)]/50 hover:text-[var(--jif-gold)]"
                            to={`/dashboard/opportunities/new?person_id=${encodeURIComponent(r.person_id)}&property_ids=${encodeURIComponent(r.property_id)}&mode=SCORING`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Crear oportunidad
                          </Link>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="border-b border-[var(--jif-line)]/60 bg-[#fffcf7]/25">
                          <td colSpan={5} className="px-4 py-4">
                            <MatchExplainBreakdown
                              explain={r.explain}
                              intro="Cómo se armó el score para esta persona y esta propiedad (pesos relativos por bloque)."
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}
