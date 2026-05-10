import type { PublicPropertyPdfInput } from "./property-public-pdf";
import { LISTING_STATUS_LABEL } from "./property-listing-status";
import { PROPERTY_KIND_LABEL } from "./property-options";

/** Alineado con public."PropertyShareFormat" y share_visibility del RPC público. */
export type PropertyShareVisibility = {
  show_org_logo: boolean;
  show_org_name: boolean;
  show_org_fiscal_address: boolean;
  show_org_contact: boolean;
  show_property_title: boolean;
  show_city_zone: boolean;
  show_street_address: boolean;
  show_price: boolean;
  show_spec_kind: boolean;
  show_spec_listing_status: boolean;
  show_spec_exclusive: boolean;
  show_spec_covered_m2: boolean;
  show_spec_total_m2: boolean;
  show_spec_rooms: boolean;
  show_spec_bathrooms: boolean;
  show_spec_parking: boolean;
  show_spec_condition: boolean;
  /** Texto libre (comodidades / tags por coma). */
  show_spec_amenities: boolean;
  show_spec_quincho: boolean;
  show_spec_pool: boolean;
  show_spec_floor_count: boolean;
  show_spec_patio: boolean;
  show_spec_terrace: boolean;
  show_spec_laundry: boolean;
  show_spec_balcony: boolean;
  show_spec_garden: boolean;
  show_spec_service_room: boolean;
  show_spec_elevator: boolean;
  show_description: boolean;
  show_photos: boolean;
  /** Cadena «Etiqueta: valor › …» desde GeoLevelDef + GeoUnit */
  show_geo_path: boolean;
  show_coordinates: boolean;
  show_external_map_link: boolean;
};

export const FULL_SHARE_VISIBILITY: PropertyShareVisibility = {
  show_org_logo: true,
  show_org_name: true,
  show_org_fiscal_address: true,
  show_org_contact: true,
  show_property_title: true,
  show_city_zone: true,
  show_street_address: true,
  show_price: true,
  show_spec_kind: true,
  show_spec_listing_status: true,
  show_spec_exclusive: true,
  show_spec_covered_m2: true,
  show_spec_total_m2: true,
  show_spec_rooms: true,
  show_spec_bathrooms: true,
  show_spec_parking: true,
  show_spec_condition: true,
  show_spec_amenities: true,
  show_spec_quincho: true,
  show_spec_pool: true,
  show_spec_floor_count: true,
  show_spec_patio: true,
  show_spec_terrace: true,
  show_spec_laundry: true,
  show_spec_balcony: true,
  show_spec_garden: true,
  show_spec_service_room: true,
  show_spec_elevator: true,
  show_description: true,
  show_photos: true,
  show_geo_path: true,
  show_coordinates: false,
  show_external_map_link: false,
};

const SPEC_FLAG_KEYS: (keyof PropertyShareVisibility)[] = [
  "show_spec_kind",
  "show_spec_listing_status",
  "show_spec_exclusive",
  "show_spec_covered_m2",
  "show_spec_total_m2",
  "show_spec_rooms",
  "show_spec_bathrooms",
  "show_spec_parking",
  "show_spec_condition",
  "show_spec_amenities",
  "show_spec_quincho",
  "show_spec_pool",
  "show_spec_floor_count",
  "show_spec_patio",
  "show_spec_terrace",
  "show_spec_laundry",
  "show_spec_balcony",
  "show_spec_garden",
  "show_spec_service_room",
  "show_spec_elevator",
];

/** True si algún campo de la ficha técnica (excluye precio) está visible. */
export function anyCommercialSpecVisible(v: PropertyShareVisibility): boolean {
  return SPEC_FLAG_KEYS.some((k) => v[k]);
}

