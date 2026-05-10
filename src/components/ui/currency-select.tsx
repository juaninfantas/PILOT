import { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } from "../../lib/currencies";
import { useCurrencyCatalog } from "../../contexts/CurrencyCatalogContext";
import { cn } from "../../lib/utils";

type CurrencySelectProps = {
  id?: string;
  name?: string;
  defaultValue?: string | null;
  className?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
};

export function CurrencySelect({ id, name, defaultValue, className, value, onChange }: CurrencySelectProps) {
  const { options, codeSet } = useCurrencyCatalog();
  const isControlled = value !== undefined;
  const dv = normalizeCurrencyCode(defaultValue ?? DEFAULT_CURRENCY_CODE, codeSet);
  return (
    <select
      id={id}
      name={name}
      value={isControlled ? normalizeCurrencyCode(value, codeSet) : undefined}
      defaultValue={isControlled ? undefined : dv}
      onChange={onChange}
      className={cn(
        "flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm",
        className,
      )}
    >
      {options.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} — {c.label}
        </option>
      ))}
    </select>
  );
}
