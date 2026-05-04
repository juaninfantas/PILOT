import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { RequirePermission } from "../../components/RequirePermission";

export function PermissionsAdminPage() {
  const [rows, setRows] = useState<{ id: string; name: string; slug: string }[]>([]);

  useEffect(() => {
    void supabase
      .from("Permission")
      .select("id, name, slug")
      .order("slug")
      .then(({ data }) => setRows((data as typeof rows) ?? []));
  }, []);

  return (
    <RequirePermission slug="manage_roles">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Permisos</h1>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="p-2">Nombre</th>
              <th className="p-2">Slug</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-[var(--border)]">
                <td className="p-2">{p.name}</td>
                <td className="p-2 font-mono">{p.slug}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RequirePermission>
  );
}
