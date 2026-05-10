import { type FormEvent, useEffect, useState } from "react";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs } from "../../components/ui/tabs";
import { PROPERTY_KIND_LABEL, PROPERTY_KINDS } from "../../lib/property-options";
import { LISTING_STATUS_KEYS, LISTING_STATUS_LABEL } from "../../lib/property-listing-status";
import { parseManagement, type ManagementCode } from "../../lib/property-management";
import { PropertyGestiónExclusiveFields } from "../../components/properties/PropertyGestiónExclusiveFields";
import { propertyConditionSelectOptions } from "../../lib/property-condition";
import type { Database } from "../../types/database";
import { PropertyContactsPanel } from "./PropertyContactsPanel";
import { GeoCascadingSelect } from "../../components/geo/GeoCascadingSelect";
import { Button } from "../../components/ui/button";
import { supabase } from "../../lib/supabase";
import { PropertyCommercialExteriorFields } from "../../components/properties/PropertyCommercialExteriorFields";

const DEFAULT_GEO_COUNTRY = "AR";

const EDIT_TABS = [
  { id: "general", label: "General" },
  { id: "ubicacion", label: "Ubicación" },
  { id: "comercial", label: "Comercial" },
  { id: "contacto", label: "Contacto" },
];

type Property = Database["public"]["Tables"]["Property"]["Row"];

export type PropertyDetailEditFormProps = {
  property: Property;
  editFormKey: number;
  editTab: string;
  setEditTab: (id: string) => void;
  dirty: boolean;
  setDirty: (v: boolean) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  mainSaving: boolean;
};

