import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Calendar,
  type Event as CalendarEventType,
  dayjsLocalizer,
  type Formats,
  type View,
} from "react-big-calendar";
import dayjs from "dayjs";
import { Clock, MapPin, Repeat2 } from "lucide-react";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { RequirePermission } from "../../components/RequirePermission";
import { NeoCard } from "../../components/ui/neo-brutal";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { Label } from "../../components/ui/label";
import { TimeSelect } from "../../components/ui/time-select";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveOrganization } from "../../contexts/OrganizationContext";
import type { Database } from "../../types/database";
import { activityTypeLabel } from "../../lib/crm-labels";
import {
  expandCalendarEventInstances,
  extractOccurrenceStartMsFromInstanceId,
  parseRecurrenceRule,
  type RecurrenceFrequency,
} from "../../lib/calendar-recurrence";
import { TIME_OPTIONS, nearestTimeOption } from "../../lib/time-options";
import { cn } from "../../lib/utils";

type Activity = Database["public"]["Tables"]["OpportunityActivity"]["Row"];
type ActivityWithProperty = Activity & { Property?: { title: string } | null };
type EventRow = Database["public"]["Tables"]["CalendarEvent"]["Row"];

type CalendarItem = CalendarEventType & {
  id: string;
  source: "ACTIVITY" | "EVENT";
  opportunity_id: string | null;
};

type FormSnapshot = {
  title: string;
  startDate: string;
  endDateAllDay: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  notes: string;
  recurrence: "NONE" | RecurrenceFrequency;
  weeklyDays: number[];
  recurrenceUntil: string;
};

const localizer = dayjsLocalizer(dayjs);

const CALENDAR_FORMATS: Formats = {
  timeGutterFormat: "HH:mm",
  agendaTimeFormat: "HH:mm",
  eventTimeRangeFormat: ({ start, end }, culture, loc) => {
    const l = loc ?? localizer;
    return `${l.format(start, "HH:mm", culture)} – ${l.format(end, "HH:mm", culture)}`;
  },
  agendaTimeRangeFormat: ({ start, end }, culture, loc) => {
    const l = loc ?? localizer;
    return `${l.format(start, "HH:mm", culture)} – ${l.format(end, "HH:mm", culture)}`;
  },
  selectRangeFormat: ({ start, end }, culture, loc) => {
    const l = loc ?? localizer;
    return `${l.format(start, "HH:mm", culture)} – ${l.format(end, "HH:mm", culture)}`;
  },
};

const RECURRENCE_OPTIONS: { value: "NONE" | RecurrenceFrequency; label: string }[] = [
  { value: "NONE", label: "No se repite" },
  { value: "DAILY", label: "Repetir diariamente" },
  { value: "WEEKLY", label: "Repetir semanalmente" },
  { value: "MONTHLY", label: "Repetir mensualmente" },
  { value: "YEARLY", label: "Repetir anualmente" },
];

const WEEKDAY_PICKER = [
  { label: "L", dow: 1 },
  { label: "M", dow: 2 },
  { label: "X", dow: 3 },
  { label: "J", dow: 4 },
  { label: "V", dow: 5 },
  { label: "S", dow: 6 },
  { label: "D", dow: 0 },
];

function serializeSnapshot(s: FormSnapshot): string {
  return JSON.stringify({
    ...s,
    weeklyDays: [...s.weeklyDays].sort((a, b) => a - b),
  });
}

function snapshotFromFields(fields: {
  title: string;
  startDate: string;
  endDateAllDay: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  notes: string;
  recurrence: "NONE" | RecurrenceFrequency;
  weeklyDays: number[];
  recurrenceUntil: string;
}): FormSnapshot {
  return {
    title: fields.title.trim(),
    startDate: fields.startDate,
    endDateAllDay: fields.endDateAllDay,
    startTime: fields.startTime,
    endTime: fields.endTime,
    allDay: fields.allDay,
    location: fields.location.trim(),
    notes: fields.notes.trim(),
    recurrence: fields.recurrence,
    weeklyDays: [...fields.weeklyDays],
    recurrenceUntil: fields.recurrenceUntil.trim(),
  };
}

