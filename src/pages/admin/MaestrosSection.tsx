import { CurrencyCatalogSection } from "./CurrencyCatalogSection";
import { GeoAreasAdminSection } from "./GeoAreasAdminSection";
import { AdminTenantsSection } from "./AdminTenantsSection";

export type MaestrosSectionProps = {
  showMonedas: boolean;
  showGeo: boolean;
  /** Pilot staff: alta y gestión de inmobiliarias (organizaciones). */
  showInmobiliariasPilot: boolean;
};

export function MaestrosSection({ showMonedas, showGeo, showInmobiliariasPilot }: MaestrosSectionProps) {
  return (
    <div className="space-y-10">
      <header className="border-b border-[var(--jif-line)] pb-6">
        <h2 className="text-xl font-semibold tracking-tight">Maestros</h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Datos base compartidos o de plataforma: monedas, jerarquía geográfica e inmobiliarias (Pilot). Gestionarlos desde un solo lugar mantiene
          criterio único entre formularios, CRM y reportes.
        </p>
      </header>

      {showMonedas ? (
        <section id="maestros-monedas" className="scroll-mt-6 space-y-4 rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6">
          <CurrencyCatalogSection embedded />
        </section>
      ) : null}

      {showGeo ? (
        <section id="maestros-areas-geo" className="scroll-mt-6 space-y-4 rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6">
          <GeoAreasAdminSection embedded />
        </section>
      ) : null}

      {showInmobiliariasPilot ? (
        <section id="maestros-inmobiliarias" className="scroll-mt-6 space-y-4 rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6">
          <AdminTenantsSection embedded />
        </section>
      ) : null}

      {!showMonedas && !showGeo && !showInmobiliariasPilot ? (
        <p className="text-sm text-[var(--muted)]">No tenés permisos para ver maestros en esta cuenta.</p>
      ) : null}
    </div>
  );
}
