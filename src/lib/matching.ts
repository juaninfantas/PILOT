import type { ListingStatus, PersonPreference, PropertyKind } from "../types/database";
import { parseBuyerExtraJson, scoreBuyerExtra, hasAnyBuyerCriterion } from "./buyer-extra";
import { parsePropertyKinds, parseStringArray, parseTagsLoose } from "./crm-json";
import { PROPERTY_KIND_LABEL } from "./property-options";

export type MatchWeights = {
  zone: number;
  price: number;
  m2: number;
  tags: number;
  kind: number;
  buyer: number;
};

export const DEFAULT_WEIGHTS: MatchWeights = {
  zone: 34,
  price: 28,
  m2: 14,
  tags: 10,
  kind: 5,
  buyer: 9,
};

export type MatchExplain = {
  score: number;
  maxScore: number;
  parts: {
    zone: { points: number; max: number; detail: string };
    price: { points: number; max: number; detail: string };
    m2: { points: number; max: number; detail: string };
    tags: { points: number; max: number; detail: string };
    kind: { points: number; max: number; detail: string };
    buyer: { points: number; max: number; detail: string };
  };
};

function norm(s: string) {
  return s.trim().toLowerCase();
}

/** Datos de propiedad que usa el matching (incl. campos para buyer_extra_json). */
export type PropPick = {
  city_zone: string;
  kind: PropertyKind;
  listing_status: ListingStatus;
  covered_m2: number | null;
  total_m2: number | null;
  amenity_tags: string | null;
  condition: string | null;
  title?: string | null;
  description?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  parking?: number | null;
};

