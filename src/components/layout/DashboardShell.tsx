import { DashboardLayout } from "./DashboardLayout";
import { CurrencyCatalogProvider } from "../../contexts/CurrencyCatalogContext";
import { useOrganization } from "../../contexts/OrganizationContext";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";

export function DashboardShell() {
  const { loading, organization, refresh } = useOrganization();
  const { signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-[var(--muted)]">
        Cargando inmobiliaria…
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="max-w-md text-[var(--foreground)]">
          Tu cuenta no tiene una <strong>inmobiliaria</strong> asignada (o falta ejecutar migraciones Supabase).
        </p>
        <p className="jif-caps max-w-md text-[0.65rem] text-[var(--muted)]">
          Si venís del registro con código invitación, esperá unos segundos y volvé a cargar.
        </p>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={() => void refresh()}>
            Reintentar
          </Button>
          <Button type="button" variant="ghost" onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  return (
    <CurrencyCatalogProvider>
      <DashboardLayout />
    </CurrencyCatalogProvider>
  );
}