export type PropertyShareFormatRow = {
  id: string;
  organization_id: string;
  name: string;
  is_default_share: boolean;
  show_org_logo: boolean;
  show_org_name: boolean;
  show_org_fiscal_address: boolean;
  show_org_contact: boolean;
  show_property_title: boolean;
  show_city_zone: boolean;
  show_street_address: boolean;
  show_price: boolean;
  show_spec_kind: boolean;
  show_spec_listing_status: boolean;
  show_spec_exclusive: boolean;
  show_spec_covered_m2: boolean;
  show_spec_total_m2: boolean;
  show_spec_rooms: boolean;
  show_spec_bathrooms: boolean;
  show_spec_parking: boolean;
  show_spec_condition: boolean;
  show_spec_amenities: boolean;
  show_spec_quincho: boolean;
  show_spec_pool: boolean;
  show_spec_floor_count: boolean;
  show_spec_patio: boolean;
  show_spec_terrace: boolean;
  show_spec_laundry: boolean;
  show_spec_balcony: boolean;
  show_spec_garden: boolean;
  show_spec_service_room: boolean;
  show_spec_elevator: boolean;
  show_description: boolean;
  show_photos: boolean;
  show_geo_path: boolean;
  show_coordinates: boolean;
  show_external_map_link: boolean;
};

/** Orden: marcado en BD → nombre «Completa» → primero alfabético (es). */
export function pickDefaultShareFormatId(formats: Pick<PropertyShareFormatRow, "id" | "name" | "is_default_share">[]): string | null {
  if (!formats.length) return null;
  const marked = formats.find((f) => f.is_default_share);
  if (marked) return marked.id;
  const completa = formats.find((f) => f.name.trim().toLowerCase() === "completa");
  if (completa) return completa.id;
  const sorted = [...formats].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  return sorted[0]?.id ?? null;
}

export function visibilityFromFormatRow(row: PropertyShareFormatRow): PropertyShareVisibility {
  return {
    show_org_logo: row.show_org_logo,
    show_org_name: row.show_org_name,
    show_org_fiscal_address: row.show_org_fiscal_address,
    show_org_contact: row.show_org_contact,
    show_property_title: row.show_property_title,
    show_city_zone: row.show_city_zone,
    show_street_address: row.show_street_address,
    show_price: row.show_price,
    show_spec_kind: row.show_spec_kind,
    show_spec_listing_status: row.show_spec_listing_status,
    show_spec_exclusive: row.show_spec_exclusive,
    show_spec_covered_m2: row.show_spec_covered_m2,
    show_spec_total_m2: row.show_spec_total_m2,
    show_spec_rooms: row.show_spec_rooms,
    show_spec_bathrooms: row.show_spec_bathrooms,
    show_spec_parking: row.show_spec_parking,
    show_spec_condition: row.show_spec_condition,
    show_spec_amenities: row.show_spec_amenities,
    show_spec_quincho: row.show_spec_quincho,
    show_spec_pool: row.show_spec_pool,
    show_spec_floor_count: row.show_spec_floor_count,
    show_spec_patio: row.show_spec_patio,
    show_spec_terrace: row.show_spec_terrace,
    show_spec_laundry: row.show_spec_laundry,
    show_spec_balcony: row.show_spec_balcony,
    show_spec_garden: row.show_spec_garden,
    show_spec_service_room: row.show_spec_service_room,
    show_spec_elevator: row.show_spec_elevator,
    show_description: row.show_description,
    show_photos: row.show_photos,
    show_geo_path: row.show_geo_path,
    show_coordinates: row.show_coordinates,
    show_external_map_link: row.show_external_map_link,
  };
}

function triBool(o: Record<string, unknown>, key: string, fallback: boolean): boolean {
  if (o[key] === false) return false;
  if (o[key] === true) return true;
  return fallback;
}