export function scorePropertyMatch(
  property: PropPick,
  preference: PersonPreference | null,
  publicPrice: number | null,
  weights: MatchWeights = DEFAULT_WEIGHTS,
): MatchExplain {
  const zones = preference ? parseStringArray(preference.zones_json) : [];
  const kinds = preference ? parsePropertyKinds(preference.property_kinds_json) : [];
  const feat = preference ? parseStringArray(preference.feature_tags_json) : [];
  const minM2 = preference?.min_m2 ?? null;
  const rawMin =
    preference?.min_price != null && String(preference.min_price).trim() !== ""
      ? Number(preference.min_price)
      : null;
  const rawMax =
    preference?.max_price != null && String(preference.max_price).trim() !== ""
      ? Number(preference.max_price)
      : null;
  const minPrice = rawMin != null && Number.isFinite(rawMin) ? rawMin : null;
  const maxPrice = rawMax != null && Number.isFinite(rawMax) ? rawMax : null;
  const priceCurrency = preference?.price_currency ?? "USD";

  const buyerUnified = preference ? parseBuyerExtraJson(preference.buyer_extra_json) : { rows: [], legacy: null };
  const useBuyerWeight = hasAnyBuyerCriterion(buyerUnified);
  const buyerW = useBuyerWeight ? weights.buyer : 0;

  let zonePts = 0;
  let zoneDetail = "Sin preferencia de zona";
  if (zones.length > 0) {
    const cz = norm(property.city_zone);
    const hit = zones.some((z) => cz.includes(norm(z)) || norm(z).includes(cz));
    zonePts = hit ? 1 : 0;
    zoneDetail = hit ? `Zona coincide (${property.city_zone})` : `Zona no coincide (buscado: ${zones.join(", ")})`;
  } else {
    zoneDetail = "Sin zonas definidas en preferencias (0 pts)";
  }

  let pricePts = 0;
  let priceDetail = "Sin rango de precio en preferencias";
  const hasPriceBand =
    (minPrice != null && Number.isFinite(minPrice)) || (maxPrice != null && Number.isFinite(maxPrice));

  if (!hasPriceBand) {
    pricePts = 0;
    priceDetail = "Sin mínimo/máximo de precio (0 pts en precio)";
  } else if (publicPrice == null || !Number.isFinite(publicPrice)) {
    priceDetail = "Propiedad sin precio público vigente";
  } else {
    const pub = publicPrice;
    const belowMin = minPrice != null && pub < minPrice;
    const aboveMax = maxPrice != null && pub > maxPrice;
    const loLabel = minPrice != null ? String(minPrice) : "−∞";
    const hiLabel = maxPrice != null ? String(maxPrice) : "∞";

    if (!belowMin && !aboveMax) {
      pricePts = 1;
      priceDetail = `Precio público ${pub.toLocaleString()} ${priceCurrency} dentro del rango [${loLabel}, ${hiLabel}]`;
    } else if (belowMin && minPrice != null && minPrice > 0) {
      const ratio = pub / minPrice;
      pricePts = Math.max(0, ratio);
      priceDetail = `Precio ${pub.toLocaleString()} ${priceCurrency} por debajo del mínimo ${minPrice.toLocaleString()} (${Math.round(ratio * 100)}%)`;
    } else if (aboveMax && maxPrice != null && maxPrice > 0) {
      const ratio = maxPrice / pub;
      pricePts = Math.max(0, ratio);
      priceDetail = `Precio ${pub.toLocaleString()} ${priceCurrency} por encima del máximo ${maxPrice.toLocaleString()} (${Math.round(ratio * 100)}%)`;
    } else {
      pricePts = 0;
      priceDetail = `Precio ${pub.toLocaleString()} fuera del rango declarado`;
    }
  }

  const m2val = property.total_m2 ?? property.covered_m2 ?? null;
  let m2Pts = 0;
  let m2Detail = "Sin m² en propiedad o mínimo en preferencias";
  if (minM2 != null && m2val != null) {
    m2Pts = m2val >= minM2 ? 1 : m2val / minM2;
    m2Detail =
      m2val >= minM2
        ? `Superficie ${m2val} m² ≥ mínimo ${minM2}`
        : `Superficie ${m2val} m² bajo el mínimo ${minM2}`;
  }

  const propTags = parseTagsLoose(property.amenity_tags);
  let tagPts = 0;
  let tagDetail = "Sin tags en preferencias o en propiedad";
  if (feat.length > 0 && propTags.length > 0) {
    const hit = feat.filter((t) => propTags.includes(t.toLowerCase()));
    tagPts = hit.length / Math.max(feat.length, 1);
    tagDetail = `Coincidencias de características: ${hit.join(", ") || "ninguna"}`;
  } else if (feat.length === 0) {
    tagPts = 0;
    tagDetail = "Sin características buscadas";
  }

  let kindPts = 0;
  let kindDetail = "Sin tipo preferido";
  if (kinds.length > 0) {
    const hit = kinds.includes(property.kind);
    kindPts = hit ? 1 : 0;
    const propKindLabel = PROPERTY_KIND_LABEL[property.kind];
    const prefLabels = kinds.map((k) => PROPERTY_KIND_LABEL[k]).join(", ");
    kindDetail = hit
      ? `Tipo «${propKindLabel}» coincide`
      : `La propiedad es «${propKindLabel}»; preferidos: ${prefLabels}`;
  }

  let buyerPts = 0;
  let buyerDetail = "Sin criterios en buyer_extra_json (no suma al score)";
  if (useBuyerWeight) {
    const buyerSnapshot = {
      city_zone: property.city_zone,
      kind: property.kind,
      listing_status: property.listing_status,
      covered_m2: property.covered_m2,
      total_m2: property.total_m2,
      rooms: property.rooms ?? null,
      bathrooms: property.bathrooms ?? null,
      parking: property.parking ?? null,
      condition: property.condition,
      title: property.title ?? null,
      description: property.description ?? null,
      amenity_tags: property.amenity_tags,
    };
    const buyerBlock = scoreBuyerExtra(buyerUnified, buyerSnapshot, propTags);
    buyerPts = buyerBlock.pts;
    buyerDetail = buyerBlock.detail;
  }

  const w = weights;
  const maxScore = w.zone + w.price + w.m2 + w.tags + w.kind + buyerW;
  const score =
    zonePts * w.zone +
    pricePts * w.price +
    m2Pts * w.m2 +
    tagPts * w.tags +
    kindPts * w.kind +
    buyerPts * buyerW;

  return {
    score: Math.round((score / maxScore) * 1000) / 10,
    maxScore: 100,
    parts: {
      zone: { points: zonePts * w.zone, max: w.zone, detail: zoneDetail },
      price: { points: pricePts * w.price, max: w.price, detail: priceDetail },
      m2: { points: m2Pts * w.m2, max: w.m2, detail: m2Detail },
      tags: { points: tagPts * w.tags, max: w.tags, detail: tagDetail },
      kind: { points: kindPts * w.kind, max: w.kind, detail: kindDetail },
      buyer: { points: buyerPts * buyerW, max: buyerW, detail: buyerDetail },
    },
  };
}
