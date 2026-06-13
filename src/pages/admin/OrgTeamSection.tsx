import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../../components/ui/button";
import { formatUserLabel } from "../../lib/created-by-display";

type MemberRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  is_active: boolean;
  access_group_slug: string;
  linked_person_id: string | null;
  linked_person_name: string | null;
};

const ACCESS_LABEL: Record<string, string> = {
  admins: "Administrador",
  agentes: "Agente",
  consulta: "Consulta",
  "—": "Sin grupo",
};

export function OrgTeamSection() {
  const { user, refreshPermissions } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setMsg(null);
    const { data, error } = await supabase.rpc("list_org_members");
    if (error) {
      setMsg(error.message);
      setMembers([]);
      return;
    }
    setMembers((data as MemberRow[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(m: MemberRow) {
    if (busy || m.user_id === user?.id) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_org_member_active", {
      p_user_id: m.user_id,
      p_is_active: !m.is_active,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      setMsg(m.is_active ? "Usuario desactivado." : "Usuario reactivado.");
      void load();
      void refreshPermissions();
    }
  }

  async function setAccess(m: MemberRow, access: "admin" | "agente" | "consulta") {
    if (busy || m.user_id === user?.id) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_org_member_access", {
      p_user_id: m.user_id,
      p_access: access,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      setMsg("Acceso actualizado.");
      void load();
      void refreshPermissions();
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Equipo</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Usuarios de la inmobiliaria, rol de acceso y ficha agente vinculada. Los agentes solo ven propiedades, personas y
          oportunidades que cargaron ellos.
        </p>
      </div>

      {msg ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--jif-line)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <th className="py-2 pr-3 font-medium">Usuario</th>
              <th className="py-2 pr-3 font-medium">Acceso</th>
              <th className="py-2 pr-3 font-medium">Persona agente</th>
              <th className="py-2 pr-3 font-medium">Estado</th>
              <th className="py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id} className="border-b border-[var(--jif-line)]/70">
                <td className="py-3 pr-3">
                  <span className="font-medium">{formatUserLabel({ id: m.user_id, name: m.name, email: m.email })}</span>
                </td>
                <td className="py-3 pr-3">{ACCESS_LABEL[m.access_group_slug] ?? m.access_group_slug}</td>
                <td className="py-3 pr-3 text-[var(--muted)]">{m.linked_person_name ?? "—"}</td>
                <td className="py-3 pr-3">{m.is_active ? "Activo" : "Inactivo"}</td>
                <td className="py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || m.user_id === user?.id}
                      onClick={() => void toggleActive(m)}
                    >
                      {m.is_active ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || m.user_id === user?.id || m.access_group_slug === "admins"}
                      onClick={() => void setAccess(m, "admin")}
                    >
                      Admin
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || m.user_id === user?.id || m.access_group_slug === "agentes"}
                      onClick={() => void setAccess(m, "agente")}
                    >
                      Agente
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || m.user_id === user?.id || m.access_group_slug === "consulta"}
                      onClick={() => void setAccess(m, "consulta")}
                    >
                      Consulta
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {members.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[var(--muted)]">
                  No hay miembros o no tenés permiso para ver el equipo.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
