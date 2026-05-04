import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import type { MatchExplain } from "../../lib/matching";
import { MatchExplainBreakdown } from "./MatchExplainBreakdown";
import { matchExplainFromParts, parseMatchExplainParts } from "../../lib/parse-match-explain";
import { cn } from "../../lib/utils";

type Props = {
  /** JSON guardado en BD o null. */
  explainJson?: string | null;
  /** Explain en memoria (p. ej. ranking en vivo). */
  liveExplain?: MatchExplain | null;
  className?: string;
};

/** Botón "i" que abre un panel fijo cerca del clic con el desglose de scoring. */
export function MatchScoreInfoButton({ explainJson, liveExplain, className }: Props) {
  const popId = useId().replace(/:/g, "");
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });

  const parts = liveExplain?.parts ?? parseMatchExplainParts(explainJson ?? null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      const pop = document.getElementById(popId);
      if (pop?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, popId]);

  if (!parts) return null;

  const explain = liveExplain ?? matchExplainFromParts(parts);

  function openNearButton() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const w = 340;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      const top = Math.min(r.bottom + 8, window.innerHeight - 280);
      setAnchor({ top, left });
    }
    setOpen(true);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--jif-line)] text-[var(--muted)] hover:border-[var(--jif-gold)]/45 hover:text-[var(--foreground)]",
          className,
        )}
        aria-label="Ver detalle del match"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) setOpen(false);
          else openNearButton();
        }}
      >
        <Info className="size-4" strokeWidth={1.75} />
      </button>
      {open
        ? createPortal(
            <div
              id={popId}
              className="fixed z-[300] max-h-[min(70vh,380px)] w-[min(calc(100vw-24px),340px)] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow-xl"
              style={{ top: anchor.top, left: anchor.left }}
              role="dialog"
              aria-label="Detalle del scoring"
            >
              <MatchExplainBreakdown explain={explain} intro="Coincidencias usadas para el score." />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
