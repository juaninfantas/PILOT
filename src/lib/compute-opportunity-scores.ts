import { supabase } from "./supabase";
import { scorePropertyMatch } from "./matching";
import type { PersonPreference, PropertyKind } from "../types/database";
import type { Database } from "../types/database";

type PropRow = Database["public"]["Tables"]["Property"]["Row"];

export type RankedProperty = {
  property_id: string;
  title: string;
  score: number;
  explain: ReturnType<typeof scorePropertyMatch>;
};

/** Último precio público por propiedad (misma lógica que recompute-matching). */
function latestPublicByProperty(rows: { property_id: string; amount: string | number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!m.has(r.property_id)) {
      const n = Number(r.amount);
      if (Number.isFinite(n)) m.set(r.property_id, n);
    }
  }
  return m;
}

/** Calcula score persona–propiedad para todas las propiedades de la organización. */
export async function rankPropertiesForPerson(
  organizationId: string,
  personId: string,
): Promise<{ ranked: RankedProperty[]; error?: string }> {
  const { data: prefRow, error: pe } = await supabase
    .from("PersonPreference")
    .select("*")
    .eq("person_id", personId)
    .maybeSingle();
  if (pe) return { ranked: [], error: pe.message };

  const pref = prefRow as PersonPreference | null;

  const { data: props, error: propsE } = await supabase.from("Property").select("*").eq("organization_id", organizationId);
  if (propsE) return { ranked: [], error: propsE.message };
  const list = (props as PropRow[]) ?? [];
  if (!list.length) return { ranked: [] };

  const ids = list.map((p) => p.id);
  const { data: priceRows } = await supabase
    .from("PropertyPrice")
    .select("property_id, amount, effective_at")
    .in("property_id", ids)
    .eq("kind", "LISTING_PUBLIC")
    .order("effective_at", { ascending: false });

  const ordered = (priceRows as { property_id: string; amount: string }[]) ?? [];
  const latest = latestPublicByProperty(ordered);

  const ranked: RankedProperty[] = list.map((prop) => {
    const pubAmount = latest.get(prop.id) ?? null;
    const explain = scorePropertyMatch(
      {
        city_zone: prop.city_zone,
        kind: prop.kind as PropertyKind,
        listing_status: prop.listing_status,
        covered_m2: prop.covered_m2,
        total_m2: prop.total_m2,
        amenity_tags: prop.amenity_tags,
        condition: prop.condition,
        title: prop.title,
        description: prop.description,
        rooms: prop.rooms,
        bathrooms: prop.bathrooms,
        parking: prop.parking,
      },
      pref,
      pubAmount,
    );
    return {
      property_id: prop.id,
      title: prop.title,
      score: explain.score,
      explain,
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return { ranked };
}
