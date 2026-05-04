import type { PropertyKind } from "../types/database";

export function parseStringArray(json: string | null | undefined): string[] {
  if (!json?.trim()) return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function parsePropertyKinds(json: string | null | undefined): PropertyKind[] {
  const raw = parseStringArray(json);
  const allowed: PropertyKind[] = [
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
  return raw.filter((x): x is PropertyKind => (allowed as string[]).includes(x));
}

export function parseTagsLoose(s: string | null | undefined): string[] {
  if (!s?.trim()) return [];
  return s
    .split(/[,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}
