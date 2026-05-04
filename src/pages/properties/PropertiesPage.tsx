import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, LayoutGrid, LayoutList } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useActiveOrganization } from "../../contexts/OrganizationContext";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { PropertiesCsvImport } from "../../components/properties/PropertiesCsvImport";
import { PROPERTY_KIND_LABEL } from "../../lib/property-options";
import { LISTING_STATUS_KEYS, LISTING_STATUS_LABEL } from "../../lib/property-listing-status";
import type { ListingStatus } from "../../types/database";
import { Input } from "../../components/ui/input";
import { cn } from "../../lib/utils";
import type { Database } from "../../types/database";

type Property = Database["public"]["Tables"]["Property"]["Row"];
type FileRowPick = Pick<Database["public"]["Tables"]["PropertyFile"]["Row"], "property_id" | "url" | "kind" | "created_at">;

function coverUrlMapFromFiles(rows: FileRowPick[]): Map<string, string> {
  const byProp = new Map<string, FileRowPick[]>();
  for (const f of rows) {
    if (f.kind !== "cover" && f.kind !== "photo") continue;
    const arr = byProp.get(f.property_id) ?? [];
    arr.push(f);
    byProp.set(f.property_id, arr);
  }
  const out = new Map<string, string>();
  for (const [pid, list] of byProp) {
    const cover = list.find((x) => x.kind === "cover");
    if (cover) {
      out.set(pid, cover.url);
      continue;
    }
    const sorted = [...list]
      .filter((x) => x.kind === "photo")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (sorted[0]) out.set(pid, sorted[0].url);
  }
  return out;
}

