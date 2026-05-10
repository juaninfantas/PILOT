import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type SourcePoint = {
  t: number;
  v: number;
  label: string;
  /** Origen del dato — se muestra en el tooltip al hover */
  tooltipLines?: string[];
};

function endOfTodayMs(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function padValueRange(minV: number, maxV: number): { y0: number; y1: number } {
  const span = maxV - minV;
  const p = span > 0 ? span * 0.08 : Math.abs(minV) * 0.03 + 5000;
  return { y0: minV - p, y1: maxV + p };
}

function compactYTicks(lo: number, hi: number, maxTicks = 4): number[] {
  const span = hi - lo;
  if (!(span > 0) || !Number.isFinite(span)) return [lo, hi];
  const raw = span / Math.max(maxTicks - 1, 1);
  const pow10 = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  let step = pow10;
  if (raw / step > 5) step *= 2;
  else if (raw / step > 2) step *= 2.5;
  else if (raw / step > 1.2) step *= 2;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 0.001; v += step) {
    if (v >= lo - step * 0.001) out.push(v);
  }
  if (out.length < 2) return [lo, hi];
  return out;
}

function linspaceTimes(minT: number, maxT: number, n: number): number[] {
  if (n < 2) return [minT];
  if (maxT <= minT) return [minT];
  return Array.from({ length: n }, (_, i) => minT + ((maxT - minT) * i) / (n - 1));
}

function formatYAxisCompact(y: number) {
  if (Math.abs(y) >= 1000) return `${Math.round(y / 1000)}k`;
  return `${Math.round(y)}`;
}

function formatLongDate(tMs: number) {
  return new Date(tMs).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function fmtAmt(v: number) {
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function buildEquilibriumPoints(
  listingPrices: { effective_at: string; amount: string | number }[],
  appraisals: { appraised_at: string; amount: string | number }[],
  currency: string,
): SourcePoint[] {
  type Ev = { t: number; kind: "L" | "A"; v: number };
  const evs: Ev[] = [];
  for (const r of listingPrices) {
    const t = new Date(r.effective_at).getTime();
    const v = Number(r.amount);
    if (Number.isFinite(t) && Number.isFinite(v)) evs.push({ t, kind: "L", v });
  }
  for (const r of appraisals) {
    const t = new Date(r.appraised_at).getTime();
    const v = Number(r.amount);
    if (Number.isFinite(t) && Number.isFinite(v)) evs.push({ t, kind: "A", v });
  }
  evs.sort((a, b) => a.t - b.t);
  let lastL: number | null = null;
  let lastA: number | null = null;
  const out: SourcePoint[] = [];
  for (const e of evs) {
    if (e.kind === "L") lastL = e.v;
    else lastA = e.v;
    if (lastL != null && lastA != null && Number.isFinite(lastL) && Number.isFinite(lastA)) {
      const mid = (lastL + lastA) / 2;
      out.push({
        t: e.t,
        v: mid,
        label: "equilibrio",
        tooltipLines: [
          "Equilibrio (promedio listado y tasación)",
          `Listado: ${currency} ${fmtAmt(lastL)}`,
          `Tasación: ${currency} ${fmtAmt(lastA)}`,
          `→ (${fmtAmt(lastL)} + ${fmtAmt(lastA)}) / 2 = ${currency} ${fmtAmt(mid)}`,
          `Actualizado al cambiar dato el ${formatLongDate(e.t)}`,
        ],
      });
    }
  }
  return out;
}

function linearLineWithFlatTailToToday(
  knots: SourcePoint[],
  xScale: (t: number) => number,
  yScale: (v: number) => number,
  todayMs: number,
): string {
  if (!knots.length) return "";
  const sorted = [...knots].sort((a, b) => a.t - b.t);
  const pix = sorted.map((p) => ({ x: xScale(p.t), y: yScale(p.v) }));
  const last = sorted[sorted.length - 1];
  const xEnd = xScale(todayMs);

  let d = `M ${pix[0].x.toFixed(2)} ${pix[0].y.toFixed(2)}`;
  for (let i = 1; i < pix.length; i++) {
    d += ` L ${pix[i].x.toFixed(2)} ${pix[i].y.toFixed(2)}`;
  }

  if (last.t < todayMs) {
    const y = yScale(last.v);
    d += ` L ${xEnd.toFixed(2)} ${y.toFixed(2)}`;
  }

  return d;
}

function ChartDot(props: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  opacity?: number;
  lines: string[];
  onHover: (lines: string[], clientX: number, clientY: number) => void;
  onMove: (clientX: number, clientY: number) => void;
}) {
  const { cx, cy, r, fill, stroke, strokeWidth = 1, opacity, lines, onHover, onMove } = props;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={Math.max(r + 6, 10)}
        fill="transparent"
        className="cursor-crosshair"
        onPointerEnter={(e) => onHover(lines, e.clientX, e.clientY)}
        onPointerMove={(e) => onMove(e.clientX, e.clientY)}
      />
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} pointerEvents="none">
        <title>{lines.join(" · ")}</title>
      </circle>
    </g>
  );
}

