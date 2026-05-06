import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { ListingStatus } from "../../types/database";
import { LISTING_STATUS_LABEL } from "../../lib/property-listing-status";
import { PROPERTY_KIND_LABEL } from "../../lib/property-options";
import { anyCommercialSpecVisible, parseShareVisibility } from "../../lib/property-share-visibility";

type Payload = {
  error?: string;
  property?: {
    id: string;
    title: string;
    city_zone: string;
    address: string | null;
    kind: keyof typeof PROPERTY_KIND_LABEL;
    covered_m2: number | null;
    total_m2: number | null;
    rooms: number | null;
    bathrooms: number | null;
    parking: number | null;
    condition: string | null;
    listing_status: ListingStatus;
    description: string | null;
    amenity_tags: string | null;
    is_exclusive: boolean;
    /** Ruta «Etiqueta: valor › …» cuando el formato lo permite. */
    geo_path?: string | null;
    lat?: number | null;
    lng?: number | null;
    /** Enlace externo a mapa (p. ej. Google) si el formato lo incluye y hay coordenadas. */
    show_map_link?: boolean;
  };
  organization?: {
    display_name: string;
    logo_url: string | null;
    fiscal_address?: string | null;
    contact_phone?: string | null;
    broker_matricula?: string | null;
  };
  public_price?: { amount: string; currency: string } | null;
  photos?: string[];
  share_visibility?: unknown;
};

