import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { FunnelEditorSection } from "../../components/admin/FunnelEditorSection";
import { PropertyShareFormatsSection } from "./PropertyShareFormatsSection";

export function AdminConfigurationSection() {
  const { permissions } = useAuth();
  const canFunnel = hasPermission(permissions ?? [], "manage_opportunities");
  const canShareFormats =
    hasPermission(permissions ?? [], "manage_users") || hasPermission(permissions ?? [], "manage_properties");

  return (
    <div className="space-y-12">
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
