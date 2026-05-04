import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TimeOption } from "../../lib/time-options";
import { cn } from "../../lib/utils";

export type { TimeOption };

type TimeSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: TimeOption[];
  className?: string;
  /** Altura máxima del panel desplegable (ej. `max-h-40` ≈ 10rem) */
  listMaxHeightClass?: string;
};

export function TimeSelect({
  id,
  value,
  onChange,
  options,
  className,
  listMaxHeightClass = "max-h-40",
}: TimeSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const selected = listRef.current.querySelector('[aria-selected="true"]');
    selected?.scrollIntoView({ block: "nearest" });
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const current = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "neo-field flex h-10 w-full cursor-pointer items-center justify-between gap-2 text-left",
          open && "outline outline-1 outline-[var(--jif-gold)] outline-offset-0",
        )}
      >
        <span className="tabular-nums">{current}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-[var(--muted)] transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Horarios"
          className={cn(
            "absolute left-0 right-0 z-[100] mt-1 overflow-y-auto overscroll-contain border border-[var(--jif-line)] bg-[#fffcf7] py-1 shadow-lg",
            listMaxHeightClass,
          )}
        >
          {options.map((o) => (
            <li key={o.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm tabular-nums text-[var(--foreground)] transition-colors hover:bg-stone-900/6",
                  o.value === value && "bg-[var(--jif-gold)]/15 font-medium text-[var(--foreground)]",
                )}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