/** Tooltip fijo al cursor (información de origen de cada punto). */
function HoverTipPortal(props: { x: number; y: number; lines: string[] }) {
  const { x, y, lines } = props;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[500] max-w-[19rem] rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[11px] leading-snug text-[var(--foreground)] shadow-lg"
      style={{
        left: Math.min(x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 300),
        top: y + 12,
      }}
    >
      {lines.map((line, i) => (
        <p key={i} className={i === 0 ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted)]"}>
          {line}
        </p>
      ))}
    </div>,
    document.body,
  );
}

/**
 * Evolución listado / ofertas / tasaciones — viewBox ancho; puntos con tooltip de procedencia.
 */
export function PropertyPriceAppraisalChart(props: {
  listingPrices: { effective_at: string; amount: string | number }[];
  offerPrices: { effective_at: string; amount: string | number }[];
  appraisals: { appraised_at: string; amount: string | number }[];
  height?: number;
  currency?: string;
  showLegend?: boolean;
}) {
  const { listingPrices, offerPrices, appraisals, height = 176, currency = "USD", showLegend = true } = props;

  const [hover, setHover] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const showTip = useCallback((lines: string[], clientX: number, clientY: number) => {
    setHover({ x: clientX, y: clientY, lines });
  }, []);
  const moveTip = useCallback((clientX: number, clientY: number) => {
    setHover((prev) => (prev ? { ...prev, x: clientX, y: clientY } : null));
  }, []);
  const hideTip = useCallback(() => setHover(null), []);

  const todayMs = useMemo(() => endOfTodayMs(), []);

  const { listPts, offPts, apprPts, eqPts, minT, maxT, minV, maxV } = useMemo(() => {
    const lPts: SourcePoint[] = listingPrices
      .map((r): SourcePoint | null => {
        const t = new Date(r.effective_at).getTime();
        const v = Number(r.amount);
        if (!Number.isFinite(t) || !Number.isFinite(v)) return null;
        return {
          t,
          v,
          label: "listado",
          tooltipLines: [
            "Precio listado público",
            `${currency} ${fmtAmt(v)}`,
            `Vigente desde ${formatLongDate(t)} · entrada en el historial de precios de la propiedad`,
          ],
        };
      })
      .filter((x): x is SourcePoint => x !== null)
      .sort((a, b) => a.t - b.t);

    const oPts: SourcePoint[] = offerPrices
      .map((r): SourcePoint | null => {
        const t = new Date(r.effective_at).getTime();
        const v = Number(r.amount);
        if (!Number.isFinite(t) || !Number.isFinite(v)) return null;
        return {
          t,
          v,
          label: "oferta",
          tooltipLines: [
            "Oferta en esta oportunidad",
            `${currency} ${fmtAmt(v)}`,
            `Registrada el ${formatLongDate(t)} · sincronizada con el CRM`,
          ],
        };
      })
      .filter((x): x is SourcePoint => x !== null)
      .sort((a, b) => a.t - b.t);

    const aPts: SourcePoint[] = appraisals
      .map((r): SourcePoint | null => {
        const t = new Date(r.appraised_at).getTime();
        const v = Number(r.amount);
        if (!Number.isFinite(t) || !Number.isFinite(v)) return null;
        return {
          t,
          v,
          label: "tasación",
          tooltipLines: [
            "Tasación",
            `${currency} ${fmtAmt(v)}`,
            `Fecha de tasación: ${formatLongDate(t)} · registro en la propiedad`,
          ],
        };
      })
      .filter((x): x is SourcePoint => x !== null)
      .sort((a, b) => a.t - b.t);

    const ePts = buildEquilibriumPoints(listingPrices, appraisals, currency);

    const timevals = [...lPts, ...oPts, ...aPts].map((p) => p.t);

    if (!timevals.length) {
      return { listPts: lPts, offPts: oPts, apprPts: aPts, eqPts: ePts, minT: 0, maxT: 1, minV: 0, maxV: 1 };
    }
    let minTd = Math.min(...timevals);
    const maxTd = Math.max(todayMs, Math.max(...timevals));
    if (minTd > maxTd) minTd = maxTd - 86400000 * 14;
    if (maxTd - minTd < 86400000) minTd = maxTd - 86400000 * 7;

    const valCandidates = [...lPts, ...oPts, ...aPts, ...ePts].map((p) => p.v).filter(Number.isFinite);
    let minVt = Math.min(...valCandidates);
    let maxVt = Math.max(...valCandidates);
    if (minVt === maxVt) maxVt = minVt + 1;

    return {
      listPts: lPts,
      offPts: oPts,
      apprPts: aPts,
      eqPts: ePts,
      minT: minTd,
      maxT: maxTd,
      minV: minVt,
      maxV: maxVt,
    };
  }, [listingPrices, offerPrices, appraisals, todayMs, currency]);

  const { y0, y1 } = padValueRange(minV, maxV);
  const yTicks = compactYTicks(y0, y1, 4);
  const domainLo = yTicks[0] ?? y0;
  const domainHi = Math.max(yTicks[yTicks.length - 1] ?? y1, domainLo + 1);

  const tSpanRaw = Math.max(maxT - minT, 86400000 * 2);
  const xPadEnd = tSpanRaw * 0.06;
  const xPadStart = tSpanRaw * 0.02;
  const xDomainMin = minT - xPadStart;
  const xDomainMax = maxT + xPadEnd;

  const xTicks = linspaceTimes(minT, Math.min(maxT + xPadEnd * 0.5, xDomainMax), 4);

  const w = 720;
  const h = height;
  const margin = { top: 12, right: 10, bottom: 26, left: 44 };
  const plotL = margin.left;
  const plotR = w - margin.right;
  const plotT = margin.top;
  const plotB = h - margin.bottom;
  const innerW = plotR - plotL;
  const innerH = plotB - plotT;

  function xScale(t: number) {
    const span = xDomainMax - xDomainMin;
    if (span <= 0) return plotL + innerW / 2;
    return plotL + ((t - xDomainMin) / span) * innerW;
  }
  function yScale(v: number) {
    return plotB - ((v - domainLo) / (domainHi - domainLo)) * innerH;
  }

  function formatXTick(ts: number) {
    return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  const gridColor = "var(--border, #dcd6cc)";
  const axisMuted = "var(--muted)";
  const COL_LIST = "var(--accent, #1a2d4a)";
  const COL_OFFER = "#5b2d86";
  const COL_APPR = "#b8860b";
  const COL_EQ = "#94a3b8";

  const pathListing = linearLineWithFlatTailToToday(listPts, xScale, yScale, todayMs);
  const pathOffers = linearLineWithFlatTailToToday(offPts, xScale, yScale, todayMs);
  const pathAppr = linearLineWithFlatTailToToday(apprPts, xScale, yScale, todayMs);
  const pathEq = linearLineWithFlatTailToToday(eqPts, xScale, yScale, todayMs);

  const fallbackLines = (kind: string, v: number, t: number) => [
    kind,
    `${currency} ${fmtAmt(v)}`,
    formatLongDate(t),
  ];

  if (!listPts.length && !offPts.length && !apprPts.length) {
    return <p className="jif-caps jif-dim text-[10px]">Sin datos de precio ni tasación.</p>;
  }

  const longExplain =
    "Listado, ofertas y tasación; línea punteada = equilibrio listado–tasación cuando ambos existen. Pasá el mouse por los puntos para ver el origen del dato.";

  return (
    <div className="w-full min-w-0 rounded-lg border border-[var(--border)]/60 bg-[var(--card)]/35 p-2">
      {hover ? <HoverTipPortal x={hover.x} y={hover.y} lines={hover.lines} /> : null}

      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerLeave={hideTip}
        className="block h-auto w-full max-h-[212px] max-w-full font-sans text-[10px] leading-none text-[var(--foreground)] antialiased"
        role="img"
        aria-label={longExplain}
      >
        <title>{longExplain}</title>

        {yTicks.map((yv) => {
          const yy = yScale(yv);
          return (
            <line key={`gy-${yv}`} x1={plotL} x2={plotR} y1={yy} y2={yy} stroke={gridColor} strokeWidth={1} opacity={0.4} />
          );
        })}

        <line x1={plotL} x2={plotR} y1={plotB} y2={plotB} stroke={axisMuted} strokeWidth={0.75} opacity={0.55} />
        <line x1={plotL} x2={plotL} y1={plotT} y2={plotB} stroke={axisMuted} strokeWidth={0.75} opacity={0.55} />

        {yTicks.map((yv) => {
          const yy = yScale(yv);
          return (
            <text
              key={`y-${yv}`}
              x={plotL - 5}
              y={yy}
              dominantBaseline="middle"
              textAnchor="end"
              className="fill-[var(--muted)]"
            >
              {formatYAxisCompact(yv)}
            </text>
          );
        })}

        <text x={plotL - 4} y={plotT + 2} textAnchor="start" className="fill-[var(--muted)] text-[9px]">
          {currency}
        </text>

        {xTicks.map((tv) => {
          let xx = xScale(tv);
          const nearEnd = xx > plotR - 28;
          if (nearEnd) xx = plotR - 2;
          return (
            <text
              key={`x-${tv}`}
              x={xx}
              y={plotB + 11}
              textAnchor={nearEnd ? "end" : "middle"}
              className="fill-[var(--muted)]"
            >
              {formatXTick(tv)}
            </text>
          );
        })}

        {pathEq ? (
          <path
            d={pathEq}
            fill="none"
            stroke={COL_EQ}
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="3 4"
            opacity={0.5}
          />
        ) : null}
        {pathAppr ? (
          <path d={pathAppr} fill="none" stroke={COL_APPR} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {pathOffers ? (
          <path d={pathOffers} fill="none" stroke={COL_OFFER} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {pathListing ? (
          <path d={pathListing} fill="none" stroke={COL_LIST} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        ) : null}

        <g className="pointer-events-auto">
          {eqPts.map((p, i) => (
            <ChartDot
              key={`dot-eq-${p.t}-${i}`}
              cx={xScale(p.t)}
              cy={yScale(p.v)}
              r={2.35}
              fill="var(--card, #fffcf7)"
              stroke={COL_EQ}
              opacity={0.95}
              lines={p.tooltipLines ?? fallbackLines("Equilibrio", p.v, p.t)}
              onHover={showTip}
              onMove={moveTip}
            />
          ))}
          {apprPts.map((p, i) => (
            <ChartDot
              key={`dot-appr-${p.t}-${i}`}
              cx={xScale(p.t)}
              cy={yScale(p.v)}
              r={2.5}
              fill="var(--card, #fffcf7)"
              stroke={COL_APPR}
              lines={p.tooltipLines ?? fallbackLines("Tasación", p.v, p.t)}
              onHover={showTip}
              onMove={moveTip}
            />
          ))}
          {offPts.map((p, i) => (
            <ChartDot
              key={`dot-off-${p.t}-${i}`}
              cx={xScale(p.t)}
              cy={yScale(p.v)}
              r={2.5}
              fill="var(--card, #fffcf7)"
              stroke={COL_OFFER}
              lines={p.tooltipLines ?? fallbackLines("Oferta", p.v, p.t)}
              onHover={showTip}
              onMove={moveTip}
            />
          ))}
          {listPts.map((p, i) => (
            <ChartDot
              key={`dot-list-${p.t}-${i}`}
              cx={xScale(p.t)}
              cy={yScale(p.v)}
              r={2.75}
              fill="var(--card, #fffcf7)"
              stroke={COL_LIST}
              lines={p.tooltipLines ?? fallbackLines("Listado", p.v, p.t)}
              onHover={showTip}
              onMove={moveTip}
            />
          ))}
        </g>
      </svg>

      {showLegend ? (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-[var(--border)]/50 pt-2 sm:grid-cols-4">
          <span className="jif-caps jif-dim inline-flex items-center gap-1.5 tracking-wide">
            <span className="inline-block h-px w-3 bg-[var(--accent)]" aria-hidden />
            Listado
          </span>
          <span className="jif-caps jif-dim inline-flex items-center gap-1.5 tracking-wide">
            <span className="inline-block h-px w-3 bg-[#5b2d86]" aria-hidden />
            Ofertas
          </span>
          <span className="jif-caps jif-dim inline-flex items-center gap-1.5 tracking-wide">
            <span className="inline-block h-px w-3 bg-[#b8860b]" aria-hidden />
            Tasación
          </span>
          <span className="jif-caps jif-dim inline-flex items-center gap-1.5 tracking-wide">
            <span className="inline-block h-px w-3 border-b border-dotted border-[#94a3b8]" aria-hidden />
            Equilibrio
          </span>
        </div>
      ) : null}
    </div>
  );
}
