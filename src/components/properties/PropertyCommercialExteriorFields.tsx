import { Label } from "../ui/label";
import { Input } from "../ui/input";

function pill(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs transition-colors ${
    active
      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
      : "border-[var(--border)] bg-[#fffcf7] text-[var(--muted)] hover:border-[var(--accent)]/40"
  }`;
}

function YesNoPair({
  idPrefix,
  label,
  value,
  onChange,
}: {
  idPrefix: string;
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="md:col-span-4">
      <Label className="mb-2 block">{label}</Label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          id={`${idPrefix}-yes`}
          onClick={() => onChange(true)}
          className={pill(value)}
        >
          Sí
        </button>
        <button
          type="button"
          id={`${idPrefix}-no`}
          onClick={() => onChange(false)}
          className={pill(!value)}
        >
          No
        </button>
      </div>
    </div>
  );
}

export type PropertyCommercialExteriorFieldsProps = {
  hasQuincho: boolean;
  onHasQuinchoChange: (v: boolean) => void;
  hasPool: boolean;
  onHasPoolChange: (v: boolean) => void;
  floorCountInput: string;
  onFloorCountInputChange: (v: string) => void;
  hasPatio: boolean;
  onHasPatioChange: (v: boolean) => void;
  hasTerrace: boolean;
  onHasTerraceChange: (v: boolean) => void;
  hasLaundry: boolean;
  onHasLaundryChange: (v: boolean) => void;
  hasBalcony: boolean;
  onHasBalconyChange: (v: boolean) => void;
  hasGarden: boolean;
  onHasGardenChange: (v: boolean) => void;
  hasServiceRoom: boolean;
  onHasServiceRoomChange: (v: boolean) => void;
  hasElevator: boolean;
  onHasElevatorChange: (v: boolean) => void;
  /** Hidden booleans para FormData (`true` / `false`). */
  syncFormHiddenBools?: boolean;
  syncFormHiddenFloor?: boolean;
  onAnyInteraction?: () => void;
};

export function PropertyCommercialExteriorFields({
  hasQuincho,
  onHasQuinchoChange,
  hasPool,
  onHasPoolChange,
  floorCountInput,
  onFloorCountInputChange,
  hasPatio,
  onHasPatioChange,
  hasTerrace,
  onHasTerraceChange,
  hasLaundry,
  onHasLaundryChange,
  hasBalcony,
  onHasBalconyChange,
  hasGarden,
  onHasGardenChange,
  hasServiceRoom,
  onHasServiceRoomChange,
  hasElevator,
  onHasElevatorChange,
  syncFormHiddenBools,
  syncFormHiddenFloor,
  onAnyInteraction,
}: PropertyCommercialExteriorFieldsProps) {
  const touch = () => onAnyInteraction?.();

  return (
    <>
      {syncFormHiddenBools || syncFormHiddenFloor ? (
        <div className="hidden md:col-span-12" aria-hidden>
          {syncFormHiddenBools ? (
            <>
              <input type="hidden" name="has_quincho" value={hasQuincho ? "true" : "false"} />
              <input type="hidden" name="has_pool" value={hasPool ? "true" : "false"} />
              <input type="hidden" name="has_patio" value={hasPatio ? "true" : "false"} />
              <input type="hidden" name="has_terrace" value={hasTerrace ? "true" : "false"} />
              <input type="hidden" name="has_laundry" value={hasLaundry ? "true" : "false"} />
              <input type="hidden" name="has_balcony" value={hasBalcony ? "true" : "false"} />
              <input type="hidden" name="has_garden" value={hasGarden ? "true" : "false"} />
              <input type="hidden" name="has_service_room" value={hasServiceRoom ? "true" : "false"} />
              <input type="hidden" name="has_elevator" value={hasElevator ? "true" : "false"} />
            </>
          ) : null}
          {syncFormHiddenFloor ? <input type="hidden" name="floor_count" value={floorCountInput} /> : null}
        </div>
      ) : null}
      <div className="md:col-span-12">
        <p className="text-xs text-[var(--muted)]">Espacios y exterior</p>
      </div>
      <YesNoPair
        idPrefix="quincho"
        label="Quincho"
        value={hasQuincho}
        onChange={(v) => {
          touch();
          onHasQuinchoChange(v);
        }}
      />
      <YesNoPair
        idPrefix="pileta"
        label="Pileta"
        value={hasPool}
        onChange={(v) => {
          touch();
          onHasPoolChange(v);
        }}
      />
      <div className="md:col-span-4">
        <Label htmlFor="floor_count">Plantas (niveles)</Label>
        <Input
          id="floor_count"
          type="number"
          min={0}
          step={1}
          className="mt-1"
          value={floorCountInput}
          onChange={(e) => {
            touch();
            onFloorCountInputChange(e.target.value);
          }}
          placeholder="—"
        />
      </div>
      <YesNoPair
        idPrefix="patio"
        label="Patio"
        value={hasPatio}
        onChange={(v) => {
          touch();
          onHasPatioChange(v);
        }}
      />
      <YesNoPair
        idPrefix="terraza"
        label="Terraza"
        value={hasTerrace}
        onChange={(v) => {
          touch();
          onHasTerraceChange(v);
        }}
      />
      <div className="md:col-span-12">
        <p className="text-xs text-[var(--muted)]">Interior y edificio</p>
      </div>
      <YesNoPair
        idPrefix="lavadero"
        label="Lavadero independiente"
        value={hasLaundry}
        onChange={(v) => {
          touch();
          onHasLaundryChange(v);
        }}
      />
      <YesNoPair
        idPrefix="balcon"
        label="Balcón"
        value={hasBalcony}
        onChange={(v) => {
          touch();
          onHasBalconyChange(v);
        }}
      />
      <YesNoPair
        idPrefix="jardin"
        label="Jardín / parque"
        value={hasGarden}
        onChange={(v) => {
          touch();
          onHasGardenChange(v);
        }}
      />
      <YesNoPair
        idPrefix="dependencia"
        label="Dependencia"
        value={hasServiceRoom}
        onChange={(v) => {
          touch();
          onHasServiceRoomChange(v);
        }}
      />
      <YesNoPair
        idPrefix="ascensor"
        label="Ascensor"
        value={hasElevator}
        onChange={(v) => {
          touch();
          onHasElevatorChange(v);
        }}
      />
    </>
  );
}

/** Lee checkboxes/ocultos enviados como `true`/`false`. */
export function parseBoolFormValue(raw: FormDataEntryValue | null): boolean {
  return String(raw ?? "") === "true";
}

export function parseOptionalFloorCount(raw: FormDataEntryValue | null): number | null {
  return parseOptionalFloorCountString(String(raw ?? ""));
}

export function parseOptionalFloorCountString(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
