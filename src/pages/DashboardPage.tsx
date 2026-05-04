import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RequirePermission } from "../components/RequirePermission";
import { NeoCard } from "../components/ui/neo-brutal";
import { supabase } from "../lib/supabase";
import type { Database } from "../types/database";
import { opportunityStatusLabel } from "../lib/crm-labels";

type OppStatus = Database["public"]["Tables"]["Opportunity"]["Row"]["status"];

function barPct(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((value / max) * 100));
}

export function DashboardPage() {
  const [opps, setOpps] = useState<{ status: OppStatus }[]>([]);
  const [stock, setStock] = useState(0);

  useEffect(() => {
    void (async () => {
      const [o, p] = await Promise.all([
        supabase.from("Opportunity").select("status"),
        supabase.from("Property").select("id", { count: "exact", head: true }),
      ]);
      setOpps((o.data as { status: OppStatus }[]) ?? []);
      setStock(p.count ?? 0);
    })();
  }, []);

  const byStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const x of opps) {
      m[x.status] = (m[x.status] ?? 0) + 1;
    }
    return m;
  }, [opps]);

  const entries = Object.entries(byStatus);
  const maxStatus = Math.max(...entries.map(([, v]) => v), 1);
  const totalOpp = opps.length;
  const closed = (byStatus.WON ?? 0) + (byStatus.LOST ?? 0);
  const winRate = closed > 0 ? Math.round(((byStatus.WON ?? 0) / closed) * 100) : null;

  const donutGrad = useMemo(() => {
    if (totalOpp === 0) return "conic-gradient(#333 0% 100%)";
    let acc = 0;
    const colors: Record<string, string> = {
      OPEN: "#2d6a7a",
      WON: "#2d7a3e",
      LOST: "#a84a38",
      ONHOLD: "#8c8c8c",
    };
    const parts: string[] = [];
    for (const [k, v] of entries) {
      const pct = (v / totalOpp) * 100;
      const c = colors[k] ?? "#d4a012";
      parts.push(`${c} ${acc}% ${acc + pct}%`);
      acc += pct;
    }
    return `conic-gradient(${parts.join(", ")})`;
  }, [entries, totalOpp]);

  return (
    <RequirePermission slug="view_dashboard">
      <div className="jif-page space-y-8">
        <header className="border-b border-[var(--jif-line)] pb-6">
          <div>
            <h1 className="jif-hero">Control Tower</h1>
            <p className="jif-caps jif-dim mt-1">
              Pulso del negocio: oportunidades por estado, stock de propiedades y enlaces directos a informes clave.
            </p>
          </div>
        </header>
        <div className="grid gap-6 lg:grid-cols-3">
          <NeoCard className="flex flex-col items-center justify-center p-6">
            <div
              className="size-36 shrink-0 rounded-full border border-[var(--jif-line)]"
              style={{ background: donutGrad }}
              title="Distribución por estado"
            />
            <p className="jif-caps jif-dim mt-4" style={{ fontSize: "0.6rem" }}>
              Oportunidades por estado
            </p>
          </NeoCard>
          <NeoCard className="p-6">
            <div className="flex h-40 items-end gap-2">
              {entries.map(([k, v]) => (
                <div key={k} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className="w-full max-w-[3rem] rounded-t bg-[var(--jif-gold)]/90"
                    style={{ height: `${barPct(v, maxStatus)}%`, minHeight: v > 0 ? 8 : 0 }}
                  />
                  <span className="jif-caps jif-dim text-center" style={{ fontSize: "0.55rem" }}>
                    {opportunityStatusLabel(k as OppStatus)}
                  </span>
                  <span className="font-mono text-sm text-[var(--foreground)]">{v}</span>
                </div>
              ))}
            </div>
            <p className="jif-caps jif-dim mt-3 text-center" style={{ fontSize: "0.6rem" }}>
              Barras · total {totalOpp}
            </p>
          </NeoCard>
          <NeoCard className="space-y-4 p-6">
            <div className="flex items-end justify-between gap-2">
              <span className="jif-caps jif-dim" style={{ fontSize: "0.6rem" }}>
                Stock
              </span>
              <span className="font-neo text-4xl font-semibold tabular-nums text-[var(--jif-gold)]">{stock}</span>
            </div>
            <div className="h-2 w-full bg-[#222]">
              <div className="h-2 bg-[var(--jif-gold)]/80" style={{ width: `${Math.min(100, stock * 4)}%` }} />
            </div>
            <div className="flex items-end justify-between border-t border-[var(--jif-line)] pt-3">
              <span className="jif-caps jif-dim" style={{ fontSize: "0.6rem" }}>
                Tasa cierre
              </span>
              <span className="font-neo text-3xl font-semibold tabular-nums">
                {winRate != null ? `${winRate}%` : "—"}
              </span>
            </div>
          </NeoCard>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {[
            { to: "/dashboard/reports/overview", t: "Overview" },
            { to: "/dashboard/reports/pipeline", t: "Pipeline" },
            { to: "/dashboard/reports/funnels", t: "Funnels" },
            { to: "/dashboard/reports/final-states", t: "Estados" },
            { to: "/dashboard/reports/calendar", t: "Calendario" },
          ].map((x) => (
            <Link
              key={x.to}
              to={x.to}
              className="jif-caps border border-[var(--jif-line)] bg-[var(--card)] px-3 py-4 text-center text-[0.65rem] text-[var(--foreground)] transition-colors hover:border-[var(--jif-gold)] hover:text-[var(--jif-gold)]"
            >
              {x.t}
            </Link>
          ))}
        </div>
      </div>
    </RequirePermission>
  );
}
