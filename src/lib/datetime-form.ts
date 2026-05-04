import { nearestTimeOption } from "./time-options";

export function isoToDateAndTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "09:00" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "09:00" };
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = nearestTimeOption(iso);
  return { date, time };
}

/** Interpreta fecha + hora en zona local y devuelve ISO UTC. */
export function combineLocalDateTime(date: string, time: string): string | null {
  const dStr = date.trim();
  const tStr = (time.trim() || "09:00").slice(0, 5);
  if (!dStr) return null;
  const parsed = new Date(`${dStr}T${tStr}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function todayDateInputValue(): string {
  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
