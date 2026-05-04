/** Geocodificación Nominatim (OSM). En producción respetar políticas de uso. */
export async function geocodeAddress(
  query: string,
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": import.meta.env.VITE_NOMINATIM_USER_AGENT ?? "PilotCRM/1.0",
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat?: string; lon?: string; display_name?: string }[];
  const first = data[0];
  if (!first?.lat || !first?.lon) return null;
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, displayName: first.display_name ?? q };
}
