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

export function ReportsFinalStatesPage() {
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
    <RequirePermission slug="view_reports">
      <NeoPageShell>
        <NeoPageHeader
          title="Estados finales"
          subtitle="Vista de tablero para ganadas, perdidas y en pausa. Solo lectura y seguimiento; para editar abrí cada oportunidad."
        />
        <div className="grid gap-4 md:grid-cols-3">
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