/** Parsea share_visibility del JSON público (faltantes = true por compatibilidad). */
export function parseShareVisibility(raw: unknown): PropertyShareVisibility {
  if (!raw || typeof raw !== "object") return { ...FULL_SHARE_VISIBILITY };
  const o = raw as Record<string, unknown>;
  const b = (k: keyof PropertyShareVisibility) => (o[k] === false ? false : true);
  const legacySpecs = o.show_specs === false ? false : true;
  const amenityStructFallback = triBool(o, "show_spec_amenities", legacySpecs);

  return {
    show_org_logo: b("show_org_logo"),
    show_org_name: b("show_org_name"),
    show_org_fiscal_address: b("show_org_fiscal_address"),
    show_org_contact: b("show_org_contact"),
    show_property_title: b("show_property_title"),
    show_city_zone: b("show_city_zone"),
    show_street_address: b("show_street_address"),
    show_price: b("show_price"),
    show_spec_kind: triBool(o, "show_spec_kind", legacySpecs),
    show_spec_listing_status: triBool(o, "show_spec_listing_status", legacySpecs),
    show_spec_exclusive: triBool(o, "show_spec_exclusive", legacySpecs),
    show_spec_covered_m2: triBool(o, "show_spec_covered_m2", legacySpecs),
    show_spec_total_m2: triBool(o, "show_spec_total_m2", legacySpecs),
    show_spec_rooms: triBool(o, "show_spec_rooms", legacySpecs),
    show_spec_bathrooms: triBool(o, "show_spec_bathrooms", legacySpecs),
    show_spec_parking: triBool(o, "show_spec_parking", legacySpecs),
    show_spec_condition: triBool(o, "show_spec_condition", legacySpecs),
    show_spec_amenities: triBool(o, "show_spec_amenities", legacySpecs),
    show_spec_quincho: triBool(o, "show_spec_quincho", amenityStructFallback),
    show_spec_pool: triBool(o, "show_spec_pool", amenityStructFallback),
    show_spec_floor_count: triBool(o, "show_spec_floor_count", amenityStructFallback),
    show_spec_patio: triBool(o, "show_spec_patio", amenityStructFallback),
    show_spec_terrace: triBool(o, "show_spec_terrace", amenityStructFallback),
    show_spec_laundry: triBool(o, "show_spec_laundry", amenityStructFallback),
    show_spec_balcony: triBool(o, "show_spec_balcony", amenityStructFallback),
    show_spec_garden: triBool(o, "show_spec_garden", amenityStructFallback),
    show_spec_service_room: triBool(o, "show_spec_service_room", amenityStructFallback),
    show_spec_elevator: triBool(o, "show_spec_elevator", amenityStructFallback),
    show_description: b("show_description"),
    show_photos: b("show_photos"),
    show_geo_path: triBool(o, "show_geo_path", true),
    show_coordinates: triBool(o, "show_coordinates", false),
    show_external_map_link: triBool(o, "show_external_map_link", false),
  };
}

export function filterPdfInputForShare(input: PublicPropertyPdfInput, v: PropertyShareVisibility): PublicPropertyPdfInput {
  const org = {
    ...input.organization,
    logo_url: v.show_org_logo ? input.organization.logo_url : null,
    display_name: v.show_org_name ? input.organization.display_name : "",
    fiscal_address: v.show_org_fiscal_address ? input.organization.fiscal_address : null,
    contact_phone: v.show_org_contact ? input.organization.contact_phone : null,
    broker_matricula: v.show_org_contact ? input.organization.broker_matricula : null,
  };
  const pr = input.property;
  const property = {
    ...pr,
    title: v.show_property_title ? pr.title : "",
    city_zone: v.show_city_zone ? pr.city_zone : "",
    address: v.show_street_address ? pr.address : null,
    description: v.show_description ? pr.description : null,
    geo_unit_id: v.show_geo_path ? pr.geo_unit_id ?? null : null,
    geo_path_labeled: v.show_geo_path ? pr.geo_path_labeled ?? null : null,
    lat: v.show_coordinates ? pr.lat ?? null : null,
    lng: v.show_coordinates ? pr.lng ?? null : null,
  };
  return {
    organization: org,
    property,
    public_price: v.show_price ? input.public_price : null,
    photo_urls: v.show_photos ? input.photo_urls : [],
  };
}

