import type { MatchExplain } from "../../lib/matching";
import { cn } from "../../lib/utils";

const PART_LABELS: Record<keyof MatchExplain["parts"], string> = {
  zone: "Zona",
  price: "Precio",
  m2: "Superficie",
  tags: "Características",
  kind: "Tipo",
  buyer: "Criterios del comprador",
};

type Props = {
  explain: MatchExplain;
  className?: string;
  /** Texto introductorio opcional (ej. reporte vs formulario). */
  intro?: string;
};

export function MatchExplainBreakdown({ explain, className, intro }: Props) {
  const entries = [
    ["zone", explain.parts.zone],
    ["price", explain.parts.price],
    ["m2", explain.parts.m2],
    ["tags", explain.parts.tags],
    ["kind", explain.parts.kind],
    ["buyer", explain.parts.buyer],
  ] as const;

  return (
    <div className={cn("space-y-2", className)}>
      {intro ? <p className="text-[11px] leading-relaxed text-[var(--muted)]">{intro}</p> : null}
      <ul className="space-y-1.5 text-xs leading-snug">
        {entries.map(([key, v]) => (
          <li key={key}>
            <span className="font-medium text-[var(--foreground)]">{PART_LABELS[key]}:</span>{" "}
            <span className="text-[var(--muted)]">{v.detail}</span>{" "}
            <span className="whitespace-nowrap font-mono tabular-nums text-[var(--jif-gold)]">
              ({v.points.toFixed(1)} / {v.max} pts)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
