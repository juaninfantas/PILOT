import { useMemo, useState } from "react";

/* Tonos alineados a MILAN 430: azul marino, sages, cálidos, sin neón */
const STAGE_GRADES = [
  { a: "#1a2d4a", b: "#152438" },
  { a: "#2a3f56", b: "#1e3045" },
  { a: "#3d4f5a", b: "#2d3e48" },
  { a: "#4a5a52", b: "#384540" },
  { a: "#5c4a44", b: "#453635" },
  { a: "#4a4458", b: "#363042" },
];

export type FunnelShapeRow = {
  id: string;
  label: string;
  count: number;
  budgeted: number;
  notBudgeted: number;
  pct: number;
};

type Props = {
  rows: FunnelShapeRow[];
};

/** Embudo invertido: etapas apiladas, ancho decrece; flecha de entrada arriba */
export function FunnelShapeChart({ rows }: Props) {
  const n = Math.max(rows.length, 1);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const active = useMemo(() => {
    if (rows.length === 0) return null;
    return rows.find((r) => r.id === hoveredId) ?? rows[0] ?? null;
  }, [hoveredId, rows]);

  if (rows.length === 0 || !active) {
    return <p className="jif-caps jif-dim text-center">Sin etapas en este funnel.</p>;
  }

  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="mb-2 flex justify-center" aria-hidden>
        <svg width="40" height="24" viewBox="0 0 40 24" className="text-[#1a2d4a]">
          <path d="M20 0 L30 12 L24 12 L24 24 L16 24 L16 12 L10 12 Z" fill="currentColor" />
        </svg>
      </div>
      <div className="space-y-0">
        {rows.map((row, i) => {
          const wTop = 96 - (i * 76) / n;
          const wBot = 96 - ((i + 1) * 76) / n;
          const col = STAGE_GRADES[i % STAGE_GRADES.length];
          const clip = `polygon(${50 - wTop / 2}% 0%, ${50 + wTop / 2}% 0%, ${50 + wBot / 2}% 100%, ${50 - wBot / 2}% 100%)`;
          return (
            <div
              key={row.id}
              className="group relative -mt-px first:mt-0"
              style={{ clipPath: clip, WebkitClipPath: clip }}
              title={`${row.label}: ${row.count} · ${row.pct}% · con monto ${row.budgeted} / sin ${row.notBudgeted}`}
              onMouseEnter={() => setHoveredId(row.id)}
              onFocus={() => setHoveredId(row.id)}
            >
              <div
                className="flex h-14 w-full items-center justify-center border-y border-black/10 text-center text-white transition-transform duration-150 group-hover:scale-[1.04] group-focus-within:scale-[1.04]"
                style={{
                  background: `linear-gradient(90deg, ${col.a} 0%, ${col.b} 50%, ${col.a} 100%)`,
                }}
              >
                <div className="px-3">
                  <div className="line-clamp-2 text-[0.6rem] font-bold uppercase tracking-wider text-white/95">{row.label}</div>
                  <div className="mt-0.5 font-mono text-xl font-bold tabular-nums">{row.count}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 border border-[var(--jif-line)] bg-[var(--card)] p-3 shadow-[var(--neo-shadow-sm)]">
        <p className="jif-caps jif-dim text-[0.55rem]">Etapa activa</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div>
            <p className="font-semibold text-[var(--foreground)]">{active.label}</p>
            <p className="jif-caps jif-dim text-[0.55rem]">Participación {active.pct}% del funnel</p>
          </div>
          <p className="font-mono text-2xl font-bold tabular-nums text-[var(--jif-gold)]">{active.count}</p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="border border-[var(--jif-line)] bg-[var(--background)] px-2 py-1">
            <p className="jif-caps jif-dim text-[0.5rem]">Con monto</p>
            <p className="font-mono tabular-nums">{active.budgeted}</p>
          </div>
          <div className="border border-[var(--jif-line)] bg-[var(--background)] px-2 py-1">
            <p className="jif-caps jif-dim text-[0.5rem]">Sin monto</p>
            <p className="font-mono tabular-nums">{active.notBudgeted}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
