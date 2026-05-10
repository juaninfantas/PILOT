import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs } from "../../components/ui/tabs";
import { PROPERTY_KIND_LABEL, PROPERTY_KINDS } from "../../lib/property-options";
import { LISTING_STATUS_KEYS, LISTING_STATUS_LABEL } from "../../lib/property-listing-status";
import type { ListingStatus, PropertyKind } from "../../types/database";
import { useCurrencyCatalog } from "../../contexts/CurrencyCatalogContext";
import { useActiveOrganization } from "../../contexts/OrganizationContext";
import { CurrencySelect } from "../../components/ui/currency-select";
import { normalizeCurrencyCode } from "../../lib/currencies";
import { serializeManagement, type ManagementCode } from "../../lib/property-management";
import { PropertyGestiónExclusiveFields } from "../../components/properties/PropertyGestiónExclusiveFields";
import { propertyConditionSelectOptions } from "../../lib/property-condition";
import { GeoCascadingSelect } from "../../components/geo/GeoCascadingSelect";
import { PropertyCommercialExteriorFields, parseOptionalFloorCountString } from "../../components/properties/PropertyCommercialExteriorFields";

const DEFAULT_GEO_COUNTRY = "AR";

const FORM_TABS = [
  { id: "general", label: "General" },
  { id: "ubicacion", label: "Ubicación" },
  { id: "comercial", label: "Comercial" },
];

