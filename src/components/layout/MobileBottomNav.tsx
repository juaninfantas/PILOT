import { NavLink } from "react-router-dom";
import { Building2, CalendarDays, StickyNote } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { cn } from "../../lib/utils";

/** Altura reservada para barras fijas que deben quedar por encima del dock (p. ej. acciones en detalle de propiedad). */
export const MOBILE_DOCK_OFFSET = "calc(5rem + env(safe-area-inset-bottom, 0px))";

type MobileBottomNavProps = {
  permissions: string[];
};

export function MobileBottomNav({ permissions }: MobileBottomNavProps) {
  const showNotes = hasPermission(permissions, "view_dashboard");
  const showCalendar = hasPermission(permissions, "view_reports");
  const showProperties = hasPermission(permissions, "view_properties");

  if (!showNotes && !showCalendar && !showProperties) return null;

  const linkBase =
    "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.08em] transition-colors";

  const iconWrap = (isActive: boolean) =>
    cn(
      "flex size-11 items-center justify-center rounded-2xl border-2 transition-colors",
      isActive ? "border-white/30 bg-white/15 text-white" : "border-[var(--jif-line)] bg-[var(--card)] text-[var(--foreground)]",
    );

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--jif-line)] bg-[var(--background)]/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
      aria-label="Accesos rápidos"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1 px-1 pt-2">
        {showNotes ? (
          <NavLink
            to="/dashboard/notes"
            className={({ isActive }) =>
              cn(
                linkBase,
                isActive
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--secondary)]/50 hover:text-[var(--foreground)]",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={iconWrap(isActive)}>
                  <StickyNote className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="max-w-full truncate">Notas</span>
              </>
            )}
          </NavLink>
        ) : null}

        {showCalendar ? (
          <NavLink
            to="/dashboard/reports/calendar"
            className={({ isActive }) =>
              cn(
                linkBase,
                isActive
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--secondary)]/50 hover:text-[var(--foreground)]",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={iconWrap(isActive)}>
                  <CalendarDays className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="max-w-full truncate">Calendario</span>
              </>
            )}
          </NavLink>
        ) : null}

        {showProperties ? (
          <NavLink
            to="/dashboard/properties"
            className={({ isActive }) =>
              cn(
                linkBase,
                isActive
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--secondary)]/50 hover:text-[var(--foreground)]",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={iconWrap(isActive)}>
                  <Building2 className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="max-w-full truncate">Propiedades</span>
              </>
            )}
          </NavLink>
        ) : null}
      </div>
    </nav>
  );
}
