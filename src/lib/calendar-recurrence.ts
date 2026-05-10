import dayjs from "dayjs";

export type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval?: number;
  /** 0 = domingo … 6 = sábado (Date.getDay) */
  byweekday?: number[];
  /** yyyy-mm-dd inclusive */
  until?: string | null;
  /** Ocurrencias omitidas (mismo epoch ms que en instanceId `${id}::${ms}`). */
  exclude_occurrence_starts_ms?: number[];
}

const MAX_OCCURRENCES = 400;

function durationMs(baseStart: dayjs.Dayjs, baseEnd: dayjs.Dayjs): number {
  const d = baseEnd.diff(baseStart);
  return Math.max(60_000, d);
}

/** Si el ítem viene de una instancia expandida, devuelve el epoch ms del inicio (`id` = `{uuid}::{ms}`). */
export function extractOccurrenceStartMsFromInstanceId(calendarItemId: string): number | null {
  const sep = calendarItemId.indexOf("::");
  if (sep === -1) return null;
  const n = Number(calendarItemId.slice(sep + 2));
  return Number.isFinite(n) ? n : null;
}

export function parseRecurrenceRule(raw: unknown): RecurrenceRule | null {
  if (raw == null) return null;
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const f = o.frequency;
  if (f !== "DAILY" && f !== "WEEKLY" && f !== "MONTHLY" && f !== "YEARLY") return null;
  const interval = typeof o.interval === "number" && o.interval >= 1 ? Math.floor(o.interval) : 1;
  let byweekday: number[] | undefined;
  if (Array.isArray(o.byweekday)) {
    byweekday = o.byweekday.filter((x): x is number => typeof x === "number" && x >= 0 && x <= 6);
    if (byweekday.length === 0) byweekday = undefined;
  }
  const until = typeof o.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.until) ? o.until : null;
  let exclude_occurrence_starts_ms: number[] | undefined;
  if (Array.isArray(o.exclude_occurrence_starts_ms)) {
    const xs = o.exclude_occurrence_starts_ms.filter(
      (x): x is number => typeof x === "number" && Number.isFinite(x),
    );
    if (xs.length > 0) exclude_occurrence_starts_ms = [...new Set(xs)];
  }
  return { frequency: f, interval, byweekday, until, exclude_occurrence_starts_ms };
}

export type ExpandedInstance = { instanceId: string; start: Date; end: Date };

function untilDayjs(rule: RecurrenceRule): dayjs.Dayjs | null {
  return rule.until ? dayjs(rule.until).endOf("day") : null;
}

/**
 * Devuelve instancias visibles en [rangeStart, rangeEnd] para un evento guardado (una fila).
 */
export function expandCalendarEventInstances(
  row: {
    id: string;
    starts_at: string;
    ends_at: string | null;
    recurrence_rule: unknown;
  },
  rangeStart: Date,
  rangeEnd: Date,
): ExpandedInstance[] {
  const rule = parseRecurrenceRule(row.recurrence_rule);
  const baseStart = dayjs(row.starts_at);
  const baseEnd = row.ends_at ? dayjs(row.ends_at) : baseStart.add(30, "minute");
  const dur = durationMs(baseStart, baseEnd);

  const rs = dayjs(rangeStart).startOf("day");
  const re = dayjs(rangeEnd).endOf("day");

  if (!rule) {
    const occEnd = baseStart.add(dur, "millisecond");
    if (occEnd.isBefore(rs) || baseStart.isAfter(re)) return [];
    return [{ instanceId: row.id, start: baseStart.toDate(), end: occEnd.toDate() }];
  }

  const excludeSet = new Set(rule.exclude_occurrence_starts_ms ?? []);
  const pushIfInRange = (occStart: dayjs.Dayjs, out: ExpandedInstance[]) => {
    const untilLim = untilDayjs(rule);
    if (untilLim && occStart.isAfter(untilLim)) return;
    if (occStart.isBefore(baseStart)) return;
    if (excludeSet.has(occStart.valueOf())) return;
    const occEnd = occStart.add(dur, "millisecond");
    if (occEnd.isBefore(rs) || occStart.isAfter(re)) return;
    out.push({
      instanceId: `${row.id}::${occStart.valueOf()}`,
      start: occStart.toDate(),
      end: occEnd.toDate(),
    });
  };

  const interval = Math.max(1, rule.interval ?? 1);
  const until = untilDayjs(rule);
  const out: ExpandedInstance[] = [];

  if (rule.frequency === "DAILY") {
    let cur = baseStart.clone();
    let guard = 0;
    while (cur.isBefore(rs) && guard++ < MAX_OCCURRENCES) cur = cur.add(interval, "day");
    guard = 0;
    while (guard++ < MAX_OCCURRENCES) {
      if (until && cur.isAfter(until)) break;
      if (cur.isAfter(re.add(1, "day"))) break;
      pushIfInRange(cur, out);
      cur = cur.add(interval, "day");
    }
    return out;
  }

  if (rule.frequency === "WEEKLY") {
    const weekdays =
      rule.byweekday && rule.byweekday.length > 0
        ? [...new Set(rule.byweekday)].sort((a, b) => a - b)
        : [baseStart.day()];
    const baseWeekStart = baseStart.startOf("week");
    let w = 0;
    while (w < MAX_OCCURRENCES && out.length < MAX_OCCURRENCES) {
      const ws = baseWeekStart.add(w * interval, "week");
      if (ws.isAfter(re.add(1, "week"))) break;
      for (const dow of weekdays) {
        const occ = ws
          .day(dow)
          .hour(baseStart.hour())
          .minute(baseStart.minute())
          .second(baseStart.second())
          .millisecond(baseStart.millisecond());
        pushIfInRange(occ, out);
      }
      w += 1;
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  if (rule.frequency === "MONTHLY") {
    let cur = baseStart.clone();
    let guard = 0;
    while (cur.isBefore(rs.subtract(1, "day")) && guard++ < MAX_OCCURRENCES) cur = cur.add(interval, "month");
    guard = 0;
    while (guard++ < MAX_OCCURRENCES) {
      if (until && cur.isAfter(until)) break;
      if (cur.isAfter(re.add(1, "month"))) break;
      pushIfInRange(cur, out);
      cur = cur.add(interval, "month");
    }
    return out;
  }

  if (rule.frequency === "YEARLY") {
    let cur = baseStart.clone();
    let guard = 0;
    while (cur.isBefore(rs.subtract(1, "day")) && guard++ < MAX_OCCURRENCES) cur = cur.add(interval, "year");
    guard = 0;
    while (guard++ < MAX_OCCURRENCES) {
      if (until && cur.isAfter(until)) break;
      if (cur.isAfter(re.add(1, "year"))) break;
      pushIfInRange(cur, out);
      cur = cur.add(interval, "year");
    }
    return out;
  }

  return [];
}
