import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { StaffTenantSwitcher } from "./StaffTenantSwitcher";
import { useAuth } from "../../contexts/AuthContext";
import { useOrganization } from "../../contexts/OrganizationContext";
import { Button } from "../ui/button";

export function DashboardLayout() {
  const { permissions } = useAuth();
  const { pilotStaff } = useOrganization();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col pt-14 md:pt-0 md:pl-72">
        <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--jif-line)] bg-[var(--background)] px-4 md:hidden">
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
          <span className="min-w-0 flex-1 truncate font-pilot-logo text-xl leading-none text-[var(--foreground)]">
            Pilot.
          </span>
          <StaffTenantSwitcher compact />
        </header>
        <div className="hidden shrink-0 items-center justify-end gap-2 border-b border-[var(--jif-line)] px-10 py-2.5 md:flex">
          <StaffTenantSwitcher />
        </div>
        <main className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-10 md:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
