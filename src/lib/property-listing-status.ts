import type { ListingStatus } from "../types/database";

/** Orden alfabético por etiqueta en español */
export const LISTING_STATUS_KEYS: readonly ListingStatus[] = [
  "ARCHIVED",
  "AVAILABLE",
  "OTHER",
  "RESERVED",
  "URGENT",
] as const;

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  ARCHIVED: "Archivado",
  AVAILABLE: "Disponible",
  OTHER: "Otro",
  RESERVED: "Reservada (oferta)",
  URGENT: "Urgente",
};
