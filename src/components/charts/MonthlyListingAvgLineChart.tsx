import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type MonthlyAvgPoint = { month: string; avg: number; n: number };

/** Etiqueta corta para mes ISO `YYYY-MM` (p. ej. en tooltips). */
export function formatMonthAxisLabel(isoMonth: string): string {
  const [y, m] = isoMonth.split("-");
  if (!y || !m) return isoMonth;
  return `${m}/${y.slice(-2)}`;
}

function isoMonthToMidTs(isoMonth: string): number {
  const [ys, ms] = isoMonth.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return Date.now();
  return new Date(y, mo - 1, 15, 12, 0, 0, 0).getTime();
}

function padValueRange(minV: number, maxV: number): { y0: number; y1: number } {
  const span = maxV - minV;
  const p = span > 0 ? span * 0.08 : Math.abs(minV) * 0.03 + (minV > 500 ? minV * 0.02 : 500);
  return { y0: Math.max(0, minV - p), y1: maxV + p };
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

function formatLongMonth(isoMonth: string) {
  const [ys, ms] = isoMonth.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return isoMonth;
  return new Date(y, mo - 1, 15).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function linearPath(pix: { x: number; y: number }[]): string {
  if (!pix.length) return "";
  let d = `M ${pix[0].x.toFixed(2)} ${pix[0].y.toFixed(2)}`;
  for (let i = 1; i < pix.length; i++) {
    d += ` L ${pix[i].x.toFixed(2)} ${pix[i].y.toFixed(2)}`;
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
  lines: string[];
  onHover: (lines: string[], clientX: number, clientY: number) => void;
  onMove: (clientX: number, clientY: number) => void;
}) {
  const { cx, cy, r, fill, stroke, strokeWidth = 1, lines, onHover, onMove } = props;
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
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} pointerEvents="none">
        <title>{lines.join(" · ")}</title>
      </circle>
    </g>
  );
}

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
 * Promedio mensual — mismo lenguaje visual que el gráfico listado/tasación de ficha (línea segmentada, puntos huecos, leyenda).
 */
