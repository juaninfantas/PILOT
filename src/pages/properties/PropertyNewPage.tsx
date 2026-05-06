import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { geocodeAddress } from "../../lib/geocode";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs } from "../../components/ui/tabs";
import { PROPERTY_KIND_LABEL, PROPERTY_KINDS } from "../../lib/property-options";
import { LISTING_STATUS_KEYS, LISTING_STATUS_LABEL } from "../../lib/property-listing-status";
import type { ListingStatus, PropertyKind } from "../../types/database";
import { useActiveOrganization } from "../../contexts/OrganizationContext";
import { CurrencySelect } from "../../components/ui/currency-select";
import { normalizeCurrencyCode } from "../../lib/currencies";
import { MANAGEMENT_OPTIONS, managementCodesFromForm, serializeManagement } from "../../lib/property-management";
import { GeoCascadingSelect } from "../../components/geo/GeoCascadingSelect";
import type { MapPin } from "../../components/map/PropertyMap";

const PropertyMap = lazy(() => import("../../components/map/PropertyMap").then((m) => ({ default: m.PropertyMap })));

const DEFAULT_GEO_COUNTRY = "AR";

const FORM_TABS = [
  { id: "general", label: "General" },
  { id: "ubicacion", label: "Ubicación" },
  { id: "comercial", label: "Comercial" },
];

export function PropertyNewPage() {
  const org = useActiveOrganization();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState("general");
  const [showMap, setShowMap] = useState(false);
  const [mapPreview, setMapPreview] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    void import("./PropertyDetailPage");
  }, []);

  const mapPin: MapPin | null = useMemo(() => {
    if (!mapPreview) return null;
    return {
      id: "new",
      title: "Nueva propiedad",
      city_zone: "",
      lat: mapPreview.lat,
      lng: mapPreview.lng,
      priceLabel: "—",
      kindLabel: "—",
    };
  }, [mapPreview]);

  function readLatLngFromInputs(): { lat: number; lng: number } | null {
    const la = (document.getElementById("lat") as HTMLInputElement | null)?.value;
    const ln = (document.getElementById("lng") as HTMLInputElement | null)?.value;
    const lat = la ? Number(la) : NaN;
    const lng = ln ? Number(ln) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  async function geolocateFromFields() {
    const address = (document.getElementById("address") as HTMLInputElement | null)?.value?.trim() ?? "";
    const postal = (document.getElementById("postal_code") as HTMLInputElement | null)?.value?.trim() ?? "";
    const city = (document.getElementById("city_zone_hidden") as HTMLInputElement | null)?.value?.trim() ?? "";
    const geoUnit = (document.getElementById("geo_unit_id_hidden") as HTMLInputElement | null)?.value?.trim() ?? "";
    let geoLine = "";
    if (geoUnit) {
      const { data } = await supabase.rpc("geo_unit_path_line", { p_unit_id: geoUnit });
      geoLine = typeof data === "string" ? data.trim() : "";
    }
    const q = [address, postal, city, geoLine].filter(Boolean).join(", ");
    if (!q) return;
    const g = await geocodeAddress(q);
    if (!g) return;
    const la = document.getElementById("lat") as HTMLInputElement | null;
    const ln = document.getElementById("lng") as HTMLInputElement | null;
    if (la) la.value = String(g.lat);
    if (ln) ln.value = String(g.lng);
    setMapPreview({ lat: g.lat, lng: g.lng });
    setShowMap(true);
  }

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
    let lat = fd.get("lat") ? Number(fd.get("lat")) : null;
    let lng = fd.get("lng") ? Number(fd.get("lng")) : null;
    const geo_unit_id = geoRaw ? geoRaw : null;
    if (lat == null || Number.isNaN(lat) || lng == null || Number.isNaN(lng)) {
      let geoLine: string | null = null;
      if (geo_unit_id) {
        const { data } = await supabase.rpc("geo_unit_path_line", { p_unit_id: geo_unit_id });
        geoLine = typeof data === "string" ? data : null;
      }
      const q = [address, postal_code, city_zone, geoLine].filter((x) => (x ?? "").trim()).join(", ");
      if (q.trim()) {
        const g = await geocodeAddress(q);
        if (g) {
          lat = g.lat;
          lng = g.lng;
        }
      }
    }
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
        is_exclusive: fd.get("is_exclusive") === "on",
        management: serializeManagement(managementCodesFromForm(fd.getAll("management"))) || null,
        amenity_tags: String(fd.get("amenity_tags") ?? "").trim() || null,
        lat,
        lng,
        listing_status,
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
        currency: normalizeCurrencyCode(String(fd.get("initialPriceCurrency") ?? "USD")),
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
                <Label htmlFor="description">Descripción</Label>
                <Textarea id="description" name="description" rows={3} />
              </div>
            </div>
          </div>

          {/* ── Tab: Ubicación ───────────────────────────────────── */}
          <div className={tab === "ubicacion" ? "block" : "hidden"}>
            <div className="grid gap-4 md:grid-cols-12">
              <div className="md:col-span-12">
                <GeoCascadingSelect countryCode={DEFAULT_GEO_COUNTRY} value={null} emitCityZone />
              </div>
              <div className="md:col-span-8">
                <Label htmlFor="address">Dirección</Label>
                <Input id="address" name="address" />
              </div>
              <div className="md:col-span-4">
                <Label htmlFor="postal_code">Código postal</Label>
                <Input id="postal_code" name="postal_code" />
              </div>
              <div className="md:col-span-6">
                <Label htmlFor="lat">Latitud</Label>
                <Input id="lat" name="lat" type="number" step="any" placeholder="-34.603722" />
              </div>
              <div className="md:col-span-6">
                <Label htmlFor="lng">Longitud</Label>
                <Input id="lng" name="lng" type="number" step="any" placeholder="-58.381592" />
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-12">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void geolocateFromFields()}
                >
                  Geolocalizar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (showMap) {
                      setShowMap(false);
                      return;
                    }
                    const p = readLatLngFromInputs();
                    if (p) {
                      setMapPreview(p);
                      setShowMap(true);
                    }
                  }}
                >
                  {showMap ? "Ocultar mapa" : "Ver en mapa"}
                </Button>
              </div>
              {showMap && mapPin ? (
                <div className="md:col-span-12">
                  <Suspense fallback={<p className="text-xs text-[var(--muted)]">Cargando mapa…</p>}>
                    <PropertyMap pins={[mapPin]} className="h-[min(40vh,320px)]" />
                  </Suspense>
                </div>
              ) : null}
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
              <div className="md:col-span-4">
                <Label htmlFor="condition">Estado</Label>
                <Input id="condition" name="condition" placeholder="A estrenar, usado…" />
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
                        className="size-4 rounded border-[var(--border)]"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="md:col-span-4">
                <Label htmlFor="amenity_tags">Tags (coma)</Label>
                <Input id="amenity_tags" name="amenity_tags" placeholder="patio, cochera, …" />
              </div>
              <div className="flex items-center gap-2 md:col-span-12">
                <input id="is_exclusive" name="is_exclusive" type="checkbox" className="size-4 rounded border-[var(--border)]" />
                <Label htmlFor="is_exclusive" className="mb-0 cursor-pointer">
                  Exclusividad
                </Label>
              </div>
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
