export function hasPermission(permissions: string[] | undefined, slug: string): boolean {
  return Boolean(permissions?.includes(slug));
}

export function hasAny(permissions: string[] | undefined, slugs: string[]): boolean {
  if (!permissions?.length) return false;
  return slugs.some((s) => permissions.includes(s));
}
