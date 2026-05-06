import type { Database } from "../types/database";

export type GeoLevelDefRow = Database["public"]["Tables"]["GeoLevelDef"]["Row"];

/** Etiqueta visible para el nivel (p. ej. «Provincia» / «Comunidad autónoma») según idioma. */
export function geoLevelLabel(row: Pick<GeoLevelDefRow, "labels" | "level_key">, locale = "es"): string {
  const raw = row.labels;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const v = o[locale];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return row.level_key;
}
