-- Outlook-style calendar fields: all-day, location, recurrence (expanded client-side)

ALTER TABLE public."CalendarEvent"
  ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS recurrence_rule jsonb;

COMMENT ON COLUMN public."CalendarEvent".recurrence_rule IS 'JSON: { frequency: DAILY|WEEKLY|MONTHLY|YEARLY, interval?: number, byweekday?: number[] (0=Dom..6=Sab), until?: yyyy-mm-dd }';
