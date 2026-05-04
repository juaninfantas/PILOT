import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";

export function UsersAdminPage() {
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string | null }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data: u } = await supabase.from("User").select("id, name, email").order("email");
    setUsers((u as typeof users) ?? []);
    const { data: g } = await supabase.from("Group").select("id, name, slug").order("name");
    setGroups((g as typeof groups) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function assign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const user_id = String(fd.get("user_id") ?? "");
    const group_id = String(fd.get("group_id") ?? "");
    if (!user_id || !group_id) return;
    const { error } = await supabase.from("UserGroup").insert({ user_id, group_id });
    if (error) setMsg(error.message);
    else {
      setMsg("Usuario asignado al grupo.");
      e.currentTarget.reset();
    }
  }

  return (
    <RequirePermission slug="manage_users">
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        {msg ? <p className="text-[var(--accent)]">{msg}</p> : null}
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="p-2">Email</th>
                <th className="p-2">Nombre</th>
                <th className="p-2 font-mono text-xs">id</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--border)]">
                  <td className="p-2">{u.email}</td>
                  <td className="p-2">{u.name}</td>
                  <td className="p-2 font-mono text-xs">{u.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={assign} className="max-w-md space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-medium">Asignar usuario a grupo</h2>
          <div>
            <Label htmlFor="user_id">Usuario (id)</Label>
            <select id="user_id" name="user_id" required className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm">
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email ?? u.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="group_id">Grupo</Label>
            <select id="group_id" name="group_id" required className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm">
              <option value="">—</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Asignar</Button>
        </form>
      </div>
    </RequirePermission>
  );
}
