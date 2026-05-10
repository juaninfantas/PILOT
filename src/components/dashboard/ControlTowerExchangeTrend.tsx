import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  buildRatesByPair,
  effectiveQuoteForUse,
  exchangePairKey,
  formatExchangePairQuote,
  type ExchangeRateRow,
} from "../../lib/exchange-rate";
import { useOrganization } from "../../contexts/OrganizationContext";

const DEFAULT_PAIR = "USD|ARS";

/** Escala Y: valores muy chicos (p.ej. ARS→USD) se muestran como equivalente grande en pantalla para legibilidad. */
function chartY(quotePerBase: number, from: string, to: string): number {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  const q = Number(quotePerBase);
  if (!Number.isFinite(q) || q <= 0) return 0;
  if (t === "USD" && q < 0.05) return 1 / q;
  if (f === "USD" && t !== "USD") return q;
  return q;
}

/** Franja amplia del Control Tower: evolución de tipo de cambio y valor actual destacado a la derecha. */
export function ControlTowerExchangeTrend() {
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const [rows, setRows] = useState<ExchangeRateRow[]>([]);
  const [pairKey, setPairKey] = useState(DEFAULT_PAIR);
  const pairInitialized = useRef(false);

  useEffect(() => {
    if (!orgId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from("ExchangeRate")
      .select("*")
      .eq("organization_id", orgId)
      .order("effective_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error(error);
          setRows([]);
          return;
        }
        setRows((data as ExchangeRateRow[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const byPair = useMemo(() => buildRatesByPair(rows), [rows]);

  const pairOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(exchangePairKey(r.currency_from, r.currency_to));
    return [...s].sort();
  }, [rows]);

  useEffect(() => {
    if (pairInitialized.current || pairOptions.length === 0) return;
    pairInitialized.current = true;
    if (pairOptions.includes(DEFAULT_PAIR)) setPairKey(DEFAULT_PAIR);
    else setPairKey(pairOptions[0]);
  }, [pairOptions]);

  useEffect(() => {
    if (pairOptions.length > 0 && !pairOptions.includes(pairKey)) {
      setPairKey(pairOptions.includes(DEFAULT_PAIR) ? DEFAULT_PAIR : pairOptions[0]);
    }
  }, [pairKey, pairOptions]);

  const series = useMemo(() => byPair.get(pairKey) ?? [], [byPair, pairKey]);

  const points = useMemo(() => {
    return series
      .map((r) => {
        const q = effectiveQuoteForUse(r);
        if (!Number.isFinite(q) || q <= 0) return null;
        return {
          iso: r.effective_at,
          quotePerBase: q,
          y: chartY(q, r.currency_from, r.currency_to),
          tMs: new Date(r.effective_at).getTime(),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);
  }, [series]);

  const last = series.length > 0 ? series[series.length - 1] : null;
  const tailLabel = last
    ? formatExchangePairQuote(last.currency_from, last.currency_to, effectiveQuoteForUse(last))
    : null;

  const chartGeom = useMemo(() => {
    if (points.length === 0) return { path: "", lastCx: "", lastCy: "", w: 100, h: 52 };

    const ys = points.map((p) => p.y);
    const minYRaw = Math.min(...ys);
    const maxYRaw = Math.max(...ys);
    const pad = maxYRaw > minYRaw ? (maxYRaw - minYRaw) * 0.08 || maxYRaw * 0.02 : Math.max(minYRaw * 0.02, 1);
    const minY = minYRaw - pad;
    const maxY = maxYRaw + pad;
    const span = Math.max(maxY - minY, 1e-9);

    const w = 100;
    const h = 52;
    const pl = 2;
    const pr = 2;
    const pt = 4;
    const pb = 6;
    const iw = w - pl - pr;
    const ih = h - pt - pb;

    const n = points.length;
    const xAt = (i: number) => pl + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
    const yAt = (yv: number) => pt + ih * (1 - (yv - minY) / span);

    let d = "";
    points.forEach((p, i) => {
      const x = xAt(i);
      const y = yAt(p.y);
      d += `${i === 0 ? "M" : "L"} ${x} ${y}`;
    });

    let lastCx = "";
    let lastCy = "";
    if (points.length > 0) {
      lastCx = String(xAt(n - 1));
      lastCy = String(yAt(points[n - 1].y));
    }

    return { path: d, lastCx, lastCy, w, h };
  }, [points]);

  if (!orgId) {
    return (
      <div className="rounded border border-dashed border-[var(--jif-line)] bg-[var(--card)]/50 px-4 py-6 text-xs text-[var(--muted)]">
        Elegí una inmobiliaria para ver cotizaciones.
      </div>
    );
  }

  if (pairOptions.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded border border-[var(--jif-line)] bg-[var(--card)] px-4 py-4">
        <p className="jif-caps text-[0.65rem] text-[var(--muted)]">Cotización</p>
        <p className="text-sm text-[var(--muted)]">
          Sin tipos de cambio cargados.{" "}
          <Link to="/dashboard/admin?tab=configuracion" className="text-[var(--accent)] hover:underline">
            Configuración
          </Link>
        </p>
      </div>
    );
  }

  function pairOptionLabel(key: string): string {
    const [a, b] = key.split("|");
    if (key === DEFAULT_PAIR) return `${a} → ${b} (dólar / peso)`;
    return `${a} → ${b}`;
  }

  return (
    <div className="flex min-h-[7.5rem] min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
      <div className="min-w-0 flex-1 px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="jif-caps text-[0.6rem] text-[var(--muted)]">Cotización</span>
          <select
            aria-label="Par de monedas"
            className="neo-field h-9 max-w-[14rem] text-sm"
            value={pairKey}
            onChange={(e) => setPairKey(e.target.value)}
          >
            {pairOptions.map((key) => (
              <option key={key} value={key}>
                {pairOptionLabel(key)}
              </option>
            ))}
          </select>
        </div>
        {points.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Sin puntos para este par.</p>
        ) : (
          <svg
            className="h-[72px] w-full max-w-none text-[var(--jif-gold)]"
            viewBox={`0 0 ${chartGeom.w} ${chartGeom.h}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Evolución del tipo de cambio"
          >
            {chartGeom.path ? (
              <path
                d={chartGeom.path}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {chartGeom.lastCx && chartGeom.lastCy ? (
              <circle
                cx={chartGeom.lastCx}
                cy={chartGeom.lastCy}
                r="4"
                fill="var(--foreground)"
                stroke="currentColor"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
        )}
      </div>
      <div className="flex shrink-0 flex-col justify-center border-t border-[var(--jif-line)] px-6 py-4 sm:w-[min(100%,260px)] sm:border-l sm:border-t-0 md:w-[280px]">
        <span className="jif-caps text-[0.55rem] text-[var(--muted)]">Último</span>
        <p className="mt-2 max-w-[min(100%,18rem)] font-neo text-base font-bold leading-snug tracking-tight text-[var(--foreground)] sm:text-lg md:text-xl">
          {tailLabel ?? "—"}
        </p>
        {last ? (
          <p className="mt-3 font-mono text-[0.65rem] leading-snug text-[var(--muted)]">
            Vigente desde{" "}
            {new Date(last.effective_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
