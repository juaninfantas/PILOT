import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { CurrencySelect } from "../ui/currency-select";

export type PropertyAmountDateFormVariant = "listing_price" | "offer";

type Props = {
  variant: PropertyAmountDateFormVariant;
  amountInputId: string;
  currencyInputId: string;
  dateInputId: string;
  noteInputId: string;
  /** `name` del input fecha (effective_date vs offered_date). */
  dateFieldName: string;
  noteFieldName: string;
  dateLabel: string;
  notePlaceholder?: string;
  defaultAmount?: string;
  defaultDate?: string;
  defaultCurrency?: string;
  defaultNote?: string;
  /** Solo listado público / reservado. */
  defaultKind?: "LISTING_PUBLIC" | "LISTING_RESERVED";
  kindSelectId?: string;
};

/**
 * Campos alineados con el modal de precio en ficha propiedad (importe, fecha+moneda, listado opcional, nota).
 */
export function PropertyAmountDateFormFields(props: Props) {
  const {
    variant,
    amountInputId,
    currencyInputId,
    dateInputId,
    noteInputId,
    dateFieldName,
    noteFieldName,
    dateLabel,
    notePlaceholder = "Opcional",
    defaultAmount = "",
    defaultDate = "",
    defaultCurrency = "USD",
    defaultNote = "",
    defaultKind = "LISTING_PUBLIC",
    kindSelectId = "pad-kind",
  } = props;

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={amountInputId}>Importe</Label>
        <Input
          id={amountInputId}
          name="amount"
          type="number"
          step="any"
          placeholder="Importe"
          required
          defaultValue={defaultAmount}
          className="mt-1"
          autoComplete="off"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <Label htmlFor={dateInputId}>{dateLabel}</Label>
          <Input id={dateInputId} name={dateFieldName} type="date" required className="mt-1" defaultValue={defaultDate} />
        </div>
        <div className="min-w-0">
          <Label htmlFor={currencyInputId}>Moneda</Label>
          <CurrencySelect id={currencyInputId} name="currency" defaultValue={defaultCurrency} className="mt-1" />
        </div>
      </div>
      {variant === "listing_price" ? (
        <div>
          <Label htmlFor={kindSelectId}>Listado</Label>
          <select
            id={kindSelectId}
            name="kind"
            defaultValue={defaultKind}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
          >
            <option value="LISTING_PUBLIC">Público</option>
            <option value="LISTING_RESERVED">Reservado</option>
          </select>
        </div>
      ) : null}
      <div>
        <Label htmlFor={noteInputId}>Nota</Label>
        <Input id={noteInputId} name={noteFieldName} placeholder={notePlaceholder} defaultValue={defaultNote} className="mt-1" />
      </div>
    </div>
  );
}
