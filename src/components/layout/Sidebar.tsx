import { NavLink, Link } from "react-router-dom";
import { LogOut, Settings } from "lucide-react";
import { hasAny, hasPermission } from "../../lib/permissions";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { useMdUp } from "../../hooks/useMediaQuery";

function navLinkClass(active: boolean) {
  return cn("jif-nav-item", active && "jif-nav-item-active");
}

const ADMIN_PERMS = ["manage_users", "manage_groups", "manage_roles"] as const;

type SidebarProps = {
  permissions: string[];
  /** Equipo Pilot: acceso a Administración (pestaña Tenants) aunque el tenant no tenga manage_users. */
  platformStaff?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

export function Sidebar({ permissions, platformStaff = false, mobileOpen = false, onCloseMobile }: SidebarProps) {
  const { signOut } = useAuth();
  const mdUp = useMdUp();
  const canAdmin =
    hasAny(permissions, [...ADMIN_PERMS]) || platformStaff || hasPermission(permissions, "manage_properties");
  const canDash = hasPermission(permissions, "view_dashboard");
  const canReports = hasPermission(permissions, "view_reports");
  const canOpp = hasPermission(permissions, "view_opportunities");

  const settingsTo = canAdmin ? "/dashboard/admin?tab=configuracion" : "/dashboard/settings";

  const showCrmNav =
    hasPermission(permissions, "view_properties") ||
    hasPermission(permissions, "view_people") ||
    hasPermission(permissions, "view_opportunities") ||
    hasPermission(permissions, "view_dashboard");

  const closeIfMobile = () => {
    if (!mdUp) onCloseMobile?.();
  };

  const asideClass = cn(
    "fixed left-0 top-0 z-50 flex h-dvh w-56 flex-col border-r border-[var(--jif-line)] bg-[var(--background)] py-5 pl-4 pr-3 transition-transform duration-200 ease-out md:w-72",
    "md:translate-x-0",
    mobileOpen ? "translate-x-0 shadow-2xl" : "max-md:-translate-x-full",
  );

  return (
    <aside className={asideClass}>
      <div className="shrink-0">
        <Link to="/dashboard" className="block outline-offset-2 hover:opacity-90" onClick={closeIfMobile}>
          <span className="font-pilot-logo block text-[2.85rem] leading-[0.88] text-[var(--foreground)] md:text-[5.25rem]">
            Pilot.
          </span>
        </Link>
      </div>

      <nav className="mt-8 min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain">
        {canDash ? (
          <NavLink to="/dashboard" end className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Control Tower
          </NavLink>
        ) : null}

        {canReports ? (
          <NavLink to="/dashboard/reports/overview" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Overview
          </NavLink>
        ) : null}
        {canReports ? (
          <NavLink
            to="/dashboard/reports/price-geo"
            className={({ isActive }) => cn(navLinkClass(isActive), "jif-nav-item-sub")}
            onClick={closeIfMobile}
          >
            Precios (geo)
          </NavLink>
        ) : null}

        {canOpp ? (
          <NavLink to="/dashboard/reports/funnels" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Funnels
          </NavLink>
        ) : null}

        {canReports ? (
          <>
            {canOpp ? (
              <>
                <NavLink
                  to="/dashboard/reports/pipeline"
                  className={({ isActive }) => cn(navLinkClass(isActive), "jif-nav-item-sub")}
                  onClick={closeIfMobile}
                >
                  Pipeline
                </NavLink>
                <NavLink
                  to="/dashboard/reports/final-states"
                  className={({ isActive }) => cn(navLinkClass(isActive), "jif-nav-item-sub")}
                  onClick={closeIfMobile}
                >
                  Estados finales
                </NavLink>
              </>
            ) : (
              <>
                <NavLink to="/dashboard/reports/pipeline" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
                  Pipeline
                </NavLink>
                <NavLink to="/dashboard/reports/final-states" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
                  Estados finales
                </NavLink>
              </>
            )}
            <NavLink to="/dashboard/reports/scoring" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
              Scoring
            </NavLink>
            {mdUp ? (
              <NavLink to="/dashboard/reports/calendar" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
                Calendario
              </NavLink>
            ) : null}
          </>
        ) : null}

        {canReports && showCrmNav ? (
          <div className="my-3 border-t border-[var(--jif-line)]" role="presentation" aria-hidden />
        ) : null}

        {hasPermission(permissions, "view_properties") && mdUp ? (
          <NavLink to="/dashboard/properties" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Propiedades
          </NavLink>
        ) : null}
        {hasPermission(permissions, "view_people") ? (
          <NavLink to="/dashboard/people" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Personas
          </NavLink>
        ) : null}
        {hasPermission(permissions, "view_opportunities") ? (
          <NavLink to="/dashboard/opportunities" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Oportunidades
          </NavLink>
        ) : null}
        {hasPermission(permissions, "view_properties") ? (
          <NavLink to="/dashboard/map" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Mapa
          </NavLink>
        ) : null}
        {hasPermission(permissions, "view_dashboard") && mdUp ? (
          <NavLink to="/dashboard/notes" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Notas
          </NavLink>
        ) : null}
      </nav>

      <div className="mt-auto shrink-0 border-t border-[var(--jif-line)] pt-3">
        <div className="flex items-center justify-center gap-8 px-0.5 pb-1 pt-1">
          {canDash || canAdmin ? (
            <Link
              to={settingsTo}
              className="flex shrink-0 text-[var(--muted)] transition-colors hover:text-[var(--jif-gold)]"
              title="Configuración"
              aria-label="Configuración"
              onClick={closeIfMobile}
            >
              <Settings className="size-6" strokeWidth={1.5} />
            </Link>
          ) : null}
          <button
            type="button"
            className="flex shrink-0 cursor-pointer text-[var(--muted)] transition-colors hover:text-[var(--jif-gold)]"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            onClick={() => void signOut()}
          >
            <LogOut className="size-6" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </aside>
  );
}