function eventRowToFields(row: EventRow): FormSnapshot {
  const start = dayjs(row.starts_at);
  const end = row.ends_at ? dayjs(row.ends_at) : start.add(30, "minute");
  const rule = parseRecurrenceRule(row.recurrence_rule);
  let recurrence: "NONE" | RecurrenceFrequency = "NONE";
  let weeklyDays: number[] = [start.day()];
  let recurrenceUntil = "";
  if (rule) {
    recurrence = rule.frequency;
    if (rule.byweekday && rule.byweekday.length > 0) weeklyDays = [...rule.byweekday];
    else if (rule.frequency === "WEEKLY") weeklyDays = [start.day()];
    recurrenceUntil = rule.until ?? "";
  }

  if (row.all_day) {
    return snapshotFromFields({
      title: row.title,
      startDate: start.format("YYYY-MM-DD"),
      endDateAllDay: end.format("YYYY-MM-DD"),
      startTime: "09:00",
      endTime: "09:30",
      allDay: true,
      location: row.location ?? "",
      notes: row.notes ?? "",
      recurrence,
      weeklyDays,
      recurrenceUntil,
    });
  }

  const startDate = start.format("YYYY-MM-DD");
  return snapshotFromFields({
    title: row.title,
    startDate,
    endDateAllDay: end.format("YYYY-MM-DD"),
    startTime: nearestTimeOption(row.starts_at),
    endTime: nearestTimeOption(end.toISOString()),
    allDay: false,
    location: row.location ?? "",
    notes: row.notes ?? "",
    recurrence,
    weeklyDays,
    recurrenceUntil,
  });
}

function eventToCalendarItem(row: EventRow, inst: { instanceId: string; start: Date; end: Date }): CalendarItem {
  if (row.all_day) {
    const start = dayjs(inst.start).startOf("day").toDate();
    const endExclusive = dayjs(inst.end).add(1, "day").startOf("day").toDate();
    return {
      id: inst.instanceId,
      title: row.title,
      start,
      end: endExclusive,
      allDay: true,
      source: "EVENT",
      opportunity_id: row.opportunity_id,
    };
  }
  return {
    id: inst.instanceId,
    title: row.title,
    start: inst.start,
    end: inst.end,
    allDay: false,
    source: "EVENT",
    opportunity_id: row.opportunity_id,
  };
}

function calendarInstanceBaseId(instanceId: string): string {
  const sep = instanceId.indexOf("::");
  return sep === -1 ? instanceId : instanceId.slice(0, sep);
}

