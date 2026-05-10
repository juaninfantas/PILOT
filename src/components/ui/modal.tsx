import { type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Clases del panel (ancho, etc.) */
  panelClassName?: string;
};

export function Modal({ open, title, onClose, children, footer, panelClassName }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className={cn(
          "w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg",
          panelClassName,
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar">
            <X className="size-4" />
          </Button>
        </div>
        <div className="space-y-4 px-4 py-4">{children}</div>
        {footer ? (
          <div className="flex w-full min-w-0 flex-wrap justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