export function PropertyNewPage() {
  const org = useActiveOrganization();
  const { codeSet } = useCurrencyCatalog();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState("general");
  const [managementCodes, setManagementCodes] = useState<ManagementCode[]>([]);
  const [isExclusive, setIsExclusive] = useState(false);
  const [hasQuincho, setHasQuincho] = useState(false);
  const [hasPool, setHasPool] = useState(false);
  const [floorCountInput, setFloorCountInput] = useState("");
  const [hasPatio, setHasPatio] = useState(false);
  const [hasTerrace, setHasTerrace] = useState(false);
  const [hasLaundry, setHasLaundry] = useState(false);
  const [hasBalcony, setHasBalcony] = useState(false);
  const [hasGarden, setHasGarden] = useState(false);
  const [hasServiceRoom, setHasServiceRoom] = useState(false);
  const [hasElevator, setHasElevator] = useState(false);
  const [geoCountryCode, setGeoCountryCode] = useState(DEFAULT_GEO_COUNTRY);

  useEffect(() => {
    void import("./PropertyDetailPage");
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const city_zone = String(fd.get("city_zone") ?? "").trim();
    if (!title || !city_zone) {
      setError("Título y localidad son obligatorios.");
      setTab("general");
      return;
    }
    const kind = String(fd.get("kind") ?? "OTHER") as PropertyKind;
    const listing_status = String(fd.get("listing_status") ?? "AVAILABLE") as ListingStatus;
    const address = String(fd.get("address") ?? "").trim() || null;
    const postal_code = String(fd.get("postal_code") ?? "").trim() || null;
    const geoRaw = String(fd.get("geo_unit_id") ?? "").trim();
    const geo_unit_id = geoRaw ? geoRaw : null;

    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;

    setPending(true);
    const { data: prop, error: pe } = await supabase
      .from("Property")
      .insert({
        organization_id: org.id,
        title,
        city_zone,
        address,
        postal_code,
        geo_unit_id,
        kind,
        covered_m2: fd.get("covered_m2") ? Number(fd.get("covered_m2")) : null,
        total_m2: fd.get("total_m2") ? Number(fd.get("total_m2")) : null,
        rooms: fd.get("rooms") ? parseInt(String(fd.get("rooms")), 10) : null,
        bathrooms: fd.get("bathrooms") ? parseInt(String(fd.get("bathrooms")), 10) : null,
        parking: fd.get("parking") ? parseInt(String(fd.get("parking")), 10) : null,
        condition: String(fd.get("condition") ?? "").trim() || null,
        description: String(fd.get("description") ?? "").trim() || null,
        is_exclusive: isExclusive,
        management: serializeManagement(managementCodes) || null,
        amenity_tags: String(fd.get("amenity_tags") ?? "").trim() || null,
        lat: null,
        lng: null,
        listing_status,
        has_quincho: hasQuincho,
        has_pool: hasPool,
        floor_count: parseOptionalFloorCountString(floorCountInput),
        has_patio: hasPatio,
        has_terrace: hasTerrace,
        has_laundry: hasLaundry,
        has_balcony: hasBalcony,
        has_garden: hasGarden,
        has_service_room: hasServiceRoom,
        has_elevator: hasElevator,
        created_by_id: uid,
      })
      .select("id")
      .single();

    if (pe || !prop) {
      setPending(false);
      setError(pe?.message ?? "No se pudo crear");
      return;
    }

    const priceAmount = fd.get("initialPriceAmount");
    if (priceAmount) {
      await supabase.from("PropertyPrice").insert({
        property_id: prop.id,
        amount: String(priceAmount),
        currency: normalizeCurrencyCode(String(fd.get("initialPriceCurrency") ?? "USD"), codeSet),
        kind: "LISTING_PUBLIC",
        created_by_id: uid,
      });
    }

    setPending(false);
    nav(`/dashboard/properties/${prop.id}`);
  }

  return (
    <RequirePermission slug="manage_properties">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Nueva propiedad</h1>
          <p className="text-sm text-[var(--muted)]">Título y localidad obligatorios.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <Tabs tabs={FORM_TABS} active={tab} onChange={setTab} />

          {/* ── Tab: General ─────────────────────────────────────── */}
          <div className={tab === "general" ? "block" : "hidden"}>
            <div className="grid gap-4 md:grid-cols-12">
              <div className="md:col-span-8">
                <Label htmlFor="title">Título *</Label>
                <Input id="title" name="title" required />
              </div>
              <div className="md:col-span-4">
                <Label htmlFor="kind">Tipo</Label>
                <select
                  id="kind"
                  name="kind"
                  className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
                  defaultValue="OTHER"
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
                  defaultValue="AVAILABLE"
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
                  defaultValue=""
                >
                  {propertyConditionSelectOptions(null).map((o) => (
                    <option key={o.value || "__empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <PropertyGestiónExclusiveFields
                management={managementCodes}
                onToggleManagement={(code) =>
                  setManagementCodes((prev) =>
                    prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
                  )
                }
                isExclusive={isExclusive}
                onExclusiveChange={setIsExclusive}
              />
              <div className="md:col-span-4">
                <Label htmlFor="amenity_tags">Tags (coma)</Label>
                <Input id="amenity_tags" name="amenity_tags" placeholder="patio, cochera, …" />
              </div>
              <div className="md:col-span-6">
                <Label htmlFor="description">Descripción</Label>
                <Textarea id="description" name="description" rows={3} />
              </div>
            </div>
          </div>

          {/* ── Tab: Ubicación ───────────────────────────────────── */}
          <div className={tab === "ubicacion" ? "block" : "hidden"}>
            <div className="grid gap-4 md:grid-cols-12">
              <div className="md:col-span-12">
                <GeoCascadingSelect
                  countryCode={geoCountryCode}
                  onCountryCodeChange={setGeoCountryCode}
                  value={null}
                  emitCityZone
                />
              </div>
              <div className="md:col-span-12">
                <p className="text-xs text-[var(--muted)]">
                  El cascada país → provincia → partido → localidad alimenta el maestro geo (mapas generales, compartidos). No se usa geocodificación en esta pantalla.
                </p>
              </div>
              <div className="md:col-span-8">
                <Label htmlFor="address">Dirección</Label>
                <Input id="address" name="address" />
              </div>
              <div className="md:col-span-4">
                <Label htmlFor="postal_code">Código postal</Label>
                <Input id="postal_code" name="postal_code" />
              </div>
            </div>
          </div>

          {/* ── Tab: Comercial ───────────────────────────────────── */}
          <div className={tab === "comercial" ? "block" : "hidden"}>
            <div className="grid gap-4 md:grid-cols-12">
              <div className="md:col-span-3">
                <Label htmlFor="total_m2">m² totales</Label>
                <Input id="total_m2" name="total_m2" type="number" step="any" />
              </div>
              <div className="md:col-span-3">
                <Label htmlFor="covered_m2">m² cubiertos</Label>
                <Input id="covered_m2" name="covered_m2" type="number" step="any" />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="rooms">Amb.</Label>
                <Input id="rooms" name="rooms" type="number" />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="bathrooms">Baños</Label>
                <Input id="bathrooms" name="bathrooms" type="number" />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="parking">Coch.</Label>
                <Input id="parking" name="parking" type="number" />
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
              />
              <div className="md:col-span-12">
                <p className="mb-3 text-sm font-medium text-[var(--muted)]">Precio inicial (opcional)</p>
                <div className="grid gap-3 md:grid-cols-12">
                  <div className="md:col-span-8">
                    <Label htmlFor="initialPriceAmount">Precio público</Label>
                    <Input id="initialPriceAmount" name="initialPriceAmount" type="number" step="any" />
                  </div>
                  <div className="md:col-span-4">
                    <Label htmlFor="initialPriceCurrency">Moneda</Label>
                    <CurrencySelect id="initialPriceCurrency" name="initialPriceCurrency" className="mt-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
            <div className="flex gap-2">
              {tab !== "general" && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setTab(FORM_TABS[FORM_TABS.findIndex((t) => t.id === tab) - 1].id)}>
                  ← Anterior
                </Button>
              )}
              {tab !== "comercial" && (
                <Button type="button" variant="secondary" size="sm" onClick={() => setTab(FORM_TABS[FORM_TABS.findIndex((t) => t.id === tab) + 1].id)}>
                  Siguiente →
                </Button>
              )}
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Crear propiedad"}
            </Button>
          </div>
        </form>
      </div>
    </RequirePermission>
  );
}
