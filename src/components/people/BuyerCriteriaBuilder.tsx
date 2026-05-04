import { Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  BUYER_CRITERION_FIELDS,
  type BuyerCriteriaRow,
  type BuyerCriterionFieldKey,
} from "../../lib/buyer-criteria-fields";
import { LISTING_STATUS_KEYS, LISTING_STATUS_LABEL } from "../../lib/property-listing-status";
import { PROPERTY_KIND_LABEL, PROPERTY_KINDS } from "../../lib/property-options";
import type { ListingStatus, PropertyKind } from "../../types/database";

function defaultField(): BuyerCriterionFieldKey {
  return "rooms";
}

type Props = {
  rows: BuyerCriteriaRow[];
  onChange: (rows: BuyerCriteriaRow[]) => void;
};

export function BuyerCriteriaBuilder({ rows, onChange }: Props) {
  function addRow() {
    onChange([...rows, { field: defaultField(), value: "" }]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function patchRow(index: number, patch: Partial<BuyerCriteriaRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[#fffcf7]/80 p-5 md:p-6">
      <div>
        <h3 className="text-lg font-medium leading-snug text-[var(--foreground)]">Criterios sobre propiedades (scoring)</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          Elegí un atributo como en la ficha de la propiedad y el valor buscado. Podés sumar varios requisitos; el score promedia
          qué tanto cumple cada uno.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Todavía no cargaste criterios.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, i) => {
            const meta = BUYER_CRITERION_FIELDS.find((f) => f.key === row.field)!;
            return (
              <li
                key={`${i}-${row.field}`}
                className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 md:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1.35fr)_auto] md:items-end md:gap-4"
              >
                <div className="min-w-0">
                  <Label className="text-[11px] text-[var(--muted)]">Atributo</Label>
                  <select
                    value={row.field}
                    onChange={(e) => patchRow(i, { field: e.target.value as BuyerCriterionFieldKey, value: "" })}
                    className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
                  >
                    {BUYER_CRITERION_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <Label className="text-[11px] text-[var(--muted)]">Valor</Label>
                  <div className="mt-1">
                    {meta.input === "kind" ? (
                      <select
                        value={PROPERTY_KINDS.includes(row.value as PropertyKind) ? row.value : ""}
                        onChange={(e) => patchRow(i, { value: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
                      >
                        <option value="">— Elegir tipo —</option>
                        {PROPERTY_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {PROPERTY_KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    ) : meta.input === "listing_status" ? (
                      <select
                        value={LISTING_STATUS_KEYS.includes(row.value as ListingStatus) ? row.value : ""}
                        onChange={(e) => patchRow(i, { value: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
                      >
                        <option value="">— Elegir estado —</option>
                        {LISTING_STATUS_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {LISTING_STATUS_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    ) : meta.input === "number" ? (
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        placeholder={"hint" in meta ? meta.hint : ""}
                        value={row.value}
                        onChange={(e) => patchRow(i, { value: e.target.value })}
                      />
                    ) : (
                      <Input
                        type="text"
                        placeholder={"hint" in meta ? meta.hint : ""}
                        value={row.value}
                        onChange={(e) => patchRow(i, { value: e.target.value })}
                      />
                    )}
                  </div>
                </div>
                <div className="flex justify-end md:justify-start md:pb-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-700 hover:bg-red-50"
                    title="Quitar"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 className="size-4" strokeWidth={1.75} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Button type="button" size="sm" variant="secondary" className="gap-1.5 bg-[#fffcf7]" onClick={addRow}>
        <Plus className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        <span>Agregar criterio</span>
      </Button>
    </div>
  );
}
