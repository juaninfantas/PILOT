/** Catálogo UI de permisos granulares (sincronizado con migración SQL). */
export type PermissionAction = "view" | "create" | "update" | "delete";

export type PermissionResourceDef = {
  resource: string;
  label: string;
  description?: string;
  actions: PermissionAction[];
};

export type PermissionModuleDef = {
  module: string;
  label: string;
  resources: PermissionResourceDef[];
};

export const PERMISSION_ACTION_LABEL: Record<PermissionAction, string> = {
  view: "Ver",
  create: "Crear",
  update: "Modificar",
  delete: "Eliminar",
};

export const PERMISSION_MODULES: PermissionModuleDef[] = [
  {
    module: "general",
    label: "General",
    resources: [
      { resource: "dashboard", label: "Inicio / Control Tower", actions: ["view"] },
      { resource: "reports", label: "Reportes y KPIs", actions: ["view"] },
      { resource: "notes", label: "MyPilot / notas", actions: ["view", "create", "update", "delete"] },
    ],
  },
  {
    module: "crm",
    label: "CRM",
    resources: [
      {
        resource: "properties",
        label: "Propiedades",
        description: "Cartera, fichas, precios y archivos",
        actions: ["view", "create", "update", "delete"],
      },
      {
        resource: "people",
        label: "Personas",
        description: "Contactos, perfiles y preferencias",
        actions: ["view", "create", "update", "delete"],
      },
      {
        resource: "opportunities",
        label: "Oportunidades",
        description: "Pipeline, actividades y matching",
        actions: ["view", "create", "update", "delete"],
      },
      {
        resource: "funnels",
        label: "Funnels",
        description: "Etapas del pipeline comercial",
        actions: ["view", "create", "update", "delete"],
      },
      {
        resource: "calendar",
        label: "Calendario",
        actions: ["view", "create", "update", "delete"],
      },
    ],
  },
  {
    module: "admin",
    label: "Administración",
    resources: [
      {
        resource: "organization",
        label: "Inmobiliaria / marca",
        actions: ["view", "update"],
      },
      {
        resource: "users",
        label: "Usuarios del equipo",
        actions: ["view", "create", "update", "delete"],
      },
      {
        resource: "roles",
        label: "Roles y permisos",
        actions: ["view", "create", "update", "delete"],
      },
      {
        resource: "invites",
        label: "Invitaciones",
        actions: ["view", "create", "update", "delete"],
      },
      {
        resource: "exchange_rates",
        label: "Tipos de cambio",
        actions: ["view", "create", "update", "delete"],
      },
      {
        resource: "share_formats",
        label: "Formatos de share",
        actions: ["view", "create", "update", "delete"],
      },
    ],
  },
];

export function permissionSlug(resource: string, action: PermissionAction): string {
  return `${resource}.${action}`;
}

export function allCatalogSlugs(): string[] {
  const out: string[] = [];
  for (const mod of PERMISSION_MODULES) {
    for (const res of mod.resources) {
      for (const act of res.actions) {
        out.push(permissionSlug(res.resource, act));
      }
    }
  }
  return out;
}

/** Slugs legacy que sigue usando la app; se resuelven vía permisos granulares en has_permission. */
export const LEGACY_PERMISSION_ALIASES: Record<string, string[]> = {
  view_dashboard: ["dashboard.view"],
  view_reports: ["reports.view"],
  view_properties: ["properties.view"],
  manage_properties: ["properties.create", "properties.update", "properties.delete"],
  view_people: ["people.view"],
  manage_people: ["people.create", "people.update", "people.delete"],
  view_opportunities: ["opportunities.view"],
  manage_opportunities: ["opportunities.create", "opportunities.update", "opportunities.delete"],
  view_funnels: ["funnels.view"],
  manage_funnels: ["funnels.create", "funnels.update", "funnels.delete"],
  view_calendar: ["calendar.view"],
  manage_calendar: ["calendar.create", "calendar.update", "calendar.delete"],
  view_notes: ["notes.view"],
  manage_notes: ["notes.create", "notes.update", "notes.delete"],
  manage_users: ["users.view", "users.create", "users.update", "users.delete"],
  manage_groups: ["roles.view", "roles.update"],
  manage_roles: ["roles.view", "roles.create", "roles.update", "roles.delete"],
};
