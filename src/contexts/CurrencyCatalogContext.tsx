import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { FALLBACK_CURRENCY_OPTIONS } from "../lib/currencies";
import type { Database } from "../types/database";

type Row = Database["public"]["Tables"]["CurrencyCatalog"]["Row"];

export type CurrencyOption = { code: string; label: string };

export type CurrencyCatalogContextValue = {
  options: CurrencyOption[];
  /** Códigos efectivos (catálogo + reserva mínima USD/ARS/EUR desde fallback). */
  codeSet: Set<string>;
  loading: boolean;
  refresh: () => Promise<void>;
};

const defaultValue: CurrencyCatalogContextValue = {
  options: FALLBACK_CURRENCY_OPTIONS.map((c) => ({ code: c.code, label: c.label })),
  codeSet: new Set(FALLBACK_CURRENCY_OPTIONS.map((c) => c.code)),
  loading: false,
  refresh: async () => {},
};

const CurrencyCatalogContext = createContext<CurrencyCatalogContextValue>(defaultValue);

function rowsToOptions(rows: Row[]): CurrencyOption[] {
  return [...rows]
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      if (byName !== 0) return byName;
      return a.code.localeCompare(b.code);
    })
    .map((r) => ({ code: r.code, label: r.name }));
}

function mergeCodes(catalogCodes: string[]): Set<string> {
  const s = new Set<string>(FALLBACK_CURRENCY_OPTIONS.map((c) => c.code));
  for (const c of catalogCodes) s.add(c.toUpperCase());
  return s;
}

export function CurrencyCatalogProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("CurrencyCatalog")
      .select("code,name,sort_order,created_at")
      .order("name");
    setLoading(false);
    if (error) {
      console.error(error);
      setRows([]);
      return;
    }
    setRows((data as Row[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const optionsFromDb = rowsToOptions(rows);
  const options = optionsFromDb.length > 0 ? optionsFromDb : defaultValue.options;

  const codeSet = useMemo(() => mergeCodes(rows.map((r) => r.code)), [rows]);

  const value = useMemo<CurrencyCatalogContextValue>(
    () => ({
      options,
      codeSet,
      loading,
      refresh: load,
    }),
    [options, codeSet, loading, load],
  );

  return <CurrencyCatalogContext.Provider value={value}>{children}</CurrencyCatalogContext.Provider>;
}

export function useCurrencyCatalog(): CurrencyCatalogContextValue {
  return useContext(CurrencyCatalogContext);
}
