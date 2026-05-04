import { Link } from "react-router-dom";
import { hasAny } from "../../lib/permissions";
import { useAuth } from "../../contexts/AuthContext";
import { Card } from "../../components/ui/card";

export function AdminHomePage() {
  const { permissions } = useAuth();
  if (!hasAny(permissions, ["manage_users", "manage_groups", "manage_roles"])) {
    return <p className="text-[var(--muted)]">Sin acceso a administración.</p>;
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Administración</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/dashboard/admin/users">
          <Card className="hover:border-[var(--accent)]">Usuarios y grupos</Card>
        </Link>
        <Link to="/dashboard/admin/groups">
          <Card className="hover:border-[var(--accent)]">Grupos</Card>
        </Link>
        <Link to="/dashboard/admin/roles">
          <Card className="hover:border-[var(--accent)]">Roles</Card>
        </Link>
        <Link to="/dashboard/admin/permissions">
          <Card className="hover:border-[var(--accent)]">Permisos</Card>
        </Link>
      </div>
    </div>
  );
}
