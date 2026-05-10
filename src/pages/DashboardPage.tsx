import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ControlTowerExchangeTrend } from "../components/dashboard/ControlTowerExchangeTrend";
import { RequirePermission } from "../components/RequirePermission";
import { NeoCard } from "../components/ui/neo-brutal";
import { useAuth } from "../contexts/AuthContext";
import { hasPermission } from "../lib/permissions";
import { opportunityStatusLabel } from "../lib/crm-labels";
import { supabase } from "../lib/supabase";
import type { Database } from "../types/database";
import { ReportsPriceGeoPage } from "./reports/ReportsPriceGeoPage";

type OppStatus = Database["public"]["Tables"]["Opportunity"]["Row"]["status"];

function barPct(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((value / max) * 100));
}

export function DashboardPage() {
  const { permissions } = useAuth();
  const canReports = hasPermission(permissions, "view_reports");
  const canOpportunities = hasPermission(permissions, "view_opportunities");
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

  const reportLinkCls =
    "jif-caps rounded border border-transparent px-2 py-2 text-center text-[0.65rem] text-[var(--foreground)] hover:border-[var(--jif-gold)]/40 hover:bg-[var(--card)] hover:text-[var(--jif-gold)]";

  return (
    <RequirePermission slug="view_dashboard">
      <div className="jif-page space-y-6 lg:space-y-8">
        <header className="border-b border-[var(--jif-line)] pb-6">
          <div>
            <h1 className="jif-hero">Control Tower</h1>
            <p className="jif-caps jif-dim mt-1 max-w-3xl leading-relaxed">
              Mirá rápido oportunidades, stock y tipo de cambio; el detalle está a un clic.
            </p>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-6 lg:gap-5">
          <NeoCard className="flex flex-col items-center justify-center p-5 lg:col-span-2">
            <div
              className="size-32 shrink-0 rounded-full border border-[var(--jif-line)] sm:size-36"
              style={{ background: donutGrad }}
              title="Distribución por estado"
            />
            <p className="jif-caps jif-dim mt-3 text-center" style={{ fontSize: "0.6rem" }}>
              Oportunidades por estado
            </p>
          </NeoCard>
          <NeoCard className="p-5 lg:col-span-2">
            <div className="flex h-36 items-end gap-2 sm:h-40">
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
            <p className="jif-caps jif-dim mt-2 text-center" style={{ fontSize: "0.6rem" }}>
              Estados · total {totalOpp}
            </p>
          </NeoCard>
          <NeoCard className="space-y-3 p-5 lg:col-span-2">
            <div className="flex items-end justify-between gap-2">
              <span className="jif-caps jif-dim" style={{ fontSize: "0.6rem" }}>
                Stock propiedades
              </span>
              <span className="font-neo text-3xl font-semibold tabular-nums text-[var(--jif-gold)] sm:text-4xl">{stock}</span>
            </div>
            <div className="h-2 w-full bg-[#222]">
              <div className="h-2 bg-[var(--jif-gold)]/80" style={{ width: `${Math.min(100, stock * 4)}%` }} />
            </div>
            <div className="flex items-end justify-between border-t border-[var(--jif-line)] pt-3">
              <span className="jif-caps jif-dim" style={{ fontSize: "0.6rem" }}>
                Tasa cierre (ganadas / cerradas)
              </span>
              <span className="font-neo text-2xl font-semibold tabular-nums sm:text-3xl">
                {winRate != null ? `${winRate}%` : "—"}
              </span>
            </div>
          </NeoCard>

          <NeoCard className="min-h-[7.5rem] overflow-hidden p-0 lg:col-span-5">
            <ControlTowerExchangeTrend />
          </NeoCard>

          <NeoCard className="flex flex-col justify-center gap-0.5 p-3 lg:col-span-1">
            {canReports ? (
              <>
                <Link to="/dashboard/reports/overview" className={reportLinkCls}>
                  Overview
                </Link>
                <Link to="/dashboard/reports/pipeline" className={reportLinkCls}>
                  Pipeline
                </Link>
                <Link to="/dashboard/reports/price-geo" className={reportLinkCls}>
                  Precios geo
                </Link>
                <Link to="/dashboard/reports/final-states" className={reportLinkCls}>
                  Estados finales
                </Link>
                <Link to="/dashboard/reports/calendar" className={reportLinkCls}>
                  Calendario
                </Link>
              </>
            ) : null}
            {canOpportunities ? (
              <Link to="/dashboard/reports/funnels" className={reportLinkCls}>
                Funnels
              </Link>
            ) : null}
            {!canReports && !canOpportunities ? (
              <p className="jif-caps px-1 py-2 text-[0.6rem] leading-snug text-[var(--muted)]">Sin accesos rápidos.</p>
            ) : null}
          </NeoCard>

          {canReports ? (
            <div className="lg:col-span-6">
              <ReportsPriceGeoPage embedded controlTower />
            </div>
          ) : null}
        </div>
      </div>
    </RequirePermission>
  );
}
