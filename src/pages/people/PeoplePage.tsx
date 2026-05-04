import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
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
  const [rows, setRows] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [profilesByPerson, setProfilesByPerson] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState("");
  const [profileFilter, setProfileFilter] = useState("ALL");

  useEffect(() => {
    void (async () => {
      const [{ data: people }, { data: profs }] = await Promise.all([
        supabase.from("Person").select("*").order("name"),
        supabase.from("PersonProfile").select("person_id, profile"),
      ]);
      setRows((people as Person[]) ?? []);
      const map: Record<string, string[]> = {};
      for (const item of (profs as { person_id: string; profile: string }[]) ?? []) {
        if (!map[item.person_id]) map[item.person_id] = [];
        map[item.person_id].push(item.profile);
      }
      setProfilesByPerson(map);
      setLoading(false);
    })();
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
                <th className="w-20 py-3 text-right font-medium">
                  <span className="sr-only">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((p) => (
                <tr key={p.id} className="border-b border-[var(--jif-line)]/60">
                  <td className="py-3 pl-4 pr-4 font-medium text-[var(--foreground)] sm:pl-5">{p.name}</td>
                  <td className="py-3 pr-4 text-[var(--muted)]">{p.email ?? "—"}</td>
                  <td className="py-3 pr-4 text-[var(--muted)]">{p.phone ?? "—"}</td>
                  <td className="py-3 pr-4 text-sm text-[var(--muted)]">
                    {(profilesByPerson[p.id] ?? []).map(formatPersonProfileLabel).join(", ") || "—"}
                  </td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </RequirePermission>
  );
}
