import { useEffect, useMemo } from "react";
import { createSearchParams, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { hasAny, hasPermission } from "../../lib/permissions";
import { useAuth } from "../../contexts/AuthContext";
import { useOrganization } from "../../contexts/OrganizationContext";
import { UsersAdminPage } from "./UsersAdminPage";
import { GroupsAdminPage } from "./GroupsAdminPage";
import { RolesAdminPage } from "./RolesAdminPage";
import { PermissionsAdminPage } from "./PermissionsAdminPage";
import { OrganizationBrandSection } from "./OrganizationBrandSection";
import { AdminConfigurationSection } from "./AdminConfigurationSection";
import { AdminMyPilotSection } from "./AdminMyPilotSection";
import { MaestrosSection } from "./MaestrosSection";
import { cn } from "../../lib/utils";

type AdminTab = "general" | "configuracion" | "usuarios" | "mypilot" | "maestros";

const ADMIN_PERMS = ["manage_users", "manage_groups", "manage_roles"] as const;

function isTab(s: string | null): s is AdminTab {
  return (
    s === "general" ||
    s === "mypilot" ||
    s === "configuracion" ||
    s === "usuarios" ||
    s === "maestros"
  );
}

export function AdminSettingsPage() {
  const { permissions } = useAuth();
  const { pilotStaff } = useOrganization();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const location = useLocation();
  const navigate = useNavigate();

  const canPilotTenants = pilotStaff.platformStaff;
  const showGeneral = hasPermission(permissions ?? [], "manage_users");
  const canManageGeo = canPilotTenants || hasPermission(permissions ?? [], "manage_users");
  const canCatalog =
    pilotStaff.platformStaff ||
    hasPermission(permissions ?? [], "manage_users") ||
    hasPermission(permissions ?? [], "manage_properties");
  const showMaestrosTab = canCatalog || canManageGeo || canPilotTenants;
  const canAccessAdmin =
    hasAny(permissions ?? [], [...ADMIN_PERMS]) ||
    canPilotTenants ||
    hasPermission(permissions ?? [], "manage_properties");

  const activeTab: AdminTab = useMemo(() => {
    if (isTab(tabParam)) {
      if (tabParam === "general" && !showGeneral) {
        return canPilotTenants ? "maestros" : "configuracion";
      }
      if (tabParam === "usuarios" && !hasAny(permissions ?? [], ["manage_users", "manage_groups", "manage_roles"])) {
        return canPilotTenants ? "maestros" : "configuracion";
      }
      if (tabParam === "maestros" && !showMaestrosTab) {
        return showGeneral ? "general" : "configuracion";
      }
      return tabParam;
    }
    if (showGeneral) return "general";
    if (canPilotTenants) return "maestros";
    return "configuracion";
  }, [tabParam, showGeneral, canPilotTenants, showMaestrosTab, permissions]);

  useEffect(() => {
    if (tabParam === "geo") {
      if (canManageGeo) {
        navigate(
          {
            pathname: location.pathname,
            search: `?${createSearchParams({ tab: "maestros" }).toString()}`,
            hash: "#maestros-areas-geo",
          },
          { replace: true },
        );
      } else {
        setSearchParams({ tab: showGeneral ? "general" : "configuracion" }, { replace: true });
      }
      return;
    }
    if (tabParam === "tenants") {
      if (canPilotTenants) {
        navigate(
          {
            pathname: location.pathname,
            search: `?${createSearchParams({ tab: "maestros" }).toString()}`,
            hash: "#maestros-tenant",
          },
          { replace: true },
        );
      } else {
        setSearchParams({ tab: showGeneral ? "general" : "configuracion" }, { replace: true });
      }
      return;
    }
    if (!isTab(tabParam)) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [
    tabParam,
    activeTab,
    canManageGeo,
    canPilotTenants,
    showGeneral,
    navigate,
    location.pathname,
    setSearchParams,
  ]);

  useEffect(() => {
    if (tabParam === "general" && !showGeneral) {
      setSearchParams({ tab: canPilotTenants ? "maestros" : "configuracion" }, { replace: true });
    }
  }, [tabParam, showGeneral, canPilotTenants, setSearchParams]);

  useEffect(() => {
    if (tabParam === "maestros" && !showMaestrosTab) {
      setSearchParams({ tab: showGeneral ? "general" : "configuracion" }, { replace: true });
    }
  }, [tabParam, showMaestrosTab, showGeneral, setSearchParams]);

  useEffect(() => {
    const id = location.hash.replace(/^#/, "");
    if (!id) return;
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [activeTab, location.hash]);

  function selectTab(id: AdminTab) {
    if (id === "general" && !showGeneral) return;
    if (id === "maestros" && !showMaestrosTab) return;
    if (id === "usuarios" && !hasAny(permissions ?? [], ["manage_users", "manage_groups", "manage_roles"])) return;
    setSearchParams({ tab: id }, { replace: true });
  }

  if (!canAccessAdmin) {
    return <p className="jif-caps jif-dim">Sin acceso a administración.</p>;
  }

  const tabBtn = (id: AdminTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => selectTab(id)}
      className={cn(
        "jif-caps min-w-[7rem] flex-1 border px-4 py-2.5 text-center text-[0.65rem] font-semibold tracking-[0.14em] transition-colors sm:min-w-0 sm:flex-none",
        activeTab === id
          ? "border-[var(--jif-gold)] bg-[var(--card)] text-[var(--foreground)]"
          : "border-[var(--jif-line)] bg-[var(--card)] text-[var(--muted)] hover:border-[var(--jif-gold)]/45 hover:text-[var(--foreground)]",
      )}
    >
      {label}
    </button>
  );

  const showUsersTab = hasAny(permissions ?? [], ["manage_users", "manage_groups", "manage_roles"]);

  return (
    <div className="flex min-h-0 flex-col gap-8 pb-16">
      <header className="border-b border-[var(--jif-line)] pb-6">
        <h1 className="jif-hero">Administración</h1>
        <p className="jif-caps jif-dim mt-2" style={{ fontSize: "0.65rem" }}>
          Inmobiliaria, funnels, equipo, MyPilot{canPilotTenants ? " y maestros Pilot" : ""}.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Secciones administración">
        {showGeneral ? tabBtn("general", "General") : null}
        {tabBtn("configuracion", "Configuración")}
        {showUsersTab ? tabBtn("usuarios", "Usuarios") : null}
        {tabBtn("mypilot", "MyPilot")}
        {showMaestrosTab ? tabBtn("maestros", "Maestros") : null}
      </nav>

      <div className="min-w-0 flex-1 space-y-10">
        {activeTab === "general" && showGeneral ? <OrganizationBrandSection /> : null}

        {activeTab === "configuracion" ? <AdminConfigurationSection /> : null}

        {activeTab === "usuarios" && showUsersTab ? (
          <div className="space-y-16">
            {hasPermission(permissions, "manage_users") ? (
              <section id="users" className="scroll-mt-6">
                <UsersAdminPage />
              </section>
            ) : null}
            {hasPermission(permissions, "manage_groups") ? (
              <section id="groups" className="scroll-mt-6">
                <GroupsAdminPage />
              </section>
            ) : null}
            {hasPermission(permissions, "manage_roles") ? (
              <>
                <section id="roles" className="scroll-mt-6">
                  <RolesAdminPage />
                </section>
                <section id="permissions" className="scroll-mt-6">
                  <PermissionsAdminPage />
                </section>
              </>
            ) : null}
          </div>
        ) : null}

        {activeTab === "mypilot" ? <AdminMyPilotSection /> : null}

        {activeTab === "maestros" && showMaestrosTab ? (
          <MaestrosSection showMonedas={canCatalog} showGeo={canManageGeo} showTenant={canPilotTenants} />
        ) : null}
      </div>
    </div>
  );
}
