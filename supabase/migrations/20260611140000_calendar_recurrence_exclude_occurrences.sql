-- Document recurrence_rule.exclude_occurrence_starts_ms (omit occurrences client-expanded).

COMMENT ON COLUMN public."CalendarEvent".recurrence_rule IS
  'JSON: { frequency: DAILY|WEEKLY|MONTHLY|YEARLY, interval?: number, byweekday?: number[] (0=Dom..6=Sab), until?: yyyy-mm-dd, exclude_occurrence_starts_ms?: number[] — epoch ms del starts_at de cada instancia omitida (mismo valor que en instanceId tras "::").';
