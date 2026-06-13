import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RequirePermission } from "../../components/RequirePermission";
import { NeoCard, NeoPageHeader, NeoPageShell } from "../../components/ui/neo-brutal";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../types/database";

type Opp = Database["public"]["Tables"]["Opportunity"]["Row"];

const labels: Record<"WON" | "LOST" | "ONHOLD", { title: string; accent: string }> = {
  WON: { title: "Ganadas", accent: "border-[var(--primary)]" },
  LOST: { title: "Perdidas", accent: "border-[#b91c1c]" },
  ONHOLD: { title: "En pausa", accent: "border-zinc-500" },
};

export function ReportsFinalStatesPage({ embedded = false }: { embedded?: boolean }) {
  const [rows, setRows] = useState<Opp[]>([]);

  useEffect(() => {
    void supabase
      .from("Opportunity")
      .select("id, title, status, lost_reason, updated_at")
      .in("status", ["WON", "LOST", "ONHOLD"])
      .order("updated_at", { ascending: false })
      .then(({ data }) => setRows((data as Opp[]) ?? []));
  }, []);

  const grouped = useMemo(
    () => ({
      WON: rows.filter((x) => x.status === "WON"),
      LOST: rows.filter((x) => x.status === "LOST"),
      ONHOLD: rows.filter((x) => x.status === "ONHOLD"),
    }),
    [rows],
  );

  return (
    <RequirePermission slug="view_opportunities">
      <NeoPageShell className={embedded ? "scroll-mt-10 space-y-4 border-t border-[var(--jif-line)] pt-10" : undefined}>
        {embedded ? (
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-neo text-xl font-semibold text-[var(--foreground)]">Estados finales</h2>
              <p className="jif-caps jif-dim mt-2 max-w-2xl font-normal" style={{ fontSize: "0.65rem" }}>
                Ganadas, perdidas y en pausa. Para editar, abrí cada oportunidad.
              </p>
            </div>
            <Link
              to="/dashboard/reports/final-states"
              className="jif-caps shrink-0 text-[0.65rem] text-[var(--accent)] hover:underline"
            >
              Ver pantalla completa →
            </Link>
          </div>
        ) : (
          <NeoPageHeader
            title="Estados finales"
            subtitle="Vista de tablero para ganadas, perdidas y en pausa. Solo lectura y seguimiento; para editar abrí cada oportunidad."
          />
        )}
        <div
          className={
            embedded
              ? "grid max-h-[min(70vh,640px)] gap-4 overflow-y-auto overscroll-contain pr-1 md:grid-cols-3"
              : "grid gap-4 md:grid-cols-3"
          }
        >
          {(["WON", "LOST", "ONHOLD"] as const).map((key) => (
            <NeoCard key={key} className={`p-4 ${labels[key].accent}`}>
              <h2 className="font-neo text-lg font-black uppercase tracking-tight text-[var(--foreground)]">{labels[key].title}</h2>
              <p className="mt-1 font-mono text-xs text-[var(--muted)]">{grouped[key].length} oportunidades</p>
              <ul className="mt-3 max-h-72 space-y-2 overflow-auto text-sm">
                {grouped[key].map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/dashboard/opportunities/${o.id}`}
                      className="block border border-[var(--jif-line)] bg-[#fffcf7] px-2 py-2 font-medium shadow-[var(--neo-shadow-sm)] transition-colors hover:border-[var(--jif-gold)]"
                    >
                      <p className="truncate">{o.title ?? "Sin título"}</p>
                      {key === "LOST" && o.lost_reason ? <p className="truncate text-xs text-[var(--muted)]">{o.lost_reason}</p> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </NeoCard>
          ))}
        </div>
      </NeoPageShell>
    </RequirePermission>
  );
}
