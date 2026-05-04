import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import type { OrganizationRow, PilotStaffSnapshot } from "../types/organization";
import { useAuth } from "./AuthContext";

const defaultPilotStaff: PilotStaffSnapshot = {
  platformStaff: false,
  impersonating: false,
  impersonationExpiresAt: null,
  impersonationOrganizationId: null,
};

type OrgState = {
  organization: OrganizationRow | null;
  pilotStaff: PilotStaffSnapshot;
  loading: boolean;
  refresh: () => Promise<void>;
};

const OrganizationContext = createContext<OrgState | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [organization, setOrganization] = useState<OrganizationRow | null>(null);
  const [pilotStaff, setPilotStaff] = useState<PilotStaffSnapshot>(defaultPilotStaff);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!session?.user?.id) {
      setOrganization(null);
      setPilotStaff(defaultPilotStaff);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data, error }, staffRes] = await Promise.all([
      supabase.rpc("get_my_organization"),
      supabase.rpc("get_my_staff_context"),
    ]);
    if (staffRes.error) {
      console.warn("get_my_staff_context", staffRes.error);
      setPilotStaff(defaultPilotStaff);
    } else if (Array.isArray(staffRes.data) && staffRes.data[0]) {
      const s = staffRes.data[0];
      setPilotStaff({
        platformStaff: Boolean(s.platform_staff),
        impersonating: Boolean(s.impersonating),
        impersonationExpiresAt: s.impersonation_expires_at ?? null,
        impersonationOrganizationId: s.impersonation_organization_id ?? null,
      });
    } else {
      setPilotStaff(defaultPilotStaff);
    }
    if (error) {
      console.error(error);
      setOrganization(null);
    } else if (Array.isArray(data) && data[0]) {
      const row = data[0] as {
        id: string;
        slug: string;
        display_name: string;
        logo_url: string | null;
        legal_json: string | null;
        fiscal_legal_name?: string | null;
        fiscal_address?: string | null;
        fiscal_cuit?: string | null;
        fiscal_iva_condition?: string | null;
        contact_phone?: string | null;
        broker_matricula?: string | null;
        subscription_tier?: string | null;
        subscription_expires_at?: string | null;
      };
      setOrganization({
        id: row.id,
        slug: row.slug,
        display_name: row.display_name,
        logo_url: row.logo_url,
        legal_json: row.legal_json,
        fiscal_legal_name: row.fiscal_legal_name ?? null,
        fiscal_address: row.fiscal_address ?? null,
        fiscal_cuit: row.fiscal_cuit ?? null,
        fiscal_iva_condition: row.fiscal_iva_condition ?? null,
        contact_phone: row.contact_phone ?? null,
        broker_matricula: row.broker_matricula ?? null,
        subscription_tier: row.subscription_tier === "PRO" ? "PRO" : "FREE",
        subscription_expires_at: row.subscription_expires_at ?? null,
      });
    } else {
      setOrganization(null);
    }
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      organization,
      pilotStaff,
      loading,
      refresh,
    }),
    [organization, pilotStaff, loading, refresh],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) throw new Error("useOrganization dentro de OrganizationProvider");
  return ctx;
}

/** Sólo bajo DashboardShell donde ya cargó membresía. */
export function useActiveOrganization(): OrganizationRow {
  const ctx = useOrganization();
  if (!ctx.organization) {
    throw new Error("Inmobiliaria no disponible todavía");
  }
  return ctx.organization;
}
