import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../types/database";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { geoLevelLabel } from "../../lib/geo-ui";

type GeoCountry = Database["public"]["Tables"]["GeoCountryConfig"]["Row"];
type GeoLevelDefRow = Database["public"]["Tables"]["GeoLevelDef"]["Row"];
type GeoUnitRow = Database["public"]["Tables"]["GeoUnit"]["Row"];

/**
 * Supervisor Pilot: define etiquetas de nivel por país (GeoLevelDef.labels) y nodos (GeoUnit).
 * Las etiquetas son las que ve el usuario en las propiedades y en la ruta al compartir.
 */
export function GeoAreasAdminSection() {
  const [countries, setCountries] = useState<GeoCountry[]>([]);
  const [cc, setCc] = useState("AR");
  const [defs, setDefs] = useState<GeoLevelDefRow[]>([]);
  const [units, setUnits] = useState<GeoUnitRow[]>([]);
  const [labelEdits, setLabelEdits] = useState<Record<string, string>>({});
  const [parentId, setParentId] = useState<string>("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    if (cc) void loadCountry(cc);
  }, [cc, loadCountry]);

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

  async function addUnit() {
    setErr(null);
    setMsg(null);
    if (!parentId || !newCode.trim() || !newName.trim()) {
      setErr("Padre, código y nombre obligatorios.");
      return;
    }
    const parent = units.find((u) => u.id === parentId);
    if (!parent) {
      setErr("Padre no encontrado.");
      return;
    }
    const nextLevel = parent.level_index + 1;
    const hasDef = defs.some((d) => d.level_index === nextLevel);
    if (!hasDef) {
      setErr(`No hay nivel definido para level_index ${nextLevel}. Agregalo en SQL o ampliá GeoLevelDef.`);
      return;
    }
    const { error } = await supabase.from("GeoUnit").insert({
      country_code: cc.trim().toUpperCase(),
      parent_id: parentId,
      level_index: nextLevel,
      code: newCode.trim(),
      name: newName.trim(),
    });
    if (error) setErr(error.message);
    else {
      setMsg("Unidad creada.");
      setNewCode("");
      setNewName("");
      void loadCountry(cc);
    }
  }

  return (
    <section id="geo-areas" className="scroll-mt-6 rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6">
      <h2 className="text-lg font-semibold">Áreas geográficas (maestro)</h2>
      <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
        Las etiquetas de cada nivel (País, Provincia, Comunidad, etc.) las define el país en{" "}
        <code className="text-xs">GeoLevelDef.labels</code>; al cambiarlas, los formularios de propiedad y el texto al
        compartir usan esos nombres.
      </p>

      {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
      {msg ? <p className="mt-3 text-sm text-emerald-700">{msg}</p> : null}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="geo-cc">País (ISO2)</Label>
          <select
            id="geo-cc"
            className="mt-1 flex h-10 min-w-[8rem] rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
          >
            {countries.map((c) => (
              <option key={c.country_code} value={c.country_code}>
                {c.country_code}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-[var(--muted)]">Cargando…</p>
      ) : (
        <>
          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">Etiquetas de nivel (ES)</h3>
            <ul className="space-y-3">
              {defs.map((d) => {
                const k = `${d.country_code}-${d.level_index}`;
                return (
                  <li key={k} className="flex flex-wrap items-end gap-2 border-b border-[var(--border)] pb-3">
                    <div className="min-w-[5rem] text-xs text-[var(--muted)]">
                      L{d.level_index} · {d.level_key}
                    </div>
                    <Input
                      className="max-w-xs"
                      value={labelEdits[k] ?? ""}
                      onChange={(e) => setLabelEdits((o) => ({ ...o, [k]: e.target.value }))}
                    />
                    <Button type="button" size="sm" variant="secondary" onClick={() => void saveLabel(d)}>
                      Guardar etiqueta
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-8 space-y-3">
            <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">Agregar unidad bajo un padre</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="geo-parent">Padre</Label>
                <select
                  id="geo-parent"
                  className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
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
                <Label htmlFor="geo-code">Código (único bajo el padre)</Label>
                <Input id="geo-code" value={newCode} onChange={(e) => setNewCode(e.target.value)} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="geo-name">Nombre</Label>
                <Input id="geo-name" value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1" />
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={() => void addUnit()}>
              Crear unidad
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
