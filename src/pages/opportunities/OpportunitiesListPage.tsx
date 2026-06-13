import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { cn } from "../../lib/utils";
import type { Database, OpportunityStatus } from "../../types/database";
import { OPPORTUNITY_STATUS_LABEL, opportunityStatusLabel } from "../../lib/crm-labels";

type Opp = Database["public"]["Tables"]["Opportunity"]["Row"] & { person_name?: string };

const OPPORTUNITY_STATUS_ORDER = Object.keys(OPPORTUNITY_STATUS_LABEL) as OpportunityStatus[];

export function OpportunitiesListPage() {
  const { permissions } = useAuth();
  const canManage = hasPermission(permissions, "manage_opportunities");
  const [rows, setRows] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data: o, error: oppErr } = await supabase.from("Opportunity").select("*").order("updated_at", { ascending: false });
    if (oppErr) {
      setRows([]);
      setLoadError(oppErr.message);
      setLoading(false);
      return;
    }
    const list = (o as Opp[]) ?? [];
    const ids = [...new Set(list.map((x) => x.person_id))];
    const { data: persons, error: personErr } = ids.length
      ? await supabase.from("Person").select("id, name").in("id", ids)
      : { data: [] as { id: string; name: string }[], error: null };
    if (personErr) {
      setRows([]);
      setLoadError(personErr.message);
      setLoading(false);
      return;
    }
    const byId = Object.fromEntries((persons ?? []).map((p) => [p.id, p.name]));
    setRows(list.map((x) => ({ ...x, person_name: byId[x.person_id] })));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((o) => {
      const matchesQ =
        !q ||
        (o.title ?? "").toLowerCase().includes(q) ||
        (o.person_name ?? "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "ALL" || o.status === statusFilter;
      return matchesQ && matchesStatus;
    });
  }, [rows, query, statusFilter]);

  async function deleteOpp(id: string, title: string) {
    if (!canManage) return;
    const ok = window.confirm(
      `¿Eliminar la oportunidad «${title || "sin título"}»?\n\nEsta acción no se puede deshacer.`,
    );
    if (!ok) return;
    setActionError(null);
    const { error } = await supabase.from("Opportunity").delete().eq("id", id);
    if (error) {
      setActionError(error.message);
      return;
    }
    await loadRows();
  }

  return (
    <RequirePermission slug="view_opportunities">
      <div className="jif-page space-y-8">
        <header className="border-b border-[var(--jif-line)] pb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="jif-hero">Oportunidades</h1>
              <p className="jif-caps jif-dim mt-1">
                Listado de todas las fichas comerciales; el tablero por etapas y arrastre está en Funnels.
              </p>
            </div>
            {canManage ? (
              <Link to="/dashboard/opportunities/new">
                <Button type="button" className="jif-btn-primary">
                  Nueva oportunidad
                </Button>
              </Link>
            ) : null}
          </div>
        </header>
        {loadError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
            <p>{loadError}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadRows()}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {actionError ? (
          <p className="jif-caps border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-amber-200">{actionError}</p>
        ) : null}
        {loading ? <p className="jif-caps jif-dim">Cargando…</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Buscar por título o persona…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-md min-w-[200px]"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
            aria-label="Filtrar por estado"
          >
            <option value="ALL">Todos los estados</option>
            {OPPORTUNITY_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {OPPORTUNITY_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="jif-table w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="jif-caps jif-dim border-b border-[var(--jif-line)]">
                <th className="py-3 pl-4 pr-4 font-medium sm:pl-5">Título</th>
                <th className="py-3 pr-4 font-medium">Persona</th>
                <th className="py-3 pr-4 font-medium">Estado</th>
                <th className="py-3 pr-4 font-medium">Actualizado</th>
                <th className="w-20 py-3 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-[var(--muted)] sm:px-5">
                    {rows.length === 0
                      ? "Todavía no hay oportunidades cargadas."
                      : "No hay oportunidades que coincidan con los filtros actuales."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((o) => (
                  <tr key={o.id} className="border-b border-[var(--jif-line)]/60">
                    <td className="py-3 pl-4 pr-4 font-medium text-[var(--foreground)] sm:pl-5">{o.title ?? "—"}</td>
                    <td className="py-3 pr-4 text-[var(--muted)]">{o.person_name ?? "—"}</td>
                    <td className="py-3 pr-4 text-sm text-[var(--jif-gold)]">{opportunityStatusLabel(o.status)}</td>
                    <td className="py-3 pr-4 text-xs text-[var(--muted)]">
                      {new Date(o.updated_at).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/dashboard/opportunities/${o.id}`}
                          className="inline-flex size-9 items-center justify-center text-[var(--jif-gold)] transition-colors hover:bg-stone-900/5 hover:text-[var(--foreground)]"
                          title="Ver ficha"
                          aria-label="Ver ficha"
                        >
                          <Eye className="size-4" strokeWidth={1.75} />
                        </Link>
                        {canManage ? (
                          <button
                            type="button"
                            className={cn(
                              "inline-flex size-9 items-center justify-center text-[var(--muted)] transition-colors",
                              "hover:bg-red-950/50 hover:text-red-300",
                            )}
                            title="Eliminar oportunidad"
                            aria-label="Eliminar oportunidad"
                            onClick={() => void deleteOpp(o.id, o.title ?? "")}
                          >
                            <Trash2 className="size-4" strokeWidth={1.75} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </RequirePermission>
  );
}