export function MonthlyListingAvgLineChart(props: {
  monthly: MonthlyAvgPoint[];
  currency?: string;
  height?: number;
  yAxisCaption?: string;
  valueSuffix?: string;
  ariaLabel?: string;
  chartTitle?: string;
  /** Texto de la leyenda bajo el gráfico. */
  legendLabel?: string;
  showLegend?: boolean;
}) {
  const {
    monthly,
    currency = "USD",
    height = 220,
    yAxisCaption,
    valueSuffix = "",
    ariaLabel = "Promedio mensual precio público",
    chartTitle = "Evolución mensual del precio de listado",
    legendLabel = "Promedio mensual",
    showLegend = true,
  } = props;

  const [hover, setHover] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const showTip = useCallback((lines: string[], clientX: number, clientY: number) => {
    setHover({ x: clientX, y: clientY, lines });
  }, []);
  const moveTip = useCallback((clientX: number, clientY: number) => {
    setHover((prev) => (prev ? { ...prev, x: clientX, y: clientY } : null));
  }, []);
  const hideTip = useCallback(() => setHover(null), []);

  const COL_LINE = "var(--accent, #1a2d4a)";
  const gridColor = "var(--border, #dcd6cc)";
  const axisMuted = "var(--muted)";

  const layout = useMemo(() => {
    if (!monthly.length) return null;

    const pts = monthly.map((m) => ({
      t: isoMonthToMidTs(m.month),
      v: m.avg,
      month: m.month,
      n: m.n,
    }));

    let minT = Math.min(...pts.map((p) => p.t));
    let maxT = Math.max(...pts.map((p) => p.t));
    const minSpan = 86400000 * 45;
    if (maxT - minT < minSpan) {
      const pad = (minSpan - (maxT - minT)) / 2;
      minT -= pad;
      maxT += pad;
    }

    const tSpanRaw = Math.max(maxT - minT, 86400000 * 2);
    const xPadEnd = tSpanRaw * 0.06;
    const xPadStart = tSpanRaw * 0.04;
    const xDomainMin = minT - xPadStart;
    const xDomainMax = maxT + xPadEnd;

    const vals = pts.map((p) => p.v).filter(Number.isFinite);
    const minV = Math.min(...vals);
    let maxV = Math.max(...vals);
    if (minV === maxV) maxV = minV + (minV > 0 ? minV * 0.05 : 1);

    const { y0, y1 } = padValueRange(minV, maxV);
    const yTicks = compactYTicks(y0, y1, 4);
    const domainLo = yTicks[0] ?? y0;
    const domainHi = Math.max(yTicks[yTicks.length - 1] ?? y1, domainLo + 1);

    const w = 720;
    const h = height;
    const margin = { top: 12, right: 12, bottom: 28, left: 48 };
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

    const screenPts = pts.map((p) => ({ x: xScale(p.t), y: yScale(p.v), meta: p }));
    const pathLine = linearPath(screenPts.map((s) => ({ x: s.x, y: s.y })));

    const xTicks = linspaceTimes(minT, Math.min(maxT + xPadEnd * 0.4, xDomainMax), Math.min(5, Math.max(3, monthly.length)));

    function formatXTick(ts: number) {
      return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    }

    return {
      w,
      h,
      plotL,
      plotR,
      plotT,
      plotB,
      pathLine,
      screenPts,
      yTicks,
      domainLo,
      domainHi,
      xTicks,
      formatXTick,
      xScale,
      yScale,
      yAxisCaption: yAxisCaption ?? currency,
    };
  }, [monthly, height, yAxisCaption, currency]);

  if (!layout) return null;

  const {
    w,
    h,
    plotL,
    plotR,
    plotT,
    plotB,
    pathLine,
    screenPts,
    yTicks,
    xTicks,
    formatXTick,
    xScale,
    yScale,
    yAxisCaption: yCap,
  } = layout;

  const fmtAmt = (v: number) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="w-full min-w-0 rounded-lg border border-[var(--border)]/60 bg-[var(--card)]/35 p-2">
      {hover ? <HoverTipPortal x={hover.x} y={hover.y} lines={hover.lines} /> : null}

      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerLeave={hideTip}
        className="block h-auto w-full max-w-full font-mono text-[10px] leading-none text-[var(--foreground)] antialiased"
        role="img"
        aria-label={ariaLabel}
      >
        <title>{chartTitle}</title>

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
          {yCap}
        </text>

        {xTicks.map((tv) => {
          let xx = xScale(tv);
          const nearEnd = xx > plotR - 28;
          if (nearEnd) xx = plotR - 2;
          return (
            <text
              key={`x-${tv}`}
              x={xx}
              y={plotB + 13}
              textAnchor={nearEnd ? "end" : "middle"}
              className="fill-[var(--muted)]"
            >
              {formatXTick(tv)}
            </text>
          );
        })}

        {pathLine ? (
          <path
            d={pathLine}
            fill="none"
            stroke={COL_LINE}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        <g className="pointer-events-auto">
          {screenPts.map((s, i) => {
            const row = monthly[i];
            const suffix = valueSuffix ? ` ${valueSuffix}` : "";
            const lines = [
              legendLabel,
              `${currency} ${fmtAmt(row.avg)}${suffix}`,
              `${formatLongMonth(row.month)} · n=${row.n}`,
            ];
            return (
              <ChartDot
                key={`dot-${row.month}`}
                cx={s.x}
                cy={s.y}
                r={2.75}
                fill="var(--card, #fffcf7)"
                stroke={COL_LINE}
                lines={lines}
                onHover={showTip}
                onMove={moveTip}
              />
            );
          })}
        </g>
      </svg>

      {showLegend ? (
        <div className="mt-2 border-t border-[var(--border)]/50 pt-2">
          <span className="jif-caps jif-dim inline-flex items-center gap-1.5 tracking-wide">
            <span className="inline-block h-px w-4 bg-[var(--accent)]" aria-hidden />
            {legendLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}
