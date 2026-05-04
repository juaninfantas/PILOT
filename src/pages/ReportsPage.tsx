import { RequirePermission } from "../components/RequirePermission";
import { Navigate } from "react-router-dom";

export function ReportsPage() {
  return (
    <RequirePermission slug="view_reports">
      <Navigate to="/dashboard/reports/overview" replace />
    </RequirePermission>
  );
}
