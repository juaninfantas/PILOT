import { Label } from "../ui/label";
import { MANAGEMENT_OPTIONS, type ManagementCode } from "../../lib/property-management";

function pillClass(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs transition-colors ${
    active
      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
      : "border-[var(--border)] bg-[#fffcf7] text-[var(--muted)] hover:border-[var(--accent)]/40"
  }`;
}

export type PropertyGestiónExclusiveFieldsProps = {
  management: ManagementCode[];
  onToggleManagement: (code: ManagementCode) => void;
  isExclusive: boolean;
  onExclusiveChange: (value: boolean) => void;
  /** Hidden inputs para FormData (`management`, `is_exclusive`). */
  syncFormHiddenFields?: boolean;
};

export function PropertyGestiónExclusiveFields({
  management,
  onToggleManagement,
  isExclusive,
  onExclusiveChange,
  syncFormHiddenFields,
}: PropertyGestiónExclusiveFieldsProps) {
  return (
    <>
      {syncFormHiddenFields ? (
        <div className="hidden md:col-span-12" aria-hidden>
          {management.map((code) => (
            <input key={code} type="hidden" name="management" value={code} />
          ))}
          {isExclusive ? <input type="hidden" name="is_exclusive" value="on" /> : null}
        </div>
      ) : null}
      <div className="md:col-span-12">
        <Label>Gestión</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {MANAGEMENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggleManagement(opt.value)}
              className={pillClass(management.includes(opt.value))}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="md:col-span-12">
        <Label className="mb-2 block">Exclusividad</Label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onExclusiveChange(!isExclusive)}
            className={pillClass(isExclusive)}
          >
            Exclusividad
          </button>
        </div>
      </div>
    </>
  );
}
