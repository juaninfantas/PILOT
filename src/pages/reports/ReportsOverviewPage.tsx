import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RequirePermission } from "../../components/RequirePermission";
import { NeoCard } from "../../components/ui/neo-brutal";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../types/database";
import { opportunityStatusLabel } from "../../lib/crm-labels";
import { MonthlyListingAvgLineChart } from "../../components/charts/MonthlyListingAvgLineChart";

type OppStatus = Database["public"]["Tables"]["Opportunity"]["Row"]["status"];

const STATUS_COLORS: Record<string, string> = {
  OPEN: "#2d6a7a",
  WON: "#2d7a3e",
  LOST: "#a84a38",
  ONHOLD: "#6b6b6b",
};

function barPct(n: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((n / max) * 100));
}

export function ReportsOverviewPage({ embedded = false }: { embedded?: boolean }) {
  const [opps, setOpps] = useState<{ status: OppStatus }[]>([]);
  const [props, setProps] = useState<{ city_zone: string }[]>([]);
  const [prices, setPrices] = useState<Database["public"]["Tables"]["PropertyPrice"]["Row"][]>([]);

  useEffect(() => {
    void (async () => {
      const [o, p, pr] = await Promise.all([
        supabase.from("Opportunity").select("status"),
        supabase.from("Property").select("city_zone"),
        supabase
          .from("PropertyPrice")
          .select("*")
          .eq("kind", "LISTING_PUBLIC")
          .order("effective_at", { ascending: true }),
      ]);
      setOpps((o.data as { status: OppStatus }[]) ?? []);
      setProps((p.data as { city_zone: string }[]) ?? []);
      setPrices((pr.data as Database["public"]["Tables"]["PropertyPrice"]["Row"][]) ?? []);
    })();
  }, []);

  const byStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of opps) {
      m[o.status] = (m[o.status] ?? 0) + 1;
    }
    return m;
  }, [opps]);
  const statusEntries = useMemo(() => Object.entries(byStatus), [byStatus]);
  const maxStatus = Math.max(...statusEntries.map(([, v]) => v), 1);
  const totalOpp = opps.length;
  const closed = (byStatus.WON ?? 0) + (byStatus.LOST ?? 0);
  const closeRatePct = closed > 0 ? Math.round(((byStatus.WON ?? 0) / closed) * 100) : null;

  const donutGrad = useMemo(() => {
    if (totalOpp === 0) return "conic-gradient(#333 0% 100%)";
    let acc = 0;
    const parts: string[] = [];
    for (const [k, v] of statusEntries) {
      const pct = (v / totalOpp) * 100;
      const c = STATUS_COLORS[k] ?? "#d4a012";
      parts.push(`${c} ${acc}% ${acc + pct}%`);
      acc += pct;
    }
    return `conic-gradient(${parts.join(", ")})`;
  }, [statusEntries, totalOpp]);

  const byZone = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of props) {
      const z = p.city_zone?.trim() || "—";
      m.set(z, (m.get(z) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [props]);
  const maxZone = Math.max(...byZone.map(([, v]) => v), 1);

  const monthly = useMemo(() => {
    const byMonth = new Map<string, { sum: number; n: number }>();
    for (const r of prices) {
      const m = r.effective_at.slice(0, 7);
      const cur = byMonth.get(m) ?? { sum: 0, n: 0 };
      cur.sum += Number(r.amount);
      cur.n += 1;
      byMonth.set(m, cur);
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, avg: v.n > 0 ? v.sum / v.n : 0, n: v.n }))
      .slice(-10);
  }, [prices]);

  return (
    <RequirePermission slug="view_reports">
      <div className={embedded ? "scroll-mt-10 space-y-6 border-t border-[var(--jif-line)] pt-10" : "jif-page space-y-8"}>
        {embedded ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="control-tower-overview" className="font-neo text-xl font-semibold text-[var(--foreground)]">
                Overview
              </h2>
              <p className="mt-1 max-w-2xl text-xs text-[var(--muted)]">
                Oportunidades, stock, zonas y precios de listado (resumen mensual).
              </p>
            </div>
            <Link
              to="/dashboard/reports/overview"
              className="jif-caps shrink-0 text-[0.65rem] text-[var(--accent)] hover:underline"
            >
              Ver pantalla completa →
            </Link>
          </div>
        ) : (
          <header className="border-b border-[var(--jif-line)] pb-6">
            <div>
              <h1 className="jif-hero">Overview</h1>
              <p className="jif-caps jif-dim mt-1">
                Resumen de oportunidades por estado, stock, zonas con más propiedades y tendencia de precios de listado.
              </p>
            </div>
          </header>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <NeoCard className="flex flex-col items-center justify-center p-6">
            <div
              className="size-40 shrink-0 rounded-full border border-[var(--jif-line)]"
              style={{ background: donutGrad }}
              title="Oportunidades"
            />
            <p className="jif-caps jif-dim mt-4" style={{ fontSize: "0.6rem" }}>
              Estados · {totalOpp} oportunidades
            </p>
          </NeoCard>
          <NeoCard className="flex flex-col justify-center p-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="jif-caps jif-dim" style={{ fontSize: "0.6rem" }}>
                  Stock
                </p>
                <p className="font-neo text-4xl font-bold tabular-nums text-[var(--jif-gold)]">{props.length}</p>
              </div>
              <div>
                <p className="jif-caps jif-dim" style={{ fontSize: "0.6rem" }}>
                  Tasa cierre
                </p>
                <p className="font-neo text-4xl font-bold tabular-nums">
                  {closeRatePct != null ? `${closeRatePct}%` : "—"}
                </p>
              </div>
            </div>
            <div className="mt-4 flex h-24 items-end gap-1.5">
              {statusEntries.map(([k, v]) => (
                <div key={k} className="flex min-w-0 flex-1 flex-col items-center justify-end">
                  <div
                    className="w-full max-w-10 rounded-t"
                    style={{
                      height: `${barPct(v, maxStatus)}%`,
                      minHeight: v > 0 ? 6 : 0,
                      background: STATUS_COLORS[k] ?? "#d4a012",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              {statusEntries.map(([k]) => (
                <span key={k} className="jif-caps jif-dim" style={{ fontSize: "0.5rem" }}>
                  {opportunityStatusLabel(k as OppStatus)}
                </span>
              ))}
            </div>
          </NeoCard>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <NeoCard className="p-5">
            <p className="jif-caps jif-dim mb-4" style={{ fontSize: "0.6rem" }}>
              Propiedades por zona (top 6)
            </p>
            <div className="space-y-2">
              {byZone.length === 0 ? (
                <p className="jif-caps jif-dim text-sm">Sin datos de zona.</p>
              ) : (
                byZone.map(([zone, c]) => (
                  <div key={zone} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate font-mono text-[0.65rem] text-[var(--foreground)]" title={zone}>
                      {zone}
                    </span>
                    <div className="h-2 min-w-0 flex-1 bg-[color-mix(in_srgb,var(--jif-line)_55%,var(--background))]">
                      <div
                        className="h-2 bg-[var(--jif-gold)]/80"
                        style={{ width: `${barPct(c, maxZone)}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right font-mono text-sm tabular-nums">{c}</span>
                  </div>
                ))
              )}
            </div>
          </NeoCard>
          <NeoCard className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--jif-line)] pb-4">
              <div>
                <p className="jif-caps jif-dim" style={{ fontSize: "0.6rem" }}>
                  Precio público (prom. mensual, últimos meses)
                </p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {embedded
                    ? "En Control Tower tenés además el reporte geográfico debajo."
                    : "Resumen sin filtro geo. Para filtros por maestro país / niveles…"}
                </p>
              </div>
              {embedded ? null : (
                <Link
                  to="/dashboard/reports/price-geo"
                  className="jif-caps shrink-0 rounded border border-[var(--jif-line)] bg-[var(--card)] px-3 py-2 text-[0.6rem] text-[var(--foreground)] transition-colors hover:border-[var(--jif-gold)] hover:text-[var(--jif-gold)]"
                >
                  Precios por geografía
                </Link>
              )}
            </div>
            {monthly.length === 0 ? (
              <p className="jif-caps jif-dim text-sm">Sin precios de listado.</p>
            ) : (
              <div className="pb-2 pt-1">
                <MonthlyListingAvgLineChart monthly={monthly} currency="USD" height={240} />
              </div>
            )}
          </NeoCard>
        </div>
      </div>
    </RequirePermission>
  );
}
