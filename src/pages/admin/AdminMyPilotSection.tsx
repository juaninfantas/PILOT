import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useOrganization } from "../../contexts/OrganizationContext";
import { hasPermission } from "../../lib/permissions";
import { Button } from "../../components/ui/button";
import { PILOT_ACTIVE_FEATURES } from "../../lib/pilot-features";
import { formatExpiryLabel, tierLabel } from "../../lib/subscriptionDisplay";

export function AdminMyPilotSection() {
  const { permissions } = useAuth();
  const { organization } = useOrganization();
  const tier = organization?.subscription_tier ?? "FREE";
  const expiry = organization?.subscription_expires_at ?? null;
  const canInvite = hasPermission(permissions ?? [], "manage_users");

  return (
    <div className="space-y-12">
      <section className="space-y-4 rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Plan y versión</h2>
        <p className="text-sm text-[var(--muted)]">Estado de suscripción y funcionalidades declaradas para esta inmobiliaria.</p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[var(--jif-line)] pb-4">
          <span className="text-sm font-medium text-[var(--muted)]">Versión</span>
          <span className="text-lg font-semibold capitalize text-[var(--foreground)]">{tierLabel(tier)}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-sm font-medium text-[var(--muted)]">Caducidad</span>
          <span className="text-lg font-semibold text-[var(--foreground)]">{formatExpiryLabel(expiry)}</span>
        </div>
        <div className="pt-2">
          <h3 className="text-base font-semibold text-[var(--foreground)]">Funcionalidades activas</h3>
          <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-[var(--muted)] marker:text-[var(--jif-gold)]">
            {PILOT_ACTIVE_FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
        {tier !== "PRO" ? (
          <div className="pt-4">
            <Link to="/dashboard/planes/pro">
              <Button type="button" variant="neo" className="w-full sm:w-auto">
                Pasá a Pro
              </Button>
            </Link>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Compará alcance declarado para contrato comercial y facturación.
            </p>
          </div>
        ) : (
          <p className="border-t border-[var(--jif-line)] pt-4 text-sm text-[var(--muted)]">Estás en el plan Pro.</p>
        )}
      </section>

      {canInvite ? (
        <section className="rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
          Las invitaciones y la gestión del equipo están en{" "}
          <strong className="text-[var(--foreground)]">Administración → Usuarios</strong>.
        </section>
      ) : null}
    </div>
  );
}
