import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function NeoPageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8 max-w-3xl border-l border-[var(--jif-gold)] pl-4">
      <h1 className="jif-hero text-xl text-[var(--foreground)] md:text-2xl">{title}</h1>
      {subtitle ? (
        <p className="jif-caps jif-dim mt-3 max-w-2xl font-normal" style={{ fontSize: "0.7rem" }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function NeoCard({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("neo-card", className)} {...props}>
      {children}
    </div>
  );
}

export function NeoBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "pop" | "warn" }) {
  return (
    <span
      className={cn(
        "jif-caps inline-flex items-center border border-[var(--jif-line)] px-2 py-0.5",
        tone === "pop" && "border-[var(--jif-gold)] bg-[var(--jif-gold)] text-[var(--primary-foreground)]",
        tone === "warn" && "bg-[var(--secondary)] text-[var(--secondary-foreground)]",
        tone === "neutral" && "text-[var(--foreground)]",
      )}
    >
      {children}
    </span>
  );
}

export function NeoPageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("neo-page", className)}>{children}</div>;
}
