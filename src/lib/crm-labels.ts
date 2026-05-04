import type {
  ActivityType,
  OfferInOpportunityStatus,
  OpportunityCreationMode,
  OpportunityStatus,
  OppPropertyLinkStatus,
  PriceKind,
} from "../types/database";

export const OPPORTUNITY_STATUS_LABEL: Record<OpportunityStatus, string> = {
  OPEN: "Abierta",
  WON: "Ganada",
  LOST: "Perdida",
  ONHOLD: "En pausa",
};

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  CALL: "Llamada",
  VISIT: "Visita",
  NOTE: "Nota",
  REMINDER: "Recordatorio",
};

export function opportunityStatusLabel(s: OpportunityStatus): string {
  return OPPORTUNITY_STATUS_LABEL[s] ?? s;
}

export function activityTypeLabel(t: ActivityType): string {
  return ACTIVITY_TYPE_LABEL[t] ?? t;
}

export const OPPORTUNITY_CREATION_MODE_LABEL: Record<OpportunityCreationMode, string> = {
  MANUAL: "Manual",
  SCORING: "Por scoring",
};

export const OPP_PROPERTY_LINK_STATUS_LABEL: Record<OppPropertyLinkStatus, string> = {
  PROPOSED: "Propuesta",
  POSSIBLE: "Posible",
  INTERESTED: "Interesado",
  DISCARDED: "Descartada",
};

export const OFFER_IN_OPP_STATUS_LABEL: Record<OfferInOpportunityStatus, string> = {
  PROPOSED: "Propuesta",
  ACCEPTED: "Aceptada",
  DISCARDED: "Descartada",
};

export const PRICE_KIND_LABEL: Record<PriceKind, string> = {
  LISTING_PUBLIC: "Precio público",
  LISTING_RESERVED: "Precio reservado",
  OFFER_OPPORTUNITY: "Oferta",
};
