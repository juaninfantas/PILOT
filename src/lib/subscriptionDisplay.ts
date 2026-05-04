export function tierLabel(tier: string): string {
  return tier === "PRO" ? "Pro" : "Free";
}

export function formatExpiryLabel(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "Nunca";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Nunca";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