export function PropertiesPage() {
  const org = useActiveOrganization();
  const { permissions } = useAuth();
  const canManage = hasPermission(permissions, "manage_properties");
  const [rows, setRows] = useState<Property[]>([]);
  const [coverUrls, setCoverUrls] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "grid">("grid");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("ALL");
  const [listingFilter, setListingFilter] = useState<string>("ALL");

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setActionError(null);
    void (async () => {
      const { data, error: e } = await supabase.from("Property").select("*").order("created_at", { ascending: false });
      if (e) {
        setError(e.message);
        setRows([]);
        setCoverUrls(new Map());
        setLoading(false);
        return;
      }
      const list = (data as Property[]) ?? [];
      setRows(list);
      const ids = list.map((p) => p.id);
      let map = new Map<string, string>();
      if (ids.length > 0) {
        const { data: files, error: fe } = await supabase
          .from("PropertyFile")
          .select("property_id, url, kind, created_at")
          .in("property_id", ids)
          .in("kind", ["cover", "photo"]);
        if (!fe && files?.length) {
          map = coverUrlMapFromFiles(files as FileRowPick[]);
        }
      }
      setCoverUrls(map);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    void import("./PropertyDetailPage");
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      const matchesQ =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.city_zone.toLowerCase().includes(q) ||
        (p.address ?? "").toLowerCase().includes(q);
      const matchesKind = kindFilter === "ALL" || p.kind === kindFilter;
      const ls = p.listing_status ?? "AVAILABLE";
      const matchesListing = listingFilter === "ALL" || ls === listingFilter;
      return matchesQ && matchesKind && matchesListing;
    });
  }, [rows, query, kindFilter, listingFilter]);

  function resetFilters() {
    setQuery("");
    setKindFilter("ALL");
    setListingFilter("ALL");
  }

  return (
    <RequirePermission slug="view_properties">
      <div className="jif-page space-y-8">
        <header className="border-b border-[var(--jif-line)] pb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="jif-hero">Propiedades</h1>
              <p className="jif-caps jif-dim mt-1">
                Cartera y objetos comerciales; buscá, filtrá por tipo y estado de listado o importá desde CSV.
              </p>
            </div>
            {canManage ? (
              <Link to="/dashboard/properties/new">
                <Button type="button" className="jif-btn-primary">
                  Nueva propiedad
                </Button>
              </Link>
            ) : null}
          </div>
        </header>
        {loading ? <p className="jif-caps jif-dim">Cargando…</p> : null}
        {error ? <p className="text-red-400">{error}</p> : null}
        {actionError ? <p className="border border-amber-600/50 bg-amber-50 px-3 py-2 text-amber-900">{actionError}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-lg border border-[var(--jif-line)]/80 bg-[#fffcf7]/90 p-0.5"
            role="group"
            aria-label="Vista"
          >
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cn(
                "rounded-md px-3 py-1.5 text-[var(--muted)] transition-colors hover:text-[var(--foreground)]",
                view === "grid" && "bg-[var(--card)] text-[var(--foreground)]",
              )}
              title="Cuadrícula"
              aria-label="Vista cuadrícula"
              aria-pressed={view === "grid"}
            >
              <LayoutGrid className="size-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "rounded-md px-3 py-1.5 text-[var(--muted)] transition-colors hover:text-[var(--foreground)]",
                view === "list" && "bg-[var(--card)] text-[var(--foreground)]",
              )}
              title="Lista"
              aria-label="Vista lista"
              aria-pressed={view === "list"}
            >
              <LayoutList className="size-4" strokeWidth={1.75} />
            </button>
          </div>
          <Input
            placeholder="Buscar por título, zona o dirección..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-md"
          />
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="h-10 rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
          >
            <option value="ALL">Todos los tipos</option>
            {Object.entries(PROPERTY_KIND_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={listingFilter}
            onChange={(e) => setListingFilter(e.target.value)}
            className="h-10 rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
            aria-label="Filtrar por estado comercial"
          >
            <option value="ALL">Todos los estados</option>
            {LISTING_STATUS_KEYS.map((key) => (
              <option key={key} value={key}>
                {LISTING_STATUS_LABEL[key]}
              </option>
            ))}
          </select>
          {canManage ? <PropertiesCsvImport organizationId={org.id} onDone={reload} /> : null}
        </div>
        {!loading && !error && rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--jif-line)]/50 bg-transparent px-6 py-14 text-center">
            <p className="text-lg font-medium text-[var(--foreground)]">Todavía no hay propiedades</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Cuando cargues operaciones, las vas a ver acá con portada y título.</p>
            {canManage ? (
              <Link to="/dashboard/properties/new" className="mt-6 inline-block">
                <Button type="button">Cargar la primera propiedad</Button>
              </Link>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && rows.length > 0 && filteredRows.length === 0 ? (
          <div className="rounded-lg border border-[var(--jif-line)]/40 bg-transparent px-6 py-12 text-center">
            <p className="font-medium text-[var(--foreground)]">Ningún resultado con este filtro</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Probá otra búsqueda o cambiá el tipo de operación ({rows.length}{" "}
              {rows.length === 1 ? "propiedad en cartera" : "propiedades en cartera"}).
            </p>
            <Button type="button" variant="secondary" className="mt-6" onClick={resetFilters}>
              Limpiar filtros
            </Button>
          </div>
        ) : null}

        {!loading && !error && filteredRows.length > 0 ? (
          view === "list" ? (
            <div className="overflow-x-auto">
              <table className="jif-table w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="jif-caps jif-dim border-b border-[var(--jif-line)]">
                    <th className="w-14 py-3 pl-4 pr-2 font-medium sm:pl-5" aria-hidden />
                    <th className="py-3 pr-4 font-medium">Título</th>
                    <th className="py-3 pr-4 font-medium">Zona</th>
                    <th className="py-3 pr-4 font-medium">Tipo</th>
                    <th className="py-3 pr-4 font-medium">Estado</th>
                    <th className="w-20 py-3 text-right font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((p) => {
                    const thumb = coverUrls.get(p.id);
                    return (
                      <tr key={p.id} className="border-b border-[var(--jif-line)]/60">
                        <td className="py-3 pl-4 pr-2 sm:pl-5">
                          {thumb ? (
                            <Link
                              to={`/dashboard/properties/${p.id}`}
                              className="block size-11 shrink-0 overflow-hidden rounded-md bg-[#ede8df]/80 ring-1 ring-[var(--jif-line)]/25"
                            >
                              <img src={thumb} alt="" className="size-full object-cover" />
                            </Link>
                          ) : (
                            <div
                              className="size-11 rounded-md bg-[#ede8df]/50 ring-1 ring-dashed ring-[var(--jif-line)]/35"
                              title="Sin foto"
                            />
                          )}
                        </td>
                        <td className="py-3 pr-4 font-medium text-[var(--foreground)]">{p.title}</td>
                        <td className="py-3 pr-4 text-[var(--muted)]">{p.city_zone}</td>
                        <td className="py-3 pr-4 text-sm text-[var(--muted)]">{PROPERTY_KIND_LABEL[p.kind]}</td>
                        <td className="py-3 pr-4 text-sm text-[var(--jif-gold)]">
                          {LISTING_STATUS_LABEL[(p.listing_status ?? "AVAILABLE") as ListingStatus]}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              to={`/dashboard/properties/${p.id}`}
                              className="inline-flex size-9 items-center justify-center text-[var(--jif-gold)] transition-colors hover:bg-stone-900/5 hover:text-[var(--foreground)]"
                              title="Ver ficha"
                              aria-label="Ver ficha"
                            >
                              <Eye className="size-4" strokeWidth={1.75} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-x-6 gap-y-8 px-0.5 sm:grid-cols-2 sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
              {filteredRows.map((p) => {
                const thumb = coverUrls.get(p.id);
                return (
                  <article key={p.id} className="group">
                    <Link
                      to={`/dashboard/properties/${p.id}`}
                      className="block overflow-hidden rounded-lg bg-[#ede8df]/60 ring-1 ring-[var(--jif-line)]/20 transition-[box-shadow,ring-color] hover:ring-[var(--jif-line)]/45"
                    >
                      <div className="relative aspect-square w-full overflow-hidden bg-[#e8e2d8]/90">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center text-xs text-[var(--muted)]">
                            Sin foto
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="mt-2.5 space-y-0.5 px-0.5">
                      <Link
                        to={`/dashboard/properties/${p.id}`}
                        className="block truncate font-medium leading-snug text-[var(--foreground)] hover:text-[var(--jif-gold)]"
                      >
                        {p.title}
                      </Link>
                      <p className="truncate text-xs text-[var(--muted)]">{p.city_zone}</p>
                      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-[var(--jif-gold)]">
                        {LISTING_STATUS_LABEL[(p.listing_status ?? "AVAILABLE") as ListingStatus]}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : null}
      </div>
    </RequirePermission>
  );
}
