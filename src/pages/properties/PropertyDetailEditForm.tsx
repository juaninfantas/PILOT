import type { FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs } from "../../components/ui/tabs";
import { PROPERTY_KIND_LABEL, PROPERTY_KINDS } from "../../lib/property-options";
import { LISTING_STATUS_KEYS, LISTING_STATUS_LABEL } from "../../lib/property-listing-status";
import { MANAGEMENT_OPTIONS, parseManagement } from "../../lib/property-management";
import type { Database } from "../../types/database";
import { PropertyContactsPanel } from "./PropertyContactsPanel";

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
    <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
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
                <Label htmlFor="city_zone">Ciudad / Zona *</Label>
                <Input id="city_zone" name="city_zone" defaultValue={property.city_zone} required />
              </div>
              <div className="md:col-span-12">
                <Label htmlFor="address">Dirección</Label>
                <Input id="address" name="address" defaultValue={property.address ?? ""} />
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
                <Label htmlFor="geocodeQuery">Buscar dirección (geocodificar)</Label>
                <Input id="geocodeQuery" name="geocodeQuery" placeholder="Dirección para buscar lat/lng" />
                <p className="mt-1 text-xs text-[var(--muted)]">Se usará sólo si lat/lng están vacíos al guardar.</p>
              </div>
              <div className="md:col-span-6">
                <Label htmlFor="lat">Latitud</Label>
                <Input id="lat" name="lat" type="number" step="any" defaultValue={property.lat ?? ""} />
              </div>
              <div className="md:col-span-6">
                <Label htmlFor="lng">Longitud</Label>
                <Input id="lng" name="lng" type="number" step="any" defaultValue={property.lng ?? ""} />
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
              <div className="md:col-span-4">
                <Label htmlFor="condition">Estado</Label>
                <Input id="condition" name="condition" defaultValue={property.condition ?? ""} />
              </div>
              <div className="md:col-span-12">
                <Label>Gestión</Label>
                <div className="mt-2 flex flex-wrap gap-4">
                  {MANAGEMENT_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="management"
                        value={opt.value}
                        defaultChecked={parseManagement(property.management).includes(opt.value)}
                        className="size-4 rounded border-[var(--border)]"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="md:col-span-4">
                <Label htmlFor="amenity_tags">Tags (coma)</Label>
                <Input id="amenity_tags" name="amenity_tags" defaultValue={property.amenity_tags ?? ""} />
              </div>
              <div className="flex items-center gap-2 md:col-span-12">
                <input
                  id="is_exclusive"
                  name="is_exclusive"
                  type="checkbox"
                  defaultChecked={property.is_exclusive}
                  className="size-4 rounded"
                />
                <Label htmlFor="is_exclusive" className="mb-0 cursor-pointer">
                  Exclusividad
                </Label>
              </div>
            </div>
          </div>

          {tabNavFooter}
        </form>
      )}
    </div>
  );
}
