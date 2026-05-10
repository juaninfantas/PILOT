import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../types/database";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Modal } from "../../components/ui/modal";
import { geoLevelLabel } from "../../lib/geo-ui";

type GeoCountry = Database["public"]["Tables"]["GeoCountryConfig"]["Row"];
type GeoLevelDefRow = Database["public"]["Tables"]["GeoLevelDef"]["Row"];
type GeoUnitRow = Database["public"]["Tables"]["GeoUnit"]["Row"];

type NewLevelDraft = {
  level_key: string;
  label_es: string;
  optional_level: boolean;
};

function sanitizeLevelKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
}

/**
 * Admins (manage_users / Pilot staff): país + niveles (GeoLevelDef), unidades (GeoUnit) y etiquetas ES.
 */
type GeoAreasAdminSectionProps = { embedded?: boolean };

export function GeoAreasAdminSection({ embedded = false }: GeoAreasAdminSectionProps) {
  const [countries, setCountries] = useState<GeoCountry[]>([]);
  const [cc, setCc] = useState("AR");
  const [defs, setDefs] = useState<GeoLevelDefRow[]>([]);
  const [units, setUnits] = useState<GeoUnitRow[]>([]);
  const [labelEdits, setLabelEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [newCountryOpen, setNewCountryOpen] = useState(false);
  const [newCountrySaving, setNewCountrySaving] = useState(false);
  const [newCc, setNewCc] = useState("");
  const [countryDisplayName, setCountryDisplayName] = useState("");
  const [dialHint, setDialHint] = useState("");
  const [l0Label, setL0Label] = useState("País");
  const [extraLevels, setExtraLevels] = useState<NewLevelDraft[]>([]);
  const [countryModalErr, setCountryModalErr] = useState<string | null>(null);

  const [newUnitOpen, setNewUnitOpen] = useState(false);
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitParentId, setUnitParentId] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const [unitName, setUnitName] = useState("");
  const [unitModalErr, setUnitModalErr] = useState<string | null>(null);

  const loadCountries = useCallback(async () => {
    const { data, error } = await supabase.from("GeoCountryConfig").select("*").order("country_code");
    if (error) setErr(error.message);
    else setCountries((data as GeoCountry[]) ?? []);
  }, []);

  const loadCountry = useCallback(async (country: string) => {
    setLoading(true);
    setErr(null);
    const c = country.trim().toUpperCase();
    const [{ data: defRows }, { data: unitRows }] = await Promise.all([
      supabase.rpc("list_geo_level_defs", { p_country: c }),
      supabase.from("GeoUnit").select("*").eq("country_code", c).order("level_index").order("name"),
    ]);
    const dr = (defRows as GeoLevelDefRow[]) ?? [];
    setDefs(dr);
    const edits: Record<string, string> = {};
    for (const d of dr) {
      const key = `${d.country_code}-${d.level_index}`;
      edits[key] = geoLevelLabel(d);
    }
    setLabelEdits(edits);
    setUnits((unitRows as GeoUnitRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCountries();
  }, [loadCountries]);

  useEffect(() => {
    if (!countries.length) return;
    if (!countries.some((c) => c.country_code === cc)) setCc(countries[0].country_code);
  }, [countries, cc]);

  useEffect(() => {
    if (!cc || !countries.some((c) => c.country_code === cc)) return;
    void loadCountry(cc);
  }, [cc, loadCountry, countries]);

  function openNewCountryModal() {
    setNewCc("");
    setCountryDisplayName("");
    setDialHint("");
    setL0Label("País");
    setExtraLevels([]);
    setCountryModalErr(null);
    setNewCountryOpen(true);
  }

  function openNewUnitModal() {
    setUnitParentId("");
    setUnitCode("");
    setUnitName("");
    setUnitModalErr(null);
    setNewUnitOpen(true);
  }

  async function saveLabel(row: GeoLevelDefRow) {
    setErr(null);
    setMsg(null);
    const key = `${row.country_code}-${row.level_index}`;
    const es = labelEdits[key]?.trim() ?? "";
    if (!es) {
      setErr("Etiqueta vacía.");
      return;
    }
    const labels = { ...(row.labels as Record<string, unknown>), es };
    const { error } = await supabase
      .from("GeoLevelDef")
      .update({ labels })
      .eq("country_code", row.country_code)
      .eq("level_index", row.level_index);
    if (error) setErr(error.message);
    else {
      setMsg(`Guardado nivel ${row.level_index} (${row.country_code}).`);
      void loadCountry(cc);
    }
  }

  async function createCountryStructure(e: React.FormEvent) {
    e.preventDefault();
    setCountryModalErr(null);
    const code = sanitizeLevelKey(newCc).slice(0, 2);
    if (!/^[A-Z]{2}$/.test(code)) {
      setCountryModalErr("El código país debe ser ISO 3166-1 alpha-2 (2 letras).");
      return;
    }
    const display = countryDisplayName.trim();
    if (!display) {
      setCountryModalErr("Nombre del país obligatorio (aparece como unidad raíz).");
      return;
    }
    const l0 = l0Label.trim() || "País";
    for (let i = 0; i < extraLevels.length; i++) {
      const row = extraLevels[i];
      const k = sanitizeLevelKey(row.level_key);
      const lb = row.label_es.trim();
      if (!k || !lb) {
        setCountryModalErr(`Revisá el nivel ${i + 1}: clave técnica y etiqueta ES son obligatorias.`);
        return;
      }
    }
    const seenKeys = new Set<string>();
    for (let i = 0; i < extraLevels.length; i++) {
      const k = sanitizeLevelKey(extraLevels[i].level_key);
      if (k === "COUNTRY") {
        setCountryModalErr('La clave «COUNTRY» está reservada para el nivel 0.');
        return;
      }
      if (seenKeys.has(k)) {
        setCountryModalErr(`La clave «${k}» está repetida.`);
        return;
      }
      seenKeys.add(k);
    }

    setNewCountrySaving(true);
    const dialMeta =
      dialHint.trim() ? ({ dial: dialHint.trim().startsWith("+") ? dialHint.trim() : `+${dialHint.trim()}` } as Record<string, unknown>) : {};
    const { error: ec } = await supabase.from("GeoCountryConfig").insert({
      country_code: code,
      dial_metadata: dialMeta,
    });
    if (ec) {
      setNewCountrySaving(false);
      setCountryModalErr(ec.message.includes("duplicate") ? "Ese país ya existe." : ec.message);
      return;
    }

    const levelRows = [
      { country_code: code, level_index: 0, level_key: "COUNTRY", labels: { es: l0 }, optional_level: false },
      ...extraLevels.map((row, idx) => ({
        country_code: code,
        level_index: idx + 1,
        level_key: sanitizeLevelKey(row.level_key),
        labels: { es: row.label_es.trim() },
        optional_level: row.optional_level,
      })),
    ] satisfies Database["public"]["Tables"]["GeoLevelDef"]["Insert"][];
    const { error: ld } = await supabase.from("GeoLevelDef").insert(levelRows);
    if (ld) {
      setNewCountrySaving(false);
      setCountryModalErr(ld.message);
      await supabase.from("GeoCountryConfig").delete().eq("country_code", code);
      return;
    }

    const { error: gu } = await supabase.from("GeoUnit").insert({
      country_code: code,
      parent_id: null,
      level_index: 0,
      code,
      name: display,
    });
    if (gu) {
      setNewCountrySaving(false);
      setCountryModalErr(gu.message);
      await supabase.from("GeoLevelDef").delete().eq("country_code", code);
      await supabase.from("GeoCountryConfig").delete().eq("country_code", code);
      return;
    }

    setNewCountrySaving(false);
    setNewCountryOpen(false);
    setMsg(`País «${code}» creado con su estructura y unidad raíz.`);
    await loadCountries();
    setCc(code);
  }

  async function createUnitSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUnitModalErr(null);
    const c = cc.trim().toUpperCase();
    if (!unitParentId || !unitCode.trim() || !unitName.trim()) {
      setUnitModalErr("Padre, código y nombre obligatorios.");
      return;
    }
    const parent = units.find((u) => u.id === unitParentId);
    if (!parent) {
      setUnitModalErr("Padre no encontrado.");
      return;
    }
    const nextLevel = parent.level_index + 1;
    const hasDef = defs.some((d) => d.level_index === nextLevel);
    if (!hasDef) {
      setUnitModalErr(
        `No hay nivel definido para level_index ${nextLevel}. Revisá la estructura del país o agrega niveles (solo desde «Nuevo país» al crear otro país).`,
      );
      return;
    }
    setUnitSaving(true);
    const { error } = await supabase.from("GeoUnit").insert({
      country_code: c,
      parent_id: unitParentId,
      level_index: nextLevel,
      code: unitCode.trim(),
      name: unitName.trim(),
    });
    setUnitSaving(false);
    if (error) setUnitModalErr(error.message);
    else {
      setMsg("Unidad creada.");
      setUnitCode("");
      setUnitName("");
      setUnitParentId("");
      setNewUnitOpen(false);
      void loadCountry(c);
    }
  }

  function addExtraLevelRow() {
    setExtraLevels((prev) => [...prev, { level_key: "", label_es: "", optional_level: false }]);
  }

  function removeExtraLevel(index: number) {
    setExtraLevels((prev) => prev.filter((_, i) => i !== index));
  }

  const Shell = embedded ? "div" : "section";
  const shellClass = embedded
    ? "space-y-4"
    : "scroll-mt-6 rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6";

  return (
    <Shell {...(!embedded ? ({ id: "geo-areas" } as const) : {})} className={shellClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="jif-caps jif-dim" style={{ fontSize: "0.65rem" }}>
            Áreas geo
          </p>
          <h3 className="mt-2 text-lg font-semibold">Áreas geográficas (maestro)</h3>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
            <strong>Nuevo país</strong> registra la configuración (niveles y etiquetas) y la unidad raíz del país.{" "}
            <strong>Nueva unidad</strong> permite ir cargando la jerarquía (provincias, municipios, etc.) bajo esa estructura.
            Las etiquetas también se pueden afinar después con el país seleccionado. Es un <strong>maestro compartido</strong> para
            todas las inmobiliarias; usalo con cuidado en entornos multi-tenant.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            className="font-medium text-[var(--accent)] hover:bg-transparent hover:underline"
            onClick={() => openNewCountryModal()}
          >
            Nuevo país
          </Button>
          <Button
            type="button"
            className="jif-btn-primary"
            onClick={() => openNewUnitModal()}
            disabled={!cc || !countries.length || loading}
          >
            Nueva unidad
          </Button>
        </div>
      </div>

      {err ? <p className={`text-sm text-red-600 ${embedded ? "mt-2" : "mt-3"}`}>{err}</p> : null}
      {msg ? <p className={`text-sm text-[var(--accent)] ${embedded ? "mt-2" : "mt-3"}`}>{msg}</p> : null}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="geo-cc" className="jif-caps jif-dim" style={{ fontSize: "0.65rem" }}>
            País seleccionado (ISO2)
          </Label>
          <select
            id="geo-cc"
            className="mt-1 flex h-10 min-w-[12rem] rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
          >
            {countries.length === 0 ? (
              <option value="">Sin países</option>
            ) : (
              countries.map((ct) => (
                <option key={ct.country_code} value={ct.country_code}>
                  {ct.country_code}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-[var(--muted)]">Cargando…</p>
      ) : (
        <>
          <div className="mt-6">
            <p className="jif-caps jif-dim mb-3" style={{ fontSize: "0.6rem" }}>
              Etiquetas de nivel ({cc || "—"})
            </p>
            {defs.length === 0 ? (
              <div className="rounded-xl border border-[var(--jif-line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                No hay niveles para este país. Usá «Nuevo país» o revisá datos.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--jif-line)]">
                <table className="jif-table w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="jif-caps jif-dim border-b border-[var(--jif-line)]">
                      <th className="px-3 py-3 pl-4 font-medium sm:pl-5">Nivel</th>
                      <th className="px-3 py-3 font-medium">Clave</th>
                      <th className="px-3 py-3 font-medium">Opc.</th>
                      <th className="min-w-[14rem] px-3 py-3 font-medium">Etiqueta (ES)</th>
                      <th scope="col" className="w-32 whitespace-nowrap px-3 py-3 pr-4 text-right font-medium sm:pr-5" aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {defs.map((d) => {
                      const k = `${d.country_code}-${d.level_index}`;
                      return (
                        <tr key={k} className="border-b border-[var(--jif-line)]/60">
                          <td className="px-3 py-3 pl-4 text-[var(--muted)] sm:pl-5">L{d.level_index}</td>
                          <td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">{d.level_key}</td>
                          <td className="px-3 py-3 text-[var(--muted)]">{d.optional_level ? "Sí" : "—"}</td>
                          <td className="px-3 py-3">
                            <Input
                              className="h-9 py-1 text-sm"
                              value={labelEdits[k] ?? ""}
                              onChange={(e) => setLabelEdits((o) => ({ ...o, [k]: e.target.value }))}
                              aria-label={`Etiqueta nivel ${d.level_index}`}
                            />
                          </td>
                          <td className="px-3 py-3 pr-4 text-right sm:pr-5">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                className="inline-flex rounded-md p-2 text-[var(--accent)] hover:bg-stone-900/5"
                                title="Guardar etiqueta"
                                aria-label="Guardar etiqueta"
                                onClick={() => void saveLabel(d)}
                              >
                                <Save className="size-4" strokeWidth={1.75} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <Modal
        open={newCountryOpen}
        title="Nuevo país y estructura"
        panelClassName="max-w-2xl max-h-[min(92vh,640px)] overflow-y-auto"
        onClose={() => {
          if (!newCountrySaving) setNewCountryOpen(false);
        }}
        footer={
          <>
            <Button type="button" variant="ghost" disabled={newCountrySaving} onClick={() => setNewCountryOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-new-geo-country"
              disabled={newCountrySaving}
              className="jif-btn-primary inline-flex h-10 min-w-10 items-center justify-center px-3"
              aria-label="Crear país"
              title="Crear país"
            >
              {newCountrySaving ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <Save className="size-5 shrink-0" />}
            </Button>
          </>
        }
      >
        <form id="form-new-geo-country" className="space-y-5" onSubmit={(e) => void createCountryStructure(e)}>
          {countryModalErr ? <p className="text-sm text-red-600">{countryModalErr}</p> : null}
          <p className="text-xs text-[var(--muted)]">
            Se crean <code className="text-[10px]">GeoCountryConfig</code>, los niveles en{" "}
            <code className="text-[10px]">GeoLevelDef</code> y la unidad país en{" "}
            <code className="text-[10px]">GeoUnit</code> (nivel 0, sin padre).
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="nc-cc">Código país (ISO2)</Label>
              <Input
                id="nc-cc"
                maxLength={2}
                placeholder="Ej. CL"
                className="mt-1 uppercase"
                value={newCc}
                onChange={(e) => setNewCc(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
              />
            </div>
            <div>
              <Label htmlFor="nc-dial">Prefijo telefónico (opcional)</Label>
              <Input
                id="nc-dial"
                placeholder="+56"
                className="mt-1"
                value={dialHint}
                onChange={(e) => setDialHint(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="nc-name">Nombre del país</Label>
              <Input
                id="nc-name"
                placeholder="Ej. Chile"
                className="mt-1"
                value={countryDisplayName}
                onChange={(e) => setCountryDisplayName(e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--muted)]">Se usa como unidad maestro nivel 0 (el «nodo país»).</p>
            </div>
          </div>
          <div>
            <Label htmlFor="nc-l0">Etiqueta del nivel país (campo cascada nivel 0)</Label>
            <Input id="nc-l0" className="mt-1 max-w-xs" value={l0Label} onChange={(e) => setL0Label(e.target.value)} placeholder="País" />
          </div>
          <div className="border-t border-[var(--border)] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-[var(--foreground)]">Subniveles (orden = jerarquía)</h4>
              <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => addExtraLevelRow()}>
                <Plus className="size-4" strokeWidth={1.75} />
                Agregar nivel
              </Button>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Clave técnica (sin espacios, única por país): p. ej. ADM1, PROVINCE, LOCALITY. Opcional marca si ese nivel puede
              omitirse en la cascada.
            </p>
            <ul className="mt-3 space-y-3">
              {extraLevels.map((row, idx) => (
                <li
                  key={idx}
                  className="rounded-lg border border-[var(--border)] bg-[#fffcf7]/80 p-3"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 text-xs font-medium text-[var(--muted)]">
                    Nivel L{idx + 1}
                    <button
                      type="button"
                      className="rounded-md p-1 text-red-700 hover:bg-red-50"
                      title="Quitar nivel"
                      aria-label="Quitar nivel"
                      onClick={() => removeExtraLevel(idx)}
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} />
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Clave técnica</Label>
                      <Input
                        className="mt-1 uppercase"
                        placeholder="ADM1"
                        value={row.level_key}
                        onChange={(e) =>
                          setExtraLevels((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, level_key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") } : x,
                            ),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Etiqueta (ES)</Label>
                      <Input
                        className="mt-1"
                        placeholder="Región"
                        value={row.label_es}
                        onChange={(e) =>
                          setExtraLevels((prev) => prev.map((x, i) => (i === idx ? { ...x, label_es: e.target.value } : x)))
                        }
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-2">
                      <input
                        id={`nc-opt-${idx}`}
                        type="checkbox"
                        checked={row.optional_level}
                        onChange={(e) =>
                          setExtraLevels((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, optional_level: e.target.checked } : x)),
                          )
                        }
                        className="size-4 rounded border-[var(--border)]"
                      />
                      <Label htmlFor={`nc-opt-${idx}`} className="mb-0 cursor-pointer text-xs font-normal text-[var(--muted)]">
                        Nivel opcional en cascada
                      </Label>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {extraLevels.length === 0 ? (
              <p className="mt-2 text-xs italic text-[var(--muted)]">Podés crear solo país (sin subdivisión); en general conviene al menos un subnivel.</p>
            ) : null}
          </div>
        </form>
      </Modal>

      <Modal
        open={newUnitOpen}
        title={`Nueva unidad — ${cc}`}
        onClose={() => {
          if (!unitSaving) setNewUnitOpen(false);
        }}
        footer={
          <>
            <Button type="button" variant="ghost" disabled={unitSaving} onClick={() => setNewUnitOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-new-geo-unit"
              disabled={unitSaving}
              className="jif-btn-primary inline-flex h-10 min-w-10 items-center justify-center px-3"
              aria-label="Crear unidad"
              title="Crear unidad"
            >
              {unitSaving ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <Save className="size-5 shrink-0" />}
            </Button>
          </>
        }
      >
        <form id="form-new-geo-unit" className="space-y-4" onSubmit={(e) => void createUnitSubmit(e)}>
          {unitModalErr ? <p className="text-sm text-red-600">{unitModalErr}</p> : null}
          <p className="text-xs text-[var(--muted)]">
            País vigente según selector arriba: <strong>{cc}</strong>. La unidad hija será del nivel siguiente al padre elegido.
          </p>
          <div>
            <Label htmlFor="nu-parent">Padre</Label>
            <select
              id="nu-parent"
              className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
              value={unitParentId}
              onChange={(e) => setUnitParentId(e.target.value)}
              required
            >
              <option value="">Seleccionar…</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  [L{u.level_index}] {u.name} ({u.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="nu-code">Código (único bajo ese padre)</Label>
            <Input id="nu-code" value={unitCode} onChange={(e) => setUnitCode(e.target.value)} className="mt-1" required />
          </div>
          <div>
            <Label htmlFor="nu-name">Nombre</Label>
            <Input id="nu-name" value={unitName} onChange={(e) => setUnitName(e.target.value)} className="mt-1" required />
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
