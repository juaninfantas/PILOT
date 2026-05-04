import { lazy, Suspense } from "react";
import { RequirePermission } from "../components/RequirePermission";
import { useMapPins } from "../hooks/useMapPins";

const PropertyMap = lazy(() =>
  import("../components/map/PropertyMap").then((m) => ({ default: m.PropertyMap })),
);

export function MapPage() {
  const { pins, loading } = useMapPins();

  return (
    <RequirePermission slug="view_properties">
      <div className="jif-page space-y-8">
        <header className="border-b border-[var(--jif-line)] pb-6">
          <div>
            <h1 className="jif-hero">Mapa</h1>
            <p className="jif-caps jif-dim mt-1">
              OpenStreetMap y Leaflet sin API keys; pines con precio público de listado y acceso a la ficha de cada propiedad.
            </p>
          </div>
        </header>
        {loading ? (
          <p className="jif-caps jif-dim">Cargando mapa…</p>
        ) : pins.length === 0 ? (
          <p className="border border-dashed border-[var(--jif-line)] bg-[var(--card)] px-4 py-8 text-center font-medium text-[var(--muted)]">
            No hay propiedades con coordenadas. Geocodificá en la ficha.
          </p>
        ) : (
          <Suspense fallback={<p className="jif-caps jif-dim">Cargando mapa…</p>}>
            <PropertyMap pins={pins} />
          </Suspense>
        )}
      </div>
    </RequirePermission>
  );
}
