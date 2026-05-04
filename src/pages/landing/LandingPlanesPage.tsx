import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { PILOT_ACTIVE_FEATURES } from "../../lib/pilot-features";

function PlanCard({
  badge,
  title,
  subtitle,
  highlight,
  accent,
}: {
  badge?: string;
  title: string;
  subtitle: string;
  highlight?: boolean;
  accent?: boolean;
}) {
  return (
    <article
      className={
        highlight
          ? "flex flex-col rounded-2xl border-2 border-[var(--foreground)] bg-[var(--card)] shadow-[var(--neo-shadow-sm)]"
          : "flex flex-col rounded-2xl border border-[var(--jif-line)] bg-[var(--card)] shadow-[var(--neo-shadow-sm)]"
      }
    >
      {badge ? (
        <div
          className={
            accent
              ? "rounded-t-2xl bg-[var(--foreground)] px-4 py-2 text-center jif-caps text-[0.62rem] tracking-widest text-[var(--primary-foreground)]"
              : "rounded-t-2xl border-b border-[var(--jif-line)] bg-[var(--secondary)]/40 px-4 py-2 text-center jif-caps text-[0.62rem] text-[var(--muted)]"
          }
        >
          {badge}
        </div>
      ) : (
        <div className="h-2 shrink-0" />
      )}
      <div className="flex flex-1 flex-col p-8">
        <h2 className="font-neo text-xl font-bold tracking-wide text-[var(--foreground)]">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{subtitle}</p>
        <ul className="mt-8 flex flex-1 flex-col gap-2 text-sm text-[var(--foreground)]">
          {PILOT_ACTIVE_FEATURES.slice(0, 8).map((f) => (
            <li key={f} className="flex gap-2 border-b border-[var(--jif-line)]/60 pb-2 last:border-0">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--jif-gold)]" aria-hidden /> {f}
            </li>
          ))}
        </ul>
        <div className="mt-10 pt-2">
          <Link to="/login" className="block w-full">
            <Button
              type="button"
              variant={highlight ? "primary" : "ghost"}
              className={
                highlight
                  ? "w-full rounded-xl py-6 text-base"
                  : "w-full rounded-xl border border-[var(--foreground)] py-6 text-base text-[var(--foreground)] hover:bg-[var(--secondary)]/50"
              }
            >
              Ver planes en la app
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

export function LandingPlanesPage() {
  return (
    <main className="border-t border-[var(--jif-line)] bg-[var(--card)] px-4 py-12 md:px-8 md:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="jif-caps jif-dim text-[0.65rem]">Pilot</p>
          <h1 className="jif-hero mx-auto mt-2 text-xl md:text-2xl">Planes para tu equipo inmobiliario</h1>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Mismo producto ejecutable desde Free; Pro formaliza contratación y acompañamiento. El detalle de versión está en tu panel,
            Administración → MyPilot.
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl gap-8 lg:mx-auto lg:grid-cols-2">
          <PlanCard
            badge="Empezá sin fricción"
            title="Free"
            subtitle="Operá con todo el alcance funcional hasta que escale la operación."
          />
          <PlanCard
            badge="Contratación comercial"
            title="Pro"
            subtitle="Mismo código y capacidades para equipos que cierran con facturación y soporte definido."
            highlight
            accent
          />
        </div>
        <div className="mx-auto mt-10 max-w-2xl text-center text-xs text-[var(--muted)]">
          Consultá tasas y condiciones con ventas antes de cerrar ciclo formal.
        </div>
      </div>
    </main>
  );
}
