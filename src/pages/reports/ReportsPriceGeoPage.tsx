import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { RequirePermission } from "../../components/RequirePermission";
import { NeoCard, NeoPageHeader, NeoPageShell } from "../../components/ui/neo-brutal";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../types/database";
import { geoLevelLabel } from "../../lib/geo-ui";
import { useOrganization } from "../../contexts/OrganizationContext";
import { buildRatesByPair, pickUsdMultiplier, type ExchangeRateRow } from "../../lib/exchange-rate";
import { cn } from "../../lib/utils";
import { MonthlyListingAvgLineChart } from "../../components/charts/MonthlyListingAvgLineChart";

type GeoLevelDefRow = Database["public"]["Tables"]["GeoLevelDef"]["Row"];
type GeoUnitRow = Pick<Database["public"]["Tables"]["GeoUnit"]["Row"], "id" | "country_code" | "parent_id" | "level_index" | "name">;
type PropRow = Pick<
  Database["public"]["Tables"]["Property"]["Row"],
  "id" | "geo_unit_id" | "listing_status" | "covered_m2" | "total_m2"
>;

/** Incluye todas las propiedades salvo archivadas. */
function includePropertyInPriceGeoReport(listingStatus: PropRow["listing_status"]): boolean {
  return listingStatus !== "ARCHIVED";
}

function effectiveM2(p: PropRow): number | null {
  const t = p.total_m2 != null ? Number(p.total_m2) : NaN;
  const c = p.covered_m2 != null ? Number(p.covered_m2) : NaN;
  if (Number.isFinite(t) && t > 0) return t;
  if (Number.isFinite(c) && c > 0) return c;
  return null;
}

function hasAncestor(unitId: string, ancestorId: string, unitsById: Map<string, GeoUnitRow>) {
  let cur: string | null = unitId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = unitsById.get(cur)?.parent_id ?? null;
  }
  return false;
}

/**
 * Precio listado público (USD/m²) promedio por mes, filtrable por maestro geo.
 * Propiedades: todas salvo ARCHIVED. Superficie: total_m2 si existe; si no, covered_m2.
 */
