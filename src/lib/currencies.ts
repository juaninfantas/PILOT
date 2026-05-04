export const CURRENCIES = [
  { code: "USD", label: "Dólar estadounidense" },
  { code: "ARS", label: "Peso argentino" },
  { code: "EUR", label: "Euro" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY_CODE: CurrencyCode = "USD";

const CODE_SET = new Set<string>(CURRENCIES.map((c) => c.code));

export function normalizeCurrencyCode(raw: string | null | undefined): CurrencyCode {
  const u = String(raw ?? "").trim().toUpperCase();
  if (CODE_SET.has(u)) return u as CurrencyCode;
  return DEFAULT_CURRENCY_CODE;
}
