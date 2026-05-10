import { lazy } from "react";

/** Rutas cargadas bajo demanda para reducir el chunk inicial de Vite. */
export const PublicPropertySharePage = lazy(() =>
  import("../pages/public/PublicPropertySharePage").then((m) => ({ default: m.PublicPropertySharePage })),
);
export const LoginPage = lazy(() => import("../pages/LoginPage").then((m) => ({ default: m.LoginPage })));
export const SignUpPage = lazy(() => import("../pages/SignUpPage").then((m) => ({ default: m.SignUpPage })));

export const LandingLayout = lazy(() =>
  import("../components/landing/LandingLayout").then((m) => ({ default: m.LandingLayout })),
);
export const LandingHomePage = lazy(() =>
  import("../pages/landing/LandingHomePage").then((m) => ({ default: m.LandingHomePage })),
);
export const LandingFeaturesPage = lazy(() =>
  import("../pages/landing/LandingFeaturesPage").then((m) => ({ default: m.LandingFeaturesPage })),
);
export const LandingVentasPipelinePage = lazy(() =>
  import("../pages/landing/LandingVentasPipelinePage").then((m) => ({ default: m.LandingVentasPipelinePage })),
);
export const LandingReportesControlPage = lazy(() =>
  import("../pages/landing/LandingReportesControlPage").then((m) => ({ default: m.LandingReportesControlPage })),
);
export const LandingIntegrationsPage = lazy(() =>
  import("../pages/landing/LandingIntegrationsPage").then((m) => ({ default: m.LandingIntegrationsPage })),
);
export const LandingPlanesPage = lazy(() =>
  import("../pages/landing/LandingPlanesPage").then((m) => ({ default: m.LandingPlanesPage })),
);
export const LandingNosotrosPage = lazy(() =>
  import("../pages/landing/LandingNosotrosPage").then((m) => ({ default: m.LandingNosotrosPage })),
);
export const LandingContactoPage = lazy(() =>
  import("../pages/landing/LandingContactoPage").then((m) => ({ default: m.LandingContactoPage })),
);

export const DashboardPage = lazy(() => import("../pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
export const PropertiesPage = lazy(() =>
  import("../pages/properties/PropertiesPage").then((m) => ({ default: m.PropertiesPage })),
);
export const PropertyNewPage = lazy(() =>
  import("../pages/properties/PropertyNewPage").then((m) => ({ default: m.PropertyNewPage })),
);
export const PropertyDetailPage = lazy(() =>
  import("../pages/properties/PropertyDetailPage").then((m) => ({ default: m.PropertyDetailPage })),
);
export const PropertyPhotosPage = lazy(() =>
  import("../pages/properties/PropertyPhotosPage").then((m) => ({ default: m.PropertyPhotosPage })),
);
export const PeoplePage = lazy(() => import("../pages/people/PeoplePage").then((m) => ({ default: m.PeoplePage })));
export const PersonNewPage = lazy(() =>
  import("../pages/people/PersonNewPage").then((m) => ({ default: m.PersonNewPage })),
);
export const PersonDetailPage = lazy(() =>
  import("../pages/people/PersonDetailPage").then((m) => ({ default: m.PersonDetailPage })),
);
export const OpportunitiesPage = lazy(() =>
  import("../pages/opportunities/OpportunitiesPage").then((m) => ({ default: m.OpportunitiesPage })),
);
export const OpportunityNewPage = lazy(() =>
  import("../pages/opportunities/OpportunityNewPage").then((m) => ({ default: m.OpportunityNewPage })),
);
export const OpportunityDetailPage = lazy(() =>
  import("../pages/opportunities/OpportunityDetailPage").then((m) => ({ default: m.OpportunityDetailPage })),
);
export const FunnelsPage = lazy(() => import("../pages/funnels/FunnelsPage").then((m) => ({ default: m.FunnelsPage })));
export const MapPage = lazy(() => import("../pages/MapPage").then((m) => ({ default: m.MapPage })));
export const NotesPage = lazy(() => import("../pages/NotesPage").then((m) => ({ default: m.NotesPage })));
export const ReportsPage = lazy(() => import("../pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
export const ReportsOverviewPage = lazy(() =>
  import("../pages/reports/ReportsOverviewPage").then((m) => ({ default: m.ReportsOverviewPage })),
);
export const ReportsPriceGeoPage = lazy(() =>
  import("../pages/reports/ReportsPriceGeoPage").then((m) => ({ default: m.ReportsPriceGeoPage })),
);
export const ReportsPipelinePage = lazy(() =>
  import("../pages/reports/ReportsPipelinePage").then((m) => ({ default: m.ReportsPipelinePage })),
);
export const ReportsFinalStatesPage = lazy(() =>
  import("../pages/reports/ReportsFinalStatesPage").then((m) => ({ default: m.ReportsFinalStatesPage })),
);
export const ReportsScoringPage = lazy(() =>
  import("../pages/reports/ReportsScoringPage").then((m) => ({ default: m.ReportsScoringPage })),
);
export const CalendarPage = lazy(() =>
  import("../pages/reports/CalendarPage").then((m) => ({ default: m.CalendarPage })),
);
export const AppSettingsPage = lazy(() =>
  import("../pages/settings/AppSettingsPage").then((m) => ({ default: m.AppSettingsPage })),
);
export const ProPlanPage = lazy(() => import("../pages/settings/ProPlanPage").then((m) => ({ default: m.ProPlanPage })));
export const AdminSettingsPage = lazy(() =>
  import("../pages/admin/AdminSettingsPage").then((m) => ({ default: m.AdminSettingsPage })),
);
