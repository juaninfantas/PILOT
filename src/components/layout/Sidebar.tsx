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
  /** Equipo Pilot: acceso a Administración (sección Maestros > Inmobiliarias) aunque no tenga manage_users. */
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
  const canFunnels = hasPermission(permissions, "view_funnels");
  const canOpp = hasPermission(permissions, "view_opportunities");
  const canCalendar = hasPermission(permissions, "view_calendar");
  const canProperties = hasPermission(permissions, "view_properties");
  const canPeople = hasPermission(permissions, "view_people");
  const canNotes = hasPermission(permissions, "view_notes");

  const showReportsBlock = canReports || canFunnels || canOpp || canCalendar;
  const showCrmBlock = canProperties || canPeople || canOpp;

  const settingsTo = canAdmin ? "/dashboard/admin?tab=configuracion" : "/dashboard/settings";

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
          <span className="font-pilot-logo text-[3rem] leading-none text-[var(--foreground)] md:text-[4.5rem]">
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

        {canFunnels ? (
          <NavLink to="/dashboard/reports/funnels" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Funnels
          </NavLink>
        ) : null}

        {canOpp ? (
          <NavLink
            to="/dashboard/reports/pipeline"
            className={({ isActive }) => cn(navLinkClass(isActive), canFunnels || canReports ? "jif-nav-item-sub" : undefined)}
            onClick={closeIfMobile}
          >
            Pipeline
          </NavLink>
        ) : null}
        {canOpp ? (
          <NavLink
            to="/dashboard/reports/final-states"
            className={({ isActive }) => cn(navLinkClass(isActive), canFunnels || canReports ? "jif-nav-item-sub" : undefined)}
            onClick={closeIfMobile}
          >
            Estados finales
          </NavLink>
        ) : null}
        {canOpp ? (
          <NavLink to="/dashboard/reports/scoring" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Scoring
          </NavLink>
        ) : null}
        {canCalendar && mdUp ? (
          <NavLink to="/dashboard/reports/calendar" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Calendario
          </NavLink>
        ) : null}

        {showReportsBlock && showCrmBlock ? (
          <div className="my-3 border-t border-[var(--jif-line)]" role="presentation" aria-hidden />
        ) : null}

        {canProperties && mdUp ? (
          <NavLink to="/dashboard/properties" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Propiedades
          </NavLink>
        ) : null}
        {canPeople ? (
          <NavLink to="/dashboard/people" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Personas
          </NavLink>
        ) : null}
        {canOpp ? (
          <NavLink to="/dashboard/opportunities" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Oportunidades
          </NavLink>
        ) : null}
        {canProperties ? (
          <NavLink to="/dashboard/map" className={({ isActive }) => navLinkClass(isActive)} onClick={closeIfMobile}>
            Mapa
          </NavLink>
        ) : null}
        {canNotes && mdUp ? (
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
