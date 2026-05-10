import { useEffect, useMemo, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { StaffTenantSwitcher } from "./StaffTenantSwitcher";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "../../contexts/AuthContext";
import { useOrganization } from "../../contexts/OrganizationContext";
import { hasPermission } from "../../lib/permissions";
import { Button } from "../ui/button";

export function DashboardLayout() {
  const { permissions } = useAuth();
  const { pilotStaff } = useOrganization();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const perms = permissions ?? [];
  const showMobileDock = useMemo(
    () =>
      hasPermission(perms, "view_dashboard") ||
      hasPermission(perms, "view_reports") ||
      hasPermission(perms, "view_properties"),
    [perms],
  );

  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 768) setMobileNavOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="flex min-h-dvh bg-[var(--background)]">
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/45 md:hidden"
          aria-label="Cerrar menú"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <Sidebar
        permissions={permissions ?? []}
        platformStaff={pilotStaff.platformStaff}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-0 md:pl-72">
        <header className="fixed left-0 right-0 top-0 z-30 flex min-h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 border-b border-[var(--jif-line)] bg-[var(--background)] px-3 pt-[env(safe-area-inset-top)] md:hidden">
          <Link
            to="/dashboard"
            className="shrink-0 font-pilot-logo text-xl leading-none text-[var(--foreground)] outline-offset-2 hover:opacity-90"
            aria-label="Pilot inicio"
          >
            Pilot.
          </Link>
          <span className="min-w-0 flex-1" aria-hidden />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 px-2"
            aria-label="Abrir menú"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="size-6 text-[var(--foreground)]" strokeWidth={1.75} />
          </Button>
          <StaffTenantSwitcher compact />
        </header>
        <div className="hidden shrink-0 items-center justify-end gap-2 border-b border-[var(--jif-line)] px-10 py-2.5 md:flex">
          <StaffTenantSwitcher />
        </div>
        <main
          className={
            showMobileDock
              ? "min-h-0 flex-1 overflow-auto px-4 py-5 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-10 md:py-6 md:pb-6"
              : "min-h-0 flex-1 overflow-auto px-4 py-5 md:px-10 md:py-6"
          }
        >
          <Outlet />
        </main>
        {showMobileDock ? <MobileBottomNav permissions={perms} /> : null}
      </div>
    </div>
  );
}
