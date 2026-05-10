import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../types/database";
import { geoLevelLabel } from "../../lib/geo-ui";
import { Label } from "../ui/label";

type GeoUnitRow = Database["public"]["Tables"]["GeoUnit"]["Row"];
type GeoLevelDefRow = Database["public"]["Tables"]["GeoLevelDef"]["Row"];

type Props = {
  /** País del maestro geo (sincroniza al montar / cuando el padre lo cambia). */
  countryCode: string;
  /** geo_unit_id guardado en la propiedad (nodo más fino elegido). */
  value: string | null;
  disabled?: boolean;
  emitCityZone?: boolean;
  cityZoneFallback?: string;
  /** Si hay más de uno, el desplegable País se puede cambiar (p. ej. AR / ES). */
  availableCountries?: string[];
  /** Al cambiar de país se limpia la selección en cascada (y el geo oculto hasta elegir de nuevo). */
  onCountryCodeChange?: (code: string) => void;
};

function countryLabel(cc: string): string {
  const c = cc.trim().toUpperCase();
  if (c === "AR") return "Argentina";
  if (c === "ES") return "España";
  return c;
}

/**
 * Selects en cascada según GeoLevelDef del país: la etiqueta de cada campo sale de `labels` (es, …).
 * Envía `geo_unit_id` por campo oculto al hacer submit del formulario.
 */
type Selection = { id: string | null; name: string | null };

const DEFAULT_COUNTRIES = ["AR", "ES"];

