/** Perfiles sólo definibles desde la ficha propiedad (pestaña Contacto). En Personas no aparecen como seleccionables. */
export const PERSON_PROFILE_PROPERTY_KINDS = [
  "propiedad_dueno",
  "propiedad_familiar",
  "propiedad_tutor",
  "propiedad_martillero",
] as const;

export type PersonProfilePropertySlug = (typeof PERSON_PROFILE_PROPERTY_KINDS)[number];

const PROPERTY_LABELS: Record<PersonProfilePropertySlug, string> = {
  propiedad_dueno: "Dueño/a",
  propiedad_familiar: "Familiar",
  propiedad_tutor: "Tutor/responsable",
  propiedad_martillero: "Inmobiliaria / martillero (propiedad)",
};

const PROPERTY_SLUG_SET = new Set<string>(PERSON_PROFILE_PROPERTY_KINDS);

/** Etiqueta legible para chips y tablas. */
export function formatPersonProfileLabel(p: string) {
  if (!p) return p;
  if (PROPERTY_LABELS[p as PersonProfilePropertySlug]) {
    return PROPERTY_LABELS[p as PersonProfilePropertySlug];
  }
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/** Perfiles disponibles en alta/edición del módulo Personas (no incluye rol de propiedad). */
export const PERSON_PROFILE_OPTIONS = [
  "contacto",
  "cliente",
  "empresa",
  "martillero",
  "tasador",
  "informador",
  "referral",
  "interesado",
] as const;

/** Perfiles que usan el campo empresa (misma UX que «empresa»). */
export function personProfileUsesCompanyField(slug: string): boolean {
  return slug === "empresa" || slug === "martillero" || slug === "propiedad_martillero";
}

export type PersonProfileSlug = (typeof PERSON_PROFILE_OPTIONS)[number];

export function isPropertyLinkedProfileSlug(p: string): p is PersonProfilePropertySlug {
  return PROPERTY_SLUG_SET.has(p);
}
