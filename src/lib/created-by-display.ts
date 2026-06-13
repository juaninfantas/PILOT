export type UserLabelRow = { id: string; name: string | null; email: string | null };

export function formatUserLabel(u: UserLabelRow | null | undefined): string {
  if (!u) return "—";
  const name = u.name?.trim();
  const email = u.email?.trim();
  if (name && email) return `${name} (${email})`;
  return name || email || u.id.slice(0, 8) + "…";
}

export function userLabelMap(rows: UserLabelRow[]): Map<string, string> {
  return new Map(rows.map((u) => [u.id, formatUserLabel(u)]));
}
