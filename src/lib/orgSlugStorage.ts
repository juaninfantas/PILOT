export const STORAGE_KEY_ORG_SLUG = "pilot_org_slug";

export function getStoredOrgSlug(): string {
  try {
    return (localStorage.getItem(STORAGE_KEY_ORG_SLUG) ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

export function setStoredOrgSlug(slug: string) {
  const s = slug.trim().toLowerCase();
  try {
    if (s) localStorage.setItem(STORAGE_KEY_ORG_SLUG, s);
    else localStorage.removeItem(STORAGE_KEY_ORG_SLUG);
  } catch {
    /* ignore */
  }
}
