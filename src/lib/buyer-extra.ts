/**
 * PersonPreference.buyer_extra_json:
 * - Formato nuevo: { "criteriaRows": [ { "field": "rooms", "value": "3" }, ... ] }
 * - Formato legacy: min_rooms, keywords, must_have_tags, etc. (sigue aplicando al score si existe)
 */

import {
  type BuyerCriteriaRow,
  type BuyerCriterionFieldKey,
  type BuyerPropertySnapshot,
  isBuyerCriterionFieldKey,
  scoreBuyerCriterionRow,
} from "./buyer-criteria-fields";

export type BuyerExtraCriteria = {
  min_rooms?: number;
  min_bathrooms?: number;
  min_parking?: number;
  keywords?: string[];
  keywords_all?: boolean;
  must_have_tags?: string[];
};

export type UnifiedBuyerCriteria = {
  rows: BuyerCriteriaRow[];
  legacy: BuyerExtraCriteria | null;
};

function norm(s: string) {
  return s.trim().toLowerCase();
}

function toInt(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function toStringArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof v === "string") {
    return v
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parseLegacyFromObject(o: Record<string, unknown>): BuyerExtraCriteria | null {
  const criteria: BuyerExtraCriteria = {};
  const mr = toInt(o.min_rooms);
  const mb = toInt(o.min_bathrooms);
  const mp = toInt(o.min_parking);
  if (mr !== undefined) criteria.min_rooms = mr;
  if (mb !== undefined) criteria.min_bathrooms = mb;
  if (mp !== undefined) criteria.min_parking = mp;
  const kw = toStringArray(o.keywords);
  if (kw.length) criteria.keywords = kw.map(norm);
  if (typeof o.keywords_all === "boolean") criteria.keywords_all = o.keywords_all;
  const mht = toStringArray(o.must_have_tags);
  if (mht.length) criteria.must_have_tags = mht.map(norm);
  return hasLegacyCriterion(criteria) ? criteria : null;
}

function hasLegacyCriterion(c: BuyerExtraCriteria): boolean {
  return (
    c.min_rooms != null ||
    c.min_bathrooms != null ||
    c.min_parking != null ||
    (c.keywords?.length ?? 0) > 0 ||
    (c.must_have_tags?.length ?? 0) > 0
  );
}

function parseCriteriaRowsFromObject(o: Record<string, unknown>): BuyerCriteriaRow[] {
  const raw = o.criteriaRows;
  if (!Array.isArray(raw)) return [];
  const rows: BuyerCriteriaRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const field = rec.field;
    const value = rec.value;
    if (typeof field !== "string" || typeof value !== "string") continue;
    if (!isBuyerCriterionFieldKey(field)) continue;
    rows.push({ field: field as BuyerCriterionFieldKey, value });
  }
  return rows;
}

/** Parsea almacenamiento (nuevo criteriaRows + legacy opcional). */
export function parseBuyerExtraJson(raw: string | null | undefined): UnifiedBuyerCriteria {
  if (raw == null || !String(raw).trim()) return { rows: [], legacy: null };
  try {
    const o = JSON.parse(String(raw)) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return { rows: [], legacy: null };
    const rec = o as Record<string, unknown>;
    const rows = parseCriteriaRowsFromObject(rec);
    const legacy = parseLegacyFromObject(rec);
    return { rows, legacy };
  } catch {
    return { rows: [], legacy: null };
  }
}

export function hasAnyBuyerCriterion(c: UnifiedBuyerCriteria): boolean {
  const hasRows = c.rows.some((r) => r.field && String(r.value).trim());
  return hasRows || Boolean(c.legacy && hasLegacyCriterion(c.legacy));
}

export function serializeBuyerCriteriaRows(rows: BuyerCriteriaRow[]): string {
  const clean = rows.filter((r) => r.field && String(r.value).trim());
  if (!clean.length) return "";
  return JSON.stringify({ criteriaRows: clean });
}

export type BuyerExtraScore = {
  pts: number;
  detail: string;
};

function ratioMeet(actual: number | null | undefined, min: number): number {
  if (actual == null || !Number.isFinite(actual)) return 0;
  if (actual >= min) return 1;
  return Math.max(0, actual / min);
}

