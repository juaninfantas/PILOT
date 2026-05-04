import { hasPermission } from "../lib/permissions";
import { useAuth } from "../contexts/AuthContext";

export function RequirePermission({ slug, children }: { slug: string; children: React.ReactNode }) {
  const { permissions } = useAuth();
  if (!hasPermission(permissions, slug)) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-8 text-center text-[var(--muted)]">
        No tenés permiso para ver esta sección ({slug}).
      </div>
    );
  }
  return <>{children}</>;
}
