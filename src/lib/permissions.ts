import { LEGACY_PERMISSION_ALIASES } from "./permission-catalog";

export function hasPermission(permissions: string[] | undefined, slug: string): boolean {
  if (!permissions?.length) return false;
  if (permissions.includes(slug)) return true;
  const aliases = LEGACY_PERMISSION_ALIASES[slug];
  if (!aliases?.length) return false;
  return aliases.some((a) => permissions.includes(a));
}

export function hasAny(permissions: string[] | undefined, slugs: string[]): boolean {
  if (!permissions?.length) return false;
  return slugs.some((s) => hasPermission(permissions, s));
}
