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
    <div className={cn("flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/40 p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            active === tab.id
              ? "bg-[var(--primary)] text-white shadow-sm"
              : "text-[var(--muted)] hover:text-white",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
