import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { NeoCard, NeoPageHeader, NeoPageShell } from "../../components/ui/neo-brutal";
import { useOrganization } from "../../contexts/OrganizationContext";
import { PILOT_ACTIVE_FEATURES } from "../../lib/pilot-features";
import { getSalesContactHref } from "../../lib/salesContact";

export function ProPlanPage() {
  const { organization } = useOrganization();
  const isPro = organization?.subscription_tier === "PRO";

  function onContratar() {
    window.open(getSalesContactHref(), "_blank", "noopener,noreferrer");
  }

  return (
    <RequirePermission slug="view_dashboard">
      <NeoPageShell>
        <div className="mb-6">
          <Link
            to="/dashboard/settings"
            className="jif-caps mb-4 inline-flex items-center gap-1 text-[0.65rem] text-[var(--muted)] hover:text-[var(--jif-gold)]"
          >
            <ArrowLeft className="size-3.5" aria-hidden /> Volver a configuración
          </Link>
          <NeoPageHeader
            title="Pilot Pro"
            subtitle="Oferta declarada para contratación formal. Por ahora el producto ejecuta el mismo código que Free."
          />
        </div>

        {isPro ? (
          <p className="mb-6 border border-[var(--jif-line)] bg-[var(--card)] px-4 py-3 text-sm">
            Esta inmobiliaria ya tiene la versión <strong>Pro</strong>.
          </p>
        ) : null}

        <NeoCard className="border-[var(--jif-line)] p-6 md:p-8">
          <h2 className="font-neo text-sm font-bold uppercase tracking-wide text-[var(--foreground)]">
            Todo lo incluido en Pilot
          </h2>
          <ul className="mt-4 grid gap-2 text-sm text-[var(--muted)] md:grid-cols-2">
            {PILOT_ACTIVE_FEATURES.map((f) => (
              <li key={f} className="flex gap-2 border border-[var(--jif-line)] bg-[var(--background)] px-3 py-2">
                <span className="shrink-0 text-[var(--jif-gold)]">●</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button type="button" variant="neo" onClick={() => onContratar()}>
              Contratar
            </Button>
            <Link to="/dashboard/settings">
              <Button type="button" variant="ghost" className="rounded-lg border border-[var(--jif-line)]">
                Estado del plan
              </Button>
            </Link>
          </div>
        </NeoCard>
      </NeoPageShell>
    </RequirePermission>
  );
}