export function ReportsPriceGeoPage({
  embedded = false,
  controlTower = false,
}: {
  embedded?: boolean;
  /** Control Tower: país auto según datos, encabezado mínimo, bloque más bajo. */
  controlTower?: boolean;
}) {
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;

  const [props, setProps] = useState<PropRow[]>([]);
  const [prices, setPrices] = useState<Database["public"]["Tables"]["PropertyPrice"]["Row"][]>([]);
  const [rateRows, setRateRows] = useState<ExchangeRateRow[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [countryCode, setCountryCode] = useState("AR");
  const userPickedCountry = useRef(false);
  const autoCountryApplied = useRef(false);
  const [defs, setDefs] = useState<GeoLevelDefRow[]>([]);
  const [geoUnits, setGeoUnits] = useState<GeoUnitRow[]>([]);

  const [countryRootId, setCountryRootId] = useState<string | null>(null);
  const [tier1Units, setTier1Units] = useState<GeoUnitRow[]>([]);
  const [tier2Units, setTier2Units] = useState<GeoUnitRow[]>([]);
  const [unitFilter1, setUnitFilter1] = useState("");
  const [unitFilter2, setUnitFilter2] = useState("");

  useEffect(() => {
    void (async () => {
      const [p, pr, cc] = await Promise.all([
        supabase.from("Property").select("id, geo_unit_id, listing_status, covered_m2, total_m2"),
        supabase.from("PropertyPrice").select("*").eq("kind", "LISTING_PUBLIC").order("effective_at", { ascending: true }),
        supabase.from("GeoCountryConfig").select("country_code").order("country_code"),
      ]);
      setProps((p.data as PropRow[]) ?? []);
      setPrices((pr.data as Database["public"]["Tables"]["PropertyPrice"]["Row"][]) ?? []);
      const codes = ((cc.data as { country_code: string }[]) ?? []).map((r) => r.country_code);
      setCountries(codes);
      if (codes.length > 0 && !codes.includes("AR") && !controlTower) setCountryCode(codes[0]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- controlTower fijo por montaje del destino (/dashboard vs /reports/price-geo)
  }, []);

  useEffect(() => {
    if (!controlTower || autoCountryApplied.current || countries.length === 0) return;
    const avail = props.filter((p) => includePropertyInPriceGeoReport(p.listing_status) && p.geo_unit_id);
    const ids = [...new Set(avail.map((p) => p.geo_unit_id).filter(Boolean))] as string[];
    if (ids.length === 0) {
      autoCountryApplied.current = true;
      return;
    }
    let cancelled = false;
    void supabase
      .from("GeoUnit")
      .select("country_code")
      .in("id", ids)
      .then(({ data }) => {
        if (cancelled || !data?.length) return;
        const freq = new Map<string, number>();
        for (const row of data as { country_code: string }[]) {
          freq.set(row.country_code, (freq.get(row.country_code) ?? 0) + 1);
        }
        const pick = [...freq.entries()]
          .sort((a, b) => b[1] - a[1])
          .find(([c]) => countries.includes(c))?.[0];
        if (pick && !userPickedCountry.current) setCountryCode(pick);
        autoCountryApplied.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [controlTower, countries, props]);

  useEffect(() => {
    if (!orgId) {
      setRateRows([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from("ExchangeRate")
      .select("*")
      .eq("organization_id", orgId)
      .order("effective_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error(error);
          setRateRows([]);
          return;
        }
        setRateRows((data as ExchangeRateRow[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!countryCode) return;
    let cancelled = false;
    void (async () => {
      const c = countryCode.trim().toUpperCase();
      const [{ data: defRows }, { data: units }, { data: rootRow }] = await Promise.all([
        supabase.rpc("list_geo_level_defs", { p_country: c }),
        supabase.from("GeoUnit").select("id,country_code,parent_id,level_index,name").eq("country_code", c),
        supabase.rpc("get_geo_country_root_id", { p_country: c }),
      ]);
      if (cancelled) return;
      const d = (defRows as GeoLevelDefRow[]) ?? [];
      setDefs(d);
      setGeoUnits((units as GeoUnitRow[]) ?? []);
      const rootId = (rootRow as string | null) ?? null;
      setCountryRootId(rootId);
      setUnitFilter1("");
      setUnitFilter2("");
      setTier2Units([]);
      if (!rootId) {
        setTier1Units([]);
        return;
      }
      const { data: ch1 } = await supabase.rpc("list_geo_units", { p_country: c, p_parent_id: rootId });
      if (cancelled) return;
      setTier1Units((ch1 as GeoUnitRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [countryCode]);

  useEffect(() => {
    if (!unitFilter1) {
      setUnitFilter2("");
      setTier2Units([]);
      return;
    }
    if (!countryCode) return;
    let cancelled = false;
    const c = countryCode.trim().toUpperCase();
    void supabase.rpc("list_geo_units", { p_country: c, p_parent_id: unitFilter1 }).then(({ data }) => {
      if (cancelled) return;
      setTier2Units((data as GeoUnitRow[]) ?? []);
      setUnitFilter2("");
    });
    return () => {
      cancelled = true;
    };
  }, [countryCode, unitFilter1]);

  const depthDefs = useMemo(() => defs.filter((d) => d.level_index > 0).sort((a, b) => a.level_index - b.level_index), [defs]);

  const unitsById = useMemo(() => new Map(geoUnits.map((u) => [u.id, u])), [geoUnits]);

  const propM2ById = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of props) {
      const a = effectiveM2(p);
      if (a != null) m.set(p.id, a);
    }
    return m;
  }, [props]);

  const filteredPropertyIds = useMemo(() => {
    const ids = new Set<string>();
    const cc = countryCode.trim().toUpperCase();
    for (const p of props) {
      if (!includePropertyInPriceGeoReport(p.listing_status)) continue;
      const gid = p.geo_unit_id;
      if (!gid) continue;
      const unit = unitsById.get(gid);
      if (!unit || unit.country_code !== cc) continue;

      if (unitFilter2) {
        if (!hasAncestor(gid, unitFilter2, unitsById)) continue;
      } else if (unitFilter1) {
        if (!hasAncestor(gid, unitFilter1, unitsById)) continue;
      }
      ids.add(p.id);
    }
    return ids;
  }, [props, unitsById, countryCode, unitFilter1, unitFilter2]);

  const ratesByPair = useMemo(() => buildRatesByPair(rateRows), [rateRows]);

  const pricesInGeoFilter = useMemo(
    () => prices.filter((r) => filteredPropertyIds.has(r.property_id)),
    [prices, filteredPropertyIds],
  );

  const { monthly, skippedNoFx, skippedNoM2 } = useMemo(() => {
    const byMonth = new Map<string, { sum: number; n: number }>();
    let skippedNoFx = 0;
    let skippedNoM2 = 0;
    for (const r of prices) {
      if (!filteredPropertyIds.has(r.property_id)) continue;
      const m2 = propM2ById.get(r.property_id);
      if (m2 == null || !(m2 > 0)) {
        skippedNoM2 += 1;
        continue;
      }
      const cc = String(r.currency ?? "")
        .trim()
        .toUpperCase() || "USD";
      let mult: number | null;
      if (cc === "USD") mult = 1;
      else {
        mult = pickUsdMultiplier(cc, r.effective_at, ratesByPair);
        if (mult == null) {
          skippedNoFx += 1;
          continue;
        }
      }
      const amt = Number(r.amount);
      if (!Number.isFinite(amt)) continue;
      const usdPerM2 = (amt * mult) / m2;
      const monthKey = r.effective_at.slice(0, 7);
      if (monthKey.length < 7) continue;
      const cur = byMonth.get(monthKey) ?? { sum: 0, n: 0 };
      cur.sum += usdPerM2;
      cur.n += 1;
      byMonth.set(monthKey, cur);
    }
    const monthly = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, avg: v.n > 0 ? v.sum / v.n : 0, n: v.n }))
      .slice(-36);
    return { monthly, skippedNoFx, skippedNoM2 };
  }, [prices, filteredPropertyIds, ratesByPair, propM2ById]);

  const def1 = depthDefs[0];
  const def2 = depthDefs[1];

  const unit1Choices = tier1Units;
  const unit2Choices = tier2Units;

  const showTier2 = depthDefs.length >= 2;

  return (
    <RequirePermission slug="view_reports">
      <NeoPageShell
        className={
          embedded && !controlTower
            ? "scroll-mt-10 space-y-4 border-t border-[var(--jif-line)] pt-10"
            : embedded && controlTower
              ? "space-y-3"
              : undefined
        }
      >
        {embedded && controlTower ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--jif-line)] pb-2">
            <h2 className="font-neo text-sm font-semibold tracking-tight text-[var(--foreground)]">Precios listado (USD/m²)</h2>
            <Link to="/dashboard/reports/price-geo" className="jif-caps shrink-0 text-[0.6rem] text-[var(--accent)] hover:underline">
              Completo →
            </Link>
          </div>
        ) : embedded ? (
          <div className="mb-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-neo text-xl font-semibold text-[var(--foreground)]">Precios por geografía</h2>
              <p className="jif-caps jif-dim mt-2 max-w-2xl font-normal" style={{ fontSize: "0.65rem" }}>
                Promedio mensual USD/m² (listado público, no archivadas), según país / provincia / partido.
              </p>
            </div>
            <Link
              to="/dashboard/reports/price-geo"
              className="jif-caps shrink-0 text-[0.65rem] text-[var(--accent)] hover:underline"
            >
              Ver pantalla completa →
            </Link>
          </div>
        ) : (
          <>
            <NeoPageHeader
              title="Precios por geografía"
              subtitle="Evolución mensual del precio de listado promedio por m² en USD (propiedades no archivadas), filtrable por maestro geo del país."
            />
            <p className="jif-caps jif-dim mb-6 text-[0.65rem]">
              <Link to="/dashboard/reports/overview" className="text-[var(--accent)] hover:underline">
                ← Overview
              </Link>
            </p>
          </>
        )}

        <NeoCard
          className={
            controlTower && embedded
              ? "max-h-[min(42vh,380px)] overflow-y-auto overscroll-contain p-4"
              : embedded
                ? "max-h-[min(70vh,720px)] overflow-y-auto overscroll-contain p-6"
                : "p-6"
          }
        >
          <div
            className={cn(
              "grid gap-4 sm:grid-cols-2",
              showTier2 ? "lg:grid-cols-3" : "lg:grid-cols-2",
            )}
          >
            <div>
              <label className="jif-caps jif-dim" style={{ fontSize: "0.55rem" }} htmlFor="geo-price-country">
                País
              </label>
              <select
                id="geo-price-country"
                className="neo-field mt-1 w-full"
                value={countryCode}
                onChange={(e) => {
                  if (controlTower) userPickedCountry.current = true;
                  setCountryCode(e.target.value);
                }}
              >
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="jif-caps jif-dim" style={{ fontSize: "0.55rem" }} htmlFor="geo-price-unit1">
                {def1 ? geoLevelLabel(def1) : "Subdivisión 1"}
              </label>
              <select
                id="geo-price-unit1"
                className="neo-field mt-1 w-full"
                value={unitFilter1}
                onChange={(e) => setUnitFilter1(e.target.value)}
                disabled={!countryRootId}
              >
                <option value="">Todas</option>
                {unit1Choices.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {showTier2 ? (
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="jif-caps jif-dim" style={{ fontSize: "0.55rem" }} htmlFor="geo-price-unit2">
                  {def2 ? `${geoLevelLabel(def2)} (opcional)` : "Subdivisión 2"}
                </label>
                <select
                  id="geo-price-unit2"
                  className="neo-field mt-1 w-full"
                  value={unitFilter2}
                  onChange={(e) => setUnitFilter2(e.target.value)}
                  disabled={!unitFilter1}
                >
                  <option value="">Todas</option>
                  {unit2Choices.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {controlTower ? (
            <p className="mt-2 text-[0.65rem] leading-snug text-[var(--muted)]">
              Sin archivar · USD/m² · geo. Superficie: total m² o cubiertos.{" "}
              {skippedNoFx > 0 ? `Sin FX: ${skippedNoFx}. ` : null}
              {skippedNoM2 > 0 ? `Sin m²: ${skippedNoM2}. ` : null}
              <Link to="/dashboard/admin?tab=configuracion" className="text-[var(--accent)] hover:underline">
                Tipos de cambio
              </Link>
            </p>
          ) : (
            <p className="mt-4 text-xs text-[var(--muted)]">
              Cada punto es el promedio mensual de (precio de listado en USD ÷ superficie). Superficie: <strong>total m²</strong> si está cargada;
              si no, <strong>m² cubiertos</strong>. USD directo; otras monedas con pares en Administración · Configuración.               Sin cotización vigente
              para la fecha del precio no entra; sin superficie válida (m²) tampoco.
              {skippedNoFx > 0 ? ` Omitidos por falta de FX: ${skippedNoFx}.` : null}
              {skippedNoM2 > 0 ? ` Omitidos sin m²: ${skippedNoM2}.` : null}{" "}
              <Link to="/dashboard/admin?tab=configuracion" className="text-[var(--accent)] hover:underline">
                Cargar tipos de cambio
              </Link>
              {props.some((x) => !x.geo_unit_id) ? " Propiedades sin ubicación en el maestro geo no entran en el cálculo." : null}
            </p>
          )}

          {monthly.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--muted)]">
              {filteredPropertyIds.size === 0 ? (
                <>
                  No hay propiedades <strong>no archivadas</strong> con ubicación en el maestro geo que coincidan con este país y los filtros
                  elegidos.
                </>
              ) : pricesInGeoFilter.length === 0 ? (
                <>No hay precios de <strong>listado público</strong> cargados para esas propiedades.</>
              ) : skippedNoFx > 0 && skippedNoM2 === 0 ? (
                <>
                  No se pudo convertir ningún precio a USD: falta cotización <strong>vigente</strong> para la moneda y la{" "}
                  <strong>fecha</strong> del precio (cada fila de tipo de cambio aplica desde su «vigente desde» hacia adelante). Revisá{" "}
                  <Link to="/dashboard/admin?tab=configuracion" className="text-[var(--accent)] hover:underline">
                    Tipos de cambio
                  </Link>
                  .
                </>
              ) : skippedNoM2 > 0 && skippedNoFx === 0 ? (
                <>
                  No hay precios con <strong>superficie</strong> cargada (total m² o m² cubiertos) para calcular USD/m². Completá esos datos en
                  las fichas de propiedad.
                </>
              ) : skippedNoFx > 0 && skippedNoM2 > 0 ? (
                <>
                  No quedaron puntos: revisá <strong>tipos de cambio</strong> y que las propiedades tengan <strong>m²</strong> cargados.
                </>
              ) : (
                <>Sin datos para estos filtros.</>
              )}
            </p>
          ) : (
            <div className={controlTower ? "mt-4 w-full min-w-0" : "mt-8 w-full min-w-0"}>
              <MonthlyListingAvgLineChart
                monthly={monthly}
                currency="USD"
                height={controlTower && embedded ? 200 : embedded ? 260 : 300}
                yAxisCaption="USD/m²"
                valueSuffix="/ m²"
                legendLabel="Promedio USD/m²"
                ariaLabel="Evolución mensual del precio de listado promedio por metro cuadrado en USD"
                chartTitle="Precio de listado promedio por m² (USD) por mes"
              />
            </div>
          )}
        </NeoCard>
      </NeoPageShell>
    </RequirePermission>
  );
}
