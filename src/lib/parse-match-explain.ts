import type { MatchExplain } from "./matching";

/** Parse `match_explain_json` desde OpportunityProperty para el mismo desglose que scoring. */
export function parseMatchExplainParts(json: string | null | undefined): MatchExplain["parts"] | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as MatchExplain["parts"];
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function matchExplainFromParts(parts: MatchExplain["parts"]): MatchExplain {
  const vals = Object.values(parts);
  return {
    score: vals.reduce((a, b) => a + b.points, 0),
    maxScore: vals.reduce((a, b) => a + b.max, 0),
    parts,
  };
}
