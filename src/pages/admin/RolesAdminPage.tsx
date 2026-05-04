import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { RequirePermission } from "../../components/RequirePermission";

export function RolesAdminPage() {
  const [rows, setRows] = useState<{ id: string; name: string; slug: string }[]>([]);

  useEffect(() => {
    void supabase
      .from("Role")
      .select("id, name, slug")
      .order("name")
      .then(({ data }) => setRows((data as typeof rows) ?? []));
  }, []);

  return (
    <RequirePermission slug="manage_roles">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Roles</h1>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="p-2">Nombre</th>
              <th className="p-2">Slug</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--border)]">
                <td className="p-2">{r.name}</td>
                <td className="p-2 font-mono">{r.slug}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RequirePermission>
  );
}
