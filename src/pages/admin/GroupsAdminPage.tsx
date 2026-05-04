import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { RequirePermission } from "../../components/RequirePermission";

export function GroupsAdminPage() {
  const [rows, setRows] = useState<{ id: string; name: string; slug: string; description: string | null }[]>([]);

  useEffect(() => {
    void supabase
      .from("Group")
      .select("*")
      .order("name")
      .then(({ data }) => setRows((data as typeof rows) ?? []));
  }, []);

  return (
    <RequirePermission slug="manage_groups">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Grupos</h1>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="p-2">Nombre</th>
              <th className="p-2">Slug</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} className="border-b border-[var(--border)]">
                <td className="p-2">{g.name}</td>
                <td className="p-2 font-mono">{g.slug}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RequirePermission>
  );
}