export function PublicPropertySharePage() {
  const [params] = useSearchParams();
  const token = params.get("t")?.trim() ?? "";
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token) {
        setData({ error: "invalid_token" });
        setBusy(false);
        return;
      }
      setBusy(true);
      const { data: raw, error } = await supabase.rpc("fetch_property_via_share_token", { p_token_text: token });
      if (cancelled) return;
      if (error) {
        setData({ error: error.message });
        setBusy(false);
        return;
      }
      const row = raw as Record<string, unknown>;
      if (row.error) {
        setData({ error: String(row.error) });
        setBusy(false);
        return;
      }
      setData(row as Payload);
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const photos = useMemo(() => {
    const p = data?.photos;
    if (Array.isArray(p)) return p.filter((x): x is string => typeof x === "string");
    return [];
  }, [data]);

  const v = useMemo(() => parseShareVisibility(data?.share_visibility), [data?.share_visibility]);

  if (busy) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4">
        <p className="jif-caps text-[var(--muted)]">Cargando ficha…</p>
      </div>
    );
  }

  if (!data?.property || data.error) {
    const msg =
      data?.error === "expired_or_invalid"
        ? "El enlace no es válido o expiró."
        : data?.error === "invalid_token"
          ? "Falta el token en el enlace."
          : "No se pudo mostrar esta ficha.";
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--background)] px-4 text-center">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Ficha no disponible</h1>
        <p className="max-w-md text-sm text-[var(--muted)]">{msg}</p>
      </div>
    );
  }

  const pr = data.property;
  const org = data.organization;
  const pp = data.public_price ?? null;
  const kindLabel = PROPERTY_KIND_LABEL[pr.kind] ?? pr.kind;

  const locLine = [v.show_city_zone ? pr.city_zone : "", v.show_street_address && pr.address ? pr.address : ""]
    .filter(Boolean)
    .join(" · ");

  const mapHref =
    pr.lat != null && pr.lng != null
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${pr.lat},${pr.lng}`)}`
      : null;

  const anySpec = anyCommercialSpecVisible(v);

  return (
    <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--jif-line)] bg-[var(--card)] px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
          {v.show_org_logo && org?.logo_url ? (
            <img src={org.logo_url} alt="" className="h-14 w-auto max-w-[200px] shrink-0 object-contain" />
          ) : null}
          <div className="min-w-0 space-y-1">
            <p className="jif-caps text-[0.65rem] tracking-[0.2em] text-[var(--muted)]">Propiedad compartida</p>
            {v.show_org_name ? (
              <h1 className="text-2xl font-semibold">{org?.display_name?.trim() || "Inmobiliaria"}</h1>
            ) : null}
            {v.show_org_fiscal_address && org?.fiscal_address?.trim() ? (
              <p className="text-sm text-[var(--muted)]">{org.fiscal_address.trim()}</p>
            ) : null}
            {v.show_org_contact && org?.contact_phone?.trim() ? (
              <p className="text-sm text-[var(--muted)]">Tel.: {org.contact_phone.trim()}</p>
            ) : null}
            {v.show_org_contact && org?.broker_matricula?.trim() ? (
              <p className="text-sm text-[var(--muted)]">Matrícula: {org.broker_matricula.trim()}</p>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-8">
        <div>
          {v.show_property_title ? (
            <h2 className="text-2xl font-semibold leading-tight">{pr.title}</h2>
          ) : null}
          {locLine ? <p className="mt-2 text-[var(--muted)]">{locLine}</p> : null}
          {v.show_geo_path && pr.geo_path?.trim() ? (
            <p className="mt-2 text-sm text-[var(--muted)]">{pr.geo_path.trim()}</p>
          ) : null}
          {v.show_coordinates && pr.lat != null && pr.lng != null ? (
            <p className="mt-2 font-mono text-sm tabular-nums text-[var(--muted)]">
              {Number(pr.lat).toFixed(5)}, {Number(pr.lng).toFixed(5)}
            </p>
          ) : null}
          {pr.show_map_link && mapHref ? (
            <p className="mt-2">
              <a
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-[var(--jif-gold)] underline-offset-4 hover:underline"
              >
                Ver en mapa
                <ExternalLink className="size-3.5 shrink-0 opacity-80" aria-hidden />
              </a>
            </p>
          ) : null}
        </div>

        {v.show_price && pp && !anySpec ? (
          <p className="font-mono text-2xl tabular-nums text-[var(--jif-gold)]">
            {pp.currency} {Number(pp.amount).toLocaleString("es-AR")}
          </p>
        ) : null}

        {anySpec ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            {v.show_spec_kind ? (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Tipo</dt>
                <dd className="mt-1">{kindLabel}</dd>
              </div>
            ) : null}
            {v.show_price ? (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Precio público</dt>
                <dd className="mt-1 font-mono tabular-nums text-lg text-[var(--jif-gold)]">
                  {pp ? `${pp.currency} ${Number(pp.amount).toLocaleString("es-AR")}` : "—"}
                </dd>
              </div>
            ) : null}
            {v.show_spec_listing_status ? (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Estado comercial</dt>
                <dd className="mt-1">{LISTING_STATUS_LABEL[pr.listing_status] ?? pr.listing_status}</dd>
              </div>
            ) : null}
            {v.show_spec_exclusive ? (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Exclusiva</dt>
                <dd className="mt-1">{pr.is_exclusive ? "Sí" : "No"}</dd>
              </div>
            ) : null}
            {v.show_spec_covered_m2 && pr.covered_m2 != null ? (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Superficie cubierta</dt>
                <dd className="mt-1">{pr.covered_m2} m²</dd>
              </div>
            ) : null}
            {v.show_spec_total_m2 && pr.total_m2 != null ? (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Superficie total</dt>
                <dd className="mt-1">{pr.total_m2} m²</dd>
              </div>
            ) : null}
            {v.show_spec_rooms && pr.rooms != null ? (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Ambientes</dt>
                <dd className="mt-1">{pr.rooms}</dd>
              </div>
            ) : null}
            {v.show_spec_bathrooms && pr.bathrooms != null ? (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Baños</dt>
                <dd className="mt-1">{pr.bathrooms}</dd>
              </div>
            ) : null}
            {v.show_spec_parking && pr.parking != null ? (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Estacionamiento</dt>
                <dd className="mt-1">{pr.parking}</dd>
              </div>
            ) : null}
            {v.show_spec_condition && pr.condition ? (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Estado / condición</dt>
                <dd className="mt-1">{pr.condition}</dd>
              </div>
            ) : null}
            {v.show_spec_amenities && pr.amenity_tags ? (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Características</dt>
                <dd className="mt-1 whitespace-pre-wrap">{pr.amenity_tags}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {v.show_description && pr.description?.trim() ? (
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Descripción</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{pr.description.trim()}</p>
          </section>
        ) : null}

        {v.show_photos && photos.length ? (
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Fotos</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {photos.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-[var(--border)]">
                  <img src={url} alt="" className="h-56 w-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