export function GeoCascadingSelect({
  countryCode,
  value,
  disabled,
  emitCityZone = false,
  cityZoneFallback = "",
  availableCountries = DEFAULT_COUNTRIES,
  onCountryCodeChange,
}: Props) {
  const propCc = countryCode.trim().toUpperCase();
  const countries = useMemo(
    () => [...new Set(availableCountries.map((c) => c.trim().toUpperCase()).filter(Boolean))].sort(),
    [availableCountries],
  );
  const [localCc, setLocalCc] = useState(propCc);
  const cc = localCc;

  useEffect(() => {
    setLocalCc(propCc);
  }, [propCc]);

  const [rootId, setRootId] = useState<string | null>(null);
  const [defs, setDefs] = useState<GeoLevelDefRow[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);

  const depthDefs = useMemo(() => defs.filter((d) => d.level_index > 0), [defs]);

  useEffect(() => {
    if (!cc) return;
    let cancelled = false;
    void (async () => {
      const [{ data: root }, { data: defRows }] = await Promise.all([
        supabase.rpc("get_geo_country_root_id", { p_country: cc }),
        supabase.rpc("list_geo_level_defs", { p_country: cc }),
      ]);
      if (cancelled) return;
      setRootId((root as string | null) ?? null);
      setDefs((defRows as GeoLevelDefRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [cc]);

  const applyChain = useCallback(
    async (chain: string[]) => {
      const tail = chain.slice(1);
      const byId = new Map<string, string>();
      if (tail.length) {
        const { data } = await supabase.from("GeoUnit").select("id,name").in("id", tail);
        for (const row of (data as Pick<GeoUnitRow, "id" | "name">[] | null) ?? []) byId.set(row.id, row.name);
      }
      setSelections(depthDefs.map((_, i) => ({ id: tail[i] ?? null, name: (tail[i] && byId.get(tail[i])) || null })));
    },
    [depthDefs],
  );

  useEffect(() => {
    if (!rootId || depthDefs.length === 0) {
      setSelections([]);
      return;
    }
    setSelections(depthDefs.map(() => ({ id: null, name: null })));

    if (!value) return;

    let cancelled = false;
    void (async () => {
      const { data } = await supabase.rpc("get_geo_unit_chain", { p_unit_id: value });
      if (cancelled) return;
      const chain = (data as string[] | null) ?? [];
      if (chain.length >= 2) void applyChain(chain);
    })();
    return () => {
      cancelled = true;
    };
  }, [value, rootId, depthDefs, applyChain]);

  const parentForSlot = useCallback(
    (slotIndex: number): string | null => {
      if (!rootId) return null;
      if (slotIndex === 0) return rootId;
      return selections[slotIndex - 1]?.id ?? null;
    },
    [rootId, selections],
  );

  const effectiveGeoUnitId = useMemo(() => {
    for (let i = selections.length - 1; i >= 0; i--) {
      const id = selections[i]?.id;
      if (id) return id;
    }
    return null;
  }, [selections]);
  const effectiveCityZone = useMemo(() => {
    for (let i = selections.length - 1; i >= 0; i--) {
      const n = selections[i]?.name?.trim();
      if (n) return n;
    }
    return cityZoneFallback.trim();
  }, [selections, cityZoneFallback]);

  if (!cc) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--muted)]">
        Etiquetas por nivel según el maestro geográfico del país ({cc}). Podés dejar vacíos los niveles marcados como
        opcionales.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`geo-country-${cc}`}>País</Label>
          <select
            id={`geo-country-${cc}`}
            className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
            value={cc}
            disabled={disabled || countries.length <= 1}
            onChange={(e) => {
              const next = e.target.value.trim().toUpperCase();
              if (next === localCc || !countries.includes(next)) return;
              setLocalCc(next);
              setSelections([]);
              onCountryCodeChange?.(next);
            }}
          >
            {countries.map((c) => (
              <option key={c} value={c}>
                {countryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        {depthDefs.map((def, slotIndex) => (
          <GeoLevelSlot
            key={`${cc}-${def.level_index}-${def.level_key}`}
            countryCode={cc}
            def={def}
            parentId={parentForSlot(slotIndex)}
            selected={selections[slotIndex] ?? { id: null, name: null }}
            disabled={disabled || (!parentForSlot(slotIndex) && slotIndex > 0)}
            onPick={(id, name) => {
              setSelections((prev) => {
                const pad = depthDefs.map((_, i) => prev[i] ?? { id: null, name: null });
                const next = [...pad];
                next[slotIndex] = { id, name };
                for (let j = slotIndex + 1; j < next.length; j++) next[j] = { id: null, name: null };
                return next;
              });
            }}
          />
        ))}
      </div>
      <input id="geo_unit_id_hidden" type="hidden" name="geo_unit_id" value={effectiveGeoUnitId ?? ""} readOnly aria-hidden />
      {emitCityZone ? <input id="city_zone_hidden" type="hidden" name="city_zone" value={effectiveCityZone} readOnly aria-hidden /> : null}
    </div>
  );
}

function GeoLevelSlot({
  countryCode,
  def,
  parentId,
  selected,
  disabled,
  onPick,
}: {
  countryCode: string;
  def: GeoLevelDefRow;
  parentId: string | null;
  selected: Selection;
  disabled: boolean;
  onPick: (id: string | null, name: string | null) => void;
}) {
  const [options, setOptions] = useState<GeoUnitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const label = geoLevelLabel(def);

  useEffect(() => {
    if (!parentId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase.rpc("list_geo_units", {
        p_country: countryCode,
        p_parent_id: parentId,
      });
      if (cancelled) return;
      setLoading(false);
      if (error) {
        console.error(error);
        setOptions([]);
        return;
      }
      setOptions((data as GeoUnitRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [countryCode, parentId]);

  useEffect(() => {
    setQuery(selected.name ?? "");
  }, [selected.id, selected.name]);

  const selectedOption = useMemo(() => options.find((o) => o.id === selected.id) ?? null, [options, selected.id]);
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((u) => u.name.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <Label htmlFor={`geo-${def.country_code}-${def.level_index}`}>{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={`geo-${def.country_code}-${def.level_index}`}
          className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
          value={query}
          disabled={disabled || loading || !parentId}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setOpen(true);
            const hit = options.find((u) => u.name.toLowerCase() === v.trim().toLowerCase()) ?? null;
            if (hit) onPick(hit.id, hit.name);
            else if (!v.trim()) onPick(null, null);
          }}
          onBlur={() => {
            if (!query.trim()) {
              onPick(null, null);
              return;
            }
            const hit = options.find((u) => u.name.toLowerCase() === query.trim().toLowerCase()) ?? null;
            if (hit) onPick(hit.id, hit.name);
            else setQuery(selectedOption?.name ?? "");
          }}
          placeholder={def.optional_level ? "(Opcional) Buscar…" : "Buscar y seleccionar…"}
        />
        <button
          type="button"
          className="h-10 rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm text-[var(--muted)]"
          disabled={disabled || loading || !parentId}
          onClick={() => setOpen((v) => !v)}
          aria-label={`Desplegar ${label}`}
        >
          ▼
        </button>
      </div>
      {open && !disabled && parentId ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {filteredOptions.length ? (
            filteredOptions.map((u) => (
              <button
                key={u.id}
                type="button"
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface)] ${
                  selected.id === u.id ? "bg-[var(--surface)] font-medium" : ""
                }`}
                onClick={() => {
                  onPick(u.id, u.name);
                  setQuery(u.name);
                  setOpen(false);
                }}
              >
                {u.name}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-[var(--muted)]">Sin resultados</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
