import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "./DashboardLayout";
import { CurrencyCatalogProvider } from "../../contexts/CurrencyCatalogContext";
import { useOrganization } from "../../contexts/OrganizationContext";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { completeOrganizationJoin } from "../../lib/completeOrganizationJoin";
import { getStoredOrgSlug } from "../../lib/orgSlugStorage";

export function DashboardShell() {
  const { loading, organization, refresh } = useOrganization();
  const { session, signOut } = useAuth();
  const [joinError, setJoinError] = useState<string | null>(null);
  const joinAttempted = useRef(false);

  useEffect(() => {
    if (loading || organization || !session || joinAttempted.current) return;
    const slug = getStoredOrgSlug();
    if (!slug) return;
    joinAttempted.current = true;
    void completeOrganizationJoin(slug).then((result) => {
      if (result.ok) {
        setJoinError(null);
        void refresh();
      } else {
        joinAttempted.current = false;
        setJoinError(result.error);
      }
    });
  }, [loading, organization, session, refresh]);

  async function retryJoin() {
    const slug = getStoredOrgSlug();
    if (slug) {
      const result = await completeOrganizationJoin(slug);
      if (!result.ok) {
        setJoinError(result.error);
        return;
      }
      setJoinError(null);
    }
    await refresh();
  }

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
          Si acabás de confirmar el correo tras registrarte, la inmobiliaria se vincula al primer acceso.
        </p>
        {joinError ? <p className="max-w-md text-sm text-red-600">{joinError}</p> : null}
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={() => void retryJoin()}>
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
