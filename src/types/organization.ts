export type SubscriptionTier = "FREE" | "PRO";

/** Equipo Pilot / impersonación de otra inmobiliaria (RPC get_my_staff_context). */
export type PilotStaffSnapshot = {
  platformStaff: boolean;
  impersonating: boolean;
  impersonationExpiresAt: string | null;
  impersonationOrganizationId: string | null;
};

export type OrganizationRow = {
  id: string;
  slug: string;
  display_name: string;
  logo_url: string | null;
  /** Legado; ya no se edita desde la UI */
  legal_json: string | null;
  fiscal_legal_name: string | null;
  fiscal_address: string | null;
  fiscal_cuit: string | null;
  fiscal_iva_condition: string | null;
  contact_phone: string | null;
  broker_matricula: string | null;
  subscription_tier: SubscriptionTier;
  subscription_expires_at: string | null;
};
