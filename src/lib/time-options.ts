export type TimeOption = { value: string; label: string };

/** Franjas de 15 minutos (00:00–23:45), mismo criterio que el calendario. */
export const TIME_OPTIONS: TimeOption[] = (() => {
  const out: TimeOption[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      out.push({ value: label, label });
    }
  }
  return out;
})();

export function nearestTimeOption(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return TIME_OPTIONS[0]!.value;
  const totalMin = d.getHours() * 60 + d.getMinutes();
  const rounded = Math.min(Math.max(Math.round(totalMin / 15) * 15, 0), 23 * 60 + 45);
  const hh = Math.floor(rounded / 60);
  const mm = rounded % 60;
  const label = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  if (TIME_OPTIONS.some((o) => o.value === label)) return label;
  let best = TIME_OPTIONS[0]!;
  let bestDiff = Infinity;
  for (const o of TIME_OPTIONS) {
    const [oh, om] = o.value.split(":").map(Number);
    const t = oh * 60 + om;
    const diff = Math.abs(t - totalMin);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = o;
    }
  }
  return best.value;
}