function scoreLegacyBuyerExtra(
  criteria: BuyerExtraCriteria,
  haystack: string,
  propTagsNorm: string[],
  rooms: number | null | undefined,
  bathrooms: number | null | undefined,
  parking: number | null | undefined,
): { pts: number; detail: string } {
  const h = norm(haystack);
  const chunks: { label: string; pts: number }[] = [];

  if (criteria.min_rooms != null) {
    chunks.push({
      label: `Ambientes (formato anterior): ${rooms ?? "—"} frente a mínimo ${criteria.min_rooms}`,
      pts: ratioMeet(rooms, criteria.min_rooms),
    });
  }
  if (criteria.min_bathrooms != null) {
    chunks.push({
      label: `Baños (formato anterior): ${bathrooms ?? "—"} frente a mínimo ${criteria.min_bathrooms}`,
      pts: ratioMeet(bathrooms, criteria.min_bathrooms),
    });
  }
  if (criteria.min_parking != null) {
    chunks.push({
      label: `Cocheras (formato anterior): ${parking ?? "—"} frente a mínimo ${criteria.min_parking}`,
      pts: ratioMeet(parking, criteria.min_parking),
    });
  }

  if (criteria.keywords?.length) {
    const found = criteria.keywords.filter((k) => k.length > 0 && h.includes(k));
    const needAll = criteria.keywords_all === true;
    const kwPts = needAll
      ? found.length === criteria.keywords.length
        ? 1
        : 0
      : found.length / Math.max(criteria.keywords.length, 1);
    chunks.push({
      label: `Palabras clave (formato anterior) (${found.length}/${criteria.keywords.length})`,
      pts: kwPts,
    });
  }

  if (criteria.must_have_tags?.length) {
    const hit = criteria.must_have_tags.filter((t) => propTagsNorm.includes(t));
    chunks.push({
      label: `Etiquetas (formato anterior): ${hit.join(", ") || "ninguna"}`,
      pts: hit.length / Math.max(criteria.must_have_tags.length, 1),
    });
  }

  const pts = chunks.reduce((s, c) => s + c.pts, 0) / Math.max(chunks.length, 1);
  return {
    pts,
    detail: chunks.map((c) => `${c.label} (${Math.round(c.pts * 100)}%)`).join(" · "),
  };
}

export function buildPropertyHaystack(parts: {
  title: string | null | undefined;
  description: string | null | undefined;
  city_zone: string;
  amenity_tags: string | null | undefined;
}): string {
  return [parts.title, parts.description, parts.city_zone, parts.amenity_tags].filter(Boolean).join(" \n ");
}

/**
 * Combina filas atributo/valor + bloque legacy opcional en un solo puntaje [0,1].
 */
export function scoreBuyerExtra(
  unified: UnifiedBuyerCriteria,
  prop: BuyerPropertySnapshot,
  propTagsNorm: string[],
): BuyerExtraScore {
  const rowChunks: { label: string; pts: number }[] = [];
  for (const row of unified.rows) {
    const sc = scoreBuyerCriterionRow(row, prop, propTagsNorm);
    if (sc) rowChunks.push({ label: sc.label, pts: sc.pts });
  }

  let legacyPts = 1;
  let legacyDetail = "";
  if (unified.legacy && hasLegacyCriterion(unified.legacy)) {
    const haystack = buildPropertyHaystack({
      title: prop.title,
      description: prop.description,
      city_zone: prop.city_zone,
      amenity_tags: prop.amenity_tags,
    });
    const leg = scoreLegacyBuyerExtra(unified.legacy, haystack, propTagsNorm, prop.rooms, prop.bathrooms, prop.parking);
    legacyPts = leg.pts;
    legacyDetail = leg.detail;
  }

  const parts: { label: string; pts: number }[] = [...rowChunks];
  if (unified.legacy && hasLegacyCriterion(unified.legacy)) {
    parts.push({ label: legacyDetail || "Criterios en formato anterior", pts: legacyPts });
  }

  if (!parts.length) {
    return { pts: 0, detail: "Ningún criterio se pudo evaluar (revisá valores o formato)" };
  }

  const pts = parts.reduce((s, p) => s + p.pts, 0) / parts.length;
  const detail = parts.map((p) => `${p.label} (${Math.round(p.pts * 100)}%)`).join(" · ");
  return { pts, detail };
}
