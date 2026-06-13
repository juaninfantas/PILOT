import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Modal } from "../../components/ui/modal";
import { formatUserLabel } from "../../lib/created-by-display";
import { InviteSettingsSection } from "../settings/InviteSettingsSection";

type MemberRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  is_active: boolean;
  role_id: string | null;
  role_name: string | null;
  role_slug: string | null;
  linked_person_id: string | null;
  linked_person_name: string | null;
};

type RoleOption = { id: string; name: string; slug: string; is_system: boolean };

export function OrgUsersAdminSection() {
  const { user, refreshPermissions } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editMember, setEditMember] = useState<MemberRow | null>(null);
  const [editRoleId, setEditRoleId] = useState("");

  const load = useCallback(async () => {
    setMsg(null);
    const [{ data: mem, error: mErr }, { data: rol, error: rErr }] = await Promise.all([
      supabase.rpc("list_org_members"),
      supabase.rpc("list_roles_admin"),
    ]);
    if (mErr) {
      setMsg(mErr.message);
      setMembers([]);
    } else {
      setMembers((mem as MemberRow[]) ?? []);
    }
    if (rErr) setMsg((prev) => prev ?? rErr.message);
    else setRoles((rol as RoleOption[]) ?? []);
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

  async function saveMemberRole() {
    if (!editMember || busy || editMember.user_id === user?.id) return;
    if (!editRoleId) {
      setMsg("Elegí un rol.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("set_org_member_role", {
      p_user_id: editMember.user_id,
      p_role_id: editRoleId,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      setMsg("Rol actualizado.");
      setEditMember(null);
      void load();
      void refreshPermissions();
    }
  }

  function openEdit(m: MemberRow) {
    setEditMember(m);
    setEditRoleId(m.role_id ?? "");
    setMsg(null);
  }

  return (
    <RequirePermission slug="manage_users">
      <div className="space-y-12">
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Usuarios del equipo</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Miembros de tu inmobiliaria. Asigná un rol con permisos granulares definidos en Roles y permisos.
            </p>
          </div>

          {msg ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}

          <div className="overflow-x-auto rounded-xl border border-[var(--jif-line)]">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--jif-line)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <th className="py-3 pl-4 pr-3 font-medium">Usuario</th>
                  <th className="py-3 pr-3 font-medium">Rol</th>
                  <th className="py-3 pr-3 font-medium">Persona agente</th>
                  <th className="py-3 pr-3 font-medium">Estado</th>
                  <th className="py-3 pr-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-b border-[var(--jif-line)]/60">
                    <td className="py-3 pl-4 pr-3">
                      <span className="font-medium">{formatUserLabel({ id: m.user_id, name: m.name, email: m.email })}</span>
                    </td>
                    <td className="py-3 pr-3">{m.role_name ?? "—"}</td>
                    <td className="py-3 pr-3 text-[var(--muted)]">{m.linked_person_name ?? "—"}</td>
                    <td className="py-3 pr-3">{m.is_active ? "Activo" : "Inactivo"}</td>
                    <td className="py-3 pr-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy || m.user_id === user?.id}
                          onClick={() => openEdit(m)}
                        >
                          <Pencil className="mr-1 size-3.5" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy || m.user_id === user?.id}
                          onClick={() => void toggleActive(m)}
                        >
                          {m.is_active ? "Desactivar" : "Activar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--muted)]">
                      No hay usuarios en la inmobiliaria.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <InviteSettingsSection />
      </div>

      <Modal open={editMember != null} onClose={() => setEditMember(null)} title="Editar usuario">
        {editMember ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              {formatUserLabel({ id: editMember.user_id, name: editMember.name, email: editMember.email })}
            </p>
            <div>
              <Label htmlFor="member-role">Rol</Label>
              <select
                id="member-role"
                value={editRoleId}
                onChange={(e) => setEditRoleId(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
              >
                <option value="">— Seleccionar rol —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.is_system ? " (Sistema)" : ""}
                  </option>
                ))}
              </select>
            </div>
            {editMember.linked_person_name ? (
              <p className="text-xs text-[var(--muted)]">Persona agente vinculada: {editMember.linked_person_name}</p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditMember(null)}>
                Cancelar
              </Button>
              <Button type="button" variant="neo" disabled={busy} onClick={() => void saveMemberRole()}>
                Guardar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </RequirePermission>
  );
}
