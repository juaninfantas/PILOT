import { useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export type PhotoLightboxItem = {
  id: string;
  url: string;
  label?: string | null;
};

type PhotoLightboxProps = {
  open: boolean;
  items: PhotoLightboxItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
  footer?: React.ReactNode;
  /** Clases extra del panel (ej. z-index) */
  className?: string;
};

const SWIPE_MIN = 56;

export function PhotoLightbox({
  open,
  items,
  index,
  onClose,
  onIndexChange,
  footer,
  className,
}: PhotoLightboxProps) {
  const touchStartX = useRef<number | null>(null);
  const safeIndex = items.length ? Math.min(Math.max(index, 0), items.length - 1) : 0;
  const current = items[safeIndex] ?? null;

  const goPrev = useCallback(() => {
    if (items.length <= 1) return;
    onIndexChange((safeIndex - 1 + items.length) % items.length);
  }, [items.length, onIndexChange, safeIndex]);

  const goNext = useCallback(() => {
    if (items.length <= 1) return;
    onIndexChange((safeIndex + 1) % items.length);
  }, [items.length, onIndexChange, safeIndex]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, goPrev, goNext]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !current) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[200] flex flex-col bg-black/93 text-white backdrop-blur-[2px]",
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Visor de fotos"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X className="size-5" strokeWidth={1.75} />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-medium">{current.label ?? "Foto"}</p>
          <p className="text-xs tabular-nums text-white/60">
            {safeIndex + 1} / {items.length}
          </p>
        </div>
        <div className="w-10 shrink-0" aria-hidden />
      </header>

      <div className="relative min-h-0 flex-1 touch-pan-y">
        <button
          type="button"
          className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-white transition-colors hover:bg-black/70 disabled:opacity-25 sm:left-3"
          aria-label="Anterior"
          disabled={items.length <= 1}
          onClick={goPrev}
        >
          <ChevronLeft className="size-7" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-white transition-colors hover:bg-black/70 disabled:opacity-25 sm:right-3"
          aria-label="Siguiente"
          disabled={items.length <= 1}
          onClick={goNext}
        >
          <ChevronRight className="size-7" strokeWidth={1.75} />
        </button>

        <div
          className="flex h-full items-center justify-center px-2 pb-2 sm:px-12"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            if (start == null || items.length <= 1) return;
            const end = e.changedTouches[0]?.clientX;
            if (end == null) return;
            const dx = end - start;
            if (dx > SWIPE_MIN) goPrev();
            else if (dx < -SWIPE_MIN) goNext();
          }}
        >
          <img
            src={current.url}
            alt={current.label ?? ""}
            className="max-h-[calc(100dvh-8rem)] max-w-full select-none object-contain"
            draggable={false}
          />
        </div>
      </div>

      {footer ? (
        <footer className="shrink-0 border-t border-white/10 bg-black/40 px-4 py-3">{footer}</footer>
      ) : null}
    </div>
  );
}
