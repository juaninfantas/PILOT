import type { ListingStatus, PropertyKind } from "../types/database";
import { LISTING_STATUS_KEYS, LISTING_STATUS_LABEL } from "./property-listing-status";
import { PROPERTY_KIND_LABEL, PROPERTY_KINDS } from "./property-options";

const NUMERIC_CRITERION_LABEL: Record<"rooms" | "bathrooms" | "parking", string> = {
  rooms: "Ambientes",
  bathrooms: "Baños",
  parking: "Cocheras",
};

const M2_CRITERION_LABEL: Record<"covered_m2" | "total_m2", string> = {
  covered_m2: "Superficie cubierta (m²)",
  total_m2: "Superficie total (m²)",
};

/** Atributos de Property comparables en scoring (UX: nombre + valor). */
export const BUYER_CRITERION_FIELDS = [
  { key: "city_zone", label: "Ciudad / zona", input: "text", hint: "La zona de la propiedad debe contener este texto" },
  { key: "kind", label: "Tipo de propiedad", input: "kind" },
  { key: "listing_status", label: "Estado de publicación", input: "listing_status" },
  { key: "rooms", label: "Ambientes (mínimo)", input: "number", hint: "Cantidad mínima de ambientes" },
  { key: "bathrooms", label: "Baños (mínimo)", input: "number", hint: "Cantidad mínima" },
  { key: "parking", label: "Cocheras (mínimo)", input: "number", hint: "Cantidad mínima" },
  { key: "covered_m2", label: "m² cubiertos (mínimo)", input: "number", hint: "Superficie mínima" },
  { key: "total_m2", label: "m² totales (mínimo)", input: "number", hint: "Superficie mínima" },
  { key: "condition", label: "Condición / estado", input: "text", hint: "Texto contenido en el campo condición" },
  { key: "amenity_tags", label: "Tag en amenities", input: "text", hint: "Ej. pileta (como en tags de la propiedad)" },
  { key: "title", label: "Texto en título", input: "text", hint: "Fragmento del título" },
  { key: "description", label: "Texto en descripción", input: "text", hint: "Fragmento de la descripción" },
] as const;

export type BuyerCriterionFieldKey = (typeof BUYER_CRITERION_FIELDS)[number]["key"];

export function isBuyerCriterionFieldKey(s: string): s is BuyerCriterionFieldKey {
  return BUYER_CRITERION_FIELDS.some((f) => f.key === s);
}

export type BuyerCriteriaRow = {
  field: BuyerCriterionFieldKey;
  value: string;
};

function norm(s: string) {
  return s.trim().toLowerCase();
}

function ratioMeet(actual: number | null | undefined, min: number): number {
  if (actual == null || !Number.isFinite(actual)) return 0;
  if (actual >= min) return 1;
  return Math.max(0, actual / min);
}

export type BuyerPropertySnapshot = {
  city_zone: string;
  kind: PropertyKind;
  listing_status: ListingStatus;
  covered_m2: number | null;
  total_m2: number | null;
  rooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  condition: string | null;
  title: string | null;
  description: string | null;
  amenity_tags: string | null;
};

/** Una fila → puntaje parcial en [0,1] y texto para el explain. */
export function scoreBuyerCriterionRow(
  row: BuyerCriteriaRow,
  prop: BuyerPropertySnapshot,
  propTagsNorm: string[],
): { pts: number; label: string } | null {
  const val = row.value.trim();
  if (!val || !isBuyerCriterionFieldKey(row.field)) return null;

  switch (row.field) {
    case "city_zone": {
      const ok = norm(prop.city_zone).includes(norm(val));
      return { pts: ok ? 1 : 0, label: `Zona contiene «${val}»` };
    }
    case "kind": {
      const ok = prop.kind === (val as PropertyKind) && (PROPERTY_KINDS as readonly string[]).includes(val);
      const buscado =
        (PROPERTY_KINDS as readonly string[]).includes(val) ? PROPERTY_KIND_LABEL[val as PropertyKind] : val;
      const actualLabel = PROPERTY_KIND_LABEL[prop.kind];
      return {
        pts: ok ? 1 : 0,
        label: ok
          ? `Tipo: ${actualLabel} (coincide)`
          : `Tipo: la propiedad es ${actualLabel}; se buscaba ${buscado}`,
      };
    }
    case "listing_status": {
      const ok =
        (LISTING_STATUS_KEYS as readonly string[]).includes(val) && prop.listing_status === (val as ListingStatus);
      const buscado =
        (LISTING_STATUS_KEYS as readonly string[]).includes(val as ListingStatus)
          ? LISTING_STATUS_LABEL[val as ListingStatus]
          : val;
      const actualLabel = LISTING_STATUS_LABEL[prop.listing_status];
      return {
        pts: ok ? 1 : 0,
        label: ok
          ? `Estado de publicación: ${actualLabel} (coincide)`
          : `Estado de publicación: ${actualLabel}; se buscaba ${buscado}`,
      };
    }
    case "rooms":
    case "bathrooms":
    case "parking": {
      const min = parseInt(val, 10);
      if (!Number.isFinite(min) || min < 0) return null;
      const actual =
        row.field === "rooms" ? prop.rooms : row.field === "bathrooms" ? prop.bathrooms : prop.parking;
      const r = ratioMeet(actual, min);
      const ln = NUMERIC_CRITERION_LABEL[row.field];
      return {
        pts: r,
        label: `${ln}: ${actual ?? "—"} frente a mínimo ${min}`,
      };
    }
    case "covered_m2":
    case "total_m2": {
      const min = parseFloat(val.replace(",", "."));
      if (!Number.isFinite(min) || min <= 0) return null;
      const actual = row.field === "covered_m2" ? prop.covered_m2 : prop.total_m2;
      const r = ratioMeet(actual, min);
      const ln = M2_CRITERION_LABEL[row.field];
      return {
        pts: r,
        label: `${ln}: ${actual ?? "—"} frente a mínimo ${min}`,
      };
    }
    case "condition": {
      const c = prop.condition ? norm(prop.condition) : "";
      const ok = c.includes(norm(val));
      return { pts: ok ? 1 : 0, label: `Condición contiene «${val}»` };
    }
    case "amenity_tags": {
      const needle = norm(val);
      const ok = propTagsNorm.some((t) => t === needle || t.includes(needle));
      return { pts: ok ? 1 : 0, label: `Amenity «${val}»` };
    }
    case "title": {
      const t = prop.title ? norm(prop.title) : "";
      const ok = t.includes(norm(val));
      return { pts: ok ? 1 : 0, label: `Título contiene «${val}»` };
    }
    case "description": {
      const d = prop.description ? norm(prop.description) : "";
      const ok = d.includes(norm(val));
      return { pts: ok ? 1 : 0, label: `Descripción contiene «${val}»` };
    }
    default:
      return null;
  }
}
