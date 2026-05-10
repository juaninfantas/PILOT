/** Reserva cuando el catálogo aún no cargó o falló la tabla. Siempre fusionada con el catálogo en contexto. */
export const FALLBACK_CURRENCY_OPTIONS = [
  { code: "USD", label: "Dólar estadounidense" },
  { code: "ARS", label: "Peso argentino" },
  { code: "EUR", label: "Euro" },
] as const;

/** @deprecated usar FALLBACK_CURRENCY_OPTIONS; se mantiene por imports legados */
export const CURRENCIES = FALLBACK_CURRENCY_OPTIONS;

export const DEFAULT_CURRENCY_CODE = "USD";

const FALLBACK_CODE_SET = new Set<string>(FALLBACK_CURRENCY_OPTIONS.map((c) => c.code));

/**
 * Normaliza código de moneda. Si pasás `catalogCodes` desde el catálogo, se fusiona con la lista mínima reservada (USD/ARS/EUR).
 */
export function normalizeCurrencyCode(
  raw: string | null | undefined,
  catalogCodes?: ReadonlySet<string> | null,
): string {
  const u = String(raw ?? "").trim().toUpperCase();
  const merged =
    catalogCodes && catalogCodes.size > 0
      ? mergeCurrencyCodeSets(FALLBACK_CODE_SET, catalogCodes)
      : FALLBACK_CODE_SET;
  if (merged.has(u)) return u;
  return DEFAULT_CURRENCY_CODE;
}

function mergeCurrencyCodeSets(a: ReadonlySet<string>, b: ReadonlySet<string>): Set<string> {
  const out = new Set<string>(a);
  for (const x of b) out.add(String(x).toUpperCase());
  return out;
}
