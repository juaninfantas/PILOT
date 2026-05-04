import { useMemo } from "react";

type Point = { t: number; v: number; label: string };

const yAxisFmt = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const refAmtFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function padSeries(points: Point[], extraV: number[] = []): { minT: number; maxT: number; minV: number; maxV: number } {
  const vals = [...points.map((p) => p.v), ...extraV].filter((v) => Number.isFinite(v));
  if (!points.length && !vals.length) {
    return { minT: 0, maxT: 1, minV: 0, maxV: 1 };
  }
  if (!points.length) {
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    return { minT: 0, maxT: 1, minV, maxV: maxV === minV ? minV + 1 : maxV };
  }
  let minT = points[0].t;
  let maxT = points[0].t;
  let minV = points[0].v;
  let maxV = points[0].v;
  for (const p of points) {
    minT = Math.min(minT, p.t);
    maxT = Math.max(maxT, p.t);
    minV = Math.min(minV, p.v);
    maxV = Math.max(maxV, p.v);
  }
  for (const v of extraV) {
    if (Number.isFinite(v)) {
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  }
  if (maxT === minT) maxT = minT + 86400000;
  if (maxV === minV) maxV = minV + 1;
  return { minT, maxT, minV, maxV };
}

function padValueRange(minV: number, maxV: number): { y0: number; y1: number } {
  const span = maxV - minV;
  const p = span > 0 ? span * 0.06 : Math.abs(minV) * 0.02 + 1;
  return { y0: minV - p, y1: maxV + p };
}

function linspaceY(y0: number, y1: number, n: number): number[] {
  if (n < 2) return [y0];
  return Array.from({ length: n }, (_, i) => y0 + ((y1 - y0) * i) / (n - 1));
}

function linspaceTimes(minT: number, maxT: number, n: number): number[] {
  if (n < 2) return [minT];
  if (maxT <= minT) return [minT];
  return Array.from({ length: n }, (_, i) => minT + ((maxT - minT) * i) / (n - 1));
}

/** Precio listado, ofertas, tasaciones y referencias de equilibrio — con ejes legibles. */
export function PropertyPriceAppraisalChart(props: {
  listingPrices: { effective_at: string; amount: string | number }[];
  offerPrices: { effective_at: string; amount: string | number }[];
  appraisals: { appraised_at: string; amount: string | number }[];
  breakEvenStrong?: number | null;
  breakEvenWeak?: number | null;
  height?: number;
  /** Para etiquetas del eje Y y leyenda. */
  currency?: string;
  showLegend?: boolean;
}) {
  const {
    listingPrices,
    offerPrices,
    appraisals,
    breakEvenStrong,
    breakEvenWeak,
    height = 200,
    currency = "USD",
    showLegend = true,
  } = props;

  const { listPts, offPts, apprPts, minT, maxT, minV, maxV } = useMemo(() => {
    const toPoints = (rows: { t: string; v: string | number; label: string }[]) =>
      rows
        .map((r) => ({
          t: new Date(r.t).getTime(),
          v: Number(r.v),
          label: r.label,
        }))
        .filter((x) => Number.isFinite(x.t) && Number.isFinite(x.v))
        .sort((a, b) => a.t - b.t);

    const lPts = toPoints(
      listingPrices.map((r) => ({ t: r.effective_at, v: r.amount, label: "listado" })),
    );
    const oPts = toPoints(offerPrices.map((r) => ({ t: r.effective_at, v: r.amount, label: "oferta" })));
    const aPts = toPoints(appraisals.map((r) => ({ t: r.appraised_at, v: r.amount, label: "tasación" })));

    const all = [...lPts, ...oPts, ...aPts];
    const extraV: number[] = [];
    if (breakEvenStrong != null && Number.isFinite(breakEvenStrong)) extraV.push(breakEvenStrong);
    if (breakEvenWeak != null && Number.isFinite(breakEvenWeak)) extraV.push(breakEvenWeak);
    const pad = padSeries(all, extraV);

    return {
      listPts: lPts,
      offPts: oPts,
      apprPts: aPts,
      minT: pad.minT,
      maxT: pad.maxT,
      minV: pad.minV,
      maxV: pad.maxV,
    };
  }, [listingPrices, offerPrices, appraisals, breakEvenStrong, breakEvenWeak]);

  const { y0, y1 } = padValueRange(minV, maxV);
  const yTicks = linspaceY(y0, y1, 5);
  const xTicks = linspaceTimes(minT, maxT, 4);

  const w = 420;
  const h = height;
  const margin = { top: 14, right: 72, bottom: 40, left: 52 };
  const plotL = margin.left;
  const plotR = w - margin.right;
  const plotT = margin.top;
  const plotB = h - margin.bottom;
  const innerW = plotR - plotL;
  const innerH = plotB - plotT;

  function xScale(t: number) {
    return plotL + ((t - minT) / (maxT - minT)) * innerW;
  }
  function yScale(v: number) {
    return plotB - ((v - y0) / (y1 - y0)) * innerH;
  }

  const linePath = (pts: Point[]) =>
    pts.length
      ? pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.t).toFixed(1)} ${yScale(p.v).toFixed(1)}`).join(" ")
      : "";

  const showWeak =
    breakEvenWeak != null &&
    Number.isFinite(breakEvenWeak) &&
    breakEvenStrong != null &&
    Number.isFinite(breakEvenStrong) &&
    Math.abs(breakEvenWeak - breakEvenStrong) > 1e-6;

  function formatXTick(ts: number) {
    return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });
  }

  const gridColor = "var(--border, #dcd6cc)";
  const axisColor = "var(--foreground)";
  const mutedStroke = "#9c9488";

  if (!listPts.length && !offPts.length && !apprPts.length) {
    return <p className="text-xs text-[var(--muted)]">Sin datos de precio ni tasación.</p>;
  }

  return (
    <div className={showLegend ? "space-y-2" : undefined}>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        className="max-w-full text-[var(--foreground)]"
        role="img"
        aria-label={`Evolución de precio listado, ofertas y tasaciones en ${currency}: eje horizontal fechas, eje vertical importes.`}
      >
        <title>
          Precio listado, ofertas y tasaciones ({currency}); fechas en X e importes en Y.
        </title>

        {/* Rejilla horizontal */}
        {yTicks.map((yv) => {
          const yy = yScale(yv);
          return (
            <line
              key={`gy-${yv}`}
              x1={plotL}
              x2={plotR}
              y1={yy}
              y2={yy}
              stroke={gridColor}
              strokeWidth={1}
              opacity={0.55}
            />
          );
        })}

        {/* Ejes */}
        <line x1={plotL} x2={plotR} y1={plotB} y2={plotB} stroke={axisColor} strokeWidth={1.25} opacity={0.85} />
        <line x1={plotL} x2={plotL} y1={plotT} y2={plotB} stroke={axisColor} strokeWidth={1.25} opacity={0.85} />

        {/* Etiquetas eje Y (importe, compacto) */}
        {yTicks.map((yv) => {
          const yy = yScale(yv);
          return (
            <text
              key={`y-${yv}`}
              x={plotL - 6}
              y={yy}
              dominantBaseline="middle"
              textAnchor="end"
              className="fill-[var(--muted)]"
              style={{ fontSize: 10 }}
            >
              {yAxisFmt.format(yv)}
            </text>
          );
        })}

        <text
          x={plotL - 4}
          y={plotT - 2}
          textAnchor="start"
          className="fill-[var(--muted)]"
          style={{ fontSize: 10 }}
        >
          {currency}
        </text>

        {/* Etiquetas eje X (fechas) */}
        {xTicks.map((tv) => {
          const xx = xScale(tv);
          return (
            <text
              key={`x-${tv}`}
              x={xx}
              y={plotB + 16}
              textAnchor="middle"
              className="fill-[var(--muted)]"
              style={{ fontSize: 10 }}
            >
              {formatXTick(tv)}
            </text>
          );
        })}

        <text
          x={(plotL + plotR) / 2}
          y={h - 6}
          textAnchor="middle"
          className="fill-[var(--muted)]"
          style={{ fontSize: 10 }}
        >
          Fecha
        </text>

        {/* Referencias (dentro del área útil horizontalmente; leyendas a la derecha) */}
        {breakEvenStrong != null && Number.isFinite(breakEvenStrong) ? (
          <>
            <line
              x1={plotL}
              x2={plotR}
              y1={yScale(breakEvenStrong)}
              y2={yScale(breakEvenStrong)}
              stroke={axisColor}
              strokeWidth={1.75}
              opacity={0.75}
            />
            <text
              x={plotR + 4}
              y={yScale(breakEvenStrong)}
              dominantBaseline="middle"
              textAnchor="start"
              className="fill-[var(--foreground)]"
              style={{ fontSize: 9 }}
            >
              Eq. {refAmtFmt.format(breakEvenStrong)}
            </text>
          </>
        ) : null}
        {showWeak && breakEvenWeak != null ? (
          <>
            <line
              x1={plotL}
              x2={plotR}
              y1={yScale(breakEvenWeak)}
              y2={yScale(breakEvenWeak)}
              stroke={mutedStroke}
              strokeWidth={1.25}
              opacity={0.9}
              strokeDasharray="4 4"
            />
            <text
              x={plotR + 4}
              y={yScale(breakEvenWeak)}
              dominantBaseline="middle"
              textAnchor="start"
              className="fill-[var(--muted)]"
              style={{ fontSize: 9 }}
            >
              Ref. {refAmtFmt.format(breakEvenWeak)}
            </text>
          </>
        ) : null}

        {/* Series */}
        {apprPts.length ? (
          <path d={linePath(apprPts)} fill="none" stroke="#c48c1a" strokeWidth={2} strokeDasharray="6 4" />
        ) : null}
        {offPts.length ? (
          <path d={linePath(offPts)} fill="none" stroke="#5c4d7a" strokeWidth={1.75} strokeDasharray="2 4" />
        ) : null}
        {listPts.length ? <path d={linePath(listPts)} fill="none" stroke="#2d6a7a" strokeWidth={2.25} /> : null}

        {apprPts.map((p, i) => (
          <circle key={`ca-${p.t}-${i}`} cx={xScale(p.t)} cy={yScale(p.v)} r={3} fill="#c48c1a" stroke="#fffcf7" strokeWidth={1} />
        ))}
        {offPts.map((p, i) => (
          <circle key={`co-${p.t}-${i}`} cx={xScale(p.t)} cy={yScale(p.v)} r={2.5} fill="#5c4d7a" stroke="#fffcf7" strokeWidth={1} />
        ))}
        {listPts.map((p, i) => (
          <circle key={`cl-${p.t}-${i}`} cx={xScale(p.t)} cy={yScale(p.v)} r={3} fill="#2d6a7a" stroke="#fffcf7" strokeWidth={1} />
        ))}
      </svg>
      {showLegend ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--border)]/70 pt-2 text-[11px] text-[var(--muted)]">
          <span>
            <span className="me-1.5 inline-block size-2.5 rounded-full bg-[#2d6a7a]" /> Precio listado
          </span>
          <span>
            <span className="me-1.5 inline-block size-2.5 rounded-sm bg-[#5c4d7a]" style={{ borderStyle: "dashed" }} />{" "}
            Ofertas
          </span>
          <span>
            <span className="me-1.5 inline-block size-2.5 rounded-full bg-[#c48c1a]" /> Tasaciones
          </span>
          <span className="basis-full text-[10px] opacity-[0.88]">
            Eq. / Ref.: referencias fuerte y débil a la derecha del área.
          </span>
        </div>
      ) : null}
    </div>
  );
}
