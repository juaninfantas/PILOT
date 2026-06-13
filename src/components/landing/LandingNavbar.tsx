import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Globe, Menu, X } from "lucide-react";
import { PilotLogo } from "../brand/PilotLogo";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

const linkBase =
  "flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)]/60";

const dropPanel =
  "absolute left-0 top-full z-30 min-w-[13.5rem] pt-1.5 opacity-0 invisible transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100";

function Dropdown({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="group relative">
      <button type="button" className={cn(linkBase, "cursor-default select-none")} aria-haspopup="menu">
        {label}
        <ChevronDown className="size-4 opacity-60" strokeWidth={2} aria-hidden />
      </button>
      <div className={dropPanel}>
        <div
          className="jif-panel border border-[var(--jif-line)] bg-[var(--card)] py-2 shadow-[var(--neo-shadow-sm)]"
          role="menu"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function DropLink({ to, onNavigate, children }: { to: string; onNavigate?: () => void; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="block px-4 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--secondary)]/40"
      role="menuitem"
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}

function RouterNav({ to, onNavigate, children }: { to: string; onNavigate?: () => void; children: ReactNode }) {
  return (
    <Link to={to} className={linkBase} onClick={onNavigate}>
      {children}
    </Link>
  );
}

export function LandingNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--jif-line)] bg-[var(--card)]">
      <div className="mx-auto flex min-h-[4.25rem] max-w-7xl items-center justify-between gap-4 px-4 py-2 md:gap-6 md:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-6 lg:gap-10">
          <Link
            to="/"
            className="shrink-0 outline-offset-2 hover:opacity-90"
            onClick={close}
            aria-label="Pilot inicio"
          >
            <PilotLogo className="h-10 w-10 md:h-12 md:w-12" />
          </Link>

          <nav className="hidden lg:flex lg:flex-1 lg:items-center lg:gap-1" aria-label="Principal">
            <Dropdown label="Funcionalidades">
              <DropLink to="/funcionalidades">Stock, mapa y fichas</DropLink>
              <DropLink to="/funcionalidades/ventas-pipeline">Ventas y pipeline</DropLink>
              <DropLink to="/funcionalidades/reportes-y-control">Reportes y control</DropLink>
            </Dropdown>

            <RouterNav to="/integraciones">Integraciones</RouterNav>

            <Dropdown label="Planes">
              <DropLink to="/planes">Ver planes</DropLink>
              <DropLink to="/contacto">Hablar con ventas</DropLink>
            </Dropdown>

            <Dropdown label="Recursos">
              <Link to="/sign-up" className="block px-4 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--secondary)]/40" role="menuitem">
                Acceso por invitación
              </Link>
              <DropLink to="/contacto">Contacto</DropLink>
            </Dropdown>

            <RouterNav to="/contacto">Alianzas</RouterNav>

            <RouterNav to="/nosotros">Nosotros</RouterNav>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            className="hidden rounded-md p-2 text-[var(--muted)] hover:bg-[var(--secondary)]/50 hover:text-[var(--foreground)] md:inline-flex"
            title="Sitio en español"
            aria-label="Sitio en español"
          >
            <Globe className="size-5" strokeWidth={1.5} />
          </button>
          <Link
            to="/contacto"
            className="hidden px-2 text-sm font-medium text-[var(--foreground)] underline-offset-4 hover:underline sm:inline"
          >
            Contacto
          </Link>
          <Link to="/login" className="hidden sm:inline-flex">
            <Button type="button" variant="primary" size="md" className="rounded-lg px-5">
              Mi inmobiliaria
            </Button>
          </Link>

          <Link to="/login" className="inline-flex sm:hidden">
            <Button type="button" variant="primary" size="sm" className="rounded-lg">
              Entrar
            </Button>
          </Link>

          <button
            type="button"
            className="rounded-md p-2 text-[var(--foreground)] lg:hidden"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-[var(--jif-line)] bg-[var(--card)] px-4 py-4 lg:hidden">
          <nav className="flex flex-col gap-1 text-sm font-medium" aria-label="Menú móvil">
            <Link to="/contacto" className="rounded-md px-3 py-2 font-semibold hover:bg-[var(--secondary)]/50" onClick={close}>
              Contacto
            </Link>
            <span className="jif-caps jif-dim px-3 pt-2 text-[0.6rem]">Funcionalidades</span>
            <Link to="/funcionalidades" className="rounded-md px-3 py-2 hover:bg-[var(--secondary)]/50" onClick={close}>
              Resumen funcionalidades
            </Link>
            <Link to="/funcionalidades/ventas-pipeline" className="rounded-md px-3 py-2 hover:bg-[var(--secondary)]/50" onClick={close}>
              Ventas y pipeline
            </Link>
            <Link to="/funcionalidades/reportes-y-control" className="rounded-md px-3 py-2 hover:bg-[var(--secondary)]/50" onClick={close}>
              Reportes y control
            </Link>
            <Link to="/integraciones" className="rounded-md px-3 py-2 hover:bg-[var(--secondary)]/50" onClick={close}>
              Integraciones
            </Link>
            <span className="jif-caps jif-dim px-3 pt-3 text-[0.6rem]">Planes</span>
            <Link to="/planes" className="rounded-md px-3 py-2 hover:bg-[var(--secondary)]/50" onClick={close}>
              Ver planes
            </Link>
            <Link to="/sign-up" className="rounded-md px-3 py-2 hover:bg-[var(--secondary)]/50" onClick={close}>
              Registro con invitación
            </Link>
            <Link to="/contacto" className="rounded-md px-3 py-2 hover:bg-[var(--secondary)]/50" onClick={close}>
              Alianzas
            </Link>
            <Link to="/nosotros" className="rounded-md px-3 py-2 hover:bg-[var(--secondary)]/50" onClick={close}>
              Nosotros
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
