import { supabase } from "./supabase";
import { scorePropertyMatch } from "./matching";
import type { Database, PersonPreference } from "../types/database";

type PropRow = Database["public"]["Tables"]["Property"]["Row"];

/** Recalcula match_score / explain para todas las propiedades vinculadas a oportunidades de una persona (consultas agrupadas). */
export async function recomputeMatchingForPerson(personId: string): Promise<{ error?: string }> {
  const { data: pref, error: pe } = await supabase
    .from("PersonPreference")
    .select("*")
    .eq("person_id", personId)
    .maybeSingle();
  if (pe) return { error: pe.message };

  const { data: opps, error: oe } = await supabase.from("Opportunity").select("id").eq("person_id", personId);
  if (oe) return { error: oe.message };
  const oppIds = (opps ?? []).map((o) => o.id);
  if (!oppIds.length) return {};

  const { data: allLinks, error: le } = await supabase
    .from("OpportunityProperty")
    .select("opportunity_id, property_id")
    .in("opportunity_id", oppIds);
  if (le) return { error: le.message };

  const linkRows = allLinks ?? [];
  if (!linkRows.length) return {};

  const propIds = [...new Set(linkRows.map((l) => l.property_id))];

  const { data: props, error: propsE } = await supabase.from("Property").select("*").in("id", propIds);
  if (propsE) return { error: propsE.message };

  const propById = Object.fromEntries(((props ?? []) as PropRow[]).map((p) => [p.id, p]));

  const { data: priceRows } = await supabase
    .from("PropertyPrice")
    .select("property_id, amount, effective_at")
    .in("property_id", propIds)
    .eq("kind", "LISTING_PUBLIC")
    .order("effective_at", { ascending: false });

  const pubByProp = new Map<string, number>();
  for (const row of priceRows ?? []) {
    const pid = (row as { property_id: string }).property_id;
    if (!pubByProp.has(pid)) {
      pubByProp.set(pid, Number((row as { amount: string }).amount));
    }
  }

  const updates: { oppId: string; propId: string; score: number; explainJson: string }[] = [];
  for (const link of linkRows) {
    const prop = propById[link.property_id];
    if (!prop) continue;
    const pubAmount = Number.isFinite(pubByProp.get(link.property_id))
      ? (pubByProp.get(link.property_id) ?? null)
      : null;

    const explain = scorePropertyMatch(
      {
        city_zone: prop.city_zone,
        kind: prop.kind,
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
      pref as PersonPreference | null,
      pubAmount,
    );

    updates.push({
      oppId: link.opportunity_id,
      propId: link.property_id,
      score: explain.score,
      explainJson: JSON.stringify(explain.parts),
    });
  }

  const chunkSize = 12;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(({ oppId, propId, score, explainJson }) =>
        supabase
          .from("OpportunityProperty")
          .update({ match_score: score, match_explain_json: explainJson })
          .eq("opportunity_id", oppId)
          .eq("property_id", propId),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return { error: failed.error.message };
  }

  return {};
}
