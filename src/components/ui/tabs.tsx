import { cn } from "../../lib/utils";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div
      className={cn(
        "-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg border border-[var(--border)] bg-[var(--secondary)]/40 p-1 sm:mx-0",
        className,
      )}
      role="tablist"
      aria-label="Secciones"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-1 sm:min-w-0 sm:whitespace-normal",
            active === tab.id
              ? "bg-[var(--primary)] text-white shadow-sm"
              : "text-[var(--muted)] hover:text-[var(--foreground)] sm:hover:text-white",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
