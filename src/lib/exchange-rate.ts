import type { Database } from "../types/database";

export type ExchangeRateRow = Database["public"]["Tables"]["ExchangeRate"]["Row"];

export type ExchangeUseVariant = "BUY" | "SELL" | "MID";

export const EXCHANGE_USE_LABELS: Record<ExchangeUseVariant, string> = {
  BUY: "Compra",
  SELL: "Venta",
  MID: "Promedio",
};

export function parseUseVariant(raw: string | null | undefined): ExchangeUseVariant {
  const u = String(raw ?? "MID").trim().toUpperCase();
  if (u === "BUY" || u === "SELL" || u === "MID") return u;
  return "MID";
}

export function exchangePairKey(currencyFrom: string, currencyTo: string): string {
  return `${currencyFrom.trim().toUpperCase()}|${currencyTo.trim().toUpperCase()}`;
}

/** Por par FROM|TO, orden ascendente por effective_at. */
export function buildRatesByPair(rows: ExchangeRateRow[]): Map<string, ExchangeRateRow[]> {
  const m = new Map<string, ExchangeRateRow[]>();
  for (const r of rows) {
    const k = exchangePairKey(r.currency_from, r.currency_to);
    const list = m.get(k) ?? [];
    list.push(r);
    m.set(k, list);
  }
  for (const list of m.values()) {
    list.sort((a, b) => a.effective_at.localeCompare(b.effective_at));
  }
  return m;
}

/**
 * @deprecated Usar `buildRatesByPair`; se mantiene por compatibilidad con nombres viejos.
 */
export function buildRatesByCurrency(rows: ExchangeRateRow[]): Map<string, ExchangeRateRow[]> {
  return buildRatesByPair(rows);
}

/** Promedio compra/venta en unidades de `currency_to` por 1 `currency_from` (misma unidad que antes con un solo valor). */
export function midQuotePerBase(r: Pick<ExchangeRateRow, "quote_buy" | "quote_sell">): number {
  const buy = Number(r.quote_buy);
  const sell = Number(r.quote_sell);
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) return NaN;
  return (buy + sell) / 2;
}

/**
 * Cotización efectiva según `use_variant` de la fila (compra, venta o promedio).
 * Es el valor que usan los reportes para la fila vigente según la fecha del dato.
 */
export function effectiveQuoteForUse(r: Pick<ExchangeRateRow, "quote_buy" | "quote_sell" | "use_variant">): number {
  const buy = Number(r.quote_buy);
  const sell = Number(r.quote_sell);
  const v = parseUseVariant(r.use_variant);
  if (v === "BUY") {
    if (!Number.isFinite(buy) || buy <= 0) return NaN;
    return buy;
  }
  if (v === "SELL") {
    if (!Number.isFinite(sell) || sell <= 0) return NaN;
    return sell;
  }
  return midQuotePerBase(r);
}

function pickQuoteAtOrBefore(series: ExchangeRateRow[] | undefined, priceEffectiveAtIso: string): number | null {
  if (!series?.length) return null;
  const t = new Date(priceEffectiveAtIso).getTime();
  let picked: number | null = null;
  for (const r of series) {
    const rt = new Date(r.effective_at).getTime();
    if (rt <= t) {
      const q = effectiveQuoteForUse(r);
      if (Number.isFinite(q)) picked = q;
    } else break;
  }
  if (picked == null || !Number.isFinite(picked) || picked <= 0) return null;
  return picked;
}

/**
 * Multiplicador para pasar un monto en `priceCurrency` a USD: `usd = amount * multiplier`.
 * Usa filas (priceCurrency → USD) o, si no hay, (USD → priceCurrency) invirtendo la cotización.
 */
export function pickUsdMultiplier(
  priceCurrencyUpper: string,
  priceEffectiveAtIso: string,
  byPair: Map<string, ExchangeRateRow[]>,
): number | null {
  const cc = priceCurrencyUpper.trim().toUpperCase();
  if (cc === "USD") return 1;

  const direct = pickQuoteAtOrBefore(byPair.get(exchangePairKey(cc, "USD")), priceEffectiveAtIso);
  if (direct != null) return direct;

  const inverse = pickQuoteAtOrBefore(byPair.get(exchangePairKey("USD", cc)), priceEffectiveAtIso);
  if (inverse != null) return 1 / inverse;

  return null;
}

/**
 * @deprecated Usar `pickUsdMultiplier` con mapa de pares (misma semántica: USD = monto × factor).
 */
export function pickUsdPerUnit(
  currencyUpper: string,
  priceEffectiveAtIso: string,
  byPair: Map<string, ExchangeRateRow[]>,
): number | null {
  return pickUsdMultiplier(currencyUpper, priceEffectiveAtIso, byPair);
}

/** Texto legible: 1 FROM = X TO */
export function formatExchangePairQuote(from: string, to: string, quotePerBase: number): string {
  if (!Number.isFinite(quotePerBase) || quotePerBase <= 0) return "—";
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  const maxFrac = quotePerBase >= 1 ? 4 : 8;
  const x = quotePerBase.toLocaleString("es-AR", { maximumFractionDigits: maxFrac });
  return `1 ${f} = ${x} ${t}`;
}

function fmtPairDigit(v: number, maxFrac: number): string {
  return v.toLocaleString("es-AR", { maximumFractionDigits: maxFrac });
}

/** Una línea: compra y venta en unidades de `to` por 1 `from`. */
export function formatExchangePairBuySell(from: string, to: string, buy: number, sell: number): string {
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) return "—";
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  const maxFrac = Math.max(buy, sell) >= 1 ? 4 : 8;
  return `1 ${f}: compra ${fmtPairDigit(buy, maxFrac)} · venta ${fmtPairDigit(sell, maxFrac)} ${t}`;
}
