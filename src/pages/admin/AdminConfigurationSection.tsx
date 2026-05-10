import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { FunnelEditorSection } from "../../components/admin/FunnelEditorSection";
import { PropertyShareFormatsSection } from "./PropertyShareFormatsSection";
import { ExchangeRatesSection } from "./ExchangeRatesSection";

export function AdminConfigurationSection() {
  const { permissions } = useAuth();
  const perms = permissions ?? [];
  const canFunnel = hasPermission(perms, "manage_opportunities");
  const canShareFormats = hasPermission(perms, "manage_users") || hasPermission(perms, "manage_properties");
  const canFx = hasPermission(perms, "manage_properties");

  return (
    <div className="space-y-12">
      {canFx ? <ExchangeRatesSection /> : null}

      {canShareFormats ? <PropertyShareFormatsSection /> : null}
      {canFunnel ? (
        <section className="rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6">
          <FunnelEditorSection />
        </section>
      ) : (
        <p className="text-sm text-[var(--muted)]">El editor de funnels requiere permiso de gestión de oportunidades.</p>
      )}
    </div>
  );
}
