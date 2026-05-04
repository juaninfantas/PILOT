import type { PropertyKind } from "../types/database";

export const PROPERTY_KIND_LABEL: Record<PropertyKind, string> = {
  APARTMENT: "Departamento",
  HOUSE: "Casa",
  QUINTA: "Quinta",
  LOT: "Lote",
  GARAGE: "Cochera",
  COMMERCIAL: "Local comercial",
  LAND: "Terreno",
  FIELD: "Campo",
  OTHER: "Otro",
};

export const PROPERTY_KINDS: PropertyKind[] = [
  "APARTMENT",
  "HOUSE",
  "QUINTA",
  "LOT",
  "GARAGE",
  "COMMERCIAL",
  "LAND",
  "FIELD",
  "OTHER",
];
