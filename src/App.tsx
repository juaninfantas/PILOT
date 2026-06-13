import { Suspense } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { RequireSession } from "./components/RequireSession";
import { DashboardShell } from "./components/layout/DashboardShell";
import { OrganizationProvider } from "./contexts/OrganizationContext";
import * as Pages from "./routes/lazy-pages";

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4">
      <p className="jif-caps text-[var(--muted)]">Cargando…</p>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Pages.LandingLayout />,
    children: [
      { index: true, element: <Pages.LandingHomePage /> },
      { path: "funcionalidades", element: <Pages.LandingFeaturesPage /> },
      { path: "funcionalidades/ventas-pipeline", element: <Pages.LandingVentasPipelinePage /> },
      { path: "funcionalidades/reportes-y-control", element: <Pages.LandingReportesControlPage /> },
      { path: "integraciones", element: <Pages.LandingIntegrationsPage /> },
      { path: "planes", element: <Pages.LandingPlanesPage /> },
      { path: "nosotros", element: <Pages.LandingNosotrosPage /> },
      { path: "contacto", element: <Pages.LandingContactoPage /> },
    ],
  },
  { path: "/public/property", element: <Pages.PublicPropertySharePage /> },
  { path: "/login", element: <Pages.LoginPage /> },
  { path: "/sign-up", element: <Pages.SignUpPage /> },
  {
    path: "/dashboard",
    element: (
      <RequireSession>
        <OrganizationProvider>
          <DashboardShell />
        </OrganizationProvider>
      </RequireSession>
    ),
    children: [
      { index: true, element: <Pages.DashboardPage /> },
      { path: "properties", element: <Pages.PropertiesPage /> },
      { path: "properties/new", element: <Pages.PropertyNewPage /> },
      { path: "properties/:id", element: <Pages.PropertyDetailPage /> },
      { path: "properties/:id/photos", element: <Pages.PropertyPhotosPage /> },
      { path: "people", element: <Pages.PeoplePage /> },
      { path: "people/new", element: <Pages.PersonNewPage /> },
      { path: "people/:id", element: <Pages.PersonDetailPage /> },
      { path: "opportunities", element: <Pages.OpportunitiesPage /> },
      { path: "opportunities/new", element: <Pages.OpportunityNewPage /> },
      { path: "opportunities/:id", element: <Pages.OpportunityDetailPage /> },
      { path: "funnels", element: <Navigate to="/dashboard/reports/funnels" replace /> },
      { path: "funnels/new", element: <Navigate to="/dashboard/admin?tab=configuracion&newFunnel=1" replace /> },
      { path: "map", element: <Pages.MapPage /> },
      { path: "notes", element: <Pages.NotesPage /> },
      { path: "reports", element: <Pages.ReportsPage /> },
      { path: "reports/overview", element: <Pages.ReportsOverviewPage /> },
      { path: "reports/price-geo", element: <Pages.ReportsPriceGeoPage /> },
      { path: "reports/pipeline", element: <Pages.ReportsPipelinePage /> },
      { path: "reports/funnels", element: <Pages.FunnelsPage /> },
      {
        path: "reports/funnels/new",
        element: <Navigate to="/dashboard/admin?tab=configuracion&newFunnel=1" replace />,
      },
      { path: "reports/final-states", element: <Pages.ReportsFinalStatesPage /> },
      { path: "reports/scoring", element: <Pages.ReportsScoringPage /> },
      { path: "reports/calendar", element: <Pages.CalendarPage /> },
      { path: "settings", element: <Pages.AppSettingsPage /> },
      { path: "planes/pro", element: <Pages.ProPlanPage /> },
      { path: "admin", element: <Pages.AdminSettingsPage /> },
      { path: "admin/users", element: <Navigate to="/dashboard/admin?tab=usuarios#users" replace /> },
      { path: "admin/groups", element: <Navigate to="/dashboard/admin?tab=usuarios#groups" replace /> },
      { path: "admin/roles", element: <Navigate to="/dashboard/admin?tab=usuarios#roles" replace /> },
      { path: "admin/permissions", element: <Navigate to="/dashboard/admin?tab=usuarios#permissions" replace /> },
      { path: "admin/org", element: <Navigate to="/dashboard/admin?tab=general#organization" replace /> },
      // Legacy route kept for compatibility with old links; canonical IA is Maestros > Inmobiliarias.
      { path: "admin/tenants", element: <Navigate to="/dashboard/admin?tab=maestros#maestros-inmobiliarias" replace /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<RouteFallback />}>
        <RouterProvider router={router} />
      </Suspense>
    </AuthProvider>
  );
}
