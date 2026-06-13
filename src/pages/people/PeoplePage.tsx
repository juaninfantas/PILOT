import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { userLabelMap, type UserLabelRow } from "../../lib/created-by-display";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Eye } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Database } from "../../types/database";
import {
  formatPersonProfileLabel,
  PERSON_PROFILE_OPTIONS,
  PERSON_PROFILE_PROPERTY_KINDS,
} from "../../lib/person-profiles";

type Person = Database["public"]["Tables"]["Person"]["Row"];

export function PeoplePage() {
  const { permissions } = useAuth();
  const canManage = hasPermission(permissions, "manage_people");
  const canSeeAuthors = hasPermission(permissions, "manage_users");
  const [rows, setRows] = useState<Person[]>([]);
  const [authorLabels, setAuthorLabels] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profilesByPerson, setProfilesByPerson] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState("");
  const [profileFilter, setProfileFilter] = useState("ALL");

  async function loadPeople() {
    setLoading(true);
    setLoadError(null);
    const [{ data: people, error: peopleErr }, { data: profs, error: profileErr }] = await Promise.all([
      supabase.from("Person").select("*").order("name"),
      supabase.from("PersonProfile").select("person_id, profile"),
    ]);
    if (peopleErr || profileErr) {
      setRows([]);
      setProfilesByPerson({});
      setLoadError(peopleErr?.message ?? profileErr?.message ?? "No se pudieron cargar las personas.");
      setLoading(false);
      return;
    }
    setRows((people as Person[]) ?? []);
    if (canSeeAuthors) {
      const authorIds = [...new Set(((people as Person[]) ?? []).map((p) => p.created_by_id).filter(Boolean))] as string[];
      if (authorIds.length > 0) {
        const { data: users } = await supabase.from("User").select("id, name, email").in("id", authorIds);
        setAuthorLabels(userLabelMap((users as UserLabelRow[]) ?? []));
      } else {
        setAuthorLabels(new Map());
      }
    }
    const map: Record<string, string[]> = {};
    for (const item of (profs as { person_id: string; profile: string }[]) ?? []) {
      if (!map[item.person_id]) map[item.person_id] = [];
      map[item.person_id].push(item.profile);
    }
    setProfilesByPerson(map);
    setLoading(false);
  }

  useEffect(() => {
    void loadPeople();
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      const profiles = profilesByPerson[p.id] ?? [];
      const matchesQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").toLowerCase().includes(q) ||
        (p.company ?? "").toLowerCase().includes(q) ||
        (p.address_line ?? "").toLowerCase().includes(q) ||
        (p.tax_id ?? "").toLowerCase().includes(q) ||
        (p.trade_name ?? "").toLowerCase().includes(q) ||
        (p.notes ?? "").toLowerCase().includes(q);
      const matchesProfile = profileFilter === "ALL" || profiles.includes(profileFilter);
      return matchesQ && matchesProfile;
    });
  }, [rows, profilesByPerson, query, profileFilter]);

  return (
    <RequirePermission slug="view_people">
      <div className="jif-page space-y-8">
        <header className="border-b border-[var(--jif-line)] pb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="jif-hero">Personas</h1>
              <p className="jif-caps jif-dim mt-1">
                Contactos y clientes con perfiles; desde acá enlazás a fichas y oportunidades.
              </p>
            </div>
            {canManage ? (
              <Link to="/dashboard/people/new">
                <Button type="button" className="jif-btn-primary">
                  Nueva persona
                </Button>
              </Link>
            ) : null}
          </div>
        </header>
        {loadError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
            <p>{loadError}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadPeople()}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {loading ? <p className="jif-caps jif-dim">Cargando…</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Buscar por nombre, email, teléfono, empresa, dirección, DNI/CUIT, fantasía o notas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xl min-w-[240px] flex-1"
          />
          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            className="h-10 rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
            aria-label="Filtrar por perfil"
          >
            <option value="ALL">Todos los perfiles</option>
            {PERSON_PROFILE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {formatPersonProfileLabel(p)}
              </option>
            ))}
            {PERSON_PROFILE_PROPERTY_KINDS.map((p) => (
              <option key={p} value={p}>
                {formatPersonProfileLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="jif-table w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="jif-caps jif-dim border-b border-[var(--jif-line)]">
                <th className="py-3 pl-4 pr-4 font-medium sm:pl-5">Nombre</th>
                <th className="py-3 pr-4 font-medium">Email</th>
                <th className="py-3 pr-4 font-medium">Teléfono</th>
                <th className="py-3 pr-4 font-medium">Perfiles</th>
                {canSeeAuthors ? <th className="py-3 pr-4 font-medium">Cargado por</th> : null}
                <th className="w-20 py-3 text-right font-medium">
                  <span className="sr-only">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={canSeeAuthors ? 6 : 5} className="px-4 py-6 text-center text-sm text-[var(--muted)] sm:px-5">
                    {rows.length === 0
                      ? "Todavía no hay personas cargadas."
                      : "No hay personas que coincidan con los filtros actuales."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--jif-line)]/60">
                    <td className="py-3 pl-4 pr-4 font-medium text-[var(--foreground)] sm:pl-5">{p.name}</td>
                    <td className="py-3 pr-4 text-[var(--muted)]">{p.email ?? "—"}</td>
                    <td className="py-3 pr-4 text-[var(--muted)]">{p.phone ?? "—"}</td>
                    <td className="py-3 pr-4 text-sm text-[var(--muted)]">
                      {(profilesByPerson[p.id] ?? []).map(formatPersonProfileLabel).join(", ") || "—"}
                    </td>
                    {canSeeAuthors ? (
                      <td className="py-3 pr-4 text-sm text-[var(--muted)]">
                        {p.created_by_id ? (authorLabels.get(p.created_by_id) ?? "—") : "—"}
                      </td>
                    ) : null}
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/dashboard/people/${p.id}`}
                          className={cn(
                            "inline-flex size-9 items-center justify-center text-[var(--jif-gold)] transition-colors",
                            "hover:bg-stone-900/5 hover:text-[var(--foreground)]",
                          )}
                          aria-label="Ver ficha"
                          title="Ver ficha"
                        >
                          <Eye className="size-4" strokeWidth={1.75} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </RequirePermission>
  );
}
