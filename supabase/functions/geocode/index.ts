// Supabase Edge Function: geocode proxy for Nominatim.
// Avoids browser CORS issues and centralizes rate limiting.

type GeocodeResult = { lat: number; lng: number; displayName: string };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cache = new Map<string, GeocodeResult | null>();
let cooldownUntilMs = 0;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const now = Date.now();
  if (cooldownUntilMs > now) {
    return json(429, { error: "rate_limited", retry_after_ms: cooldownUntilMs - now });
  }

  let payload: { query?: string } = {};
  try {
    payload = (await req.json()) as { query?: string };
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const q = String(payload.query ?? "").trim();
  if (!q) return json(400, { error: "missing_query" });

  if (cache.has(q)) return json(200, cache.get(q));

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": Deno.env.get("NOMINATIM_USER_AGENT") ?? "PilotCRM/1.0",
      },
    });
    if (!res.ok) {
      if (res.status === 429) cooldownUntilMs = Date.now() + 60_000;
      cache.set(q, null);
      return json(200, null);
    }
    const arr = (await res.json()) as { lat?: string; lon?: string; display_name?: string }[];
    const first = arr[0];
    if (!first?.lat || !first?.lon) {
      cache.set(q, null);
      return json(200, null);
    }
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      cache.set(q, null);
      return json(200, null);
    }
    const out: GeocodeResult = {
      lat,
      lng,
      displayName: first.display_name ?? q,
    };
    cache.set(q, out);
    return json(200, out);
  } catch {
    cooldownUntilMs = Date.now() + 15_000;
    return json(200, null);
  }
});