export function CalendarPage({ embedded = false }: { embedded?: boolean }) {
  const org = useActiveOrganization();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ActivityWithProperty[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState<Date>(new Date());
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventModalError, setEventModalError] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const baselineSnapshotRef = useRef<string>("");

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDateAllDay, setEndDateAllDay] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [recurrence, setRecurrence] = useState<"NONE" | RecurrenceFrequency>("NONE");
  const [weeklyDays, setWeeklyDays] = useState<number[]>([dayjs().day()]);
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [eventSubmitting, setEventSubmitting] = useState(false);
  const [eventDeleting, setEventDeleting] = useState(false);
  /** Epoch ms del inicio de la instancia clickeada (solo series recurrentes expandidas). */
  const [editingOccurrenceStartMs, setEditingOccurrenceStartMs] = useState<number | null>(null);

  const visibleRange = useMemo(() => {
    const d = dayjs(date);
    return {
      start: d.subtract(2, "month").startOf("month").toDate(),
      end: d.add(2, "month").endOf("month").toDate(),
    };
  }, [date]);

  const currentSnapshot = useMemo(
    () =>
      serializeSnapshot(
        snapshotFromFields({
          title,
          startDate,
          endDateAllDay,
          startTime,
          endTime,
          allDay,
          location,
          notes,
          recurrence,
          weeklyDays,
          recurrenceUntil,
        }),
      ),
    [title, startDate, endDateAllDay, startTime, endTime, allDay, location, notes, recurrence, weeklyDays, recurrenceUntil],
  );

  const isDirty = currentSnapshot !== baselineSnapshotRef.current;
  const isEditMode = editingEventId !== null;
  const saveDisabled = (isEditMode && !isDirty) || eventSubmitting || eventDeleting;
  const editingRow = useMemo(
    () => (editingEventId ? events.find((e) => e.id === editingEventId) ?? null : null),
    [events, editingEventId],
  );
  const editingHasRecurrence = Boolean(editingRow && parseRecurrenceRule(editingRow.recurrence_rule));

  async function load() {
    const [a, e] = await Promise.all([
      supabase
        .from("OpportunityActivity")
        .select("*, Property(title)")
        .not("due_at", "is", null)
        .order("due_at", { ascending: true })
        .limit(100),
      supabase.from("CalendarEvent").select("*").order("starts_at", { ascending: true }).limit(200),
    ]);
    setActivities((a.data as ActivityWithProperty[]) ?? []);
    setEvents((e.data as EventRow[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  function applySnapshot(s: FormSnapshot) {
    setTitle(s.title);
    setStartDate(s.startDate);
    setEndDateAllDay(s.endDateAllDay);
    setStartTime(s.startTime);
    setEndTime(s.endTime);
    setAllDay(s.allDay);
    setLocation(s.location);
    setNotes(s.notes);
    setRecurrence(s.recurrence);
    setWeeklyDays(s.weeklyDays.length ? [...s.weeklyDays] : [dayjs(s.startDate).day()]);
    setRecurrenceUntil(s.recurrenceUntil);
  }

  function openCreateModal() {
    const d = dayjs().format("YYYY-MM-DD");
    const snap = snapshotFromFields({
      title: "",
      startDate: d,
      endDateAllDay: d,
      startTime: "09:00",
      endTime: "09:30",
      allDay: false,
      location: "",
      notes: "",
      recurrence: "NONE",
      weeklyDays: [dayjs(d).day()],
      recurrenceUntil: "",
    });
    baselineSnapshotRef.current = serializeSnapshot(snap);
    applySnapshot(snap);
    setEditingEventId(null);
    setEditingOccurrenceStartMs(null);
    setEventModalError(null);
    setEventModalOpen(true);
  }

  function openEditModal(row: EventRow, occurrenceStartMs: number | null) {
    const snap = eventRowToFields(row);
    baselineSnapshotRef.current = serializeSnapshot(snap);
    applySnapshot(snap);
    setEditingEventId(row.id);
    setEditingOccurrenceStartMs(occurrenceStartMs);
    setEventModalError(null);
    setEventModalOpen(true);
  }

  function requestCloseModal() {
    if (eventSubmitting || eventDeleting) return;
    if (currentSnapshot !== baselineSnapshotRef.current) {
      const ok = window.confirm(
        "¿Cerrar sin guardar? Los cambios que hiciste en este evento se perderán.",
      );
      if (!ok) return;
    }
    setEventModalOpen(false);
    setEditingEventId(null);
    setEditingOccurrenceStartMs(null);
    setEventModalError(null);
  }

  function toggleWeekday(dow: number) {
    setWeeklyDays((prev) => {
      const next = prev.includes(dow) ? prev.filter((x) => x !== dow) : [...prev, dow];
      return [...new Set(next)].sort((a, b) => a - b);
    });
  }

  async function submitEvent() {
    if (eventSubmitting) return;
    setEventModalError(null);
    const t = title.trim();
    if (!t) {
      setEventModalError("Agregá un título.");
      return;
    }
    if (!startDate) {
      setEventModalError("Elegí una fecha de inicio.");
      return;
    }
    if (recurrence === "WEEKLY" && weeklyDays.length === 0) {
      setEventModalError("Marcá al menos un día para la repetición semanal.");
      return;
    }

    setEventSubmitting(true);
    try {
      let startsIso: string;
      let endsIso: string;

      if (allDay) {
        if (!endDateAllDay) {
          setEventModalError("Elegí la fecha de fin.");
          return;
        }
        const sd = dayjs(startDate).startOf("day");
        const ed = dayjs(endDateAllDay).endOf("day");
        if (ed.isBefore(sd)) {
          setEventModalError("La fecha de fin no puede ser anterior al inicio.");
          return;
        }
        startsIso = sd.toISOString();
        endsIso = ed.toISOString();
      } else {
        const startDt = dayjs(`${startDate}T${startTime}:00`);
        let endDt = dayjs(`${startDate}T${endTime}:00`);
        if (!endDt.isAfter(startDt)) endDt = endDt.add(1, "day");
        startsIso = startDt.toISOString();
        endsIso = endDt.toISOString();
      }

      let recurrence_rule: Database["public"]["Tables"]["CalendarEvent"]["Insert"]["recurrence_rule"] = null;
      if (recurrence !== "NONE") {
        const until = recurrenceUntil.trim();
        const prevRaw = editingEventId ? events.find((e) => e.id === editingEventId)?.recurrence_rule : null;
        let preservedEx: number[] | undefined;
        if (prevRaw && typeof prevRaw === "object" && prevRaw !== null && !Array.isArray(prevRaw)) {
          const ex = (prevRaw as Record<string, unknown>).exclude_occurrence_starts_ms;
          if (Array.isArray(ex)) {
            const nums = ex.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
            if (nums.length > 0) preservedEx = [...new Set(nums)];
          }
        }
        recurrence_rule = {
          frequency: recurrence,
          interval: 1,
          ...(until ? { until } : {}),
          ...(recurrence === "WEEKLY" ? { byweekday: [...weeklyDays].sort((a, b) => a - b) } : {}),
          ...(preservedEx?.length ? { exclude_occurrence_starts_ms: preservedEx } : {}),
        };
      }

      const payload = {
        title: t,
        starts_at: startsIso,
        ends_at: endsIso,
        all_day: allDay,
        location: location.trim() || null,
        recurrence_rule,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = editingEventId
        ? await supabase.from("CalendarEvent").update(payload).eq("id", editingEventId).eq("organization_id", org.id)
        : await supabase.from("CalendarEvent").insert({
            organization_id: org.id,
            ...payload,
            type: "EVENT",
            created_by_id: user?.id ?? null,
          });

      if (error) {
        setEventModalError(error.message);
        return;
      }

      const wasEdit = editingEventId !== null;
      const nextBaseline = snapshotFromFields({
        title,
        startDate,
        endDateAllDay,
        startTime,
        endTime,
        allDay,
        location,
        notes,
        recurrence,
        weeklyDays,
        recurrenceUntil,
      });
      baselineSnapshotRef.current = serializeSnapshot(nextBaseline);

      setEventModalOpen(false);
      setEditingEventId(null);
      setEditingOccurrenceStartMs(null);
      setEventModalError(null);
      setMsg(wasEdit ? "Evento actualizado." : "Evento cargado.");
      void load();
    } finally {
      setEventSubmitting(false);
    }
  }

  async function deleteThisOccurrenceOnly() {
    if (!editingEventId || editingOccurrenceStartMs == null || !org?.id || eventDeleting || eventSubmitting) return;
    const ok = window.confirm("¿Eliminar solo esta fecha? El resto de la serie se mantiene.");
    if (!ok) return;
    setEventModalError(null);
    setEventDeleting(true);
    try {
      const prev = events.find((e) => e.id === editingEventId);
      if (!prev) {
        setEventModalError("No se encontró el evento.");
        return;
      }
      const rule = parseRecurrenceRule(prev.recurrence_rule);
      if (!rule) {
        const { error: delErr } = await supabase
          .from("CalendarEvent")
          .delete()
          .eq("id", editingEventId)
          .eq("organization_id", org.id);
        if (delErr) {
          setEventModalError(delErr.message);
          return;
        }
        setEventModalOpen(false);
        setEditingEventId(null);
        setEditingOccurrenceStartMs(null);
        setMsg("Evento eliminado.");
        void load();
        return;
      }
      const raw = prev.recurrence_rule;
      const base =
        typeof raw === "object" && raw !== null && !Array.isArray(raw)
          ? { ...(raw as Record<string, unknown>) }
          : {
              frequency: rule.frequency,
              interval: rule.interval ?? 1,
              ...(rule.until ? { until: rule.until } : {}),
              ...(rule.byweekday?.length ? { byweekday: [...rule.byweekday] } : {}),
            };
      const merged = [...new Set([...(rule.exclude_occurrence_starts_ms ?? []), editingOccurrenceStartMs])];
      (base as Record<string, unknown>).exclude_occurrence_starts_ms = merged;
      const { error } = await supabase
        .from("CalendarEvent")
        .update({
          recurrence_rule: base,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingEventId)
        .eq("organization_id", org.id);
      if (error) {
        setEventModalError(error.message);
        return;
      }
      setEventModalOpen(false);
      setEditingEventId(null);
      setEditingOccurrenceStartMs(null);
      setEventModalError(null);
      setMsg("Esta ocurrencia fue eliminada.");
      void load();
    } finally {
      setEventDeleting(false);
    }
  }

  async function deleteEventSeries() {
    if (!editingEventId || !org?.id || eventDeleting || eventSubmitting) return;
    const isSeries = editingHasRecurrence;
    const ok = window.confirm(
      isSeries ? "¿Eliminar toda la serie de forma permanente?" : "¿Eliminar este evento de forma permanente?",
    );
    if (!ok) return;
    setEventModalError(null);
    setEventDeleting(true);
    try {
      const { error } = await supabase
        .from("CalendarEvent")
        .delete()
        .eq("id", editingEventId)
        .eq("organization_id", org.id);
      if (error) {
        setEventModalError(error.message);
        return;
      }
      setEventModalOpen(false);
      setEditingEventId(null);
      setEditingOccurrenceStartMs(null);
      setMsg(isSeries ? "Serie eliminada." : "Evento eliminado.");
      void load();
    } finally {
      setEventDeleting(false);
    }
  }

  const items = useMemo<CalendarItem[]>(() => {
    const act: CalendarItem[] = activities.map((x) => {
      const baseTitle = x.title ?? activityTypeLabel(x.type);
      const propTitle = x.Property?.title;
      return {
        id: x.id,
        source: "ACTIVITY" as const,
        title: propTitle ? `${baseTitle} — ${propTitle}` : baseTitle,
        start: new Date(x.due_at ?? x.created_at),
        end: new Date(x.due_at ?? x.created_at),
        allDay: false,
        opportunity_id: x.opportunity_id,
      };
    });

    const ev: CalendarItem[] = [];
    for (const row of events) {
      const instances = expandCalendarEventInstances(row, visibleRange.start, visibleRange.end);
      for (const inst of instances) {
        ev.push(eventToCalendarItem(row, inst));
      }
    }
    return [...act, ...ev];
  }, [activities, events, visibleRange.start, visibleRange.end]);

  return (
    <RequirePermission slug="view_calendar">
      <div
        className={
          embedded
            ? "scroll-mt-10 space-y-4 border-t border-[var(--jif-line)] pb-2 pt-10"
            : "jif-page flex min-h-[calc(100dvh-8rem)] flex-col gap-4 pb-2 md:min-h-[calc(100dvh-7rem)]"
        }
      >
        <header className={embedded ? "shrink-0 border-b border-[var(--jif-line)] pb-4" : "shrink-0 border-b border-[var(--jif-line)] pb-6"}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              {embedded ? (
                <>
                  <h2 className="font-neo text-xl font-semibold text-[var(--foreground)]">Calendario</h2>
                  <p className="jif-caps jif-dim mt-1 text-[0.65rem]">Actividades y eventos organizacionales.</p>
                  <Link
                    to="/dashboard/reports/calendar"
                    className="mt-2 inline-block jif-caps text-[0.6rem] text-[var(--accent)] hover:underline"
                  >
                    Ver pantalla completa →
                  </Link>
                </>
              ) : (
                <>
                  <h1 className="jif-hero">Calendario</h1>
                  <p className="jif-caps jif-dim mt-1">Gestiona tu calendario</p>
                </>
              )}
            </div>
            <Button type="button" variant="neo" className="shrink-0" onClick={openCreateModal}>
              Nuevo evento
            </Button>
          </div>
        </header>
        {msg ? (
          <p className="shrink-0 border border-[var(--jif-line)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]">
            {msg}
          </p>
        ) : null}

        <NeoCard
          className={
            embedded
              ? "flex max-h-[min(70vh,560px)] min-h-0 flex-col overflow-hidden border-[var(--jif-line)] p-0"
              : "flex min-h-0 flex-1 flex-col overflow-hidden border-[var(--jif-line)] p-0"
          }
        >
          <div
            className="pilot-rbc--light min-h-0 flex-1 overflow-auto bg-[var(--card)] p-3"
            style={{ minHeight: embedded ? "min(45dvh, 400px)" : "min(70dvh, 520px)" }}
          >
            <div
              className={
                embedded ? "min-h-[280px] h-[min(45dvh,420px)]" : "h-[calc(100dvh-15rem)] min-h-[360px] md:h-[calc(100dvh-14rem)]"
              }
            >
              <Calendar
                localizer={localizer}
                formats={CALENDAR_FORMATS}
                culture="es"
                events={items}
                view={view}
                date={date}
                views={["month", "week", "day", "agenda"]}
                onView={(next: View) => setView(next)}
                onNavigate={(nextDate: Date) => setDate(nextDate)}
                defaultView="month"
                popup
                style={{ height: "100%" }}
                messages={{
                  month: "Mes",
                  week: "Semana",
                  day: "Día",
                  agenda: "Agenda",
                  today: "Hoy",
                  previous: "Anterior",
                  next: "Siguiente",
                  noEventsInRange: "Sin eventos en este rango",
                }}
                eventPropGetter={(event: CalendarItem) => ({
                  style: {
                    backgroundColor: event.source === "EVENT" ? "#e2e7ee" : "#ebe4d6",
                    border: "1px solid #c4b5a0",
                    borderLeft: `3px solid ${event.source === "EVENT" ? "#1a2d4a" : "#6b5a4a"}`,
                    color: "#1a2d4a",
                    borderRadius: 4,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  },
                })}
                onSelectEvent={(event: CalendarItem) => {
                  if (event.source === "ACTIVITY") {
                    if (event.opportunity_id) navigate(`/dashboard/opportunities/${event.opportunity_id}`);
                    return;
                  }
                  const baseId = calendarInstanceBaseId(event.id);
                  const row = events.find((e) => e.id === baseId);
                  if (!row) return;
                  openEditModal(row, extractOccurrenceStartMsFromInstanceId(event.id));
                }}
              />
            </div>
          </div>
        </NeoCard>

        <Modal
          open={eventModalOpen}
          title={isEditMode ? "Editar evento" : "Nuevo evento"}
          panelClassName="max-w-2xl"
          onClose={requestCloseModal}
          footer={
            <div
              className={`flex w-full min-w-0 flex-wrap items-center gap-3 ${isEditMode ? "justify-between" : "justify-end"}`}
            >
              {isEditMode ? (
                <div className="flex flex-wrap items-center gap-2">
                  {editingHasRecurrence && editingOccurrenceStartMs != null ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={eventSubmitting || eventDeleting}
                        onClick={() => void deleteThisOccurrenceOnly()}
                      >
                        {eventDeleting ? "Eliminando…" : "Solo esta vez"}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={eventSubmitting || eventDeleting}
                        onClick={() => void deleteEventSeries()}
                      >
                        {eventDeleting ? "Eliminando…" : "Toda la serie"}
                      </Button>
                    </>
                  ) : editingHasRecurrence ? (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={eventSubmitting || eventDeleting}
                      onClick={() => void deleteEventSeries()}
                    >
                      {eventDeleting ? "Eliminando…" : "Eliminar serie"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={eventSubmitting || eventDeleting}
                      onClick={() => void deleteEventSeries()}
                    >
                      {eventDeleting ? "Eliminando…" : "Eliminar"}
                    </Button>
                  )}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" disabled={eventSubmitting || eventDeleting} onClick={requestCloseModal}>
                  Cancelar
                </Button>
                <Button type="button" variant="neo" disabled={saveDisabled} onClick={() => void submitEvent()}>
                  Guardar
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-5">
            {eventModalError ? (
              <p className="rounded-md border border-red-300/80 bg-red-50 px-3 py-2 text-sm text-red-900">{eventModalError}</p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="cal-ev-title">Título</Label>
              <input
                id="cal-ev-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título"
                required
                className="neo-field"
              />
            </div>

            <div className="flex gap-3 border-b border-[var(--jif-line)]/80 pb-4">
              <Clock className="mt-2 size-5 shrink-0 text-[var(--muted)]" aria-hidden />
              <div className="min-w-0 flex-1 space-y-3">
                {!allDay ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[9rem] flex-1 space-y-1">
                      <Label className="text-xs text-[var(--muted)]">Fecha</Label>
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="neo-field" required />
                    </div>
                    <span className="jif-caps mb-2 hidden text-[0.6rem] text-[var(--muted)] sm:inline">desde</span>
                    <div className="min-w-[6.5rem] space-y-1">
                      <Label htmlFor="cal-ev-start-time" className="text-xs text-[var(--muted)]">
                        Hora
                      </Label>
                      <TimeSelect
                        id="cal-ev-start-time"
                        value={startTime}
                        onChange={setStartTime}
                        options={TIME_OPTIONS}
                        listMaxHeightClass="max-h-36"
                      />
                    </div>
                    <span className="jif-caps mb-2 hidden text-[0.6rem] text-[var(--muted)] sm:inline">hasta</span>
                    <div className="min-w-[6.5rem] space-y-1">
                      <Label htmlFor="cal-ev-end-time" className="text-xs text-[var(--muted)]">
                        Hora
                      </Label>
                      <TimeSelect
                        id="cal-ev-end-time"
                        value={endTime}
                        onChange={setEndTime}
                        options={TIME_OPTIONS}
                        listMaxHeightClass="max-h-36"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[9rem] flex-1 space-y-1">
                      <Label className="text-xs text-[var(--muted)]">Desde</Label>
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="neo-field" required />
                    </div>
                    <div className="min-w-[9rem] flex-1 space-y-1">
                      <Label className="text-xs text-[var(--muted)]">Hasta</Label>
                      <input
                        type="date"
                        value={endDateAllDay}
                        onChange={(e) => setEndDateAllDay(e.target.value)}
                        className="neo-field"
                        required
                      />
                    </div>
                  </div>
                )}
                <label className="flex cursor-pointer items-center gap-2 select-none">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setAllDay(v);
                      if (v) setEndDateAllDay((prev) => prev || startDate);
                    }}
                    className="size-4 rounded border-[var(--jif-line)] accent-[var(--jif-gold)]"
                  />
                  <span className="text-sm font-medium text-[var(--foreground)]">Todo el día</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 border-b border-[var(--jif-line)]/80 pb-4">
              <Repeat2 className="mt-2 size-5 shrink-0 text-[var(--muted)]" aria-hidden />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="cal-ev-recurrence">Repetición</Label>
                  <select
                    id="cal-ev-recurrence"
                    value={recurrence}
                    onChange={(e) => {
                      const v = e.target.value as typeof recurrence;
                      setRecurrence(v);
                      if (v === "WEEKLY") {
                        const dow =
                          startDate && dayjs(startDate).isValid() ? dayjs(startDate).day() : dayjs().day();
                        setWeeklyDays((prev) => (prev.length > 0 ? prev : [dow]));
                      }
                    }}
                    className="neo-field"
                  >
                    {RECURRENCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                {recurrence === "WEEKLY" ? (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--muted)]">Días</p>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_PICKER.map(({ label, dow }) => (
                        <button
                          key={dow}
                          type="button"
                          onClick={() => toggleWeekday(dow)}
                          className={cn(
                            "size-9 rounded-md border text-xs font-semibold transition-colors",
                            weeklyDays.includes(dow)
                              ? "border-[var(--jif-gold)] bg-[var(--jif-gold)]/15 text-[var(--foreground)]"
                              : "border-[var(--jif-line)] bg-[var(--card)] text-[var(--muted)] hover:border-[var(--jif-gold)]/50",
                          )}
                          aria-pressed={weeklyDays.includes(dow)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {recurrence !== "NONE" ? (
                  <div className="space-y-1">
                    <Label htmlFor="cal-ev-rec-until">Finalizar repeticiones (opcional)</Label>
                    <input
                      id="cal-ev-rec-until"
                      type="date"
                      value={recurrenceUntil}
                      onChange={(e) => setRecurrenceUntil(e.target.value)}
                      className="neo-field max-w-[12rem]"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex gap-3 border-b border-[var(--jif-line)]/80 pb-4">
              <MapPin className="mt-2 size-5 shrink-0 text-[var(--muted)]" aria-hidden />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="cal-ev-location">Ubicación</Label>
                <input
                  id="cal-ev-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Agregar una ubicación"
                  className="neo-field"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cal-ev-notes">Notas</Label>
              <textarea
                id="cal-ev-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas"
                className="min-h-20 w-full resize-y border border-[var(--jif-line)] bg-[#fffcf7] p-2 text-sm text-[var(--foreground)]"
              />
            </div>
          </div>
        </Modal>
      </div>
    </RequirePermission>
  );
}
