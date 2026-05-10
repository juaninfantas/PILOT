/** Geocodificación Nominatim (OSM). En producción respetar políticas de uso. */
import { supabase } from "./supabase";

type GeocodeResult = { lat: number; lng: number; displayName: string };

const geocodeCache = new Map<string, GeocodeResult | null>();
let cooldownUntilMs = 0;

export async function geocodeAddress(
  query: string,
): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (!q) return null;
  const now = Date.now();
  if (cooldownUntilMs > now) return null;
  const cacheHit = geocodeCache.get(q);
  if (cacheHit !== undefined) return cacheHit;
  try {
    const { data, error } = await supabase.functions.invoke("geocode", {
      body: { query: q },
    });
    if (error) {
      cooldownUntilMs = Date.now() + 30_000;
      const out = null;
      geocodeCache.set(q, out);
      return out;
    }
    const row = data as Partial<GeocodeResult> | null;
    if (!row?.lat || !row?.lng) {
      const out = null;
      geocodeCache.set(q, out);
      return out;
    }
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const out = null;
      geocodeCache.set(q, out);
      return out;
    }
    const out = { lat, lng, displayName: String(row.displayName ?? q) };
    geocodeCache.set(q, out);
    return out;
  } catch {
    cooldownUntilMs = Date.now() + 15_000;
    return null;
  }
}

function normalizeAddress(raw: string): string {
  return raw.replace(/\./g, ". ").replace(/\s+/g, " ").trim();
}

function splitStreetNumber(address: string): { withNumber: string; streetOnly: string | null; streetNumber: string | null } {
  const normalized = normalizeAddress(address);
  if (!normalized) return { withNumber: "", streetOnly: null, streetNumber: null };
  const m = normalized.match(/^(.*?)(?:\s+|,)(\d{1,6}[A-Za-z]?)$/);
  if (!m) return { withNumber: normalized, streetOnly: null, streetNumber: null };
  return { withNumber: normalized, streetOnly: m[1]?.trim() || null, streetNumber: m[2]?.trim() || null };
}

function expandStreetAliases(street: string): string[] {
  const s = street.trim();
  if (!s) return [];
  const variants = [s];
  if (/^av\.?\s+/i.test(s)) variants.push(s.replace(/^av\.?\s+/i, "Avenida "));
  if (/^avda\.?\s+/i.test(s)) variants.push(s.replace(/^avda\.?\s+/i, "Avenida "));
  return variants.filter((v, i, arr) => arr.indexOf(v) === i);
}

/**
 * Devuelve consultas priorizando dirección con número.
 */
export function buildGeocodeAttempts(parts: {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  geoLine?: string | null;
  country?: string | null;
}): string[] {
  const address = (parts.address ?? "").trim();
  const postal = (parts.postalCode ?? "").trim();
  const city = (parts.city ?? "").trim();
  const geoLine = (parts.geoLine ?? "").trim();
  const country = (parts.country ?? "").trim();
  const { withNumber, streetOnly } = splitStreetNumber(address);
  const streetVariants = expandStreetAliases(withNumber);
  const streetOnlyVariants = streetOnly ? expandStreetAliases(streetOnly) : [];

  const variants: string[][] = [];
  for (const st of streetVariants) {
    variants.push([st, postal, city, country], [st, city, country], [st, postal, geoLine, country], [st, geoLine, country]);
  }
  for (const st of streetOnlyVariants) {
    variants.push([st, postal, city, country], [st, city, country], [st, postal, geoLine, country], [st, geoLine, country]);
  }
  variants.push([geoLine, postal, country]);

  return variants
    .map((arr) => arr.filter(Boolean).join(", ").trim())
    .filter(Boolean)
    .filter((q, i, list) => list.indexOf(q) === i);
}

export function extractStreetNumber(address: string | null | undefined): string | null {
  const { streetNumber } = splitStreetNumber(address ?? "");
  return streetNumber;
}

export function resultMatchesStreetNumber(displayName: string, streetNumber: string | null): boolean {
  if (!streetNumber) return true;
  const n = streetNumber.trim();
  if (!n) return true;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(displayName);
}