export function PropertyDetailEditForm({
  property,
  editFormKey,
  editTab,
  setEditTab,
  dirty,
  setDirty,
  onSubmit,
  mainSaving,
}: PropertyDetailEditFormProps) {
  const idx = EDIT_TABS.findIndex((t) => t.id === editTab);

  const [management, setManagement] = useState<ManagementCode[]>(() => parseManagement(property.management));
  const [isExclusive, setIsExclusive] = useState(property.is_exclusive);
  const [hasQuincho, setHasQuincho] = useState(property.has_quincho);
  const [hasPool, setHasPool] = useState(property.has_pool);
  const [floorCountInput, setFloorCountInput] = useState(property.floor_count != null ? String(property.floor_count) : "");
  const [hasPatio, setHasPatio] = useState(property.has_patio);
  const [hasTerrace, setHasTerrace] = useState(property.has_terrace);
  const [hasLaundry, setHasLaundry] = useState(property.has_laundry);
  const [hasBalcony, setHasBalcony] = useState(property.has_balcony);
  const [hasGarden, setHasGarden] = useState(property.has_garden);
  const [hasServiceRoom, setHasServiceRoom] = useState(property.has_service_room);
  const [hasElevator, setHasElevator] = useState(property.has_elevator);
  const [geoCountryCode, setGeoCountryCode] = useState(DEFAULT_GEO_COUNTRY);
  /** `country_code` del `geo_unit_id` persistido (null si no hay o no existe). */
  const [savedGeoUnitCountry, setSavedGeoUnitCountry] = useState<string | null>(null);

  useEffect(() => {
    setManagement(parseManagement(property.management));
    setIsExclusive(property.is_exclusive);
    setHasQuincho(property.has_quincho);
    setHasPool(property.has_pool);
    setFloorCountInput(property.floor_count != null ? String(property.floor_count) : "");
    setHasPatio(property.has_patio);
    setHasTerrace(property.has_terrace);
    setHasLaundry(property.has_laundry);
    setHasBalcony(property.has_balcony);
    setHasGarden(property.has_garden);
    setHasServiceRoom(property.has_service_room);
    setHasElevator(property.has_elevator);
  }, [
    property.id,
    editFormKey,
    property.management,
    property.is_exclusive,
    property.has_quincho,
    property.has_pool,
    property.floor_count,
    property.has_patio,
    property.has_terrace,
    property.has_laundry,
    property.has_balcony,
    property.has_garden,
    property.has_service_room,
    property.has_elevator,
  ]);

  useEffect(() => {
    let cancelled = false;
    const gid = property.geo_unit_id;
    if (!gid) {
      setSavedGeoUnitCountry(null);
      setGeoCountryCode(DEFAULT_GEO_COUNTRY);
      return;
    }
    void supabase
      .from("GeoUnit")
      .select("country_code")
      .eq("id", gid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.country_code) {
          setSavedGeoUnitCountry(null);
          setGeoCountryCode(DEFAULT_GEO_COUNTRY);
          return;
        }
        const c = String(data.country_code).trim().toUpperCase();
        setSavedGeoUnitCountry(c);
        setGeoCountryCode(c);
      });
    return () => {
      cancelled = true;
    };
  }, [property.id, property.geo_unit_id, editFormKey]);

  const geoCascadeValue =
    property.geo_unit_id && savedGeoUnitCountry && geoCountryCode === savedGeoUnitCountry
      ? property.geo_unit_id
      : null;

  const tabNavFooter = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
      <div className="flex gap-2">
        {idx > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditTab(EDIT_TABS[idx - 1].id)}>
            ← Anterior
          </Button>
        ) : null}
        {idx < EDIT_TABS.length - 1 ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditTab(EDIT_TABS[idx + 1].id)}>
            Siguiente →
          </Button>
        ) : null}
      </div>
      {editTab !== "contacto" ? (
        <Button form="property-main-edit-form" type="submit" disabled={mainSaving}>
          {mainSaving ? "Guardando…" : "Guardar cambios"}
        </Button>
      ) : (
        <span className="text-xs text-[var(--muted)]">Los contactos se guardan al usar Guardar en el modal.</span>
      )}
    </div>
  );

  return (
    <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Información</h2>
        {dirty && editTab !== "contacto" ? (
          <span className="text-xs text-amber-400">Cambios sin guardar</span>
        ) : null}
      </div>

      <Tabs tabs={EDIT_TABS} active={editTab} onChange={setEditTab} />

      {editTab === "contacto" ? (
        <>
          <PropertyContactsPanel propertyId={property.id} />
          {tabNavFooter}
        </>
      ) : (
        <form
          id="property-main-edit-form"
          key={`property-edit-${property.id}-${editFormKey}`}
          onSubmit={onSubmit}
          onChange={() => {
            if (!dirty) setDirty(true);
          }}
          className="space-y-5"
        >
          <div className={editTab === "general" ? "block" : "hidden"}>
            <div className="grid gap-4 md:grid-cols-12">
              <div className="md:col-span-8">
                <Label htmlFor="title">Título *</Label>
                <Input id="title" name="title" defaultValue={property.title} required />
              </div>
              <div className="md:col-span-4">
                <Label htmlFor="kind">Tipo</Label>
                <select
                  id="kind"
                  name="kind"
                  className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
                  defaultValue={property.kind}
                >
                  {PROPERTY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {PROPERTY_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-6">
                <Label htmlFor="listing_status">Estado comercial</Label>
                <select
                  id="listing_status"
                  name="listing_status"
                  className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
                  defaultValue={property.listing_status ?? "AVAILABLE"}
                >
                  {LISTING_STATUS_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {LISTING_STATUS_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-6">
                <Label htmlFor="condition">Estado del inmueble</Label>
                <select
                  id="condition"
                  name="condition"
                  className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
                  defaultValue={property.condition ?? ""}
                >
                  {propertyConditionSelectOptions(property.condition).map((o) => (
                    <option key={o.value || "__empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <PropertyGestiónExclusiveFields
                management={management}
                onToggleManagement={(code) => {
                  setManagement((prev) =>
                    prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
                  );
                  if (!dirty) setDirty(true);
                }}
                isExclusive={isExclusive}
                onExclusiveChange={(value) => {
                  setIsExclusive(value);
                  if (!dirty) setDirty(true);
                }}
                syncFormHiddenFields
              />
              <div className="md:col-span-4">
                <Label htmlFor="amenity_tags">Tags (coma)</Label>
                <Input id="amenity_tags" name="amenity_tags" defaultValue={property.amenity_tags ?? ""} />
              </div>
              <div className="md:col-span-12">
                <Label htmlFor="description">Descripción</Label>
                <Textarea id="description" name="description" rows={3} defaultValue={property.description ?? ""} />
              </div>
            </div>
          </div>

          <div className={editTab === "ubicacion" ? "block" : "hidden"}>
            <div className="grid gap-4 md:grid-cols-12">
              <div className="md:col-span-12">
                <GeoCascadingSelect
                  countryCode={geoCountryCode}
                  onCountryCodeChange={(next) => {
                    setGeoCountryCode(next);
                    if (!dirty) setDirty(true);
                  }}
                  value={geoCascadeValue}
                  emitCityZone
                  cityZoneFallback={property.city_zone}
                />
              </div>
              <div className="md:col-span-12">
                <p className="text-xs text-[var(--muted)]">
                  Las coordenadas y vistas de mapa no se cargan desde la ficha de propiedad: el maestro geográfico sirve para listados, filtros y compartidos.
                </p>
              </div>
              <div className="md:col-span-8">
                <Label htmlFor="address">Dirección</Label>
                <Input id="address" name="address" defaultValue={property.address ?? ""} />
              </div>
              <div className="md:col-span-4">
                <Label htmlFor="postal_code">Código postal</Label>
                <Input id="postal_code" name="postal_code" defaultValue={property.postal_code ?? ""} />
              </div>
            </div>
          </div>

          <div className={editTab === "comercial" ? "block" : "hidden"}>
            <div className="grid gap-4 md:grid-cols-12">
              <div className="md:col-span-3">
                <Label htmlFor="total_m2">m² totales</Label>
                <Input id="total_m2" name="total_m2" type="number" step="any" defaultValue={property.total_m2 ?? ""} />
              </div>
              <div className="md:col-span-3">
                <Label htmlFor="covered_m2">m² cubiertos</Label>
                <Input id="covered_m2" name="covered_m2" type="number" step="any" defaultValue={property.covered_m2 ?? ""} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="rooms">Amb.</Label>
                <Input id="rooms" name="rooms" type="number" defaultValue={property.rooms ?? ""} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="bathrooms">Baños</Label>
                <Input id="bathrooms" name="bathrooms" type="number" defaultValue={property.bathrooms ?? ""} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="parking">Coch.</Label>
                <Input id="parking" name="parking" type="number" defaultValue={property.parking ?? ""} />
              </div>
              <PropertyCommercialExteriorFields
                hasQuincho={hasQuincho}
                onHasQuinchoChange={setHasQuincho}
                hasPool={hasPool}
                onHasPoolChange={setHasPool}
                floorCountInput={floorCountInput}
                onFloorCountInputChange={setFloorCountInput}
                hasPatio={hasPatio}
                onHasPatioChange={setHasPatio}
                hasTerrace={hasTerrace}
                onHasTerraceChange={setHasTerrace}
                hasLaundry={hasLaundry}
                onHasLaundryChange={setHasLaundry}
                hasBalcony={hasBalcony}
                onHasBalconyChange={setHasBalcony}
                hasGarden={hasGarden}
                onHasGardenChange={setHasGarden}
                hasServiceRoom={hasServiceRoom}
                onHasServiceRoomChange={setHasServiceRoom}
                hasElevator={hasElevator}
                onHasElevatorChange={setHasElevator}
                syncFormHiddenBools
                syncFormHiddenFloor
                onAnyInteraction={() => {
                  if (!dirty) setDirty(true);
                }}
              />
            </div>
          </div>

          {tabNavFooter}
        </form>
      )}
    </div>
  );
}
