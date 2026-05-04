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
  show_spec_amenities: boolean;
  show_description: boolean;
  show_photos: boolean;
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
  show_description: true,
  show_photos: true,
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
  show_description: boolean;
  show_photos: boolean;
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
    show_description: row.show_description,
    show_photos: row.show_photos,
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
    show_description: b("show_description"),
    show_photos: b("show_photos"),
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
  if (v.show_spec_amenities && pr.amenity_tags?.trim()) lines.push(`Características: ${pr.amenity_tags.trim()}`);

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