export function buildSharePlainText(input: PublicPropertyPdfInput, v: PropertyShareVisibility): string {
  const lines: string[] = [];
  const org = input.organization;
  const pr = input.property;

  if (v.show_org_name && org.display_name?.trim()) lines.push(org.display_name.trim());
  if (v.show_org_fiscal_address && org.fiscal_address?.trim()) lines.push(org.fiscal_address.trim());
  if (v.show_org_contact) {
    if (org.contact_phone?.trim()) lines.push(`Tel.: ${org.contact_phone.trim()}`);
    if (org.broker_matricula?.trim()) lines.push(`Matrícula: ${org.broker_matricula.trim()}`);
  }
  if (lines.length) lines.push("");

  if (v.show_property_title && pr.title?.trim()) lines.push(pr.title.trim());

  const locParts: string[] = [];
  if (v.show_city_zone && pr.city_zone?.trim()) locParts.push(pr.city_zone.trim());
  if (v.show_street_address && pr.address?.trim()) locParts.push(pr.address.trim());
  if (locParts.length) lines.push(locParts.join(" · "));

  if (v.show_geo_path && pr.geo_path_labeled?.trim()) {
    lines.push(pr.geo_path_labeled.trim());
  }
  if (v.show_coordinates && pr.lat != null && pr.lng != null) {
    lines.push(`Coord.: ${Number(pr.lat).toFixed(5)}, ${Number(pr.lng).toFixed(5)}`);
  }
  if (v.show_external_map_link && pr.lat != null && pr.lng != null) {
    lines.push(`Mapa: https://www.google.com/maps?q=${encodeURIComponent(`${pr.lat},${pr.lng}`)}`);
  }

  if (v.show_price && input.public_price) {
    const pp = input.public_price;
    lines.push(`Precio: ${pp.currency} ${Number(pp.amount).toLocaleString("es-AR")}`);
  }

  if (v.show_spec_kind) {
    const kindLabel = PROPERTY_KIND_LABEL[pr.kind] ?? pr.kind;
    lines.push(`Tipo: ${kindLabel}`);
  }
  if (v.show_spec_listing_status) {
    lines.push(`Estado: ${LISTING_STATUS_LABEL[pr.listing_status] ?? pr.listing_status}`);
  }
  if (v.show_spec_exclusive) {
    lines.push(`Exclusiva: ${pr.is_exclusive ? "Sí" : "No"}`);
  }
  if (v.show_spec_covered_m2 && pr.covered_m2 != null) lines.push(`Sup. cubierta: ${pr.covered_m2} m²`);
  if (v.show_spec_total_m2 && pr.total_m2 != null) lines.push(`Sup. total: ${pr.total_m2} m²`);
  if (v.show_spec_rooms && pr.rooms != null) lines.push(`Ambientes: ${pr.rooms}`);
  if (v.show_spec_bathrooms && pr.bathrooms != null) lines.push(`Baños: ${pr.bathrooms}`);
  if (v.show_spec_parking && pr.parking != null) lines.push(`Estacionamiento: ${pr.parking}`);
  if (v.show_spec_condition && pr.condition?.trim()) lines.push(`Condición: ${pr.condition.trim()}`);
  const yn = (b: boolean | undefined) => (b ? "Sí" : "No");
  if (v.show_spec_quincho) lines.push(`Quincho: ${yn(pr.has_quincho)}`);
  if (v.show_spec_pool) lines.push(`Pileta: ${yn(pr.has_pool)}`);
  if (v.show_spec_floor_count) {
    lines.push(`Plantas: ${pr.floor_count != null ? String(pr.floor_count) : "—"}`);
  }
  if (v.show_spec_patio) lines.push(`Patio: ${yn(pr.has_patio)}`);
  if (v.show_spec_terrace) lines.push(`Terraza: ${yn(pr.has_terrace)}`);
  if (v.show_spec_laundry) lines.push(`Lavadero independiente: ${yn(pr.has_laundry)}`);
  if (v.show_spec_balcony) lines.push(`Balcón: ${yn(pr.has_balcony)}`);
  if (v.show_spec_garden) lines.push(`Jardín / parque: ${yn(pr.has_garden)}`);
  if (v.show_spec_service_room) lines.push(`Dependencia: ${yn(pr.has_service_room)}`);
  if (v.show_spec_elevator) lines.push(`Ascensor: ${yn(pr.has_elevator)}`);
  if (v.show_spec_amenities && pr.amenity_tags?.trim()) lines.push(`Etiquetas: ${pr.amenity_tags.trim()}`);

  if (v.show_description && pr.description?.trim()) {
    lines.push("");
    lines.push(pr.description.trim());
  }

  if (v.show_photos && input.photo_urls?.length) {
    lines.push("");
    lines.push("Fotos (enlaces):");
    for (const u of input.photo_urls) {
      if (typeof u === "string" && u.startsWith("http")) lines.push(u);
    }
  }

  return lines.join("\n").trim();
}
